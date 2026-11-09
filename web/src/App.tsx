import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { analyse, ApiError, DEMO_MODE } from "./api/client";
import { mockStreets } from "./api/mock";
import { FALLBACK_META } from "./api/reference";
import type { AnalyseRequest, AnalyseResponse, MetaResponse } from "./api/types";
import { SearchForm } from "./components/SearchForm";
import { Verdict } from "./components/Verdict";
import { PriceStrip } from "./components/PriceStrip";
import { ComparablesTable } from "./components/ComparablesTable";
import { EvidenceChecks } from "./components/EvidenceChecks";
import { Shortlist } from "./components/Shortlist";
import { Method } from "./components/Method";
import { APP_NAME, DATA_SOURCE_URL, FEEDBACK_URL, PROJECT_NAME } from "./config";
import { compareAsking } from "./lib/asking";
import { money, monthLabel } from "./lib/format";
import { flatTypeLabel } from "./lib/labels";
import { displayName } from "./api/reference";
import {
  SHORTLIST_LIMIT, flatKey, loadShortlist, onShortlistChange, sameFlat, saveShortlist, toItem, type ShortlistItem,
} from "./lib/shortlist";
import { readUrl, viewHref, writeUrl, type View } from "./lib/urlState";

const META: MetaResponse = DEMO_MODE ? { ...FALLBACK_META, streets_by_town: mockStreets(FALLBACK_META.towns) } : FALLBACK_META;
const SLOW_MS = 4000;
const CACHE_SIZE = 12;

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const isNarrow = () => window.matchMedia?.("(max-width: 900px)").matches ?? false;
const scrollToEl = (el: Element | null) =>
  el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

/** The same result with a different asking price (no new request needed). */
function withAsking(res: AnalyseResponse, price: number | undefined): AnalyseResponse {
  return {
    ...res,
    subject: { ...res.subject, asking_price: price },
    asking_comparison: res.estimate && price ? compareAsking(price, res.estimate) : null,
  };
}

function statusText(res: AnalyseResponse): string {
  if (!res.estimate) return "Results ready. No estimate: not enough similar sales. The sales found are listed.";
  const a = res.asking_comparison;
  const where = a
    ? a.position === "within_range" ? " The asking price is inside the likely range." : a.position === "above_range" ? " The asking price is above the likely range." : " The asking price is below the likely range."
    : "";
  return `Results ready. Estimate ${money(res.estimate.point)}, likely between ${money(res.estimate.low)} and ${money(res.estimate.high)}.${where}`;
}

function shortSubject(r: AnalyseRequest): string {
  return `${flatTypeLabel(r.flat_type)}, ${r.block ? `Blk ${r.block} ` : ""}${r.street_name ? displayName(r.street_name) : displayName(r.town)}`;
}

