import type { FlatType, MetaResponse } from "./types";

/**
 * Fallback reference lists, taken from the categories used in HDB's
 * "Resale flat prices based on registration date from Jan-2017 onwards"
 * dataset. Used when GET /meta is unavailable and by demo mode.
 */
export const TOWNS = [
  "ANG MO KIO", "BEDOK", "BISHAN", "BUKIT BATOK", "BUKIT MERAH", "BUKIT PANJANG",
  "BUKIT TIMAH", "CENTRAL AREA", "CHOA CHU KANG", "CLEMENTI", "GEYLANG", "HOUGANG",
  "JURONG EAST", "JURONG WEST", "KALLANG/WHAMPOA", "MARINE PARADE", "PASIR RIS",
  "PUNGGOL", "QUEENSTOWN", "SEMBAWANG", "SENGKANG", "SERANGOON", "TAMPINES",
  "TOA PAYOH", "WOODLANDS", "YISHUN",
];

export const FLAT_TYPES: FlatType[] = [
  "1 ROOM", "2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE", "MULTI-GENERATION",
];

// Matches the options the backend model was trained and tested with.
export const FLAT_MODELS = [
  "2-room", "Adjoined flat", "Apartment", "DBSS", "Improved",
  "Improved-Maisonette", "Maisonette", "Model A", "Model A-Maisonette", "Model A2",
  "Multi Generation", "New Generation", "Premium Apartment", "Premium Apartment Loft",
  "Premium Maisonette", "Simplified", "Standard", "Terrace", "Type S1", "Type S2",
];

export const STOREY_RANGES = Array.from({ length: 17 }, (_, i) => {
  const lo = i * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(lo)} TO ${pad(lo + 2)}`;
});

/** Typical floor area by flat type, used only to pre-fill the form. */
export const TYPICAL_AREA: Record<FlatType, number> = {
  "1 ROOM": 31, "2 ROOM": 45, "3 ROOM": 68, "4 ROOM": 93, "5 ROOM": 113,
  EXECUTIVE: 143, "MULTI-GENERATION": 164,
};

export const FALLBACK_META: MetaResponse = {
  towns: TOWNS,
  flat_types: FLAT_TYPES,
  flat_models: FLAT_MODELS,
  storey_ranges: STOREY_RANGES,
};

/**
 * HDB writes street names with fixed abbreviations ("ANG MO KIO AVE 10",
 * "BT BATOK ST 21"). The backend only counts a same-street match on an exact
 * string, so expand-to-abbreviation common words people type in full.
 */
const STREET_WORDS: Record<string, string> = {
  AVENUE: "AVE", STREET: "ST", ROAD: "RD", DRIVE: "DR", CENTRAL: "CTRL", NORTH: "NTH",
  SOUTH: "STH", CRESCENT: "CRES", PLACE: "PL", CLOSE: "CL", BUKIT: "BT", JALAN: "JLN",
  KAMPONG: "KG", LORONG: "LOR", UPPER: "UPP", TANJONG: "TG", COMMONWEALTH: "C'WEALTH",
  HEIGHTS: "HTS", GARDENS: "GDNS", TERRACE: "TER",
};
export function normaliseStreet(s: string): string {
  return s
    .toUpperCase()
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      // HDB keeps the dot in "ST. GEORGE'S RD" (Saint); everywhere else it writes no dots.
      if (i === 0 && (w === "ST." || w === "SAINT")) return "ST.";
      const bare = w.replace(/\./g, "");
      return STREET_WORDS[bare] ?? bare;
    })
    .filter(Boolean)
    .join(" ");
}

/** Title-case HDB's upper-case town and street names for display. */
export function displayName(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s/(-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\bSt\b/g, "St")
    .replace(/\bAve\b/g, "Ave");
}

/** Convert a "01 TO 03" storey range to a friendly "Floors 1–3". */
export function storeyLabel(range: string): string {
  const m = range.match(/(\d+)\s*TO\s*(\d+)/i);
  if (!m) return range;
  return `Floors ${Number(m[1])}–${Number(m[2])}`;
}

export function storeyIndex(range: string): number {
  const m = range.match(/(\d+)/);
  return m ? Math.floor((Number(m[1]) - 1) / 3) : 0;
}
