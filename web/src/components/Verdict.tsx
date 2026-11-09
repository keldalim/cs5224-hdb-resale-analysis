import { useId, useState, type Ref } from "react";
import type { AnalyseResponse, AskingComparison, AskingPosition } from "../api/types";
import { TYPICAL_AREA, displayName, storeyLabel } from "../api/reference";
import { HDB_PRICES_URL } from "../config";
import { EVIDENCE_RULE } from "../api/rule";
import { positionAmongSales } from "../lib/asking";
import { money, monthLabel, parseMoney, years } from "../lib/format";
import { flatTypeLabel } from "../lib/labels";
import { LIMITS } from "../lib/validate";
import { SHORTLIST_LIMIT } from "../lib/shortlist";

interface Props {
  result: AnalyseResponse;
  headingRef?: Ref<HTMLHeadingElement>;
  saved: boolean;
  shortlistFull: boolean;
  onSave: () => void;
  onViewShortlist: () => void;
  onCopyLink: () => void;
  copied: boolean;
  /** Set or clear the asking price without re-running the check. */
  onAskingChange: (price: number | undefined) => void;
}

function subjectLine(r: AnalyseResponse["subject"]): string {
  const where = [r.block ? `Blk ${r.block}` : "", r.street_name ? displayName(r.street_name) : "", displayName(r.town)]
    .filter(Boolean)
    .join(", ");
  return `${flatTypeLabel(r.flat_type, true)} at ${where}. ${storeyLabel(r.storey_range)}, ${r.floor_area_sqm} sqm, ${years(r.remaining_lease_years)} of lease left.`;
}

const POSITION_HEAD: Record<AskingPosition, string> = {
  within_range: "inside the likely range",
  above_range: "above the likely range",
  below_range: "below the likely range",
};
const POSITION_BADGE: Record<AskingPosition, string> = {
  within_range: "Inside range",
  above_range: "Above range",
  below_range: "Below range",
};

function verdictHeading(a: AskingComparison, low: number, high: number): string {
  if (a.position === "within_range") return `Asking price is ${POSITION_HEAD.within_range}`;
  const gap = a.position === "above_range" ? a.asking_price - high : low - a.asking_price;
  return `Asking price is ${money(gap)} ${POSITION_HEAD[a.position]}`;
}

function askingDetail(a: AskingComparison): string {
  const pct = Math.abs(a.difference_pct).toFixed(1);
  const diff = money(Math.abs(a.difference));
  const rel = a.difference === 0 ? "the same as" : a.difference > 0 ? `${diff} (${pct}%) above` : `${diff} (${pct}%) below`;
  return `The asking price of ${money(a.asking_price)} is ${rel} the estimate.`;
}

