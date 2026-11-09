/**
 * The evidence rule and likely-range margin.
 *
 * Read at build time from the backend's own calibration file, so there is one
 * source of truth. The Lambda also echoes the rule and margin it used in each
 * response; when present, those values win (see api/estimate.ts).
 */
import calibration from "../../../models/final/hdb_resale_calibration.json";

export interface EvidenceRule {
  min_candidate_count: number;
  min_top5_avg_score: number;
  min_top5_strong_count: number;
  strong_score_threshold: number;
}

export const EVIDENCE_RULE: EvidenceRule = calibration.evidence_rule;
export const CALIBRATION_MONTH: string = calibration.calibration_month;
export const INTERVAL_MARGIN: number = calibration.interval.interval_margin;
export const INTERVAL_COVERAGE: number = calibration.interval.target_coverage;

/** Read a rule echoed by the server, falling back field by field to the build-time rule. */
export function ruleFrom(v: unknown): EvidenceRule {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const pick = (k: keyof EvidenceRule) => {
    const x = Number(o[k]);
    return o[k] != null && Number.isFinite(x) ? x : EVIDENCE_RULE[k];
  };
  return {
    min_candidate_count: pick("min_candidate_count"),
    min_top5_avg_score: pick("min_top5_avg_score"),
    min_top5_strong_count: pick("min_top5_strong_count"),
    strong_score_threshold: pick("strong_score_threshold"),
  };
}
