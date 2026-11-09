# Web client (`web/`)

React + TypeScript single-page app for CS5224 Group 21. A buyer describes a resale flat
(and optionally its asking price) and sees:

- the five most similar recent HDB sales, with how each differs from their flat,
- an indicative estimate and likely range **only when the evidence checks pass**,
- where the asking price sits against that range (inside / above / below, never "overpaying"),
- which evidence checks passed or failed, and why an estimate was withheld,
- a browser-only shortlist to compare several flats side by side.

Hosted as a static site on **S3 + CloudFront**. Results come from this repo's
`POST /estimate` Lambda (`../src/lambda_handler.py`): DynamoDB retrieval, comparable
ranking, the evidence rule and the XGBoost estimate all run there. The web client only
translates the form into the API request and renders the response.

## Quick start

Needs Node.js 20 or newer.

```bash
cd web
npm install
npm run dev:live     # http://localhost:5173, using the live /estimate API
npm run dev          # http://localhost:5173, demo data (yellow banner), works offline
npm run build        # dist/, wired to the live /estimate API
```

`dev:live` sends requests through Vite's local proxy (`/api/estimate` → API Gateway), so
the API's CORS settings don't need to include localhost. To test against a locally running
backend instead, set `API_PROXY_TARGET`, e.g. `API_PROXY_TARGET=http://localhost:8000 npm run dev:live`.

Deploying to AWS: see **[DEPLOY.md](DEPLOY.md)**.
How the frontend maps onto the API: see **[docs/API.md](docs/API.md)**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:live` | Dev server with hot reload, using the live API through a local proxy |
| `npm run dev` | Dev server with hot reload, demo data |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run check` | Type-check, lint (eslint + react-hooks) and run the unit tests (vitest) |
| `npm test` | Unit tests only |
| `npm run deploy` | Build and publish to S3 + CloudFront (DEPLOY.md) |

## Backend modes

| Mode | When | What happens |
|---|---|---|
| **estimate** | `npm run build` and `npm run dev:live` | Normal mode. The team's Lambda returns evidence, comparables and the estimate (`src/api/estimate.ts`). |
| **demo** | `npm run dev`, or `VITE_ESTIMATE_URL` empty | Synthetic sales with a visible banner. `src/api/mock.ts` returns a `POST /estimate`-shaped payload scored with the backend's formula and evidence rule, so it runs through the same adapter as production. |

## Configuration (build-time)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_ESTIMATE_URL` | team API in builds, demo in dev | Full URL of the `POST /estimate` endpoint. Set it empty for demo data |
| `VITE_FEEDBACK_URL` | empty | Link to the user-evaluation form, shown in header and footer |
| `VITE_API_TIMEOUT_MS` | 20000 | Request timeout |

## Project structure

```
src/
  api/
    types.ts          data shapes the UI renders
    estimate.ts       adapter for the team's POST /estimate (request + response mapping)
    client.ts         fetch wrapper: timeout, cancellation, error mapping
    rule.ts           evidence rule + interval, read from ../models/final/hdb_resale_calibration.json
    mock.ts           demo-mode /estimate payloads (synthetic, clearly labelled)
    reference.ts      towns, flat types, models, storey ranges; display helpers
  components/
    SearchForm.tsx    flat details form, validation, example scenarios
    Verdict.tsx       estimate + range + asking comparison, or the withheld state
    PriceStrip.tsx    dot strip of similar sales vs likely range vs asking price
    ComparablesTable.tsx  ranked similar sales with differences
    EvidenceChecks.tsx    pass/fail list behind the decision
    Shortlist.tsx     saved flats compared side by side (localStorage)
    Method.tsx        "How it works" page: method, limits, attribution
  lib/
    months.ts, lease.ts   Singapore-time months and 99-year lease maths
    validate.ts       one set of field rules for the form and for shared links
    asking.ts         asking price vs range / vs sales
    ...               formatting, labels, shortlist storage, URL state
    *.test.ts         unit tests (also src/api/api.test.ts)
  App.tsx             layout, navigation, request lifecycle
  styles.css          design tokens and all styles
infra/frontend.yaml   CloudFormation: private S3 bucket + CloudFront (OAC)
scripts/deploy.sh     build, upload with correct cache headers, invalidate
(../.github/workflows/deploy-web.yml  checks on PRs; checks + deploy on push to main)
```

## Design notes

- **Shareable checks.** The flat being checked lives in the query string
  (`?town=TAMPINES&flat_type=4+ROOM&…`), so results can be bookmarked or sent to a partner,
  and S3 never has to resolve deep paths.
- **Abstention is a first-class state.** When `evidence.sufficient` is false the UI shows
  what was found and which checks failed, and never shows a price verdict.
- **Accessibility.** Keyboard reachable throughout, visible focus, status conveyed by icon
  and text (not colour alone), table view behind the chart, reduced-motion respected,
  works down to 360 px wide.
- **No accounts, no tracking.** The shortlist stays in the visitor's browser.

## Data attribution

Contains information from HDB's *Resale flat prices based on registration date from
Jan-2017 onwards* dataset, accessed via data.gov.sg and made available under the terms of
the Singapore Open Data Licence version 1.0. This prototype is not affiliated with HDB.