/** Small inline form to add or change the asking price without scrolling back to the main form. */
function AskingInline({ current, onChange }: { current?: number; onChange: (p: number | undefined) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current ? String(current) : "");
  const [error, setError] = useState("");
  if (!open) {
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        {current ? "Change asking price" : "Add an asking price"}
      </button>
    );
  }
  return (
    <form
      className="asking-inline"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() === "") { onChange(undefined); setOpen(false); return; }
        const p = parseMoney(text);
        if (!Number.isFinite(p) || p < LIMITS.asking[0] || p > LIMITS.asking[1]) {
          setError("Enter a price between $50,000 and $5,000,000, like 625000 or 625k.");
          return;
        }
        setError("");
        onChange(p);
        setOpen(false);
      }}
    >
      <label htmlFor={`${id}-ask`}>Asking price</label>
      <div className="asking-inline-row">
        <div className="affix">
          <span className="prefix">$</span>
          <input
            id={`${id}-ask`} inputMode="decimal" autoComplete="off" autoFocus value={text}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-ask-err` : undefined}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-secondary">Compare</button>
        <button type="button" className="btn-quiet" onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
      </div>
      {error && <p className="field-error" id={`${id}-ask-err`}>{error}</p>}
    </form>
  );
}

function Withheld({ result, headingRef }: { result: AnalyseResponse; headingRef?: Ref<HTMLHeadingElement> }) {
  const { subject, comparables, evidence } = result;
  const asking = subject.asking_price;
  const prices = comparables.map((c) => c.resale_price);
  const pos = asking && prices.length ? positionAmongSales(asking, prices) : null;
  const typical = TYPICAL_AREA[subject.flat_type];
  const areaUnusual = typical ? Math.abs(subject.floor_area_sqm - typical) / typical > 0.25 : false;

  return (
    <>
      <p className="verdict-label">No estimate for this flat</p>
      <h2 id="verdict-h" ref={headingRef} className="verdict-withheld-title" tabIndex={-1}>Not enough similar sales for a reliable estimate</h2>
      <p className="verdict-withheld-body">{evidence.summary}</p>

      {pos && (
        <div className="verdict-unadjusted">
          <p className="verdict-unadjusted-label">What the sales found do show</p>
          <p>
            {pos.lower === pos.total
              ? `The asking price of ${money(asking!)} is higher than all ${pos.total} of the closest sales found.`
              : pos.higher === pos.total
                ? `The asking price of ${money(asking!)} is lower than all ${pos.total} of the closest sales found.`
                : `The asking price of ${money(asking!)} is higher than ${pos.lower} and lower than ${pos.higher} of the ${pos.total} closest sales found.`}{" "}
            These are actual prices, not adjusted for differences from your flat, so treat this as a rough guide only.
          </p>
        </div>
      )}

      <p className="verdict-withheld-body">What you can do next:</p>
      <ul className="verdict-next">
        {comparables.length > 0 && <li>Compare the sales listed below with your flat yourself.</li>}
        <li>
          Look up recent resale prices for this area on the{" "}
          <a href={HDB_PRICES_URL} target="_blank" rel="noreferrer">HDB Flat Portal</a>.
        </li>
        {(comparables.length === 0 || areaUnusual) && (
          <li>
            Check the floor area{areaUnusual && typical ? ` (${subject.floor_area_sqm} sqm is unusual for a ${flatTypeLabel(subject.flat_type)}, typically about ${typical} sqm)` : ""} and street spelling against the listing.
          </li>
        )}
      </ul>
    </>
  );
}

export function Verdict({ result, headingRef, saved, shortlistFull, onSave, onViewShortlist, onCopyLink, copied, onAskingChange }: Props) {
  const { estimate, asking_comparison: asking, subject } = result;
  const tone = estimate ? "is-supported" : "is-withheld";
  const strong = result.comparables.filter((c) => c.similarity * 100 >= EVIDENCE_RULE.strong_score_threshold).length;

  return (
    <section className={`verdict ${tone}`} aria-labelledby="verdict-h">
      <p className="verdict-subject">{subjectLine(subject)}</p>

      {estimate ? (
        <>
          {asking ? (
            <>
              <h2 id="verdict-h" ref={headingRef} tabIndex={-1} className="verdict-headline">
                <span className={`pos-badge pos-${asking.position}`}>{POSITION_BADGE[asking.position]}</span>
                {verdictHeading(asking, estimate.low, estimate.high)}
              </h2>
              <p className="verdict-label">Indicative estimate from the price model</p>
            </>
          ) : (
            <h2 id="verdict-h" ref={headingRef} tabIndex={-1} className="verdict-label verdict-label-h">Indicative estimate from the price model</h2>
          )}
          <p className="verdict-figure">{money(estimate.point)}</p>
          <p className="verdict-range">
            Likely between <strong>{money(estimate.low)}</strong> and <strong>{money(estimate.high)}</strong>.
            <span className="verdict-range-note">
              In testing, about {Math.round(estimate.interval_level * 100)} in 100 actual sale prices fell inside ranges like this.
            </span>
          </p>
          <p className="verdict-basis">
            Evidence checks passed{strong > 0 ? `: ${strong} of the 5 closest sales are strong matches` : ""}.
          </p>
          {asking ? (
            <p className="verdict-asking">
              {askingDetail(asking)} <AskingInline key={`c${asking.asking_price}`} current={asking.asking_price} onChange={onAskingChange} />
            </p>
          ) : (
            <div className="verdict-asking is-empty">
              <p>See where an asking price sits against this range.</p>
              <AskingInline key="new" onChange={onAskingChange} />
            </div>
          )}
        </>
      ) : (
        <Withheld result={result} headingRef={headingRef} />
      )}

      <div className="verdict-actions">
        {saved ? (
          <button type="button" className="btn-secondary" onClick={onViewShortlist}>Saved. View shortlist</button>
        ) : shortlistFull ? (
          <button type="button" className="btn-secondary" onClick={onViewShortlist}>
            Shortlist full ({SHORTLIST_LIMIT}). Remove one
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={onSave}>Save to shortlist</button>
        )}
        <button type="button" className="btn-quiet" onClick={onCopyLink}>
          {copied ? "Link copied" : "Copy link to this check"}
        </button>
      </div>
      {subject.asking_price ? <p className="verdict-fineprint">The link includes the asking price.</p> : null}

      <p className="verdict-fineprint">
        {result.data_month ? <>Based on HDB resale transactions up to {monthLabel(result.data_month)}. </> : <>Based on HDB resale transactions. </>}
        An indicative guide, not a valuation. It can't see renovation, condition or the exact floor.
      </p>
    </section>
  );
}
