# CS5224 HDB Resale Price Insights

Cloud-based HDB resale decision-support prototype developed for CS5224 Cloud Computing.

## Overview

The platform helps users assess an HDB resale asking price using recent completed resale transactions.

Users enter the characteristics of a target flat and an asking price. The system retrieves and ranks comparable transactions, assesses the strength of the available evidence and, when sufficient, produces an indicative XGBoost resale-price estimate with an uncertainty interval.

If the comparable evidence is insufficient, the service withholds the estimate rather than presenting an unsupported result.

The platform is a decision-support tool and not an official property valuation.

## Live Application

https://d2d7utcbwtyp5z.cloudfront.net

AWS Region:

```text
ap-southeast-1
```

## Architecture

### User request flow

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
        +-------------------+
        |                   |
        v                   v
Amazon DynamoDB       XGBoost model
historical sales      + calibration
        |
        v
Comparable ranking
        |
        v
Evidence assessment
        |
        v
Estimate + uncertainty interval
or abstention
```

### Frontend delivery

```text
React/Vite source: web/
        |
        v
npm run build
        |
        v
web/dist/
        |
        v
Private Amazon S3 bucket
        |
        v
Amazon CloudFront
        |
        v
Browser
```

### Scheduled refresh

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
        +------------------+
        |                  |
        v                  v
Amazon DynamoDB       Amazon S3
new transactions      master + snapshot
```

Amazon CloudWatch provides Lambda logging and operational monitoring. Amazon ECR stores the Lambda container images.

## Main Functions

The prototype includes:

- comparable-transaction retrieval and ranking;
- evidence-sufficiency assessment;
- XGBoost resale-price estimation;
- calibrated uncertainty interval;
- abstention when evidence is insufficient;
- asking-price interpretation;
- React-based web interface;
- automated resale-data refresh;
- API request validation;
- API health endpoint;
- CloudWatch logging and monitoring.

## API

Base endpoint:

```text
https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com
```

Health endpoint:

```text
GET /
```

Estimate endpoint:

```text
POST /estimate
```

Full estimate endpoint:

```text
https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate
```

Incoming requests are validated before DynamoDB retrieval and model inference. Invalid requests return HTTP `400`, while unexpected application or infrastructure errors return HTTP `500` without exposing internal exception details.

A valid request with insufficient or no comparable evidence still returns HTTP `200`, with the price estimate and prediction interval omitted.

## DynamoDB Design

Table:

```text
hdb-resale-app-cs5224
```

Primary key:

```text
Partition key: town_flat_type
Sort key:      month_flat_id
```

Example:

```text
town_flat_type = ANG MO KIO#2 ROOM
month_flat_id  = 2026-08#...
```

The backend uses DynamoDB `Query`, rather than `Scan`, to retrieve transactions from the same town and flat type within the preceding 12 months. Paginated results are handled using `LastEvaluatedKey`.

No Global Secondary Index is required for the current access pattern.

## Comparable Ranking

Candidates must:

- match the target town;
- match the target flat type; and
- fall within the preceding 12 months.

The comparable score has a maximum of 100 points:

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

The same-block score requires both the block number and street name to match.

The five highest-scoring transactions are returned as the strongest comparables.

## Evidence-Sufficiency Rule

A price estimate is produced only when all three conditions are met:

```text
candidate count >= 10
top-5 average comparable score >= 75
at least 2 of the top 5 comparables score >= 75
```

Otherwise, the available comparable evidence is returned but the model estimate is withheld.

## Model and Evaluation

The selected model is XGBoost.

Validation results:

```text
Model        MAE          Median APE
-------------------------------------
XGBoost      30,528.76    3.6136%
LightGBM     35,106.47    4.1757%
HistGB       36,875.07    4.3046%
CatBoost     37,387.52    4.1429%
```

The data was split chronologically:

```text
Training:          January 2017 – June 2026
Validation:        July 2026 – August 2026
Calibration:       September 2026
Final evaluation:  October 2026
```

November 2026 was excluded because it was incomplete at the time of evaluation.

A split-conformal absolute-residual method is used for the prediction interval:

```text
Nominal coverage:       90%
Interval margin:        SGD 65,339.25
Total interval width:   SGD 130,678.50
Calibration coverage:   90.14%
```

Final October 2026 evaluation:

```text
Total cases:                       2,175
Overall MAE:                       SGD 34,564.78
Overall Median APE:                3.9082%

Cases accepted:                    1,498
Cases abstained:                     677
Acceptance rate:                   68.87%

Accepted-case MAE:                 SGD 32,771.21
Accepted Median APE:               3.8494%

Nominal interval coverage:         90%
Observed final-test coverage:      88.12%
```

