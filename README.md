# CS5224 HDB Resale Analysis Platform

Cloud-based HDB resale analysis prototype developed for CS5224 Cloud Computing.

## Overview

The application helps users assess an HDB resale asking price using historical resale transactions. It retrieves relevant transactions, ranks comparable flats, evaluates whether sufficient comparable evidence exists, and, where appropriate, provides an estimated resale price with an uncertainty interval.

## Architecture

The deployed application uses:

- Amazon CloudFront and Amazon S3 for the web frontend
- Amazon API Gateway for the API endpoint
- AWS Lambda for backend processing
- Amazon DynamoDB for resale transaction retrieval
- Amazon ECR for Lambda container images
- Amazon S3 for master data, model artifacts and refreshed snapshots
- Amazon EventBridge Scheduler for automated data refresh
- Amazon CloudWatch for logs and monitoring

The system is deployed in AWS Asia Pacific (Singapore), `ap-southeast-1`.

## Main Functions

The current implementation includes:

- Comparable-transaction ranking
- Evidence-sufficiency assessment
- XGBoost resale-price estimation
- Calibrated uncertainty interval
- Abstention when comparable evidence is insufficient
- Web interface
- Automated resale-data refresh

## Repository Structure

```text
frontend/                 Web interface
models/final/             Trained model and calibration configuration
src/                      Backend, data-processing and refresh logic
Dockerfile                API Lambda container
Dockerfile.refresh        Refresh Lambda container
requirements.txt          API dependencies
requirements-refresh.txt  Refresh dependencies
```

## DynamoDB Design

Table: `hdb-resale-app-cs5224`

- Partition key: `town_flat_type`
- Sort key: `month_flat_id`
- GSIs: none currently used

The backend uses DynamoDB `Query`, not `Scan`, to retrieve transactions for the relevant town and flat type within the required date range.

## Live Application

https://d2d7utcbwtyp5z.cloudfront.net

## Notes

This prototype is intended as a decision-support tool and not as an official property valuation. The underlying public transaction data does not capture all unit-specific characteristics such as renovation quality, condition, orientation or exact unit attributes.

## AI Use

AI tools were used to support development activities including code review, debugging, documentation and refinement of implementation approaches. All generated or suggested content was reviewed and adapted by the project team before use.