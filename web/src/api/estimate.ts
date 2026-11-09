/**
 * Adapter for the team's API: POST /estimate (src/lambda_handler.py).
 *
 * It translates the form into the Lambda's request format and the Lambda's
 * response into the shape the UI renders (AnalyseResponse). The ranking,
 * evidence rule, XGBoost estimate and conformal interval all run in the Lambda;
 * nothing here re-decides whether an estimate is shown.
 */
import type { AnalyseRequest, AnalyseResponse, Comparable, EvidenceCheck, FlatType, MatchLevel } from "./types";
import { storeyIndex } from "./reference";
import { CALIBRATION_MONTH, INTERVAL_COVERAGE, ruleFrom } from "./rule";
import { compareAsking } from "../lib/asking";
import { scoreLabel } from "../lib/format";
import { leaseString, parseLeaseYears, remainingLeaseMonths } from "../lib/lease";
import { currentMonth, isMonth, monthsBetween } from "../lib/months";

/** Request body expected by the Lambda (backend_service.validate_request). */
export interface EstimateRequest {
  month: string;
  town: string;
  flat_type: string;
  block: string;
  street_name: string;
  storey_range: string;
  floor_area_sqm: number;
  flat_model: string;
  lease_commence_date: number;
  remaining_lease: string;
  asking_price?: number;
}

/** One comparable as it arrives on the wire. pandas NaN arrives as null. */
export interface EstimateComparable {
  month: string | null;
  town: string | null;
  flat_type: string | null;
  block: string | null;
  street_name: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
  flat_model: string | null;
  remaining_lease: string | number | null;
  resale_price: number | string | null;
  comparable_score: number | string | null;
}

export interface EstimateResponse {
  evidence_sufficient: boolean;
  evidence: {
    candidate_count: number;
    top5_avg_score: number | null;
    top5_strong_count: number;
    top1_score: number | null;
  };
  comparables: EstimateComparable[];
  estimated_price: number | null;
  prediction_interval: { lower: number; upper: number } | null;
  /** Echoed by newer Lambdas; older ones omit these. */
  evidence_rule?: Partial<Record<string, number>>;
  interval_margin?: number;
  latest_sale_month?: string | null;
}

const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : "");

export function toEstimateRequest(req: AnalyseRequest, month = currentMonth()): EstimateRequest {
  const body: EstimateRequest = {
    month,
    town: req.town,
    flat_type: req.flat_type,
    block: upper(req.block),
    street_name: upper(req.street_name),
    storey_range: req.storey_range,
    floor_area_sqm: req.floor_area_sqm,
    flat_model: req.flat_model,
    lease_commence_date: req.lease_commence_year,
    remaining_lease: leaseString(remainingLeaseMonths(req.lease_commence_year, month)),
  };
  if (req.asking_price) body.asking_price = req.asking_price;
  return body;
}

const num = (v: unknown, fallback = 0): number => {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : fallback;
};

