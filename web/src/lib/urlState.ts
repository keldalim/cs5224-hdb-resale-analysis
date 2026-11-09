import type { AnalyseRequest, FlatType } from "../api/types";
import { validateRequest } from "./validate";

/**
 * The current view and the flat being checked are kept in the query string,
 * so a result can be bookmarked or shared and the browser back button works.
 * Query strings (rather than paths) also mean S3/CloudFront never has to
 * resolve a deep link — every URL is just index.html.
 */
export type View = "check" | "shortlist" | "method";

const FIELDS: (keyof AnalyseRequest)[] = [
  "town", "flat_type", "block", "street_name", "storey_range",
  "floor_area_sqm", "flat_model", "lease_commence_year", "asking_price",
];
const NUMERIC = new Set<keyof AnalyseRequest>(["floor_area_sqm", "lease_commence_year", "asking_price"]);

export interface UrlState {
  view: View;
  /** The flat in the URL, if any. Present even when invalid, so the form can show it. */
  request: AnalyseRequest | null;
  /** True only when `request` passes the same validation as the form: safe to run. */
  valid: boolean;
}

export function parseSearch(search: string): UrlState {
  const p = new URLSearchParams(search);
  const v = p.get("view");
  const view: View = v === "shortlist" || v === "method" ? v : "check";
  if (!p.get("town") && !p.get("flat_type")) return { view, request: null, valid: false };
  const raw: Partial<Record<keyof AnalyseRequest, unknown>> = {};
  for (const f of FIELDS) {
    const val = p.get(f);
    if (val === null || val.trim() === "") continue;
    raw[f] = NUMERIC.has(f) ? Number(val) : val.trim();
  }
  const valid = Object.keys(validateRequest(raw)).length === 0;
  const request: AnalyseRequest = {
    town: String(raw.town ?? ""),
    flat_type: String(raw.flat_type ?? "") as FlatType,
    block: raw.block !== undefined ? String(raw.block) : undefined,
    street_name: raw.street_name !== undefined ? String(raw.street_name) : undefined,
    storey_range: String(raw.storey_range ?? ""),
    floor_area_sqm: Number(raw.floor_area_sqm ?? NaN),
    flat_model: String(raw.flat_model ?? ""),
    lease_commence_year: Number(raw.lease_commence_year ?? NaN),
    asking_price: raw.asking_price !== undefined && Number.isFinite(Number(raw.asking_price)) ? Number(raw.asking_price) : undefined,
  };
  return { view, request, valid };
}

export function readUrl(): UrlState {
  return parseSearch(window.location.search);
}

export function buildSearch(view: View, request: AnalyseRequest | null): string {
  const p = new URLSearchParams();
  if (view !== "check") p.set("view", view);
  if (view === "check" && request) {
    for (const f of FIELDS) {
      const val = request[f];
      if (val !== undefined && val !== "" && val !== null && !(typeof val === "number" && !Number.isFinite(val))) p.set(f, String(val));
    }
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function writeUrl(view: View, request: AnalyseRequest | null, replace = false): void {
  const qs = buildSearch(view, request);
  if (qs === window.location.search) return; // never stack duplicate history entries
  const url = `${window.location.pathname}${qs}`;
  try {
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  } catch {
    /* sandboxed previews may block history; navigation still works in-app */
  }
}

/** A link to a view, for real <a href> navigation (open in new tab works). */
export function viewHref(view: View): string {
  return `${window.location.pathname}${buildSearch(view, null)}` || "./";
}
