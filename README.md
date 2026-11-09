# CS5224 HDB Resale Price Insights

Cloud-based HDB resale decision-support prototype developed for CS5224 Cloud Computing.

## Overview

The platform helps users assess an HDB resale asking price using recent completed resale transactions.

A user enters the characteristics of a target flat and an asking price. The system retrieves relevant historical transactions, ranks comparable flats, assesses whether the available evidence is sufficiently strong, and, where appropriate, produces an indicative resale-price estimate with an uncertainty interval.

If comparable evidence is insufficient, the service withholds the price estimate rather than presenting a potentially unreliable result.

The platform is intended as a decision-support tool and not as an official property valuation.

## Live Application

https://d2d7utcbwtyp5z.cloudfront.net

## AWS Region

The deployed application uses AWS Asia Pacific (Singapore):

```text
ap-southeast-1
```

## Architecture

### Frontend delivery

```text
React/Vite source in web/
        |
        v
npm run build
        |
        v
web/dist/
        |
        v
Private Amazon S3 frontend
        |
        v
Amazon CloudFront
        |
        v
Browser
```

The source files under `web/` are compiled by Vite into the production build under `web/dist/`.

The contents of `web/dist/` are uploaded to the frontend S3 bucket and served through Amazon CloudFront.

### Estimate request

```text
Browser / React frontend
   |
   v
Amazon API Gateway
POST /estimate
   |
   v
AWS Lambda
hdb-resale-api
   |
   +--------------------+
   |                    |
   v                    v
Amazon DynamoDB      XGBoost model
historical sales     + calibration
   |
   v
Comparable ranking
   |
   v
Evidence-sufficiency assessment
   |
   v
Estimate + uncertainty interval
or abstention
   |
   v
JSON response to frontend
```

The automated data-refresh path is:

```text
Amazon EventBridge Scheduler
   |
   v
AWS Lambda
hdb-resale-refresh
   |
   v
data.gov.sg
   |
   v
Validation and preparation
   |
   +----------------------+
   |                      |
   v                      v
Amazon DynamoDB        Amazon S3
new transactions       updated master
                       + dated snapshot
```

Amazon CloudWatch is used for Lambda logs and operational monitoring.

Amazon ECR stores the container images used by the Lambda functions.

## Main Functions

The implemented prototype includes:

- comparable-transaction retrieval and ranking;
- evidence-sufficiency assessment;
- XGBoost resale-price estimation;
- calibrated uncertainty interval;
- abstention when comparable evidence is insufficient;
- asking-price interpretation;
- React-based web user interface with comparable-sales visualisation, shareable result links and a side-by-side shortlist;
- automated resale-data refresh;
- API request validation;
- API health/status endpoint;
- CloudWatch logging and monitoring.

## API

### Base Endpoint

```text
https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com
```

### Health Endpoint

```text
GET /
```

Example:

```text
GET https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/
```

Response:

```json
{
  "message": "HDB Resale API is running",
  "usage": "Send POST requests to /estimate"
}
```

This provides a simple way to verify that the deployed API and Lambda are reachable.

### Estimate Endpoint

```text
POST /estimate
```

Full endpoint:

```text
https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate
```

The `/estimate` endpoint accepts POST requests containing the flat characteristics required for comparable retrieval and prediction.

### Example Requests

#### Sufficient comparable evidence

The following example has strong comparable evidence and produces an indicative price estimate and uncertainty interval:

```json
{
  "month": "2026-11",
  "town": "TAMPINES",
  "flat_type": "4 ROOM",
  "block": "619A",
  "street_name": "TAMPINES ST 61",
  "storey_range": "13 TO 15",
  "floor_area_sqm": 93,
  "flat_model": "Model A",
  "lease_commence_date": 2021,
  "remaining_lease": "94 years 00 months",
  "asking_price": 800000
}
```

A representative response is:

```json
{
  "evidence_sufficient": true,
  "evidence": {
    "candidate_count": 922,
    "top5_avg_score": 96.24,
    "top5_strong_count": 5,
    "top1_score": 97.79
  },
  "estimated_price": 796251.0,
  "prediction_interval": {
    "lower": 730911.75,
    "upper": 861590.25
  }
}
```

