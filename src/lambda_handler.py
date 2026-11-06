import json
import joblib
from pathlib import Path
import logging
import time

from src.backend_service import process_resale_request


logger = logging.getLogger()
logger.setLevel(logging.INFO)

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "final"
    / "hdb_resale_xgboost_calibrated.joblib"
)

CALIBRATION_PATH = (
    PROJECT_ROOT
    / "models"
    / "final"
    / "hdb_resale_calibration.json"
)


FEATURES = [
    "town",
    "flat_type",
    "storey_mid",
    "floor_area_sqm",
    "flat_model",
    "lease_commence_date",
    "remaining_lease_months",
    "month_index"
]


TABLE_NAME = "hdb-resale-app-cs5224"
REGION = "ap-southeast-1"

model = joblib.load(MODEL_PATH)

with open(CALIBRATION_PATH, "r", encoding="utf-8") as f:
    calibration = json.load(f)

EVIDENCE_RULE = calibration["evidence_rule"]
INTERVAL_MARGIN = calibration["interval"]["interval_margin"]


def lambda_handler(event, context):

    start_time = time.time()

    try:
        logger.info("Request received")

        body = event.get("body", event)

        if isinstance(body, str):
            payload = json.loads(body)
        else:
            payload = body

        response = process_resale_request(
            payload=payload,
            model=model,
            features=FEATURES,
            evidence_rule=EVIDENCE_RULE,
            interval_margin=INTERVAL_MARGIN,
            table_name=TABLE_NAME,
            region_name=REGION
        )

        duration_ms = (
            time.time() - start_time
        ) * 1000

        logger.info(
            "Request completed | "
            "candidate_count=%s | "
            "evidence_sufficient=%s | "
            "duration_ms=%.2f",
            response["evidence"]["candidate_count"],
            response["evidence_sufficient"],
            duration_ms
        )

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps(response)
        }

    except ValueError as e:

        logger.warning(
            "Invalid request | error=%s",
            str(e)
        )

        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "error": str(e)
            })
        }

    except Exception as e:

        logger.exception(
            "Unhandled error"
        )

        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "error": str(e)
            })
        }