import { describe, expect, it } from "vitest";
import { fromEstimateResponse, toEstimateRequest, type EstimateResponse } from "./estimate";
import { fieldFor, parseLenientJson, readable } from "./client";
import { mockEstimate } from "./mock";
import { EVIDENCE_RULE } from "./rule";
import type { AnalyseRequest } from "./types";

const FLAT: AnalyseRequest = {
  town: "ANG MO KIO", flat_type: "3 ROOM", block: "406", street_name: "ANG MO KIO AVE 10",
  storey_range: "07 TO 09", floor_area_sqm: 67, flat_model: "New Generation", lease_commence_year: 1979, asking_price: 420000,
};

const comp = (over: Partial<EstimateResponse["comparables"][number]> = {}) => ({
  month: "2026-09", town: "ANG MO KIO", flat_type: "3 ROOM", block: "406", street_name: "ANG MO KIO AVE 10",
  storey_range: "07 TO 09", floor_area_sqm: 67, flat_model: "New Generation", remaining_lease: "52 years 00 months",
  resale_price: 410000, comparable_score: 90, ...over,
});

const RESPONSE: EstimateResponse = {
  evidence_sufficient: true,
  evidence: { candidate_count: 40, top5_avg_score: 82.4, top5_strong_count: 4, top1_score: 95 },
  comparables: [comp(), comp({ block: "407", comparable_score: 80 }), comp({ street_name: "ANG MO KIO AVE 3", comparable_score: 70 })],
  estimated_price: 415_400,
  prediction_interval: { lower: 350_061, upper: 480_739 },
  latest_sale_month: "2026-10",
};

describe("toEstimateRequest", () => {
  it("builds the Lambda's request", () => {
    expect(toEstimateRequest(FLAT, "2026-11")).toEqual({
      month: "2026-11", town: "ANG MO KIO", flat_type: "3 ROOM", block: "406", street_name: "ANG MO KIO AVE 10",
      storey_range: "07 TO 09", floor_area_sqm: 67, flat_model: "New Generation", lease_commence_date: 1979,
      remaining_lease: "51 years 02 months", asking_price: 420000,
    });
  });
  it("omits a blank asking price", () => {
    expect("asking_price" in toEstimateRequest({ ...FLAT, asking_price: undefined }, "2026-11")).toBe(false);
  });
});

describe("fromEstimateResponse", () => {
  it("maps a full response", () => {
    const r = fromEstimateResponse(FLAT, RESPONSE, "2026-11");
    expect(r.estimate).toMatchObject({ point: 415_000, low: 350_000, high: 481_000 });
    expect(r.asking_comparison?.position).toBe("within_range");
    expect(r.data_month).toBe("2026-10");
    expect(r.comparables.map((c) => c.match_level)).toEqual(["same_block", "same_street", "same_town"]);
    expect(r.comparables[0].differences.months_ago).toBe(2);
    expect(r.evidence.checks.every((c) => c.passed)).toBe(true);
  });

  it("survives null fields from pandas NaN", () => {
    const res: EstimateResponse = {
      ...RESPONSE,
      comparables: [comp({ remaining_lease: null, floor_area_sqm: null }), comp({ resale_price: null }), comp({ month: null })],
    };
    const r = fromEstimateResponse(FLAT, res, "2026-11");
    // rows without a price or month are skipped; a missing lease or area just shows as unknown
    expect(r.comparables).toHaveLength(1);
    expect(r.comparables[0].remaining_lease_years).toBeNaN();
    expect(r.comparables[0].price_psm).toBeNaN();
  });

  it("shows a failing average as failing, not rounded up to the threshold", () => {
    const res: EstimateResponse = {
      ...RESPONSE, evidence_sufficient: false, estimated_price: null, prediction_interval: null,
      evidence: { candidate_count: 40, top5_avg_score: 74.96, top5_strong_count: 3, top1_score: 90 },
    };
    const check = fromEstimateResponse(FLAT, res, "2026-11").evidence.checks.find((c) => c.id === "top5_avg")!;
    expect(check.passed).toBe(false);
    expect(check.observed).toBe("average match 74.9 out of 100");
  });

  it("labels checks with the rule the server sent", () => {
    const res: EstimateResponse = { ...RESPONSE, evidence_rule: { min_candidate_count: 50 } };
    const check = fromEstimateResponse(FLAT, res, "2026-11").evidence.checks.find((c) => c.id === "count")!;
    expect(check.required).toBe("at least 50");
    expect(check.passed).toBe(false);
  });

  it("falls back to the newest comparable for the data month, never the clock", () => {
    const res: EstimateResponse = { ...RESPONSE, latest_sale_month: undefined };
    expect(fromEstimateResponse(FLAT, res, "2026-11").data_month).toBe("2026-09");
    const empty: EstimateResponse = { ...res, comparables: [] };
    expect(fromEstimateResponse(FLAT, empty, "2026-11").data_month).toBe("");
  });

  it("never shows an estimate when evidence is insufficient", () => {
    const r = fromEstimateResponse(FLAT, { ...RESPONSE, evidence_sufficient: false }, "2026-11");
    expect(r.estimate).toBeNull();
    expect(r.asking_comparison).toBeNull();
  });
});

describe("client helpers", () => {
  it("replaces bare NaN and Infinity values but not text inside strings", () => {
    const out = parseLenientJson('{"a": NaN, "b": [1, -Infinity], "c": "NaN is fine here"}') as Record<string, unknown>;
    expect(out).toEqual({ a: null, b: [1, null], c: "NaN is fine here" });
  });
  it("maps Lambda errors onto fields and plain words", () => {
    expect(fieldFor("floor_area_sqm must be numeric")).toBe("floor_area_sqm");
    expect(fieldFor("flat_model is required")).toBe("flat_model");
    expect(readable("floor_area_sqm must be positive")).toBe("Floor area must be positive");
  });
});

describe("demo data", () => {
  it("uses the production evidence rule and response shape", async () => {
    const res = await mockEstimate(toEstimateRequest(FLAT, "2026-11"));
    expect(res.evidence_rule).toMatchObject(EVIDENCE_RULE);
    expect(res.comparables.length).toBeLessThanOrEqual(5);
    const r = fromEstimateResponse(FLAT, res, "2026-11");
    expect(r.evidence.checks).toHaveLength(3);
    for (const c of r.comparables) expect(c.differences.months_ago).toBeGreaterThanOrEqual(1);
  });
});
