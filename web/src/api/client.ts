import type { AnalyseRequest, AnalyseResponse } from "./types";
import { mockEstimate } from "./mock";
import { fromEstimateResponse, toEstimateRequest, type EstimateResponse } from "./estimate";
import { DEFAULT_ESTIMATE_URL } from "../config";
import { currentMonth } from "../lib/months";

// Unset → team API in production builds; in dev, demo data (`npm run dev`) or the
// live API through Vite's local proxy (`npm run dev:live`). Set to empty → demo.
const DEV_DEFAULT = import.meta.env.MODE === "live" ? "/api/estimate" : "";
const ESTIMATE_URL = (import.meta.env.VITE_ESTIMATE_URL ?? (import.meta.env.PROD ? DEFAULT_ESTIMATE_URL : DEV_DEFAULT)).trim();
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 20000;

/** Demo mode: synthetic data with a visible banner, for UI work and dry runs. */
export const DEMO_MODE = ESTIMATE_URL === "";
if (DEMO_MODE && typeof console !== "undefined") {
  console.info("[resale-evidence] Demo mode: set VITE_ESTIMATE_URL to use the live /estimate API.");
}

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Partial<Record<keyof AnalyseRequest, string>>;
  constructor(message: string, code: string, status: number, fields?: Partial<Record<keyof AnalyseRequest, string>>) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/** Map the Lambda's plain-text validation messages onto form fields where we can. */
export function fieldFor(message: string): keyof AnalyseRequest | null {
  const m = message.toLowerCase();
  if (m.includes("town")) return "town";
  if (m.includes("flat_type")) return "flat_type";
  if (m.includes("flat_model")) return "flat_model";
  if (m.includes("block")) return "block";
  if (m.includes("street")) return "street_name";
  if (m.includes("floor_area")) return "floor_area_sqm";
  if (m.includes("lease_commence") || m.includes("remaining_lease")) return "lease_commence_year";
  if (m.includes("asking_price")) return "asking_price";
  if (m.includes("storey")) return "storey_range";
  return null;
}

const LABELS: Record<string, string> = {
  floor_area_sqm: "Floor area", lease_commence_date: "Lease start year", remaining_lease: "Remaining lease",
  asking_price: "Asking price", flat_type: "Flat type", flat_model: "Flat model", street_name: "Street",
  storey_range: "Storey", town: "Town", block: "Block", month: "Month",
};
/** "floor_area_sqm must be positive" → "Floor area must be positive" */
export function readable(message: string): string {
  const out = message.replace(/\b[a-z]+(?:_[a-z]+)+\b|\b(?:town|block|month)\b/g, (w) => LABELS[w] ?? w).trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
}

/**
 * Python's json module can emit bare NaN / Infinity, which aren't valid JSON.
 * Replace them with null where they stand as values (after ":", "," or "[").
 */
export function parseLenientJson(text: string): unknown {
  return JSON.parse(text.replace(/([:,[]\s*)-?(?:NaN|Infinity)(?=\s*[,}\]])/g, "$1null"));
}

function abortError(): ApiError {
  return new ApiError(
    `The price service took longer than ${Math.round(TIMEOUT_MS / 1000)} seconds to respond. Try again.`,
    "TIMEOUT",
    0,
  );
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
    });
    // Read the body inside the timeout too: a stalled body is as bad as a stalled response.
    text = await res.text();
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      if (!timedOut) throw e; // cancelled by the caller: let them ignore it
      throw abortError();
    }
    throw new ApiError("Couldn't reach the price service. Check your connection and try again.", "NETWORK", 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  let parsed: unknown = null;
  try {
    parsed = text ? parseLenientJson(text) : null;
  } catch {
    /* non-JSON body, handled below */
  }

  if (!res.ok) {
    const raw = (parsed as { error?: unknown; message?: unknown } | null)?.error ?? (parsed as { message?: unknown } | null)?.message;
    const message = typeof raw === "string" ? raw : "";
    if (res.status === 429) throw new ApiError("Too many checks in a short time. Wait a few seconds and try again.", "RATE_LIMITED", 429);
    if (res.status === 400) {
      const f = fieldFor(message);
      const plain = readable(message);
      const friendly = plain ? `The service couldn't use these details. ${plain}.` : "The service couldn't use these details.";
      throw new ApiError(friendly, "VALIDATION_ERROR", 400, f && plain ? { [f]: `${plain}.` } : undefined);
    }
    throw new ApiError(
      res.status >= 500
        ? "The price service hit a problem on its side. Try again in a moment."
        : `The price service returned an error (HTTP ${res.status}).`,
      "HTTP_ERROR",
      res.status,
    );
  }

  // Lambda proxy envelopes sometimes pass through as { statusCode, body: "{...}" }
  if (parsed && typeof parsed === "object" && "body" in parsed && typeof (parsed as { body: unknown }).body === "string") {
    try {
      parsed = parseLenientJson((parsed as { body: string }).body);
    } catch {
      parsed = null;
    }
  }
  return parsed as T;
}

function looksLikeEstimate(b: unknown): b is EstimateResponse {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return typeof o.evidence_sufficient === "boolean" && (o.comparables === undefined || Array.isArray(o.comparables));
}

export async function analyse(req: AnalyseRequest, signal?: AbortSignal): Promise<AnalyseResponse> {
  const month = currentMonth();
  const wire = toEstimateRequest(req, month);
  const body = DEMO_MODE ? await mockEstimate(wire, signal) : await post<unknown>(ESTIMATE_URL, wire, signal);
  if (!looksLikeEstimate(body)) {
    throw new ApiError("The price service replied in a format this page doesn't recognise.", "UNEXPECTED_FORMAT", 200);
  }
  return fromEstimateResponse(req, body, month);
}
