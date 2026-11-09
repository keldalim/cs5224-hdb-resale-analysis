import type { AskingComparison, Estimate } from "../api/types";

/** Where an asking price sits against the estimate and its likely range. */
export function compareAsking(askingPrice: number, estimate: Pick<Estimate, "point" | "low" | "high">): AskingComparison {
  const difference = askingPrice - estimate.point;
  return {
    asking_price: askingPrice,
    difference,
    difference_pct: Math.round((difference / estimate.point) * 1000) / 10,
    position: askingPrice < estimate.low ? "below_range" : askingPrice > estimate.high ? "above_range" : "within_range",
  };
}

/** How many of the given sale prices are below / above the asking price. */
export function positionAmongSales(askingPrice: number, prices: number[]): { lower: number; higher: number; total: number } {
  return {
    lower: prices.filter((p) => p < askingPrice).length,
    higher: prices.filter((p) => p > askingPrice).length,
    total: prices.length,
  };
}
