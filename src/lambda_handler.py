import json
import joblib
from pathlib import Path
import logging
import time

from src.backend_service import (
    process_resale_request
)


logger = logging.getLogger()
logger.setLevel(
    logging.INFO
)


PROJECT_ROOT = (
    Path(__file__)
    .resolve()
    .parent
    .parent
)


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


TABLE_NAME = (
    "hdb-resale-app-cs5224"
)

REGION = (
    "ap-southeast-1"
)


model = joblib.load(
    MODEL_PATH
)


with open(
    CALIBRATION_PATH,
    "r",
    encoding="utf-8"
) as f:

    calibration = (
        json.load(f)
    )


EVIDENCE_RULE = (
    calibration[
        "evidence_rule"
    ]
)

INTERVAL_MARGIN = (
    calibration[
        "interval"
    ][
        "interval_margin"
    ]
)


def make_response(
    status_code,
    body
):
    """
    Build a consistent Lambda/API Gateway response.
    """

    return {
        "statusCode":
            status_code,

        "headers": {
            "Content-Type":
                "application/json"
        },

        "body":
            json.dumps(body)
    }


def lambda_handler(
    event,
    context
):

    start_time = (
        time.time()
    )

    try:

        logger.info(
            "Request received"
        )

        # Validate the Lambda event before
        # trying to read fields from it.
        if not isinstance(
            event,
            dict
        ):

            raise ValueError(
                "Invalid request event"
            )

        # -----------------------------------------
        # Identify HTTP method and path
        # -----------------------------------------

        request_context = event.get(
            "requestContext",
            {}
        )

        http_context = request_context.get(
            "http",
            {}
        )

        method = http_context.get(
            "method"
        )

        path = http_context.get(
            "path"
        )

        # -----------------------------------------
        # Friendly GET / health/info endpoint
        # -----------------------------------------

        if (
            method == "GET"
            and path == "/"
        ):

            duration_ms = (
                time.time()
                - start_time
            ) * 1000

            logger.info(
                "Health check completed | "
                "duration_ms=%.2f",
                duration_ms
            )

            return make_response(
                200,
                {
                    "message":
                        "HDB Resale API is running",

                    "usage":
                        "Send POST requests to /estimate"
                }
            )

        # -----------------------------------------
        # Extract request body
        # -----------------------------------------

        body = event.get(
            "body",
            event
        )

        if body is None:

            raise ValueError(
                "Request body is required"
            )

        # API Gateway normally supplies
        # the body as a JSON string.
        if isinstance(
            body,
            str
        ):

            try:

                payload = (
                    json.loads(
                        body
                    )
                )

            except json.JSONDecodeError:

                raise ValueError(
                    "Request body must contain valid JSON"
                )

        else:

            payload = body

        # Only JSON objects are accepted.
        if not isinstance(
            payload,
            dict
        ):

            raise ValueError(
                "Request body must be a JSON object"
            )

        # -----------------------------------------
        # Process resale request
        # -----------------------------------------

        response = (
            process_resale_request(
                payload=payload,
                model=model,
                features=FEATURES,
                evidence_rule=(
                    EVIDENCE_RULE
                ),
                interval_margin=(
                    INTERVAL_MARGIN
                ),
                table_name=(
                    TABLE_NAME
                ),
                region_name=(
                    REGION
                )
            )
        )

        duration_ms = (
            time.time()
            - start_time
        ) * 1000

        logger.info(
            "Request completed | "
            "candidate_count=%s | "
            "evidence_sufficient=%s | "
            "duration_ms=%.2f",
            response[
                "evidence"
            ][
                "candidate_count"
            ],
            response[
                "evidence_sufficient"
            ],
            duration_ms
        )

        return make_response(
            200,
            response
        )


    except ValueError as e:

        duration_ms = (
            time.time()
            - start_time
        ) * 1000

        logger.warning(
            "Invalid request | "
            "error=%s | "
            "duration_ms=%.2f",
            str(e),
            duration_ms
        )

        return make_response(
            400,
            {
                "error":
                    str(e)
            }
        )


    except Exception:

        duration_ms = (
            time.time()
            - start_time
        ) * 1000

        logger.exception(
            "Unhandled error | "
            "duration_ms=%.2f",
            duration_ms
        )

        # Do not expose internal exception
        # details through the public API.
        return make_response(
            500,
            {
                "error":
                    "Internal server error"
            }
        )