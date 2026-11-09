/** Month helpers. All months are "YYYY-MM" strings. */

const SG_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit" });

/**
 * Current month in Singapore time. The Lambda's 12-month search window and the
 * model's month index are both Singapore months, so a visitor abroad must not
 * send their local month.
 */
export function currentMonth(d = new Date()): string {
  const parts = SG_PARTS.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? String(d.getUTCFullYear());
  const m = parts.find((p) => p.type === "month")?.value ?? String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function currentYear(d = new Date()): number {
  return Number(currentMonth(d).slice(0, 4));
}

/** Months since year 0, for differences between months. */
export function monthIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
}

export function shiftMonth(ym: string, delta: number): string {
  const idx = monthIndex(ym) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Whole months from `from` to `to` (positive when `to` is later). */
export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from);
}

export function isMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}
