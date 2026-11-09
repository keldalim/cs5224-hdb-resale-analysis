import type { AnalyseRequest, AnalyseResponse, AskingComparison, Estimate } from "../api/types";
import { validateRequest } from "./validate";

/**
 * The shortlist lives in this browser only (no accounts in the MVP).
 */
export interface ShortlistItem {
  id: string;
  savedAt: string;
  request: AnalyseRequest;
  /** Latest sale month in the data when it was saved ("" if unknown). */
  data_month: string;
  sufficient: boolean;
  estimate: Estimate | null;
  asking_comparison: AskingComparison | null;
  comparable_count: number;
  remaining_lease_years: number;
}

const KEY = "hdb-resale-evidence.shortlist.v1";
export const SHORTLIST_LIMIT = 8;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function asEstimate(v: unknown): Estimate | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (!isNum(e.point) || !isNum(e.low) || !isNum(e.high)) return null;
  return {
    point: e.point, low: e.low, high: e.high,
    interval_level: isNum(e.interval_level) ? e.interval_level : 0.9,
    model_version: typeof e.model_version === "string" ? e.model_version : "",
  };
}

function asAsking(v: unknown): AskingComparison | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const positions = ["below_range", "within_range", "above_range"];
  if (!isNum(a.asking_price) || !isNum(a.difference) || !isNum(a.difference_pct) || !positions.includes(String(a.position))) return null;
  return a as unknown as AskingComparison;
}

/**
 * Turn one stored entry back into an item, or null if it isn't one. Entries
 * from older versions, other tabs or manual edits must never break the page.
 */
export function parseItem(v: unknown): ShortlistItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const req = o.request as Record<string, unknown> | undefined;
  if (!req || typeof req !== "object") return null;
  const request: AnalyseRequest = {
    town: String(req.town ?? ""),
    flat_type: String(req.flat_type ?? "") as AnalyseRequest["flat_type"],
    block: typeof req.block === "string" ? req.block : "",
    street_name: typeof req.street_name === "string" ? req.street_name : "",
    storey_range: String(req.storey_range ?? ""),
    floor_area_sqm: Number(req.floor_area_sqm),
    flat_model: String(req.flat_model ?? ""),
    lease_commence_year: Number(req.lease_commence_year),
    asking_price: isNum(req.asking_price) ? req.asking_price : undefined,
  };
  // Older saves may lack block/street; everything else must be a valid flat.
  const errs = validateRequest({ ...request, block: request.block || "1", street_name: request.street_name || "x" });
  if (Object.keys(errs).length) return null;
  const dataMonth = typeof o.data_month === "string" ? o.data_month : typeof o.snapshot_month === "string" ? o.snapshot_month : "";
  return {
    id: typeof o.id === "string" && o.id ? o.id : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    savedAt: typeof o.savedAt === "string" ? o.savedAt : "",
    request,
    data_month: dataMonth,
    sufficient: o.sufficient === true,
    estimate: asEstimate(o.estimate),
    asking_comparison: asAsking(o.asking_comparison),
    comparable_count: isNum(o.comparable_count) ? o.comparable_count : 0,
    remaining_lease_years: isNum(o.remaining_lease_years) ? o.remaining_lease_years : NaN,
  };
}

export function parseShortlist(raw: string | null): ShortlistItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseItem).filter((x): x is ShortlistItem => x !== null).slice(0, SHORTLIST_LIMIT);
  } catch {
    return [];
  }
}

export function loadShortlist(): ShortlistItem[] {
  try {
    return parseShortlist(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveShortlist(items: ShortlistItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage may be unavailable (private mode); the list still works for this visit */
  }
}

/** Keep the list in step when another tab changes it. Returns an unsubscribe function. */
export function onShortlistChange(cb: (items: ShortlistItem[]) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === KEY) cb(parseShortlist(e.newValue));
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function flatKey(r: AnalyseRequest): string {
  return [r.town, r.flat_type, (r.block ?? "").toUpperCase(), (r.street_name ?? "").toUpperCase(), r.storey_range, r.floor_area_sqm, r.flat_model, r.lease_commence_year].join("|");
}

export function sameFlat(a: AnalyseRequest, b: AnalyseRequest): boolean {
  return flatKey(a) === flatKey(b);
}

export function toItem(res: AnalyseResponse): ShortlistItem {
  const { remaining_lease_years, ...request } = res.subject;
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    savedAt: new Date().toISOString(),
    request,
    data_month: res.data_month,
    sufficient: res.evidence.sufficient,
    estimate: res.estimate,
    asking_comparison: res.asking_comparison,
    comparable_count: res.comparables.length,
    remaining_lease_years,
  };
}
