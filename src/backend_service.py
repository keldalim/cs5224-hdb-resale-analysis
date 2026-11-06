import pandas as pd
import boto3
from boto3.dynamodb.conditions import Key

from src.data_processing import (
    get_storey_mid,
    parse_remaining_lease
)

from src.resale_service import build_resale_response


REQUIRED_REQUEST_FIELDS = [
    "month",
    "town",
    "flat_type",
    "block",
    "street_name",
    "storey_range",
    "floor_area_sqm",
    "flat_model",
    "lease_commence_date",
    "remaining_lease"
]


def validate_request(payload):
    """
    Validate the incoming resale assessment request.
    """

    missing_fields = [
        field
        for field in REQUIRED_REQUEST_FIELDS
        if field not in payload
    ]

    if missing_fields:
        raise ValueError(
            "Missing required fields: "
            + ", ".join(missing_fields)
        )

    if float(payload["floor_area_sqm"]) <= 0:
        raise ValueError(
            "floor_area_sqm must be positive"
        )

    lease_year = int(
        payload["lease_commence_date"]
    )

    if lease_year < 1900 or lease_year > 2100:
        raise ValueError(
            "Invalid lease_commence_date"
        )

    get_storey_mid(
        payload["storey_range"]
    )

    parse_remaining_lease(
        payload["remaining_lease"]
    )

    return True


def build_target_row(payload):
    """
    Convert validated request data into the
    feature structure used by the model and
    comparable-ranking logic.
    """

    validate_request(
        payload
    )

    month = pd.to_datetime(
        payload["month"],
        format="%Y-%m"
    )

    target = {
        "month":
            month,

        "town":
            str(
                payload["town"]
            ).strip(),

        "flat_type":
            str(
                payload["flat_type"]
            ).strip(),

        "block":
            str(
                payload["block"]
            ).strip(),

        "street_name":
            str(
                payload["street_name"]
            ).strip(),

        "storey_range":
            str(
                payload["storey_range"]
            ).strip(),

        "floor_area_sqm":
            float(
                payload["floor_area_sqm"]
            ),

        "flat_model":
            str(
                payload["flat_model"]
            ).strip(),

        "lease_commence_date":
            int(
                payload["lease_commence_date"]
            ),

        "remaining_lease":
            str(
                payload["remaining_lease"]
            ).strip()
    }

    target[
        "storey_mid"
    ] = get_storey_mid(
        target["storey_range"]
    )

    target[
        "remaining_lease_months"
    ] = parse_remaining_lease(
        target["remaining_lease"]
    )

    target[
        "month_index"
    ] = (
        (
            month.year
            - 2017
        ) * 12
        + month.month
        - 1
    )

    return pd.Series(
        target
    )


def build_dynamodb_query_keys(
    target_row
):
    """
    Build DynamoDB partition key and
    inclusive 12-month sort-key range.
    """

    partition_key = (
        f"{target_row['town']}#"
        f"{target_row['flat_type']}"
    )

    target_month = target_row["month"]

    start_month = (
        target_month
        - pd.DateOffset(months=12)
    )

    end_month = (
        target_month
        - pd.DateOffset(months=1)
    )

    start_key = (
        start_month.strftime("%Y-%m")
        + "#"
    )

    end_key = (
        end_month.strftime("%Y-%m")
        + "#\uffff"
    )

    return {
        "town_flat_type": partition_key,
        "start_key": start_key,
        "end_key": end_key
    }


def query_dynamodb_history(
    table_name,
    target_row,
    region_name="ap-southeast-1"
):
    query_keys = build_dynamodb_query_keys(
        target_row
    )

    dynamodb = boto3.resource(
        "dynamodb",
        region_name=region_name
    )

    table = dynamodb.Table(
        table_name
    )

    response = table.query(
        KeyConditionExpression=(
            Key("town_flat_type").eq(
                query_keys["town_flat_type"]
            )
            &
            Key("month_flat_id").between(
                query_keys["start_key"],
                query_keys["end_key"]
            )
        )
    )

    return response.get(
        "Items",
        []
    )


def dynamodb_items_to_dataframe(items):
    """
    Convert DynamoDB query results into the dataframe
    format expected by resale_service.py.
    """

    history_df = pd.DataFrame(items)

    if history_df.empty:
        return history_df

    numeric_cols = [
        "floor_area_sqm",
        "lease_commence_date",
        "resale_price",
        "storey_mid",
        "remaining_lease_months",
        "month_index",
        "duplicate_seq"
    ]

    for col in numeric_cols:
        if col in history_df.columns:
            history_df[col] = pd.to_numeric(
                history_df[col]
            )

    if "month" in history_df.columns:
        history_df["month"] = pd.to_datetime(
            history_df["month"]
        )

    return history_df


def process_resale_request(
    payload,
    model,
    features,
    evidence_rule,
    interval_margin,
    table_name="hdb-resale-app-cs5224",
    region_name="ap-southeast-1"
):
    """
    Validate request, query DynamoDB history,
    and return the resale analysis response.
    """

    validate_request(payload)

    target_row = build_target_row(payload)

    items = query_dynamodb_history(
        table_name=table_name,
        target_row=target_row,
        region_name=region_name
    )

    history_df = dynamodb_items_to_dataframe(
        items
    )

    response = build_resale_response(
        target_row=target_row,
        history_df=history_df,
        model=model,
        features=features,
        evidence_rule=evidence_rule,
        interval_margin=interval_margin,
        top_n=5
    )

    return response