The October evaluation set was retained as an independent final test and was not used to further tune the model, evidence thresholds or uncertainty range.

## Automated Data Refresh

Amazon EventBridge Scheduler invokes `hdb-resale-refresh` daily.

The refresh process:

1. Reads the current master dataset from S3.
2. Retrieves recent resale transactions from data.gov.sg.
3. Validates and prepares the records.
4. Detects genuinely new transactions using occurrence-aware comparison.
5. Writes new records to DynamoDB.
6. Updates the S3 master dataset and creates a dated snapshot when new records are detected.
7. Makes no database or S3 changes when no new records are detected.
8. Records execution information in CloudWatch.

The process is designed to be idempotent, so repeated runs against the same source data do not create duplicate transactions or unnecessary snapshots.

## S3 Storage

Data bucket:

```text
hdb-resale-data-cs5224
```

Main prefixes:

```text
master/
snapshots/
models/
```

The bucket uses S3 versioning and SSE-S3 encryption.

The production API uses the model packaged inside its Lambda container image. The model is not downloaded from S3 during each request.

## Frontend

The frontend is built using React, TypeScript and Vite.

Source:

```text
web/
```

Production build:

```bash
cd web
npm install
npm run build
```

This generates:

```text
web/dist/
```

The generated `web/dist/` files are uploaded to the private S3 frontend bucket and delivered through CloudFront. `web/dist/` is build output and is excluded from the GitHub repository through `.gitignore`.

The frontend calls `POST /estimate` and displays the backend response. Comparable ranking, evidence assessment and model inference remain in the backend.

Build and deployment details are available in:

```text
web/README.md
web/DEPLOY.md
web/docs/API.md
```

## Repository Structure

```text
web/                          React/Vite frontend
    src/                      frontend source
    docs/API.md               frontend/API mapping
    README.md                 frontend setup
    DEPLOY.md                 frontend deployment

models/
    final/
        hdb_resale_xgboost_calibrated.joblib
        hdb_resale_calibration.json

src/
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
```

### Backend modules

- `src/lambda_handler.py` — API Lambda entry point; loads the model and calibration settings and handles API responses.
- `src/backend_service.py` — validates requests, prepares target features and queries DynamoDB.
- `src/resale_service.py` — ranks comparables, evaluates evidence sufficiency and performs prediction when supported.
- `src/data_source.py` — retrieves resale transactions from data.gov.sg.
- `src/data_processing.py` — validates and prepares source data and generates DynamoDB keys.
- `src/refresh_handler.py` — scheduled refresh Lambda that updates DynamoDB and S3.

`api_validation_test.py` provides repeatable checks against the deployed API.

## Running the Frontend Locally

Requires Node.js 20 or newer.

From `web/`:

```bash
npm install
```

Run with the deployed AWS API:

```bash
npm run dev:live
```

Run with synthetic demo data:

```bash
npm run dev
```

Create the production build:

```bash
npm run build
```

## Container Deployment

The API and refresh Lambda functions are deployed as container images stored in Amazon ECR.

```text
API repository:      hdb-resale-lambda
Refresh repository:  hdb-resale-refresh
Architecture:         linux/amd64
```

`Dockerfile` packages the API Lambda code, dependencies and model artefacts. `Dockerfile.refresh` packages the scheduled refresh Lambda.

## API Validation Test

Run from the project root:

```bash
python api_validation_test.py
```

The script checks deployed API behaviour for valid requests, missing or invalid inputs and valid requests with no comparable transactions.

## Security

- The frontend S3 bucket is private and served through CloudFront.
- IAM permissions are scoped to the AWS resources required by each Lambda function.
- The public frontend communicates with the backend through API Gateway over HTTPS.
- CORS is configured for the deployed frontend.
- Requests are validated before data retrieval and prediction.
- Internal exception details are not returned through public HTTP `500` responses.
- AWS credentials, environment files and private keys are excluded through `.gitignore`.

## Limitations

The platform is a decision-support tool rather than an official valuation. Public resale data does not capture renovation, interior condition, exact floor, orientation, views or other unit-specific factors.

The prediction interval is calibrated using historical transactions and may not maintain the same coverage as market conditions change.

The automated refresh detects newly published transactions but does not currently reconcile historical records that are later amended or removed from data.gov.sg.

The current Lambda concurrency limit affected reliability at 20 concurrent users. Higher concurrency should be retested after increasing the applicable limit.

## AI Use

AI tools supported code review, debugging, test-case development and documentation drafting. All AI-suggested material was reviewed and adapted by team members before use. AI support also helped identify validation gaps and improve explanations of system performance, evidence sufficiency and uncertainty. The architecture, model choices, evaluation protocol and final conclusions were determined by the team.
