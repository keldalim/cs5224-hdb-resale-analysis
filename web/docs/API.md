# How the web client uses the team's API

Backend: this repo (`../src/lambda_handler.py`, `../src/backend_service.py`, `../src/resale_service.py`)
Endpoint: `POST https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate`

The Lambda does the retrieval, ranking, evidence rule, XGBoost prediction and conformal
interval. The frontend translates the form into the Lambda's request, and the Lambda's
response into what the UI renders. The code is in `src/api/estimate.ts`.

## Request the frontend sends

```json
{
  "month": "2026-11",
  "town": "ANG MO KIO",
  "flat_type": "3 ROOM",
  "block": "406",
  "street_name": "ANG MO KIO AVE 10",
  "storey_range": "07 TO 09",
  "floor_area_sqm": 67,
  "flat_model": "New Generation",
  "lease_commence_date": 1979,
  "remaining_lease": "51 years 02 months",
  "asking_price": 420000
}
```

| Field | Where it comes from |
|---|---|
| `month` | The current month in Singapore time (not the visitor's time zone). The Lambda searches the 12 months before it. |
| `block`, `street_name` | Required in the form. The street is upper-cased and common words are abbreviated the HDB way (Avenue → AVE, Bukit → BT, etc.) so same-street matches aren't missed. |
| `remaining_lease` | Worked out from `lease_commence_date` and `month`, with the same formula as the lightweight client in `../frontend/app.js`: 99 years from January of the commencement year. |
| `asking_price` | Omitted when the visitor leaves it blank. |

## Response fields used

| Lambda field | Shown as |
|---|---|
| `evidence_sufficient` | The estimate panel, or the amber "not enough similar sales" panel |
| `estimated_price`, `prediction_interval.lower/upper` | Estimate and likely range (rounded to $1,000) |
| `evidence.candidate_count` | Check 1, and "the 5 closest of N sales considered" |
| `evidence.top5_avg_score` | Check 2 |
| `evidence.top5_strong_count` | Check 3 |
| `comparables[]` | Table and dot chart. `comparable_score / 100` is the match %. Differences from the visitor's flat (area, storey bands, lease, months ago) are computed in the browser |

Newer Lambdas also return:

| Lambda field | Used for |
|---|---|
| `evidence_rule` | The thresholds shown next to each check |
| `interval_margin` | (informational) the ± margin behind the likely range |
| `latest_sale_month` | "Based on HDB resale transactions up to …". If absent, the newest comparable's month is used; the page never guesses from the clock |

When the Lambda doesn't send `evidence_rule`, the labels fall back to
`../models/final/hdb_resale_calibration.json`, which the build reads directly
(`src/api/rule.ts`). There is no hand-copied threshold to keep in sync. Labels never
decide anything: whether an estimate appears is always the Lambda's `evidence_sufficient`.

The asking-price comparison (inside / above / below the range) is worked out in the
browser (`src/lib/asking.ts`), so changing the asking price on a result doesn't need
another request. A comparable with a missing price or month is skipped; a missing lease
or floor area is shown as "—".

## Errors

| Lambda response | What the visitor sees |
|---|---|
| `400 {"error": "floor_area_sqm must be numeric"}` | "Check the flat details", with the message under the matching field where it can be matched |
| `500 {"error": "Internal server error"}` | "The price service hit a problem on its side. Try again in a moment." |
| Timeout (20 s) or network/CORS failure | "Couldn't reach the price service…" with Try again |

The form validates the same rules first (area, year, asking price, required block and street),
so 400s should be rare.

## CORS

The API's CORS settings allow the team's CloudFront domain
(`https://d2d7utcbwtyp5z.cloudfront.net`). This client works without changes when it is
served from that domain (DEPLOY.md, route A), and locally through `npm run dev:live`, which
proxies requests server-side. To serve it from a different domain, add that origin to the
HTTP API's CORS settings:

```bash
aws apigatewayv2 update-api --api-id a34gvnw0hg --region ap-southeast-1 \
  --cors-configuration 'AllowOrigins=https://d2d7utcbwtyp5z.cloudfront.net,https://<new-domain>,http://localhost:5173,AllowMethods=GET,POST,OPTIONS,AllowHeaders=content-type,MaxAge=3600'
```

Run `aws apigatewayv2 get-api --api-id a34gvnw0hg` first. `update-api` replaces the
whole CORS configuration, so keep any origins already listed.
