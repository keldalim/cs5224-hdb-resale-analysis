import io
import json
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
import pandas as pd

from src.data_source import load_recent_hdb_data_from_api
from src.data_processing import (
    separate_valid_invalid_rows,
    prepare_data,
    update_master_data,
    add_dynamodb_keys
)


logger = logging.getLogger()
logger.setLevel(logging.INFO)


REGION = "ap-southeast-1"

S3_BUCKET = "hdb-resale-data-cs5224"
MASTER_KEY = "master/hdb_resale_clean.csv"

DYNAMODB_TABLE = "hdb-resale-app-cs5224"


s3 = boto3.client(
    "s3",
    region_name=REGION
)

dynamodb = boto3.resource(
    "dynamodb",
    region_name=REGION
)

table = dynamodb.Table(
    DYNAMODB_TABLE
)


def load_master_from_s3():
    response = s3.get_object(
        Bucket=S3_BUCKET,
        Key=MASTER_KEY
    )

    master_df = pd.read_csv(
        io.BytesIO(
            response["Body"].read()
        )
    )

    master_df = prepare_data(
        master_df
    )

    return master_df


def save_dataframe_to_s3(
    df,
    key
):
    csv_buffer = io.StringIO()

    df.to_csv(
        csv_buffer,
        index=False
    )

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=csv_buffer.getvalue(),
        ContentType="text/csv"
    )


def convert_value(value):
    if pd.isna(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")

    if isinstance(value, float):
        return Decimal(str(value))

    if hasattr(value, "item"):
        value = value.item()

    return value


def write_new_records_to_dynamodb(
    new_records
):
    if new_records.empty:
        return 0

    dynamodb_df = add_dynamodb_keys(
        new_records.copy()
    )

    written = 0

    with table.batch_writer(
        overwrite_by_pkeys=[
            "town_flat_type",
            "month_flat_id"
        ]
    ) as batch:

        for _, row in dynamodb_df.iterrows():

            item = {}

            for column, value in row.items():

                value = convert_value(
                    value
                )

                if value is not None:
                    item[column] = value

            batch.put_item(
                Item=item
            )

            written += 1

    return written


def lambda_handler(
    event,
    context
):
    logger.info(
        "Refresh started"
    )

    # Use Singapore date
    singapore_time = (
        datetime.now(timezone.utc)
        + timedelta(hours=8)
    )

    # Allow manual override when testing.
    start_month = event.get(
        "start_month",
        (
            singapore_time
            - pd.DateOffset(months=2)
        ).strftime("%Y-%m")
    )

    end_month = event.get(
        "end_month",
        singapore_time.strftime(
            "%Y-%m"
        )
    )

    logger.info(
        "Refresh window | "
        "start_month=%s | "
        "end_month=%s",
        start_month,
        end_month
    )

    # 1. Read current master from S3
    master_df = load_master_from_s3()

    logger.info(
        "Master loaded | rows=%s",
        len(master_df)
    )

    # 2. Fetch recent official records
    refresh_raw = (
        load_recent_hdb_data_from_api(
            start_month=start_month,
            end_month=end_month
        )
    )

    logger.info(
        "API records retrieved | rows=%s",
        len(refresh_raw)
    )

    # 3. Validate
    valid_df, invalid_df = (
        separate_valid_invalid_rows(
            refresh_raw
        )
    )

    logger.info(
        "Validation completed | "
        "valid=%s | invalid=%s",
        len(valid_df),
        len(invalid_df)
    )

    # 4. Standardise / derive fields
    refresh_df = prepare_data(
        valid_df
    )

    # 5. Detect genuinely new records
    updated_master, new_records = (
        update_master_data(
            master_df,
            refresh_df
        )
    )

    logger.info(
        "New records detected | rows=%s",
        len(new_records)
    )

    # Nothing new: finish without rewriting
    if new_records.empty:

        logger.info(
            "Refresh completed | "
            "no new records"
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "No new records",
                "new_records": 0,
                "master_rows": len(
                    master_df
                )
            })
        }

    # 6. Add new records to DynamoDB
    dynamodb_written = (
        write_new_records_to_dynamodb(
            new_records
        )
    )

    # 7. Save updated active master
    save_dataframe_to_s3(
        updated_master,
        MASTER_KEY
    )

    # 8. Save dated snapshot
    snapshot_date = (
        singapore_time.strftime(
            "%Y-%m-%d"
        )
    )

    snapshot_key = (
        f"snapshots/"
        f"{snapshot_date}/"
        f"hdb_resale_clean.csv"
    )

    save_dataframe_to_s3(
        updated_master,
        snapshot_key
    )

    logger.info(
        "Refresh completed | "
        "new_records=%s | "
        "dynamodb_written=%s | "
        "master_rows=%s | "
        "snapshot=%s",
        len(new_records),
        dynamodb_written,
        len(updated_master),
        snapshot_key
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Refresh completed",
            "new_records": len(
                new_records
            ),
            "dynamodb_written":
                dynamodb_written,
            "master_rows": len(
                updated_master
            ),
            "snapshot_key":
                snapshot_key
        })
    }