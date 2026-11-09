/**
 * DEMO MODE ONLY. Synthetic sales so the interface can be built, demoed and
 * user-tested without the Lambda. Prices are generated, NOT real HDB
 * transactions, and the UI labels them as such.
 *
 * It returns a POST /estimate-shaped payload, scored with the same formula and
 * evidence rule as src/resale_service.py, so demo runs go through the same
 * adapter (api/estimate.ts) and show the same checks as production.
 */
import type { FlatType } from "./types";
import type { EstimateComparable, EstimateRequest, EstimateResponse } from "./estimate";
import { STOREY_RANGES, TYPICAL_AREA } from "./reference";
import { EVIDENCE_RULE, INTERVAL_MARGIN } from "./rule";
import { leaseString, remainingLeaseMonths } from "../lib/lease";
import { monthsBetween, shiftMonth } from "../lib/months";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}

const TYPE_BASE: Record<FlatType, number> = {
  "1 ROOM": 230_000, "2 ROOM": 340_000, "3 ROOM": 440_000, "4 ROOM": 610_000,
  "5 ROOM": 720_000, EXECUTIVE: 900_000, "MULTI-GENERATION": 1_050_000,
};
/** Rough sales per year of each type in a typical town. */
const TYPE_SUPPLY: Record<FlatType, number> = {
  "1 ROOM": 2, "2 ROOM": 12, "3 ROOM": 55, "4 ROOM": 70, "5 ROOM": 45, EXECUTIVE: 14, "MULTI-GENERATION": 2,
};
const PRIME = ["BUKIT MERAH", "QUEENSTOWN", "TOA PAYOH", "KALLANG/WHAMPOA", "CENTRAL AREA", "BUKIT TIMAH", "MARINE PARADE", "BISHAN", "CLEMENTI"];
const OUTER = ["WOODLANDS", "YISHUN", "SEMBAWANG", "CHOA CHU KANG", "JURONG WEST", "BUKIT PANJANG", "PASIR RIS"];
const SMALL_TOWNS = ["BUKIT TIMAH", "MARINE PARADE", "CENTRAL AREA"];

const townMult = (t: string) => (PRIME.includes(t) ? 1.22 : OUTER.includes(t) ? 0.9 : 1.0);
const leaseFactor = (remYears: number) => Math.max(0.55, 1 - 0.0065 * Math.max(0, 92 - remYears));
const storeyMid = (range: string) => {
  const m = range.match(/(\d+)\s*TO\s*(\d+)/i);
  return m ? (Number(m[1]) + Number(m[2])) / 2 : 0;
};

function syntheticStreets(town: string): string[] {
  const stem = town.split(/[ /]/)[0];
  return [`${stem} AVE 1`, `${stem} AVE 3`, `${stem} ST 21`, `${stem} ST 32`, `${stem} DR`, `${stem} RD`];
}

interface Sale extends EstimateComparable {
  _lease_months: number;
  _storey_mid: number;
}

/** Same 0–100 score as resale_service.score_comparables. */
function score(req: EstimateRequest, subjLeaseMonths: number, s: Sale): number {
  const sameStreet = s.street_name === req.street_name ? 1 : 0;
  const sameBlock = sameStreet && s.block === req.block ? 1 : 0;
  const sameModel = s.flat_model === req.flat_model ? 1 : 0;
  const clip = (x: number) => Math.max(0, Math.min(1, x));
  const area = clip(1 - Math.abs(Number(s.floor_area_sqm) - req.floor_area_sqm) / 20);
  const lease = clip(1 - Math.abs(s._lease_months - subjLeaseMonths) / 120);
  const storey = clip(1 - Math.abs(s._storey_mid - storeyMid(req.storey_range)) / 15);
  const recency = clip(1 - monthsBetween(String(s.month), req.month) / 12);
  return sameBlock * 20 + sameStreet * 15 + sameModel * 10 + area * 20 + lease * 15 + storey * 10 + recency * 10;
}

function syntheticPrice(flatType: FlatType, town: string, area: number, storeyMidV: number, remYears: number, monthsAgo: number): number {
  const typical = TYPICAL_AREA[flatType] ?? 90;
  return (TYPE_BASE[flatType] ?? 500_000) * townMult(town) * Math.pow(area / typical, 0.9) *
    (1 + 0.004 * storeyMidV) * leaseFactor(remYears) * (1 - 0.004 * monthsAgo);
}