export function fromEstimateResponse(req: AnalyseRequest, res: EstimateResponse, month = currentMonth()): AnalyseResponse {
  const subjRemaining = remainingLeaseMonths(req.lease_commence_year, month) / 12;
  const subjBlock = upper(req.block);
  const subjStreet = upper(req.street_name);
  const subjStorey = storeyIndex(req.storey_range);

  const comparables: Comparable[] = [];
  for (const c of Array.isArray(res.comparables) ? res.comparables : []) {
    if (!c || typeof c !== "object") continue;
    const price = num(c.resale_price, NaN);
    const cm = typeof c.month === "string" ? c.month.slice(0, 7) : "";
    // A sale without a price or month can't be shown or charted; skip it rather than fail the whole result.
    if (!Number.isFinite(price) || !isMonth(cm)) continue;
    const area = num(c.floor_area_sqm, NaN);
    const remaining = parseLeaseYears(c.remaining_lease);
    const street = upper(c.street_name);
    const block = upper(c.block);
    const storey = typeof c.storey_range === "string" ? c.storey_range : "";
    const match_level: MatchLevel =
      street === subjStreet && block === subjBlock ? "same_block" : street === subjStreet ? "same_street" : "same_town";
    comparables.push({
      rank: comparables.length + 1,
      month: cm,
      town: String(c.town ?? req.town),
      block,
      street_name: street,
      flat_type: String(c.flat_type ?? req.flat_type) as FlatType,
      flat_model: String(c.flat_model ?? ""),
      storey_range: storey,
      floor_area_sqm: area,
      remaining_lease_years: Number.isFinite(remaining) ? Math.round(remaining * 10) / 10 : NaN,
      resale_price: price,
      price_psm: area > 0 ? Math.round(price / area) : NaN,
      similarity: Math.max(0, Math.min(1, num(c.comparable_score) / 100)),
      match_level,
      differences: {
        floor_area_sqm: Number.isFinite(area) ? Math.round((area - req.floor_area_sqm) * 10) / 10 : NaN,
        storey_bands: storey ? storeyIndex(storey) - subjStorey : NaN,
        remaining_lease_years: Number.isFinite(remaining) ? Math.round((remaining - subjRemaining) * 10) / 10 : NaN,
        months_ago: Math.max(0, monthsBetween(cm, month)),
      },
    });
  }

  const ev = res.evidence ?? { candidate_count: 0, top5_avg_score: 0, top5_strong_count: 0, top1_score: 0 };
  const count = num(ev.candidate_count);
  const avg = num(ev.top5_avg_score);
  const strong = num(ev.top5_strong_count);
  const R = ruleFrom(res.evidence_rule);
  const checks: EvidenceCheck[] = [
    {
      id: "count",
      label: "Enough sales of this flat type in this town in the past year",
      passed: count >= R.min_candidate_count,
      observed: `${count} found`,
      required: `at least ${R.min_candidate_count}`,
    },
    {
      id: "top5_avg",
      label: "The five closest sales are good matches on average",
      passed: count > 0 && avg >= R.min_top5_avg_score,
      observed: count > 0 ? `average match ${scoreLabel(avg)} out of 100` : "no sales to score",
      required: `at least ${R.min_top5_avg_score}`,
    },
    {
      id: "top5_strong",
      label: "Some of those five are strong matches",
      passed: strong >= R.min_top5_strong_count,
      observed: `${strong} of 5 score ${R.strong_score_threshold} or more`,
      required: `at least ${R.min_top5_strong_count}`,
    },
  ];
  const sufficient = Boolean(res.evidence_sufficient);
  const failed = checks.filter((c) => !c.passed).map((c) => c.label.toLowerCase());

  let estimate: AnalyseResponse["estimate"] = null;
  if (sufficient && res.estimated_price != null && res.prediction_interval) {
    const round = (x: number) => Math.round(x / 1000) * 1000;
    const point = num(res.estimated_price, NaN);
    const low = num(res.prediction_interval.lower, NaN);
    const high = num(res.prediction_interval.upper, NaN);
    if ([point, low, high].every(Number.isFinite)) {
      estimate = {
        point: round(point),
        low: round(low),
        high: round(high),
        interval_level: INTERVAL_COVERAGE,
        model_version: `xgboost, calibrated ${CALIBRATION_MONTH}`,
      };
    }
  }

  const asking = estimate && req.asking_price ? compareAsking(req.asking_price, estimate) : null;

  const notes: string[] = [];
  if (comparables.length > 0 && !comparables.some((c) => c.match_level !== "same_town")) {
    notes.push(
      "None of the closest sales are on the same street. Same-street sales count for a lot in the match score, so check the street is spelt as HDB writes it (for example, Ang Mo Kio Ave 10).",
    );
  }

  // Only claim a data month the server (or the sales themselves) told us about.
  const newestComparable = comparables.reduce((m, c) => (c.month > m ? c.month : m), "");
  const data_month = isMonth(res.latest_sale_month) ? res.latest_sale_month : newestComparable;

  return {
    request_id: `est-${Date.now().toString(36)}`,
    data_month,
    subject: { ...req, remaining_lease_years: Math.round(subjRemaining * 10) / 10 },
    evidence: {
      sufficient,
      rule_version: `calibrated ${CALIBRATION_MONTH}`,
      checks,
      summary: sufficient
        ? "The closest sales passed every evidence check, so the model's estimate is shown."
        : count === 0
          ? "No sales of this flat type in this town were found in the past 12 months, so no estimate is shown."
          : failed.length
            ? `No estimate is shown because the sales found did not meet these checks: ${failed.join(", ")}.`
            : "No estimate is shown because the sales found did not meet the evidence checks.",
    },
    estimate,
    asking_comparison: asking,
    comparables,
    candidates_considered: count,
    notes,
  };
}
