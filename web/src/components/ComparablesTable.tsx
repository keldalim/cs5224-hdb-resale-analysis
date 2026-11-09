import type { Comparable, MatchLevel } from "../api/types";
import { displayName, storeyLabel } from "../api/reference";
import { money, monthLabel, years } from "../lib/format";

interface Props {
  comparables: Comparable[];
  candidatesConsidered: number;
  activeRank: number | null;
  onActive: (rank: number | null) => void;
}

const MATCH: Record<MatchLevel, string> = {
  same_block: "Same block",
  same_street: "Same street",
  same_town: "Same town",
};

type D = { text: string; tone: string };

function diffText(n: number, unit: string, more: string, less: string, digits = 0): D {
  if (!Number.isFinite(n)) return { text: "", tone: "same" };
  const v = Number(n.toFixed(digits));
  if (v === 0) return { text: "same", tone: "same" };
  return { text: `${Math.abs(v).toFixed(digits)}${unit} ${v > 0 ? more : less}`, tone: v > 0 ? "up" : "down" };
}

function Diff({ d }: { d: D }) {
  return d.text ? <span className={`diff diff-${d.tone}`}>{d.text}</span> : null;
}

const dash = (ok: boolean, s: () => string) => (ok ? s() : "—");

function rowParts(c: Comparable) {
  const d = c.differences;
  return {
    sold: monthLabel(c.month),
    ago: d.months_ago === 0 ? "this month" : `${d.months_ago} mo ago`,
    address: `Blk ${c.block} ${displayName(c.street_name)}`,
    storey: c.storey_range ? storeyLabel(c.storey_range) : "—",
    storeyDiff: diffText(d.storey_bands * 3, " floors", "higher", "lower"),
    area: dash(Number.isFinite(c.floor_area_sqm), () => `${c.floor_area_sqm} sqm`),
    areaDiff: diffText(d.floor_area_sqm, " sqm", "bigger", "smaller"),
    lease: years(c.remaining_lease_years),
    leaseDiff: diffText(d.remaining_lease_years, " yrs", "more", "less", 1),
    psm: dash(Number.isFinite(c.price_psm), () => money(c.price_psm)),
    pct: Math.round(c.similarity * 100),
  };
}

export function ComparablesTable({ comparables, candidatesConsidered, activeRank, onActive }: Props) {
  if (comparables.length === 0) {
    return (
      <section className="comps" aria-labelledby="comps-h">
        <h2 id="comps-h" className="section-h">Similar past sales</h2>
        <p className="empty">
          {candidatesConsidered > 0
            ? `None of the ${candidatesConsidered} sales of this flat type in this town were close enough to compare.`
            : "There were no sales of this flat type in this town in the past 12 months."}
        </p>
      </section>
    );
  }

  return (
    <section className="comps" aria-labelledby="comps-h">
      <div className="section-head">
        <h2 id="comps-h" className="section-h">Similar past sales</h2>
        <p className="section-sub">
          The {comparables.length} closest of {candidatesConsidered} sales in the past year, most similar first.
        </p>
      </div>

      {/* Wide screens: a table. */}
      <div className="table-scroll comps-wide" tabIndex={0} role="region" aria-labelledby="comps-h">
        <table className="comps-table">
          <thead>
            <tr>
              <th scope="col">Address</th>
              <th scope="col">Sold</th>
              <th scope="col">Storey</th>
              <th scope="col" className="num">Floor area</th>
              <th scope="col" className="num">Lease left</th>
              <th scope="col" className="num">Price</th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((c) => {
              const p = rowParts(c);
              return (
                <tr
                  key={c.rank}
                  className={activeRank === c.rank ? "is-active" : undefined}
                  onMouseEnter={() => onActive(c.rank)}
                  onMouseLeave={() => onActive(null)}
                >
                  <td>
                    <span className="cell-main"><span className="sr-only">Sale {c.rank}: </span>{p.address}</span>
                    <span className="chips-inline">
                      <span className={`match match-${c.match_level}`}>{MATCH[c.match_level]}</span>
                      <span className="score" title="Match score out of 100">{p.pct}<span className="sr-only"> out of 100 match</span></span>
                    </span>
                  </td>
                  <td>
                    <span className="cell-main">{p.sold}</span>
                    <span className="cell-sub">{p.ago}</span>
                  </td>
                  <td>
                    <span className="cell-main">{p.storey}</span>
                    <Diff d={p.storeyDiff} />
                  </td>
                  <td className="num">
                    <span className="cell-main">{p.area}</span>
                    <Diff d={p.areaDiff} />
                  </td>
                  <td className="num">
                    <span className="cell-main">{p.lease}</span>
                    <Diff d={p.leaseDiff} />
                  </td>
                  <td className="num">
                    <span className="cell-main price">{money(c.resale_price)}</span>
                    <span className="cell-sub">{p.psm} / sqm</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Narrow screens: one card per sale, price first. */}
      <ol className="comp-cards" aria-labelledby="comps-h">
        {comparables.map((c) => {
          const p = rowParts(c);
          return (
            <li key={c.rank} className="comp-card">
              <div className="comp-card-head">
                <span className="comp-card-price">{money(c.resale_price)}</span>
                <span className="score">{p.pct}<span className="sr-only"> out of 100 match</span></span>
              </div>
              <p className="comp-card-addr">
                <span className="sr-only">Sale {c.rank}: </span>{p.address}{" "}
                <span className={`match match-${c.match_level}`}>{MATCH[c.match_level]}</span>
              </p>
              <dl className="comp-card-list">
                <div><dt>Sold</dt><dd>{p.sold} <span className="cell-sub-inline">{p.ago}</span></dd></div>
                <div><dt>Storey</dt><dd>{p.storey} <Diff d={p.storeyDiff} /></dd></div>
                <div><dt>Floor area</dt><dd>{p.area} <Diff d={p.areaDiff} /></dd></div>
                <div><dt>Lease left</dt><dd>{p.lease} <Diff d={p.leaseDiff} /></dd></div>
                <div><dt>Per sqm</dt><dd>{p.psm}</dd></div>
              </dl>
            </li>
          );
        })}
      </ol>

      <p className="table-note">
        Differences are compared with your flat. Storey comes in bands of three floors. The match score (out of 100) rewards the
        same block, street and flat model, and closeness in size, lease, floor and date.
      </p>
    </section>
  );
}
