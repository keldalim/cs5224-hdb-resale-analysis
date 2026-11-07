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

```text
Browser
   |
   v
Amazon CloudFront
   |
   v
Private Amazon S3 frontend
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
- web-based user interface;
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

### Example Request

```json
{
  "month": "2026-11",
  "town": "ANG MO KIO",
  "flat_type": "2 ROOM",
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

The response includes the evidence assessment, ranked comparable transactions and, where evidence is sufficient, the estimated price and calibrated uncertainty interval.

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

## API Validation Test

`api_validation_test.py` provides a repeatable functional test of the deployed API.

The test covers:

- valid requests;
- missing fields;
- empty town;
- unsupported town;
- empty flat type;
- unsupported flat type;
- negative floor area;
- non-numeric floor area;
- invalid lease commencement year;
- non-numeric asking price;
- negative asking price;
- valid requests with no comparable history;
- empty payloads.

Current validation behaviour:

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

Run the validation test using:

```bash
python api_validation_test.py
```

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
Calibration coverage: 90.15%
```

## Final Evaluation

October 2026 final evaluation:

```text
Total cases:                       2,175
Overall MAE:                       SGD 34,564.78
Overall median absolute % error:   3.9082%

Cases accepted by evidence rule:   1,500
Cases abstained:                     675
Acceptance rate:                   68.97%

Accepted-case MAE:                 SGD 32,761.14
Accepted median absolute % error:  3.85575%

Nominal interval coverage:         90%
Observed final-test coverage:      88.13%
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

The frontend is deployed using:

```text
Amazon S3
+
Amazon CloudFront
```

The S3 origin is private and is served through CloudFront.

The interface includes:

- town dropdown;
- flat-type dropdown;
- storey-range dropdown;
- flat-model dropdown;
- block and street inputs;
- floor-area input;
- lease commencement year;
- remaining lease years and months;
- helper function to estimate remaining lease from lease year;
- asking-price input;
- comparable evidence summary;
- ranked comparable transactions;
- predicted price;
- uncertainty interval;
- asking-price interpretation;
- explanatory guidance and disclaimer.

The asking-price interpretation is deterministic and rule-based rather than LLM-generated.

## Repository Structure

```text
frontend/
    index.html
    style.css
    app.js

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
```

## Running the Frontend Locally

From the project directory:

```bash
cd frontend
python -m http.server 5500
```

Then open:

```text
http://localhost:5500
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
- implementation refinement;
- test development;
- documentation drafting.

AI-generated or AI-suggested material was reviewed and adapted by the project team before use.