export default function App() {
  const initial = useRef(readUrl());
  const [view, setView] = useState<View>(initial.current.view);
  const [request, setRequest] = useState<AnalyseRequest | null>(initial.current.request);
  const [result, setResult] = useState<AnalyseResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeRank, setActiveRank] = useState<number | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistItem[]>(() => loadShortlist());
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [undo, setUndo] = useState<{ item: ShortlistItem; index: number } | null>(null);
  const [changedFrom, setChangedFrom] = useState<ShortlistItem | null>(null);

  const latest = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, AnalyseResponse>());
  const resultsRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterView = useRef(false);

  useEffect(() => onShortlistChange(setShortlist), []);

  const run = useCallback(async (req: AnalyseRequest, opts: { push?: boolean; user?: boolean; fromItem?: ShortlistItem } = {}) => {
    const ticket = ++latest.current;
    inflight.current?.abort();
    setRequest(req);
    setError(null);
    setCopied(false);
    setDirty(false);
    setChangedFrom(null);
    if (opts.push !== false) writeUrl("check", req);

    const key = flatKey(req);
    const cached = cache.current.get(key);
    const finish = (res: AnalyseResponse) => {
      setResult(res);
      setStatus(statusText(res));
      if (opts.fromItem?.estimate && res.estimate && opts.fromItem.estimate.point !== res.estimate.point) setChangedFrom(opts.fromItem);
      if (opts.user) {
        if (isNarrow()) setFormCollapsed(true);
        requestAnimationFrame(() => {
          verdictRef.current?.focus({ preventScroll: true });
          if (isNarrow()) scrollToEl(resultsRef.current);
        });
      }
    };

    if (cached) {
      setBusy(false);
      setSlow(false);
      finish(withAsking(cached, req.asking_price));
      return;
    }

    const ctrl = new AbortController();
    inflight.current = ctrl;
    setBusy(true);
    setSlow(false);
    setStatus("Checking similar sales…");
    const slowTimer = setTimeout(() => { if (ticket === latest.current) setSlow(true); }, SLOW_MS);
    // On phones the results sit below a tall form: show the loading state where people can see it.
    if (opts.user && isNarrow()) requestAnimationFrame(() => scrollToEl(resultsRef.current));

    try {
      const res = await analyse(req, ctrl.signal);
      if (ticket !== latest.current) return;
      cache.current.set(key, res);
      if (cache.current.size > CACHE_SIZE) cache.current.delete(cache.current.keys().next().value as string);
      finish(res);
    } catch (e) {
      if (ticket !== latest.current || (e as Error).name === "AbortError") return;
      const err = e instanceof ApiError ? e : new ApiError("Something unexpected went wrong. Try again.", "UNKNOWN", 0);
      setResult(null);
      setError(err);
      setStatus("");
      if (opts.user) {
        if (err.code === "VALIDATION_ERROR") setFormCollapsed(false);
        requestAnimationFrame(() => {
          if (isNarrow()) scrollToEl(errorRef.current);
          errorRef.current?.focus({ preventScroll: true });
        });
      }
    } finally {
      clearTimeout(slowTimer);
      if (ticket === latest.current) {
        setBusy(false);
        setSlow(false);
      }
    }
  }, []);

  // Run a check that arrived in the URL (shared link or bookmark), but only if it's valid.
  useEffect(() => {
    const s = initial.current;
    if (s.request && s.valid && s.view === "check") run(s.request, { push: false });
  }, [run]);

  useEffect(() => {
    const onPop = () => {
      const s = readUrl();
      setView(s.view);
      if (s.view !== "check") return;
      if (s.request && s.valid) run(s.request, { push: false }); // served from cache when already checked
      else {
        inflight.current?.abort();
        latest.current++;
        setRequest(s.request);
        setResult(null);
        setError(null);
        setBusy(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [run]);

  useEffect(() => {
    document.title = view === "shortlist" ? `Shortlist | ${APP_NAME}` : view === "method" ? `How it works | ${APP_NAME}` : APP_NAME;
    if (focusAfterView.current) {
      focusAfterView.current = false;
      requestAnimationFrame(() => pageHeadingRef.current?.focus());
    }
  }, [view]);

  const go = (v: View, e?: MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return; // let "open in new tab" work
    e?.preventDefault();
    focusAfterView.current = true;
    setView(v);
    writeUrl(v, v === "check" ? request : null);
    window.scrollTo({ top: 0 });
  };

  const saved = Boolean(result && shortlist.some((it) => sameFlat(it.request, result.subject)));

  const persist = (next: ShortlistItem[]) => {
    setShortlist(next);
    saveShortlist(next);
  };

  const save = () => {
    if (!result || saved || shortlist.length >= SHORTLIST_LIMIT) return;
    persist([toItem(result), ...shortlist]);
    setStatus("Saved to shortlist.");
  };

  const remove = (id: string) => {
    const index = shortlist.findIndex((it) => it.id === id);
    if (index < 0) return;
    setUndo({ item: shortlist[index], index });
    persist(shortlist.filter((it) => it.id !== id));
    setStatus("Removed from shortlist. Undo is available.");
  };

  const undoRemove = () => {
    if (!undo) return;
    const next = [...shortlist];
    next.splice(Math.min(undo.index, next.length), 0, undo.item);
    persist(next.slice(0, SHORTLIST_LIMIT));
    setUndo(null);
    setStatus("Restored to shortlist.");
  };

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const setAsking = (price: number | undefined) => {
    if (!result || !request) return;
    const next = withAsking(result, price);
    const nextReq = { ...request, asking_price: price };
    setResult(next);
    setRequest(nextReq);
    writeUrl("check", nextReq, true);
    setStatus(statusText(next));
  };

  const copyLink = async () => {
    try {
      if (navigator.share && isNarrow()) {
        await navigator.share({ title: APP_NAME, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setStatus("Link copied.");
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // share sheet dismissed
      setStatus("Couldn't copy automatically. Copy the address from the browser's address bar.");
    }
  };

  const nav = (v: View, label: ReactNode) => (
    <a href={viewHref(v)} aria-current={view === v ? "page" : undefined} onClick={(e) => go(v, e)}>{label}</a>
  );

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="masthead-inner">
          <a className="brand" href={viewHref("check")} onClick={(e) => go("check", e)}>
            <svg className="brand-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
              <rect x="6" y="3" width="20" height="27" rx="2" className="bm-body" />
              <g className="bm-win">
                <rect x="10" y="7" width="4" height="4" /><rect x="18" y="7" width="4" height="4" />
                <rect x="10" y="14" width="4" height="4" /><rect x="18" y="14" width="4" height="4" />
                <rect x="14" y="22" width="4" height="8" />
              </g>
            </svg>
            <span className="brand-name">{APP_NAME}</span>
          </a>
          <nav aria-label="Main">
            <ul className="nav">
              <li>{nav("check", "Check a price")}</li>
              <li>{nav("shortlist", <>Shortlist{shortlist.length > 0 && <span className="count"><span className="sr-only">, </span>{shortlist.length}<span className="sr-only"> saved</span></span>}</>)}</li>
              <li>{nav("method", "How it works")}</li>
              {FEEDBACK_URL && <li><a href={FEEDBACK_URL} target="_blank" rel="noreferrer">Give feedback</a></li>}
            </ul>
          </nav>
        </div>
      </header>

      {DEMO_MODE && (
        <div className="demo-banner" role="note">
          <strong>Demo mode.</strong> Prices shown are generated for testing, not real HDB sales.
        </div>
      )}

      {/* One quiet announcement per outcome, instead of a live region around all the results. */}
      <div className="sr-only" role="status" aria-live="polite">{status}</div>

      <main id="main">
        {view === "check" && (
          <div className="check">
            <div className="intro">
              <h1 className="intro-h" ref={pageHeadingRef} tabIndex={-1}>Is the asking price backed by real sales?</h1>
              <p className="intro-p">
                Compare a resale flat with the most similar HDB sales. You'll get an estimate only when there's enough
                evidence for one.
              </p>
            </div>

            {formCollapsed && request && (
              <div className="form-summary">
                <p><span className="form-summary-label">Checking</span> {shortSubject(request)}</p>
                <button type="button" className="btn-secondary" onClick={() => setFormCollapsed(false)} aria-expanded="false">Edit details</button>
              </div>
            )}
            <aside className={`check-form${formCollapsed ? " is-collapsed" : ""}`} aria-label="Flat details">
              <SearchForm
                meta={META}
                initial={request}
                validateInitial={Boolean(initial.current.request) && !initial.current.valid}
                busy={busy}
                serverErrors={error?.fields}
                onSubmit={(r) => run(r, { user: true })}
                onDirtyChange={setDirty}
              />
            </aside>

            <div className="check-results" ref={resultsRef} aria-busy={busy}>
              {busy && !result && <Loading slow={slow} />}
              {error && !busy && (
                <div className="error-block" ref={errorRef} tabIndex={-1} aria-labelledby="error-h">
                  <h2 id="error-h">{error.code === "VALIDATION_ERROR" ? "Check the flat details" : "The check didn't finish"}</h2>
                  <p>{error.message}</p>
                  {request && error.code !== "VALIDATION_ERROR" && (
                    <button type="button" className="btn-secondary" onClick={() => run(request, { push: false, user: true })}>Try again</button>
                  )}
                </div>
              )}
              {!busy && !error && !result && <Placeholder />}
              {result && !error && (
                <>
                  {busy && <p className="refreshing">{slow ? "Still working: the first check can take up to 10 seconds…" : "Updating…"}</p>}
                  {dirty && !busy && (
                    <div className="dirty-bar">
                      <p>You've changed the details since this check.</p>
                      <button type="button" className="btn-secondary" onClick={() => document.querySelector<HTMLFormElement>(".search")?.requestSubmit()}>
                        Check again
                      </button>
                    </div>
                  )}
                  {changedFrom?.estimate && result.estimate && (
                    <p className="changed-note">
                      The estimate has changed since you saved this flat
                      {changedFrom.data_month ? ` (data to ${monthLabel(changedFrom.data_month)})` : ""}: it was {money(changedFrom.estimate.point)}, now {money(result.estimate.point)}.
                    </p>
                  )}
                  <div className={`results${busy || dirty ? " is-stale" : ""}`}>
                    <Verdict
                      result={result}
                      headingRef={verdictRef}
                      saved={saved}
                      shortlistFull={shortlist.length >= SHORTLIST_LIMIT}
                      onSave={save}
                      onViewShortlist={() => go("shortlist")}
                      onCopyLink={copyLink}
                      copied={copied}
                      onAskingChange={setAsking}
                    />
                    <PriceStrip result={result} activeRank={activeRank} onActive={setActiveRank} />
                    <ComparablesTable
                      comparables={result.comparables}
                      candidatesConsidered={result.candidates_considered}
                      activeRank={activeRank}
                      onActive={setActiveRank}
                    />
                    <EvidenceChecks evidence={result.evidence} notes={result.notes} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {view === "shortlist" && (
          <Shortlist
            items={shortlist}
            headingRef={pageHeadingRef}
            onRemove={remove}
            onStart={() => go("check")}
            onOpen={(it) => {
              setView("check");
              setFormCollapsed(false);
              run(it.request, { fromItem: it });
              window.scrollTo({ top: 0 });
            }}
          />
        )}

        {view === "method" && <Method headingRef={pageHeadingRef} />}
      </main>

      {undo && (
        <div className="toast" role="group" aria-label="Shortlist">
          <p>Removed {shortSubject(undo.item.request)}.</p>
          <button type="button" className="btn-quiet toast-btn" onClick={undoRemove}>Undo</button>
        </div>
      )}

      <footer className="footer">
        <div className="footer-inner">
          <p>
            Sales data: Housing & Development Board, via <a href={DATA_SOURCE_URL} target="_blank" rel="noreferrer">data.gov.sg</a>
            {result?.data_month && <>, sales up to {monthLabel(result.data_month)}</>}. Contains information from HDB's
            resale flat prices dataset, made available under the terms of the Singapore Open Data Licence version 1.0.
          </p>
          <p>
            {PROJECT_NAME}, a CS5224 student prototype by Group 21. Not affiliated with HDB. Estimates are indicative and are not
            valuations or financial advice.
            {FEEDBACK_URL && <> <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">Tell us how it went.</a></>}
          </p>
        </div>
      </footer>
    </div>
  );
}

function Loading({ slow }: { slow: boolean }) {
  return (
    <div className="loading">
      <div className="loading-bars" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <p>{slow ? "Still working: the first check can take up to 10 seconds…" : "Finding similar sales…"}</p>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="placeholder">
      <h2 className="placeholder-h">What you'll see</h2>
      <dl className="placeholder-list">
        <div>
          <dt>Where the asking price sits</dt>
          <dd>Inside, above or below the likely range, so you know what to ask the seller or agent about.</dd>
        </div>
        <div>
          <dt>An estimate, only when the evidence holds</dt>
          <dd>A price estimate and likely range when there are enough close, recent sales. Otherwise, a clear note on what's missing.</dd>
        </div>
        <div>
          <dt>The closest similar sales</dt>
          <dd>Ranked by street, size, floor, lease and date, with each difference spelled out.</dd>
        </div>
      </dl>
    </div>
  );
}
