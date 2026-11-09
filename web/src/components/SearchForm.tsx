import { useEffect, useId, useRef, useState } from "react";
import type { AnalyseRequest, FlatType, MetaResponse } from "../api/types";
import { TYPICAL_AREA, displayName, normaliseStreet, storeyLabel } from "../api/reference";
import { flatTypeLabel } from "../lib/labels";
import { parseMoney } from "../lib/format";
import { currentYear } from "../lib/months";
import { FIELD_ORDER, firstError, validateRequest, type RequestErrors } from "../lib/validate";

interface Props {
  meta: MetaResponse;
  /** The flat last checked (or loaded from a link); the form resets to it when it changes. */
  initial: AnalyseRequest | null;
  /** Show validation errors for `initial` straight away (e.g. a broken shared link). */
  validateInitial?: boolean;
  busy: boolean;
  serverErrors?: Partial<Record<keyof AnalyseRequest, string>>;
  onSubmit: (req: AnalyseRequest) => void;
  /** Called with true when the form no longer matches the flat last checked. */
  onDirtyChange?: (dirty: boolean) => void;
}

type FormState = {
  town: string;
  flat_type: FlatType;
  block: string;
  street_name: string;
  storey_range: string;
  floor_area_sqm: string;
  flat_model: string;
  lease_commence_year: string;
  asking_price: string;
};

const EMPTY: FormState = {
  town: "",
  flat_type: "4 ROOM",
  block: "",
  street_name: "",
  storey_range: "",
  floor_area_sqm: "",
  flat_model: "",
  lease_commence_year: "",
  asking_price: "",
};

/** Ready-made scenarios for demos and moderated user-evaluation sessions. */
const EXAMPLES: { label: string; hint: string; state: FormState }[] = [
  {
    label: "3-room in Ang Mo Kio",
    hint: "A common flat with plenty of sales",
    state: {
      town: "ANG MO KIO", flat_type: "3 ROOM", block: "406", street_name: "ANG MO KIO AVE 10",
      storey_range: "07 TO 09", floor_area_sqm: "67", flat_model: "New Generation",
      lease_commence_year: "1979", asking_price: "420000",
    },
  },
  {
    label: "Executive in Marine Parade",
    hint: "A rare flat with few sales",
    state: {
      town: "MARINE PARADE", flat_type: "EXECUTIVE", block: "53", street_name: "MARINE TER",
      storey_range: "10 TO 12", floor_area_sqm: "146", flat_model: "Maisonette",
      lease_commence_year: "1985", asking_price: "1100000",
    },
  },
];

const str = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? "" : String(n));

function fromRequest(r: AnalyseRequest | null): FormState {
  if (!r) return EMPTY;
  return {
    town: r.town ?? "",
    flat_type: r.flat_type || EMPTY.flat_type,
    block: r.block ?? "",
    street_name: r.street_name ?? "",
    storey_range: r.storey_range ?? "",
    floor_area_sqm: str(r.floor_area_sqm),
    flat_model: r.flat_model ?? "",
    lease_commence_year: str(r.lease_commence_year),
    asking_price: str(r.asking_price),
  };
}

/** Form text → request values, without judging them (validation does that). */
function toRaw(s: FormState): Partial<Record<keyof AnalyseRequest, unknown>> {
  return {
    town: s.town,
    flat_type: s.flat_type,
    block: s.block.trim().toUpperCase(),
    street_name: normaliseStreet(s.street_name),
    storey_range: s.storey_range,
    floor_area_sqm: s.floor_area_sqm.trim() === "" ? "" : Number(s.floor_area_sqm),
    flat_model: s.flat_model,
    lease_commence_year: s.lease_commence_year.trim() === "" ? "" : Number(s.lease_commence_year),
    asking_price: s.asking_price.trim() === "" ? "" : parseMoney(s.asking_price),
  };
}

const FIELD_LABEL: Record<keyof AnalyseRequest, string> = {
  town: "Town", flat_type: "Flat type", block: "Block", street_name: "Street", storey_range: "Storey",
  floor_area_sqm: "Floor area", flat_model: "Flat model", lease_commence_year: "Lease start year", asking_price: "Asking price",
};

const same = (a: FormState, b: FormState) => (Object.keys(a) as (keyof FormState)[]).every((k) => a[k] === b[k]);

