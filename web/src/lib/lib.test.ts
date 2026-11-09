import { describe, expect, it } from "vitest";
import { currentMonth, monthsBetween, shiftMonth } from "./months";
import { leaseString, parseLeaseYears, remainingLeaseMonths } from "./lease";
import { moneyShort, parseMoney, scoreLabel, years } from "./format";
import { compareAsking, positionAmongSales } from "./asking";
import { firstError, validateRequest } from "./validate";
import { buildSearch, parseSearch } from "./urlState";
import { parseShortlist } from "./shortlist";
import { normaliseStreet } from "../api/reference";
import type { AnalyseRequest } from "../api/types";

const FLAT: AnalyseRequest = {
  town: "ANG MO KIO", flat_type: "3 ROOM", block: "406", street_name: "ANG MO KIO AVE 10",
  storey_range: "07 TO 09", floor_area_sqm: 67, flat_model: "New Generation", lease_commence_year: 1979, asking_price: 420000,
};

describe("months", () => {
  it("uses Singapore time, not the browser's", () => {
    // 31 Oct 2026, 20:00 UTC is already 1 Nov in Singapore (UTC+8).
    expect(currentMonth(new Date(Date.UTC(2026, 9, 31, 20)))).toBe("2026-11");
    expect(currentMonth(new Date(Date.UTC(2026, 9, 31, 10)))).toBe("2026-10");
  });
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-03", -15)).toBe("2024-12");
  });
  it("counts months between", () => {
    expect(monthsBetween("2025-12", "2026-02")).toBe(2);
    expect(monthsBetween("2026-02", "2026-02")).toBe(0);
  });
});

describe("lease", () => {
  it("matches the documented example", () => {
    // 1979 lease, Nov 2026: 47 years 10 months elapsed of 99 years.
    expect(leaseString(remainingLeaseMonths(1979, "2026-11"))).toBe("51 years 02 months");
  });
  it("is the full lease when it starts this January", () => {
    expect(leaseString(remainingLeaseMonths(2026, "2026-01"))).toBe("99 years 00 months");
  });
  it("never exceeds 99 years or goes negative", () => {
    expect(remainingLeaseMonths(2030, "2026-01")).toBe(99 * 12);
    expect(remainingLeaseMonths(1900, "2026-01")).toBe(0);
  });
  it("parses every shape the API sends, and null safely", () => {
    expect(parseLeaseYears("61 years 06 months")).toBeCloseTo(61.5);
    expect(parseLeaseYears("61 years")).toBe(61);
    expect(parseLeaseYears(738)).toBeCloseTo(61.5);
    expect(parseLeaseYears(61.5)).toBe(61.5);
    expect(parseLeaseYears(null)).toBeNaN();
    expect(parseLeaseYears(undefined)).toBeNaN();
    expect(parseLeaseYears("")).toBeNaN();
  });
});

describe("format", () => {
  it("abbreviates money for chart axes", () => {
    expect(moneyShort(612_000)).toBe("$612k");
    expect(moneyShort(1_000_000)).toBe("$1m");
    expect(moneyShort(999_600)).toBe("$1m");
    expect(moneyShort(1_050_000)).toBe("$1.05m");
    expect(moneyShort(1_100_000)).toBe("$1.1m");
  });
  it("parses prices the way people type them", () => {
    expect(parseMoney("625000")).toBe(625000);
    expect(parseMoney("$625,000")).toBe(625000);
    expect(parseMoney("S$625,000")).toBe(625000);
    expect(parseMoney("625k")).toBe(625000);
    expect(parseMoney("1.1m")).toBe(1_100_000);
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("")).toBeNaN();
  });
  it("never rounds a failing score up to the threshold", () => {
    expect(scoreLabel(74.96)).toBe("74.9");
    expect(scoreLabel(75)).toBe("75");
    expect(scoreLabel(80.25)).toBe("80.2");
  });
  it("shows a dash for an unknown lease", () => {
    expect(years(NaN)).toBe("—");
    expect(years(61.5)).toBe("61 yrs 6 mo");
  });
});

