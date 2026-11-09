/**
 * Data shapes used inside the web client. The team's POST /estimate response
 * is translated into these in api/estimate.ts (see docs/API.md). Demo mode
 * produces a POST /estimate-shaped payload and goes through the same adapter.
 */

export type FlatType =
  | "1 ROOM" | "2 ROOM" | "3 ROOM" | "4 ROOM" | "5 ROOM" | "EXECUTIVE" | "MULTI-GENERATION";

/** Reference lists the form is built from. */
export interface MetaResponse {
  towns: string[];
  flat_types: FlatType[];
  flat_models: string[];
  /** e.g. "01 TO 03", in ascending order. */
  storey_ranges: string[];
  /** Optional: street names per town, used for type-ahead. */
  streets_by_town?: Record<string, string[]>;
}

/** What the form produces (translated to the API request in api/estimate.ts) */
export interface AnalyseRequest {
  town: string;
  flat_type: FlatType;
  block?: string;
  street_name?: string;
  storey_range: string;
  floor_area_sqm: number;
  flat_model: string;
  lease_commence_year: number;
  asking_price?: number;
}

export interface EvidenceCheck {
  /** Stable id, e.g. "count", "top5_avg", "top5_strong". */
  id: string;
  /** Plain-language description of the requirement. */
  label: string;
  passed: boolean;
  /** Observed value rendered for people, e.g. "7 found". */
  observed: string;
  /** Required value rendered for people, e.g. "at least 10". */
  required: string;
}

export interface Evidence {
  sufficient: boolean;
  rule_version: string;
  checks: EvidenceCheck[];
  /** One sentence explaining the outcome, written for buyers. */
  summary: string;
}

export interface Estimate {
  point: number;
  low: number;
  high: number;
  /** Nominal coverage of [low, high] on calibration data, e.g. 0.9. */
  interval_level: number;
  model_version: string;
}

export type AskingPosition = "below_range" | "within_range" | "above_range";

export interface AskingComparison {
  asking_price: number;
  /** asking_price - estimate.point (positive = asking is higher). */
  difference: number;
  difference_pct: number;
  position: AskingPosition;
}

export type MatchLevel = "same_block" | "same_street" | "same_town";

export interface Comparable {
  rank: number;
  /** "YYYY-MM" registration month. */
  month: string;
  town: string;
  block: string;
  street_name: string;
  flat_type: FlatType;
  flat_model: string;
  storey_range: string;
  floor_area_sqm: number;
  /** Remaining lease at time of sale, in years (may be fractional). */
  remaining_lease_years: number;
  resale_price: number;
  price_psm: number;
  /** 0..1 similarity to the subject flat. */
  similarity: number;
  match_level: MatchLevel;
  /** Comparable minus subject. */
  differences: {
    floor_area_sqm: number;
    /** Number of storey bands (3 floors each) above (+) or below (-) the subject. */
    storey_bands: number;
    remaining_lease_years: number;
    months_ago: number;
  };
}

/** What the UI renders (built from the API response in api/estimate.ts) */
export interface AnalyseResponse {
  request_id: string;
  /** Latest sale month in the data searched ("YYYY-MM"), or "" when unknown. */
  data_month: string;
  subject: AnalyseRequest & { remaining_lease_years: number };
  evidence: Evidence;
  /** null when evidence is insufficient — the service abstains. */
  estimate: Estimate | null;
  /** null when no asking price was given or when estimate is null. */
  asking_comparison: AskingComparison | null;
  /** Ranked, most similar first; typically 5, may be fewer or empty. */
  comparables: Comparable[];
  /** How many candidate transactions were retrieved before ranking. */
  candidates_considered: number;
  /** Optional non-fatal notes, e.g. about the street spelling. */
  notes?: string[];
}
