const sgd0 = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

/** $612,000 */
export const money = (n: number) => sgd0.format(n).replace("SGD", "$").replace(/^S\$/, "$");

/** $612k / $1.05m / $1m — for tight spaces like chart axes */
export function moneyShort(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const k = Math.round(a / 1000);
  if (k >= 1000) return `${sign}$${String(Number((a / 1_000_000).toFixed(2)))}m`;
  return `${sign}$${k}k`;
}

/**
 * Parse a price typed by a person: "625000", "$625,000", "S$625,000", "625k", "1.1m".
 * Returns NaN when it isn't a price.
 */
export function parseMoney(s: string): number {
  const t = s.trim().toLowerCase().replace(/^s(?=\$)/, "").replace(/[$,\s]/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return NaN;
  const mult = m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1000 : 1;
  return Math.round(Number(m[1]) * mult);
}

/** +$12,000 / −$8,000 (true minus sign) */
export function signedMoney(n: number): string {
  if (n === 0) return "$0";
  return `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "Sep 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS[m - 1]} ${y}`;
}

export function years(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const y = Math.floor(n);
  const mo = Math.round((n - y) * 12);
  if (mo === 0) return `${y} yrs`;
  if (mo === 12) return `${y + 1} yrs`;
  return `${y} yrs ${mo} mo`;
}

/** A score shown to people: floored to one decimal, so 74.96 never reads as 75. */
export function scoreLabel(n: number): string {
  const v = Math.floor(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
