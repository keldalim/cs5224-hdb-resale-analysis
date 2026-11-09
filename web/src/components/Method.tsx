import type { Ref } from "react";
import { DATA_SOURCE_URL } from "../config";
import { EVIDENCE_RULE, INTERVAL_COVERAGE, INTERVAL_MARGIN } from "../api/rule";
import { money } from "../lib/format";

export function Method({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> }) {
  const R = EVIDENCE_RULE;
  const margin = money(Math.round(INTERVAL_MARGIN / 1000) * 1000);
  const coverage = Math.round(INTERVAL_COVERAGE * 100);
  return (
    <article className="page prose">
      <h1 className="page-h" ref={headingRef} tabIndex={-1}>How it works</h1>
      <p className="page-lede">
        This service answers one question: is an asking price backed by enough sales of genuinely similar flats? When the
        answer is no, it says so instead of guessing.
      </p>

      <h2>Where the sales come from</h2>
      <p>
        Every sale is a completed HDB resale transaction published by the Housing & Development Board on{" "}
        <a href={DATA_SOURCE_URL} target="_blank" rel="noreferrer">data.gov.sg</a>, covering sales registered from
        January 2017. The data is refreshed daily, and each result shows the latest month of sales it searched.
      </p>

      <h2>How similar sales are chosen</h2>
      <p>
        Sales are first narrowed to the same flat type in the same town over the past 12 months. Each one is then scored
        out of 100: up to 20 points for being in the same block (on the same street), 15 for the same street and 10 for the
        same flat model, plus up to 20 for floor area, 15 for remaining lease, 10 for storey and 10 for how recently it sold.
        The five highest-scoring sales are shown, with how each one differs from your flat.
      </p>

      <h2>When an estimate is shown</h2>
      <p>
        An estimate appears only if the evidence passes every check: at least {R.min_candidate_count} sales of this flat type
        in this town in the past year, an average score of at least {R.min_top5_avg_score} across the five closest, and at
        least {R.min_top5_strong_count} of those five scoring {R.strong_score_threshold} or more. If any check fails, you see
        the sales but no estimate.
      </p>

      <h2>Where the estimate comes from</h2>
      <p>
        The estimate comes from a gradient-boosted tree model (XGBoost) trained on sales from January 2017 to June 2026,
        using town, flat type, storey, floor area, flat model, lease and sale month. On October 2026 sales it hadn't seen,
        its typical error was about 4% of the sale price.
      </p>

      <h2>Reading the likely range</h2>
      <p>
        The likely range is the estimate plus or minus about {margin}, set so that {coverage}% of actual prices fell inside it
        on a held-out month of sales. On the final test month, 88% did, so roughly one sale in ten will still fall outside.
      </p>
      <p>
        The gap between the asking price and the estimate is a starting point for questions, not a verdict. A flat priced
        above the range may have a renovation, view or condition the data can't see.
      </p>

      <h2>What it can't see</h2>
      <ul>
        <li>Renovation, interior condition and fittings</li>
        <li>The exact floor, since HDB reports storeys in bands of three</li>
        <li>Facing, view, noise and distance to MRT stations or schools</li>
        <li>Cash-over-valuation and current listings</li>
      </ul>

      <h2>About this service</h2>
      <p>
        This is a student prototype built for NUS CS5224 Cloud Computing. It is not affiliated with or endorsed by HDB, and
        it is not a valuation or financial advice.
      </p>
    </article>
  );
}