export function SearchForm({ meta, initial, validateInitial, busy, serverErrors, onSubmit, onDirtyChange }: Props) {
  const [s, setS] = useState<FormState>(() => fromRequest(initial));
  const [errors, setErrors] = useState<RequestErrors>(() => (validateInitial && initial ? validateRequest(toRaw(fromRequest(initial))) : {}));
  const [showSummary, setShowSummary] = useState(false);
  const id = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const year = currentYear();

  useEffect(() => {
    if (initial) setS(fromRequest(initial));
  }, [initial]);

  useEffect(() => {
    if (serverErrors) setErrors((prev) => ({ ...prev, ...serverErrors }));
  }, [serverErrors]);

  useEffect(() => {
    onDirtyChange?.(Boolean(initial) && !same(s, fromRequest(initial)));
  }, [s, initial, onDirtyChange]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const fieldId = (k: keyof AnalyseRequest) => (k === "flat_type" ? `${id}-flat_type-0` : `${id}-${k}`);

  const submit = (state: FormState) => {
    const raw = toRaw(state);
    const e = validateRequest(raw);
    setErrors(e);
    const first = firstError(e);
    if (first) {
      const many = Object.values(e).filter(Boolean).length > 1;
      setShowSummary(many);
      if (many) requestAnimationFrame(() => summaryRef.current?.focus());
      else document.getElementById(fieldId(first))?.focus();
      return;
    }
    setShowSummary(false);
    onSubmit({
      town: state.town,
      flat_type: state.flat_type,
      block: String(raw.block),
      street_name: String(raw.street_name),
      storey_range: state.storey_range,
      floor_area_sqm: Number(raw.floor_area_sqm),
      flat_model: state.flat_model,
      lease_commence_year: Number(raw.lease_commence_year),
      asking_price: raw.asking_price === "" ? undefined : Number(raw.asking_price),
    });
  };

  const describedBy = (k: keyof AnalyseRequest, ...extra: string[]) =>
    [errors[k] ? `${id}-${k}-err` : "", ...extra].filter(Boolean).join(" ") || undefined;
  const fieldProps = (k: keyof AnalyseRequest, ...extra: string[]) => ({
    id: `${id}-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": describedBy(k, ...extra),
  });
  const err = (k: keyof AnalyseRequest) =>
    errors[k] ? <p className="field-error" id={`${id}-${k}-err`}>{errors[k]}</p> : null;

  const streets = meta.streets_by_town?.[s.town] ?? [];
  const typical = TYPICAL_AREA[s.flat_type];
  const normalised = normaliseStreet(s.street_name);
  const showMatched = normalised !== "" && normalised !== s.street_name.trim().toUpperCase();
  const errorList = FIELD_ORDER.filter((k) => errors[k]);

  return (
    <form
      className="search"
      noValidate
      aria-labelledby={`${id}-title`}
      onSubmit={(e) => {
        e.preventDefault();
        submit(s);
      }}
    >
      <h2 className="search-title" id={`${id}-title`}>Describe the flat</h2>

      {showSummary && errorList.length > 1 && (
        <div className="error-summary" ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby={`${id}-sum-h`}>
          <h3 id={`${id}-sum-h`}>{errorList.length} details need attention</h3>
          <ul>
            {errorList.map((k) => (
              <li key={k}>
                <a href={`#${fieldId(k)}`} onClick={(e) => { e.preventDefault(); document.getElementById(fieldId(k))?.focus(); }}>
                  {FIELD_LABEL[k]}: {errors[k]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-town`}>Town</label>
        <select {...fieldProps("town")} value={meta.towns.includes(s.town) ? s.town : ""} onChange={(e) => set("town", e.target.value)}>
          <option value="">Choose a town</option>
          {meta.towns.map((t) => (
            <option key={t} value={t}>{displayName(t)}</option>
          ))}
        </select>
        {err("town")}
      </div>

      <fieldset className="field" aria-describedby={describedBy("flat_type")}>
        <legend>Flat type</legend>
        <div className="chips">
          {meta.flat_types.map((t, i) => (
            <label key={t} className={`chip${s.flat_type === t ? " is-on" : ""}`}>
              <input id={`${id}-flat_type-${i}`} type="radio" name={`${id}-flat_type`} value={t} checked={s.flat_type === t} onChange={() => set("flat_type", t)} />
              {flatTypeLabel(t)}
            </label>
          ))}
        </div>
        {err("flat_type")}
      </fieldset>

      <div className="row row-block">
        <div className="field">
          <label htmlFor={`${id}-block`}>Block</label>
          <input {...fieldProps("block")} inputMode="text" autoComplete="off" autoCapitalize="characters" value={s.block} onChange={(e) => set("block", e.target.value)} />
          {err("block")}
        </div>
        <div className="field">
          <label htmlFor={`${id}-street_name`}>Street</label>
          <input
            {...fieldProps("street_name", `${id}-street-help`)}
            list={streets.length ? `${id}-streets` : undefined}
            autoComplete="off"
            value={s.street_name}
            onChange={(e) => set("street_name", e.target.value)}
          />
          {streets.length > 0 && (
            <datalist id={`${id}-streets`}>
              {streets.map((st) => <option key={st} value={st} />)}
            </datalist>
          )}
          {err("street_name")}
        </div>
      </div>
      <p className="help help-tight" id={`${id}-street-help`} aria-live="polite">
        {showMatched ? (
          <>Will be matched as <strong>{normalised}</strong>, the way HDB writes it.</>
        ) : (
          "As on the listing, e.g. Ang Mo Kio Ave 10. Words like Avenue and Street are shortened for you."
        )}
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor={`${id}-storey_range`}>Storey</label>
          <select {...fieldProps("storey_range")} value={s.storey_range} onChange={(e) => set("storey_range", e.target.value)}>
            <option value="">Choose floors</option>
            {meta.storey_ranges.map((r) => <option key={r} value={r}>{storeyLabel(r)}</option>)}
          </select>
          {err("storey_range")}
        </div>
        <div className="field">
          <label htmlFor={`${id}-floor_area_sqm`}>Floor area</label>
          <div className="affix">
            <input
              {...fieldProps("floor_area_sqm", `${id}-area-help`)}
              type="number" inputMode="decimal" min={20} max={300} step="any"
              value={s.floor_area_sqm}
              onChange={(e) => set("floor_area_sqm", e.target.value)}
            />
            <span className="suffix">sqm</span>
          </div>
          {err("floor_area_sqm")}
          {typical && (
            <p className="help" id={`${id}-area-help`}>
              Typical {flatTypeLabel(s.flat_type)}: about {typical} sqm.{" "}
              {s.floor_area_sqm === "" && (
                <button type="button" className="link-btn" onClick={() => set("floor_area_sqm", String(typical))}>Use {typical}</button>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor={`${id}-flat_model`}>Flat model</label>
          <select {...fieldProps("flat_model", `${id}-model-help`)} value={s.flat_model} onChange={(e) => set("flat_model", e.target.value)}>
            <option value="">Choose a model</option>
            {meta.flat_models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {err("flat_model")}
          <p className="help" id={`${id}-model-help`}>On the listing or the HDB Flat Portal.</p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-lease_commence_year`}>Lease start year</label>
          <input
            {...fieldProps("lease_commence_year")}
            type="number" inputMode="numeric" min={1960} max={year}
            value={s.lease_commence_year}
            onChange={(e) => set("lease_commence_year", e.target.value)}
          />
          {err("lease_commence_year")}
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-asking_price`}>Asking price <span className="opt">optional</span></label>
        <div className="affix">
          <span className="prefix">$</span>
          <input
            {...fieldProps("asking_price", `${id}-asking-help`)}
            inputMode="decimal" autoComplete="off"
            value={s.asking_price}
            onChange={(e) => set("asking_price", e.target.value)}
          />
        </div>
        {err("asking_price")}
        <p className="help" id={`${id}-asking-help`}>Add it to see where the price sits against similar sales. 625000 or 625k both work.</p>
      </div>

      <button className="btn-primary" type="submit" aria-disabled={busy || undefined} onClick={(e) => { if (busy) e.preventDefault(); }}>
        {busy ? "Checking sales…" : "Check similar sales"}
      </button>

      <div className="examples">
        <p className="examples-title">Or try an example</p>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="example"
            aria-disabled={busy || undefined}
            onClick={() => { if (busy) return; setS(ex.state); setErrors({}); setShowSummary(false); submit(ex.state); }}
          >
            <span className="example-name">{ex.label}</span>
            <span className="example-hint">{ex.hint}</span>
          </button>
        ))}
      </div>
    </form>
  );
}