export async function mockEstimate(req: EstimateRequest, signal?: AbortSignal): Promise<EstimateResponse> {
  await sleep(450 + Math.random() * 300, signal);
  const flatType = req.flat_type as FlatType;
  const r = rng(`${req.town}|${req.flat_type}|${req.street_name}`);
  const typical = TYPICAL_AREA[flatType] ?? 90;
  const streets = syntheticStreets(req.town);
  const subjStoreyIdx = Math.max(0, STOREY_RANGES.indexOf(req.storey_range));
  const subjLeaseMonths = remainingLeaseMonths(req.lease_commence_date, req.month);

  let supply = TYPE_SUPPLY[flatType] ?? 20;
  if (SMALL_TOWNS.includes(req.town)) supply = Math.round(supply * 0.35);
  const n = Math.max(0, Math.round(supply * (0.8 + r.next() * 0.4)));

  // The Lambda searches the 12 months before the target month.
  const sales: Sale[] = [];
  for (let i = 0; i < n; i++) {
    const monthsAgo = r.int(1, 12);
    const month = shiftMonth(req.month, -monthsAgo);
    const area = Math.round(typical * (1 + r.normal() * 0.08));
    const storeyIdx = Math.min(16, Math.max(0, Math.round(subjStoreyIdx + r.normal() * 2.5)));
    const storey = STOREY_RANGES[storeyIdx];
    const leaseYear = Math.round(req.lease_commence_date + r.normal() * 7);
    const leaseMonths = remainingLeaseMonths(leaseYear, month);
    const roll = r.next();
    const sameStreet = roll < 0.3;
    const street = sameStreet ? req.street_name : streets[r.int(0, streets.length - 1)];
    const block = sameStreet && roll < 0.1 ? req.block : String(r.int(100, 699)) + (r.next() < 0.2 ? "A" : "");
    const price = syntheticPrice(flatType, req.town, area, storeyMid(storey), leaseMonths / 12, monthsAgo) * (1 + r.normal() * 0.04);
    const s: Sale = {
      month, town: req.town, flat_type: req.flat_type, block, street_name: street, storey_range: storey,
      floor_area_sqm: area, flat_model: r.next() < 0.7 ? req.flat_model : "Improved",
      remaining_lease: leaseString(leaseMonths), resale_price: Math.round(price / 1000) * 1000,
      comparable_score: 0, _lease_months: leaseMonths, _storey_mid: storeyMid(storey),
    };
    s.comparable_score = score(req, subjLeaseMonths, s);
    sales.push(s);
  }
  sales.sort((a, b) => Number(b.comparable_score) - Number(a.comparable_score));

  const top5 = sales.slice(0, 5);
  const R = EVIDENCE_RULE;
  const evidence = {
    candidate_count: sales.length,
    top5_avg_score: top5.length ? top5.reduce((s, c) => s + Number(c.comparable_score), 0) / top5.length : null,
    top5_strong_count: top5.filter((c) => Number(c.comparable_score) >= R.strong_score_threshold).length,
    top1_score: top5.length ? Number(top5[0].comparable_score) : null,
  };
  const sufficient =
    evidence.candidate_count >= R.min_candidate_count &&
    (evidence.top5_avg_score ?? 0) >= R.min_top5_avg_score &&
    evidence.top5_strong_count >= R.min_top5_strong_count;

  const point = syntheticPrice(flatType, req.town, req.floor_area_sqm, storeyMid(req.storey_range), subjLeaseMonths / 12, 0);
  const latest = sales.reduce((m, s) => (String(s.month) > m ? String(s.month) : m), "");

  return {
    evidence_sufficient: sufficient,
    evidence,
    comparables: top5.map(({ _lease_months: _l, _storey_mid: _s, ...c }) => c),
    estimated_price: sufficient ? point : null,
    prediction_interval: sufficient ? { lower: point - INTERVAL_MARGIN, upper: point + INTERVAL_MARGIN } : null,
    evidence_rule: { ...R },
    interval_margin: INTERVAL_MARGIN,
    latest_sale_month: latest || null,
  };
}

/** Street names for the demo's type-ahead. */
export function mockStreets(towns: string[]): Record<string, string[]> {
  return Object.fromEntries(towns.map((t) => [t, syntheticStreets(t)]));
}