describe("asking price", () => {
  const est = { point: 500_000, low: 435_000, high: 565_000 };
  it("places the price against the range", () => {
    expect(compareAsking(600_000, est).position).toBe("above_range");
    expect(compareAsking(500_000, est).position).toBe("within_range");
    expect(compareAsking(400_000, est).position).toBe("below_range");
    expect(compareAsking(550_000, est).difference_pct).toBe(10);
  });
  it("counts sales either side", () => {
    expect(positionAmongSales(500, [400, 500, 600, 700])).toEqual({ lower: 1, higher: 2, total: 4 });
  });
});

describe("street names", () => {
  it("abbreviates the HDB way", () => {
    expect(normaliseStreet("Ang Mo Kio Avenue 10")).toBe("ANG MO KIO AVE 10");
    expect(normaliseStreet("bukit batok street 21")).toBe("BT BATOK ST 21");
    expect(normaliseStreet("Jalan Bukit Merah")).toBe("JLN BT MERAH");
  });
  it("keeps the dot in Saint, which HDB writes as ST.", () => {
    expect(normaliseStreet("St. George's Road")).toBe("ST. GEORGE'S RD");
    expect(normaliseStreet("Saint George's Road")).toBe("ST. GEORGE'S RD");
  });
  it("drops other stray dots and commas", () => {
    expect(normaliseStreet("Ang Mo Kio Ave. 10,")).toBe("ANG MO KIO AVE 10");
  });
});

describe("validation", () => {
  it("accepts a complete flat", () => {
    expect(validateRequest(FLAT)).toEqual({});
  });
  it("rejects values outside the lists and ranges", () => {
    const e = validateRequest({ ...FLAT, town: "XYZ", floor_area_sqm: -5, lease_commence_year: 1800, flat_type: "FOO" as never });
    expect(Object.keys(e).sort()).toEqual(["flat_type", "floor_area_sqm", "lease_commence_year", "town"]);
  });
  it("reports the first error in on-page order", () => {
    const e = validateRequest({ ...FLAT, block: "", floor_area_sqm: "" as never });
    expect(firstError(e)).toBe("block");
  });
});

describe("URL state", () => {
  it("round-trips a flat", () => {
    const s = parseSearch(buildSearch("check", FLAT));
    expect(s.valid).toBe(true);
    expect(s.request).toEqual(FLAT);
  });
  it("marks a tampered link as invalid instead of running it", () => {
    const s = parseSearch("?town=XYZ&flat_type=FOO&floor_area_sqm=-5&lease_commence_year=1800&storey_range=01%20TO%2003&flat_model=Improved");
    expect(s.request).not.toBeNull();
    expect(s.valid).toBe(false);
  });
  it("reads the view", () => {
    expect(parseSearch("?view=method").view).toBe("method");
    expect(parseSearch("?view=nonsense").view).toBe("check");
  });
});

describe("shortlist storage", () => {
  it("drops malformed entries instead of crashing", () => {
    const good = { id: "a", request: FLAT, data_month: "2026-10", sufficient: true, estimate: { point: 1, low: 0, high: 2, interval_level: 0.9, model_version: "" }, asking_comparison: null, comparable_count: 5, remaining_lease_years: 51.2 };
    const items = parseShortlist(JSON.stringify([good, { id: "b" }, null, 42, { request: { town: "XYZ" } }]));
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("a");
  });
  it("survives invalid JSON and non-arrays", () => {
    expect(parseShortlist("{not json")).toEqual([]);
    expect(parseShortlist('{"a":1}')).toEqual([]);
  });
  it("reads entries saved by the previous version", () => {
    const old = { id: "o", request: FLAT, snapshot_month: "2026-09", sufficient: false, estimate: null, asking_comparison: null, comparable_count: 3, remaining_lease_years: 51 };
    expect(parseShortlist(JSON.stringify([old]))[0].data_month).toBe("2026-09");
  });
});
