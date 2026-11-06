# CS5224 HDB Resale Price Insights

Cloud-based HDB resale decision-support prototype developed for CS5224 Cloud Computing.

## Overview

The platform helps users assess an HDB resale asking price using recent completed resale transactions.

A user enters the characteristics of a target flat and an asking price. The system retrieves relevant historical transactions, ranks comparable flats, assesses whether the available evidence is sufficiently strong, and, where appropriate, produces an indicative resale-price estimate with an uncertainty interval.

If comparable evidence is insufficient, the service withholds the price estimate rather than presenting a potentially unreliable result.

The platform is intended as a decision-support tool and not as an official property valuation.

## Live Application

[https://d2d7utcbwtyp5z.cloudfront.net](https://d2d7utcbwtyp5z.cloudfront.net)

## AWS Region

The deployed application uses AWS Asia Pacific (Singapore):

`ap-southeast-1`

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

The data-refresh path is:

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
- CloudWatch logging and monitoring.

## API

### Endpoint

```text
POST https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate
```

### Example request

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

## Comparable Ranking

Candidate transactions must first match the target town and flat type and fall within the previous 12 months.

The comparable score has a maximum of 100 points and considers:

```text
Same block       20
Same street      15
Same flat model  10
Floor area       20
Remaining lease  15
Storey           10
Recency          10
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

## Model and Uncertainty

The selected model is XGBoost.

Model development and evaluation use chronological data splits to avoid using future transactions to predict earlier periods.

A split-conformal absolute-residual method is used to create the uncertainty interval.

Final October 2026 evaluation:

```text
Total cases:                       2,175
Overall MAE:                       SGD 34,564.78
Overall median absolute % error:   3.9082%

Cases accepted by evidence rule:   1,500
Acceptance rate:                   68.97%

Accepted-case MAE:                 SGD 32,761.14
Accepted median absolute % error:  3.85575%

Nominal interval coverage:         90%
Observed final-test coverage:      88.13%
```

## Automated Data Refresh

Amazon EventBridge Scheduler invokes the refresh Lambda automatically.

The refresh process:

```text
1. Reads the current master dataset from S3.
2. Retrieves recent HDB resale records from data.gov.sg.
3. Validates and prepares the records.
4. Detects genuinely new transactions using occurrence-aware comparison.
5. If new records are found:
   - writes them to DynamoDB;
   - updates the master dataset in S3;
   - creates a dated S3 snapshot.
6. If no new records are found:
   - DynamoDB remains unchanged;
   - the S3 master remains unchanged;
   - no new snapshot is created.
7. Records execution information in CloudWatch.
```

The refresh process is designed to be idempotent: rerunning the same source data does not create duplicate transactions or unnecessary S3 snapshots.

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

## Security

AWS credentials, access keys and other secrets must not be stored in the repository.

Local credential files such as `.env` and `.aws/` are excluded through `.gitignore`.

IAM permissions are scoped to the AWS resources required by each Lambda function.

## Limitations

The system does not capture all characteristics that may affect the value of an individual flat, including renovation quality, interior condition, orientation and other unit-specific attributes.

Therefore:

- the model estimate is indicative rather than an official valuation;
- an asking price above the model estimate does not prove that a flat is overpriced;
- an asking price below the estimate does not prove that a flat is underpriced;
- the uncertainty interval should be considered together with the comparable transactions.

## AI Use

AI tools were used to support activities including code review, debugging, implementation refinement and documentation drafting.

AI-generated or AI-suggested material was reviewed and adapted by the project team before use.