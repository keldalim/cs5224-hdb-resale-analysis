import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyseResponse, Comparable } from "../api/types";
import { displayName, storeyLabel } from "../api/reference";
import { money, moneyShort, monthLabel } from "../lib/format";

interface Props {
  result: AnalyseResponse;
  activeRank: number | null;
  onActive: (rank: number | null) => void;
}

const H = 168;
const PAD_X = 20;
const AXIS_Y = 132;
const DOT_R = 6;

function niceStep(span: number): number {
  const raw = span / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

/** A one-sentence takeaway of the chart, for screen readers. */
export function chartSummary(result: AnalyseResponse): string {
  const prices = result.comparables.map((c) => c.resale_price);
  const parts: string[] = [];
  if (prices.length) {
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    parts.push(prices.length === 1 ? `1 similar sale at ${moneyShort(lo)}` : `${prices.length} similar sales from ${moneyShort(lo)} to ${moneyShort(hi)}`);
  }
  const e = result.estimate;
  if (e) parts.push(`likely range ${moneyShort(e.low)} to ${moneyShort(e.high)}`);
  const a = result.subject.asking_price;
  if (a) {
    const where = e ? (a > e.high ? ", above the range" : a < e.low ? ", below the range" : ", inside the range") : "";
    parts.push(`asking price ${moneyShort(a)}${where}`);
  }
  const s = parts.join("; ");
  return s ? `Price chart: ${s}.` : "Price chart.";
}

/**
 * One-dimensional dot strip: each similar sale at its actual price, with the
 * estimate's likely range as a band and the asking price as a marker.
 */
export function PriceStrip({ result, activeRank, onActive }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { estimate, comparables: comps } = result;
  const asking = result.subject.asking_price;

  const layout = useMemo(() => {
    const vals = comps.map((c) => c.resale_price);
    if (estimate) vals.push(estimate.low, estimate.high);
    if (asking) vals.push(asking);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.08, 10_000);
    lo -= pad;
    hi += pad;
    const step = niceStep(hi - lo);
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    const x = (v: number) => PAD_X + ((v - lo) / (hi - lo)) * (w - PAD_X * 2);

    // Stack dots upward when they would overlap, so every sale stays visible.
    const placed: { c: Comparable; cx: number; cy: number }[] = [];
    [...comps].sort((a, b) => a.resale_price - b.resale_price).forEach((c) => {
      const cx = x(c.resale_price);
      let level = 0;
      while (placed.some((p) => Math.abs(p.cx - cx) < DOT_R * 2 + 3 && p.cy === AXIS_Y - 22 - level * (DOT_R * 2 + 3))) level++;
      placed.push({ c, cx, cy: AXIS_Y - 22 - level * (DOT_R * 2 + 3) });
    });
    return { x, ticks, placed };
  }, [comps, estimate, asking, w]);

  if (comps.length === 0 && !estimate) return null;
  const { x, ticks, placed } = layout;
  const active = placed.find((p) => p.c.rank === activeRank) ?? null;

  const askX = asking ? x(asking) : null;
  const summary = chartSummary(result);
  const estLabelLeft = estimate ? x(estimate.point) : 0;
  const clash = askX !== null && estimate && Math.abs(askX - estLabelLeft) < 90;

  return (
    <figure className="strip card" aria-labelledby="strip-h">
      <h2 className="section-h" id="strip-h">Where the prices sit</h2>
      <div className="strip-legend" aria-hidden="true">
        <span className="lg lg-dot">Similar sale, actual price</span>
        {estimate && <span className="lg lg-band">Likely range</span>}
        {asking && <span className="lg lg-ask">Asking price</span>}
      </div>
      <div ref={wrap} className="strip-plot">
        <svg width={w} height={H} role="img" aria-label={summary}>
          {estimate && (
            <g>
              <rect className="strip-band" x={x(estimate.low)} y={14} width={Math.max(2, x(estimate.high) - x(estimate.low))} height={AXIS_Y - 14} rx={4} />
              <line className="strip-est" x1={x(estimate.point)} x2={x(estimate.point)} y1={14} y2={AXIS_Y} />
              <text className="strip-est-label" x={x(estimate.point)} y={10} textAnchor={clash && askX! > estLabelLeft ? "end" : clash ? "start" : "middle"} dx={clash ? (askX! > estLabelLeft ? -6 : 6) : 0}>
                Estimate {moneyShort(estimate.point)}
              </text>
            </g>
          )}

          <line className="strip-axis" x1={PAD_X} x2={w - PAD_X} y1={AXIS_Y} y2={AXIS_Y} />
          {ticks.map((t) => (
            <g key={t}>
              <line className="strip-tick" x1={x(t)} x2={x(t)} y1={AXIS_Y} y2={AXIS_Y + 5} />
              <text className="strip-tick-label" x={x(t)} y={AXIS_Y + 20} textAnchor="middle">{moneyShort(t)}</text>
            </g>
          ))}

          {askX !== null && (
            <g>
              <line className="strip-ask" x1={askX} x2={askX} y1={clash ? 22 : 14} y2={AXIS_Y + 2} />
              <path className="strip-ask-head" d={`M${askX - 6},${AXIS_Y + 2} L${askX + 6},${AXIS_Y + 2} L${askX},${AXIS_Y - 6} Z`} />
              <text
                className="strip-ask-label"
                x={askX}
                y={clash ? 20 : 10}
                textAnchor={askX > w - 80 ? "end" : askX < 80 ? "start" : clash ? (askX > estLabelLeft ? "start" : "end") : "middle"}
                dx={clash ? (askX > estLabelLeft ? 6 : -6) : 0}
              >
                Asking {moneyShort(asking!)}
              </text>
            </g>
          )}

          {placed.map(({ c, cx, cy }) => (
            <g
              key={c.rank}
              className={`strip-dot${activeRank === c.rank ? " is-active" : ""}`}
              aria-hidden="true"
              onMouseEnter={() => onActive(c.rank)}
              onMouseLeave={() => onActive(null)}
            >
              <circle cx={cx} cy={cy} r={14} className="strip-hit" />
              <circle cx={cx} cy={cy} r={DOT_R} />
            </g>
          ))}
        </svg>

        {active && (
          <div
            className="strip-tip"
            aria-hidden="true"
            style={{ left: Math.min(Math.max(active.cx, 110), w - 110), top: active.cy - 12 }}
          >
            <strong>{money(active.c.resale_price)}</strong>
            <span>{monthLabel(active.c.month)}, sale {active.c.rank}</span>
            <span>Blk {active.c.block} {displayName(active.c.street_name)}</span>
            <span>{active.c.floor_area_sqm} sqm, {storeyLabel(active.c.storey_range)}</span>
          </div>
        )}
      </div>
      <figcaption id="strip-cap" className="strip-cap">
        Each dot is a similar sale at its actual price.
        {estimate && " The estimate comes from the price model, not an average of the dots."}
        <span className="sr-only"> {summary} The table below lists every sale.</span>
      </figcaption>
    </figure>
  );
}