The frontend rounds the model output for presentation, showing an indicative estimate of approximately SGD 796,000 and a likely range of approximately SGD 731,000 to SGD 862,000.

#### Insufficient comparable evidence

The following example has many candidate transactions, but the closest sales are not sufficiently similar to satisfy the calibrated evidence rule:

```json
{
  "month": "2026-11",
  "town": "ANG MO KIO",
  "flat_type": "3 ROOM",
  "block": "323",
  "street_name": "ANG MO KIO AVE 3",
  "storey_range": "04 TO 06",
  "floor_area_sqm": 44,
  "flat_model": "Improved",
  "lease_commence_date": 1977,
  "remaining_lease": "49 years 10 months",
  "asking_price": 320000
}
```

A representative response is:

```json
{
  "evidence_sufficient": false,
  "evidence": {
    "candidate_count": 423,
    "top5_avg_score": 47.26,
    "top5_strong_count": 0,
    "top1_score": 48.42
  },
  "estimated_price": null,
  "prediction_interval": null
}
```

Although 423 candidate transactions are available, the closest matches do not satisfy the similarity thresholds. The service therefore returns the comparable evidence but withholds the price estimate and uncertainty interval.

These two cases demonstrate the system's evidence-gating behaviour: a model estimate is displayed only when the available comparable transactions provide sufficiently strong support.

Because the historical dataset is refreshed over time, candidate counts and similarity scores may change slightly as new transactions are added.

## API Request Validation

Incoming requests are validated before DynamoDB retrieval and model inference.

Validation covers:

- missing required fields;
- empty required fields;
- unsupported town values;
- unsupported flat types;
- non-numeric floor area;
- non-positive floor area;
- invalid lease commencement year;
- invalid storey range;
- invalid remaining-lease format;
- non-numeric asking price;
- non-positive asking price;
- malformed JSON or invalid request-body structure.

Invalid requests return HTTP:

```text
400 Bad Request
```

with a readable error message.

Unexpected application or infrastructure failures are handled separately as HTTP:

```text
500 Internal Server Error
```

without exposing internal exception details to the public API.

A valid request for which no historical transactions are available is not treated as an error. It returns HTTP `200` with insufficient evidence, for example:

```json
{
  "evidence_sufficient": false,
  "evidence": {
    "candidate_count": 0,
    "top5_avg_score": 0.0,
    "top5_strong_count": 0,
    "top1_score": 0.0
  },
  "comparables": [],
  "estimated_price": null,
  "prediction_interval": null
}
```

When history is found, the response also echoes the settings it was produced with, so clients can label results without keeping their own copy:

| Field | Meaning |
|---|---|
| `evidence_rule` | Evidence thresholds applied from `models/final/hdb_resale_calibration.json` |
| `interval_margin` | The ± conformal margin used for `prediction_interval` |
| `latest_sale_month` | Latest sale month (`YYYY-MM`) in the data searched for the town and flat type |

Scores that cannot be computed because no candidates are found are returned as `null`, never `NaN`.

## API Validation Test

`api_validation_test.py` provides a repeatable functional test of the deployed API.

The test sends a set of requests to the deployed `/estimate` endpoint and checks that valid and invalid inputs return the expected HTTP status codes.

Expected behaviour:

```text
valid request                       200
missing town                        400
empty town                          400
invalid town                        400
empty flat type                     400
invalid flat type                   400
invalid floor area                  400
non-numeric floor area              400
invalid lease commencement year     400
non-numeric asking price            400
negative asking price               400
valid but no comparables            200
empty payload                       400
```

### Running the API validation test

From the project root:

```bash
python api_validation_test.py
```

The script sends the test requests to the deployed API Gateway endpoint and prints the result for each case.

The deployed API should therefore be available before running the test.

A successful run should show the expected status code for each case. For example:

```text
valid request                       PASS (200)
missing town                        PASS (400)
invalid town                        PASS (400)
valid but no comparables            PASS (200)
```

If a case returns a different status code, the corresponding validation or API behaviour should be investigated.

This test is intended as a lightweight end-to-end check of the deployed API rather than a model-performance evaluation.

