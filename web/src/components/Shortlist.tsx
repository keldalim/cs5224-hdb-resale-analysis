import type { Ref } from "react";
import type { AnalyseRequest } from "../api/types";
import { displayName, storeyLabel } from "../api/reference";
import { money, monthLabel, signedMoney, years } from "../lib/format";
import { flatTypeLabel } from "../lib/labels";
import type { ShortlistItem } from "../lib/shortlist";

interface Props {
  items: ShortlistItem[];
  headingRef?: Ref<HTMLHeadingElement>;
  onOpen: (item: ShortlistItem) => void;
  onRemove: (id: string) => void;
  onStart: () => void;
}

function flatName(r: AnalyseRequest): string {
  return `${flatTypeLabel(r.flat_type)}, ${r.block ? `Blk ${r.block} ` : ""}${r.street_name ? displayName(r.street_name) : displayName(r.town)}`;
}

function flatDetail(it: ShortlistItem): string {
  const r = it.request;
  const left = Number.isFinite(it.remaining_lease_years) ? `, ${years(it.remaining_lease_years)} left` : "";
  return `${r.street_name ? `${displayName(r.town)}. ` : ""}${storeyLabel(r.storey_range)}, ${r.floor_area_sqm} sqm${left}`;
}

const POSITION = {
  within_range: "Inside likely range",
  above_range: "Above likely range",
  below_range: "Below likely range",
} as const;

const asOf = (it: ShortlistItem) => (it.data_month ? `Data to ${monthLabel(it.data_month)}` : "");

export function Shortlist({ items, headingRef, onOpen, onRemove, onStart }: Props) {
  if (items.length === 0) {
    return (
      <div className="page">
        <h1 className="page-h" ref={headingRef} tabIndex={-1}>Your shortlist</h1>
        <div className="empty-block">
          <p>Save flats here to compare their asking prices side by side.</p>
          <p>Check a flat, then choose <strong>Save to shortlist</strong>.</p>
          <button type="button" className="btn-primary" onClick={onStart}>Check a flat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-h" ref={headingRef} tabIndex={-1}>Your shortlist</h1>
      <p className="page-lede">
        {items.length} {items.length === 1 ? "flat" : "flats"} saved in this browser. Figures are as they were when saved; open a
        flat to re-run it on the latest data.
      </p>

      <div className="table-scroll sl-wide" tabIndex={0} role="region" aria-label="Shortlisted flats">
        <table className="sl-table">
          <thead>
            <tr>
              <th scope="col">Flat</th>
              <th scope="col" className="num">Asking</th>
              <th scope="col" className="num">Asking vs estimate</th>
              <th scope="col" className="num">Estimate</th>
              <th scope="col" className="num">Likely range</th>
              <th scope="col">Evidence</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const r = it.request;
              const a = it.asking_comparison;
              return (
                <tr key={it.id}>
                  <th scope="row">
                    <span className="cell-main">{flatName(r)}</span>
                    <span className="cell-sub">{flatDetail(it)}</span>
                  </th>
                  <td className="num">{r.asking_price ? money(r.asking_price) : <span className="muted">Not given</span>}</td>
                  <td className="num">
                    {a ? (
                      <>
                        <span className="cell-main">{signedMoney(a.difference)}</span>
                        <span className={`cell-sub pos-text pos-${a.position}`}>{POSITION[a.position]}</span>
                      </>
                    ) : (
                      <span className="muted">Not compared</span>
                    )}
                  </td>
                  <td className="num price">{it.estimate ? money(it.estimate.point) : <span className="muted">Withheld</span>}</td>
                  <td className="num">
                    {it.estimate ? `${money(it.estimate.low)} to ${money(it.estimate.high)}` : <span className="muted">None</span>}
                  </td>
                  <td>
                    <span className={`tag ${it.sufficient ? "tag-ok" : "tag-warn"}`}>
                      {it.sufficient ? `${it.comparable_count} similar sales` : "Too few similar sales"}
                    </span>
                    <span className="cell-sub">{asOf(it)}</span>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn-quiet" onClick={() => onOpen(it)} aria-label={`Open ${flatName(r)}`}>Open</button>
                    <button type="button" className="btn-quiet danger" onClick={() => onRemove(it.id)} aria-label={`Remove ${flatName(r)}`}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="sl-cards" aria-label="Shortlisted flats">
        {items.map((it) => {
          const r = it.request;
          const a = it.asking_comparison;
          return (
            <li key={it.id} className="comp-card">
              <p className="comp-card-addr"><strong>{flatName(r)}</strong></p>
              <p className="cell-sub">{flatDetail(it)}</p>
              <dl className="comp-card-list">
                <div><dt>Asking</dt><dd>{r.asking_price ? money(r.asking_price) : "Not given"}</dd></div>
                <div>
                  <dt>Vs estimate</dt>
                  <dd>{a ? <>{signedMoney(a.difference)} <span className={`pos-text pos-${a.position}`}>{POSITION[a.position]}</span></> : "Not compared"}</dd>
                </div>
                <div><dt>Estimate</dt><dd>{it.estimate ? money(it.estimate.point) : "Withheld"}</dd></div>
                <div><dt>Likely range</dt><dd>{it.estimate ? `${money(it.estimate.low)} to ${money(it.estimate.high)}` : "None"}</dd></div>
                <div><dt>Evidence</dt><dd>{it.sufficient ? `${it.comparable_count} similar sales` : "Too few similar sales"}{asOf(it) ? `. ${asOf(it)}` : ""}</dd></div>
              </dl>
              <div className="sl-card-actions">
                <button type="button" className="btn-secondary" onClick={() => onOpen(it)} aria-label={`Open ${flatName(r)}`}>Open</button>
                <button type="button" className="btn-quiet danger" onClick={() => onRemove(it.id)} aria-label={`Remove ${flatName(r)}`}>Remove</button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="table-note">
        A smaller gap isn't automatically a better deal. Renovation, condition and exact floor aren't in the data, so view the
        flat before deciding.
      </p>
    </div>
  );
}
