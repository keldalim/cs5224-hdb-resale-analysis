import type { FlatType } from "../api/types";

const SHORT: Record<FlatType, string> = {
  "1 ROOM": "1-room", "2 ROOM": "2-room", "3 ROOM": "3-room", "4 ROOM": "4-room", "5 ROOM": "5-room",
  EXECUTIVE: "Executive", "MULTI-GENERATION": "Multi-gen",
};

/** "4 ROOM" → "4-room"; the long form spells out "Multi-generation". */
export function flatTypeLabel(t: string, long = false): string {
  if (t === "MULTI-GENERATION" && long) return "Multi-generation";
  return SHORT[t as FlatType] ?? t;
}