## DynamoDB Design

Table:

```text
hdb-resale-app-cs5224
```

Primary key design:

```text
Partition key:
town_flat_type

Example:
ANG MO KIO#2 ROOM
```

```text
Sort key:
month_flat_id

Example:
2026-08#FLAT...
```

The backend uses DynamoDB `Query`, not `Scan`.

Candidate transactions are retrieved from the relevant town-and-flat-type partition using a sort-key range covering the preceding 12 months.

No Global Secondary Indexes are currently required for the application's primary retrieval pattern.

The DynamoDB query implementation also supports paginated query results using `LastEvaluatedKey`.

## Comparable Ranking

Candidate transactions must first:

- match the target town;
- match the target flat type; and
- fall within the previous 12 months.

The comparable score has a maximum of 100 points.

```text
Same block       20
Same street      15
Same flat model  10
Floor area       20
Remaining lease  15
Storey           10
Recency          10
-------------------
Total           100
```

The 20-point same-block score is awarded only when both the block number and street name match the target flat. This avoids treating identical block numbers on different streets as the same physical block.

The same-street score remains a separate 15-point component.

The highest-scoring transactions are presented to the user as the strongest comparables.

## Evidence-Sufficiency Rule

A price estimate is produced only when:

```text
candidate count >= 10
top-5 average comparable score >= 75
at least 2 of the top 5 comparables score >= 75
```

Otherwise, the system returns the available comparable evidence but withholds the price estimate.

This allows the platform to abstain when the historical evidence is too weak to support a useful estimate.

## Model Selection

The selected prediction model is XGBoost.

Validation results:

```text
Model        MAE          Median APE
-------------------------------------
XGBoost      30,528.76    3.6136%
LightGBM     35,106.47    4.1757%
HistGB       36,875.07    4.3046%
CatBoost     37,387.52    4.1429%
```

XGBoost was selected based on predictive accuracy and practical deployment size and speed.

An exploratory Random Forest model was not selected because of substantially greater training time and model size.

## Chronological Evaluation

The data was split chronologically to reduce temporal leakage.

```text
Training:
January 2017 – June 2026

Validation:
July 2026 – August 2026

Calibration:
September 2026

Final evaluation:
October 2026
```

November 2026 was excluded from final model evaluation because it was incomplete at the time of evaluation.

## Uncertainty Interval

A split-conformal absolute-residual method is used to create the uncertainty interval.

Calibration settings:

```text
Nominal coverage:     90%
Interval margin:      SGD 65,339.25
Total interval width: SGD 130,678.50
Calibration coverage: 90.14%
```

## Final Evaluation

October 2026 final evaluation:

```text
Total cases:                       2,175
Overall MAE:                       SGD 34,564.78
Overall median absolute % error:   3.9082%

Cases accepted by evidence rule:   1,498
Cases abstained:                     677
Acceptance rate:                   68.87%

Accepted-case MAE:                 SGD 32,771.21
Accepted median absolute % error:  3.8494%

Nominal interval coverage:         90%
Observed final-test coverage:      88.12%
```

The final October evaluation was retained as an independent final test and was not used to further tune the model or evidence thresholds.

## Automated Data Refresh

Amazon EventBridge Scheduler invokes the refresh Lambda automatically.

The refresh process:

```text
1. Reads the current master dataset from Amazon S3.

2. Retrieves recent HDB resale records from data.gov.sg.

3. Validates and prepares the retrieved records.

4. Detects genuinely new transactions using
   occurrence-aware comparison.

5. If new records are found:
   - writes the new records to DynamoDB;
   - updates the master dataset in S3;
   - creates a dated S3 snapshot.

6. If no new records are found:
   - DynamoDB remains unchanged;
   - the S3 master remains unchanged;
   - no new snapshot is created.

7. Records execution information in CloudWatch.
```

The refresh process is designed to be idempotent.

Running the refresh repeatedly against the same source data does not create duplicate transactions or unnecessary S3 snapshots.

The scheduled refresh runs daily using Amazon EventBridge Scheduler.

## S3 Storage

The project data bucket is:

```text
hdb-resale-data-cs5224
```

