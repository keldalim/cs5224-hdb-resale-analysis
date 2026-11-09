/**
 * One set of rules for a flat's details, shared by the form and by links that
 * arrive in the URL. They mirror the Lambda's validate_request.
 */
import type { AnalyseRequest, FlatType } from "../api/types";
import { FLAT_MODELS, FLAT_TYPES, STOREY_RANGES, TOWNS } from "../api/reference";
import { currentYear } from "./months";

export type RequestErrors = Partial<Record<keyof AnalyseRequest, string>>;

/** The order the fields appear on the page, so "first error" means the first one people see. */
export const FIELD_ORDER: (keyof AnalyseRequest)[] = [
  "town", "flat_type", "block", "street_name", "storey_range",
  "floor_area_sqm", "flat_model", "lease_commence_year", "asking_price",
];

export const LIMITS = {
  area: [20, 300] as const,
  leaseYear: [1960] as const,
  asking: [50_000, 5_000_000] as const,
};

export function validateRequest(r: Partial<Record<keyof AnalyseRequest, unknown>>): RequestErrors {
  const e: RequestErrors = {};
  const year = currentYear();
  if (!r.town) e.town = "Choose the town the flat is in.";
  else if (!TOWNS.includes(String(r.town))) e.town = "Choose a town from the list.";

  if (!FLAT_TYPES.includes(r.flat_type as FlatType)) e.flat_type = "Choose the flat type.";

  const block = String(r.block ?? "").trim();
  if (!block) e.block = "Enter the block number.";
  else if (!/^\d{1,4}[A-Za-z]?$/.test(block)) e.block = "Use the block number only, like 406 or 128C.";

  if (!String(r.street_name ?? "").trim()) e.street_name = "Enter the street name. Sales on the same street count most.";

  if (!r.storey_range) e.storey_range = "Choose the floor range the flat is on.";
  else if (!STOREY_RANGES.includes(String(r.storey_range))) e.storey_range = "Choose a floor range from the list.";

  const area = Number(r.floor_area_sqm);
  if (r.floor_area_sqm === undefined || r.floor_area_sqm === "") e.floor_area_sqm = "Enter the floor area in square metres. It's on the listing.";
  else if (!Number.isFinite(area) || area < LIMITS.area[0] || area > LIMITS.area[1]) e.floor_area_sqm = `Enter an area between ${LIMITS.area[0]} and ${LIMITS.area[1]} sqm.`;

  if (!r.flat_model) e.flat_model = "Choose the flat model. It's on the listing or the HDB Flat Portal.";
  else if (!FLAT_MODELS.includes(String(r.flat_model))) e.flat_model = "Choose a flat model from the list.";

  const yr = Number(r.lease_commence_year);
  if (r.lease_commence_year === undefined || r.lease_commence_year === "") e.lease_commence_year = "Enter the year the lease started. It's on the HDB listing.";
  else if (!Number.isInteger(yr) || yr < LIMITS.leaseYear[0] || yr > year) e.lease_commence_year = `Enter a year between ${LIMITS.leaseYear[0]} and ${year}.`;

  if (r.asking_price !== undefined && r.asking_price !== "") {
    const p = Number(r.asking_price);
    if (!Number.isFinite(p) || p < LIMITS.asking[0] || p > LIMITS.asking[1]) {
      e.asking_price = "Enter an asking price between $50,000 and $5,000,000 (625000 or 625k both work), or leave it blank.";
    }
  }
  return e;
}

export function firstError(e: RequestErrors): keyof AnalyseRequest | undefined {
  return FIELD_ORDER.find((k) => e[k]);
}
