/**
 * Lease helpers. HDB leases are 99 years; like the lightweight client
 * (frontend/app.js) we count from January of the commencement year.
 */
import { monthIndex } from "./months";

const LEASE_MONTHS = 99 * 12;

export function remainingLeaseMonths(leaseYear: number, ym: string): number {
  const elapsed = monthIndex(ym) - leaseYear * 12;
  return Math.max(0, Math.min(LEASE_MONTHS, LEASE_MONTHS - elapsed));
}

/** 614 → "51 years 02 months" (the Lambda's remaining_lease format) */
export function leaseString(totalMonths: number): string {
  return `${Math.floor(totalMonths / 12)} years ${String(totalMonths % 12).padStart(2, "0")} months`;
}

/**
 * Parse a remaining lease from the API ("61 years 04 months", "61 years",
 * 736 months, or 61.3 years) into years. Returns NaN when it can't be read,
 * including null from a pandas NaN.
 */
export function parseLeaseYears(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? (v > 150 ? v / 12 : v) : NaN;
  if (typeof v !== "string") return NaN;
  const y = v.match(/(\d+)\s*year/i);
  const mo = v.match(/(\d+)\s*month/i);
  if (y || mo) return Number(y?.[1] ?? 0) + Number(mo?.[1] ?? 0) / 12;
  const x = Number(v);
  return v.trim() !== "" && Number.isFinite(x) ? x : NaN;
}