Main prefixes:

```text
master/
snapshots/
models/
```

The bucket uses:

- S3 versioning;
- server-side encryption using SSE-S3.

The master dataset is retained in S3, while dated snapshots provide historical versions when new source records are detected.

Model artifacts are also archived in S3.

The production API Lambda uses the model packaged inside its ECR container image rather than downloading the model from S3 at request time.

## Frontend

The frontend source code is maintained under:

```text
web/
```

The application is built using React, TypeScript and Vite.

The deployment flow is:

```text
web/src/
   |
   v
npm run build
   |
   v
web/dist/
   |
   v
Amazon S3
   |
   v
Amazon CloudFront
```

`web/dist/` contains the compiled production frontend generated by Vite. These generated files are uploaded to the private S3 frontend bucket and delivered to users through CloudFront.

The frontend calls `POST /estimate` and renders the Lambda response. Comparable ranking, the evidence rule and model inference remain in the backend.

The frontend includes:

- town, flat-type, storey, flat-model, block, street, floor-area, lease-year and asking-price inputs;
- frontend validation that mirrors the API validation;
- street-name normalisation to HDB abbreviations such as Avenue → AVE and Bukit → BT;
- automatic calculation of the target month and remaining lease;
- a clear result summary showing the flat characteristics, model estimate and likely range when evidence is sufficient, or a withheld state with reasons and suggested next steps when comparable evidence is insufficient;
- evidence checks showing the observed values against the calibrated thresholds;
- a price-position chart showing comparable resale prices, asking price, model estimate and likely range when available;
- a responsive comparables view showing the closest past sales, their match scores, resale prices, price per sqm and differences from the target flat; the desktop layout uses a table while narrow screens use individual sale cards;
- asking-price interpretation showing whether the asking price is below, inside or above the likely range;
- shareable result links;
- a browser-based shortlist for comparing multiple flats;
- a "How it works" page explaining the comparable score, evidence rule, model and uncertainty interval;
- responsive layouts and accessibility features including keyboard navigation, visible focus and screen-reader labels.

Build and deployment instructions are available in `web/README.md` and `web/DEPLOY.md`.

The mapping between the frontend form, API request and API response is documented in `web/docs/API.md`.

## Repository Structure

```text
web/                          React/Vite web client
    src/
        api/                  API adapter, client and demo data
        components/           form, verdict, chart, table, checks, shortlist
        lib/                  formatting, URL state and shortlist storage
    docs/API.md               frontend ↔ API mapping
    scripts/deploy.sh         build + S3 upload + CloudFront invalidation
    infra/frontend.yaml       optional frontend infrastructure template
    README.md
    DEPLOY.md

models/
    final/
        hdb_resale_xgboost_calibrated.joblib
        hdb_resale_calibration.json

src/
    __init__.py
    backend_service.py
    data_processing.py
    data_source.py
    lambda_handler.py
    refresh_handler.py
    resale_service.py

api_validation_test.py

Dockerfile
Dockerfile.refresh
requirements.txt
requirements-refresh.txt
README.md

.github/workflows/deploy-web.yml   optional CI deployment for web/
```

`web/dist/` is generated by `npm run build` and contains the production files deployed to S3. It is build output rather than application source code.

## Backend Modules (`src/`)

The Python modules under `src/` separate API handling, data retrieval, data preparation, resale-assessment logic and automated data refresh.

| File | Purpose |
|---|---|
| `__init__.py` | Marks `src` as a Python package so the backend modules can be imported consistently. |
| `backend_service.py` | Connects the API layer to the resale-assessment logic. It validates incoming request fields, converts the request into the feature structure required by the model, retrieves the relevant 12-month transaction history from DynamoDB, and builds the final resale response. |
| `data_processing.py` | Contains shared data-validation and preparation functions. It validates HDB source records, standardises fields, derives features such as storey midpoint and remaining-lease months, detects genuinely new transactions during refresh, and prepares DynamoDB keys. |
| `data_source.py` | Retrieves HDB resale transaction data from the data.gov.sg API. It supports month-based retrieval, pagination and retry handling for API rate limits. |
| `lambda_handler.py` | Entry point for the public resale API Lambda. It loads the packaged XGBoost model and calibration settings, handles the `GET /` health check and `POST /estimate` requests, invokes the backend service, logs request outcomes, and returns appropriate HTTP responses. |
| `refresh_handler.py` | Entry point for the scheduled data-refresh Lambda. It loads the current master dataset from S3, retrieves recent transactions from data.gov.sg, validates and prepares the data, identifies new records, updates DynamoDB and S3, and creates a dated snapshot when new data is found. |
| `resale_service.py` | Implements the core resale-assessment logic. It selects 12-month comparable candidates, calculates comparable scores, evaluates the evidence-sufficiency rule, runs the prediction model when evidence is sufficient, creates the calibrated uncertainty interval, and prepares the ranked comparable transactions returned to the frontend. |

