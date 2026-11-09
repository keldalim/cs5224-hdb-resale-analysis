import type { Evidence } from "../api/types";

export function EvidenceChecks({ evidence, notes }: { evidence: Evidence; notes?: string[] }) {
  return (
    <section className="checks" aria-labelledby="checks-h">
      <div className="section-head">
        <h2 id="checks-h" className="section-h">
          {evidence.sufficient ? "Why an estimate is shown" : "Why there's no estimate"}
        </h2>
        <p className="section-sub">An estimate is shown only when the similar sales pass all of these checks.</p>
      </div>
      <ul className="check-list">
        {evidence.checks.map((c) => (
          <li key={c.id} className={c.passed ? "pass" : "fail"}>
            <span className="check-icon" aria-hidden="true">
              {c.passed ? (
                <svg viewBox="0 0 20 20" width="20" height="20"><path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg viewBox="0 0 20 20" width="20" height="20"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              )}
            </span>
            <span className="check-text">
              <span className="check-label">
                <span className="sr-only">{c.passed ? "Passed: " : "Not met: "}</span>
                {c.label}
              </span>
              <span className="check-detail">{c.observed}, needs {c.required}</span>
            </span>
          </li>
        ))}
      </ul>
      {notes && notes.length > 0 && (
        <ul className="notes">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="rule-version">Evidence rule {evidence.rule_version}</p>
    </section>
  );
}