The main API request flow is:

```text
lambda_handler.py
        |
        v
backend_service.py
        |
        +----------------------+
        |                      |
        v                      v
DynamoDB retrieval       resale_service.py
                               |
                               +--> comparable ranking
                               +--> evidence assessment
                               +--> XGBoost prediction
                               +--> uncertainty interval
```

The automated refresh flow is:

```text
refresh_handler.py
        |
        +--> data_source.py
        |      |
        |      v
        |   data.gov.sg
        |
        +--> data_processing.py
        |
        +--> DynamoDB
        |
        +--> Amazon S3
```

## Running the Frontend Locally

Requires Node.js 20 or newer.

From the `web/` directory:

```bash
cd web
npm install
```

To run the local frontend using the deployed AWS `/estimate` API:

```bash
npm run dev:live
```

This starts the Vite development server at:

```text
http://localhost:5173
```

`dev:live` routes API calls through Vite's local proxy, so no CORS change is required for localhost.

To run the frontend using synthetic demo/mock data without calling AWS:

```bash
npm run dev
```

To create the production build:

```bash
npm run build
```

The compiled application is generated under:

```text
web/dist/
```

The contents of this directory are the files deployed to the S3 frontend bucket.

## Frontend Deployment

The React/Vite frontend is built using:

```bash
npm run build
```

This generates the production files under:

```text
web/dist/
```

The contents of `web/dist/` are synchronised to the private S3 frontend bucket:

```text
s3://hdb-resale-frontend-cs5224
```

For example, from the `web/` directory:

```bash
aws s3 sync ./dist s3://hdb-resale-frontend-cs5224 --delete
```

After the files are uploaded, the CloudFront cache is invalidated so that users receive the latest frontend version.

The deployed application is available at:

```text
https://d2d7utcbwtyp5z.cloudfront.net
```

## Container Deployment

The API and refresh functions are deployed as Lambda container images stored in Amazon ECR.

API image repository:

```text
hdb-resale-lambda
```

Refresh image repository:

```text
hdb-resale-refresh
```

The images are built for:

```text
linux/amd64
```

to match the Lambda x86_64 runtime architecture.

## Security

AWS credentials, access keys and other secrets must not be stored in the repository.

Local credential and environment files such as the following are excluded through `.gitignore`:

```text
.env
.env.*
.aws/
*.pem
*.key
```

IAM permissions are scoped to the AWS resources required by each Lambda function.

The public frontend communicates with the API through API Gateway, with CORS configured for the deployed CloudFront frontend.

Unexpected internal backend exception details are not returned through public HTTP 500 responses.

## Limitations

The system does not capture all characteristics that may affect the value of an individual flat, including:

- renovation quality;
- interior condition;
- orientation;
- floor-specific views;
- proximity to specific amenities;
- other unit-specific attributes.

Therefore:

- the model estimate is indicative rather than an official valuation;
- an asking price above the model estimate does not prove that a flat is overpriced;
- an asking price below the estimate does not prove that a flat is underpriced;
- the uncertainty interval should be considered together with the comparable transactions;
- insufficient comparable evidence may cause the service to withhold an estimate.

## AI Use

AI tools were used to support activities including:

- code review;
- debugging;
- design and implementation of the React web client in `web/`;
- implementation refinement;
- test development;
- documentation drafting.

AI-generated or AI-suggested material was reviewed and adapted by the project team before use.