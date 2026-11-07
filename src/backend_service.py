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


VALID_TOWNS = {
    "ANG MO KIO",
    "BEDOK",
    "BISHAN",
    "BUKIT BATOK",
    "BUKIT MERAH",
    "BUKIT PANJANG",
    "BUKIT TIMAH",
    "CENTRAL AREA",
    "CHOA CHU KANG",
    "CLEMENTI",
    "GEYLANG",
    "HOUGANG",
    "JURONG EAST",
    "JURONG WEST",
    "KALLANG/WHAMPOA",
    "MARINE PARADE",
    "PASIR RIS",
    "PUNGGOL",
    "QUEENSTOWN",
    "SEMBAWANG",
    "SENGKANG",
    "SERANGOON",
    "TAMPINES",
    "TOA PAYOH",
    "WOODLANDS",
    "YISHUN"
}


VALID_FLAT_TYPES = {
    "1 ROOM",
    "2 ROOM",
    "3 ROOM",
    "4 ROOM",
    "5 ROOM",
    "EXECUTIVE",
    "MULTI-GENERATION"
}


def validate_request(payload):
    """
    Validate the incoming resale assessment request.

    Raises
    ------
    ValueError
        If the request is missing required fields or
        contains invalid values.
    """

    if not isinstance(payload, dict):
        raise ValueError(
            "Request body must be a JSON object"
        )

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

    # -----------------------------------------
    # Required string fields
    # -----------------------------------------

    string_fields = [
        "month",
        "town",
        "flat_type",
        "block",
        "street_name",
        "storey_range",
        "flat_model",
        "remaining_lease"
    ]

    for field in string_fields:

        value = payload.get(field)

        if value is None:
            raise ValueError(
                f"{field} cannot be empty"
            )

        if not str(value).strip():
            raise ValueError(
                f"{field} cannot be empty"
            )

    # -----------------------------------------
    # Month
    # -----------------------------------------

    try:
        pd.to_datetime(
            str(payload["month"]).strip(),
            format="%Y-%m"
        )

    except (TypeError, ValueError):

        raise ValueError(
            "month must be in YYYY-MM format"
        )

    # -----------------------------------------
    # Town
    # -----------------------------------------

    town = (
        str(payload["town"])
        .strip()
        .upper()
    )

    if town not in VALID_TOWNS:
        raise ValueError(
            f"Unsupported town: {town}"
        )

    # -----------------------------------------
    # Flat type
    # -----------------------------------------

    flat_type = (
        str(payload["flat_type"])
        .strip()
        .upper()
    )

    if flat_type not in VALID_FLAT_TYPES:
        raise ValueError(
            f"Unsupported flat_type: {flat_type}"
        )

    # -----------------------------------------
    # Floor area
    # -----------------------------------------

    try:
        floor_area = float(
            payload["floor_area_sqm"]
        )

    except (TypeError, ValueError):

        raise ValueError(
            "floor_area_sqm must be numeric"
        )

    if floor_area <= 0:
        raise ValueError(
            "floor_area_sqm must be positive"
        )

    # -----------------------------------------
    # Lease commencement year
    # -----------------------------------------

    try:
        lease_year = int(
            payload["lease_commence_date"]
        )

    except (TypeError, ValueError):

        raise ValueError(
            "lease_commence_date must be numeric"
        )

    if lease_year < 1900 or lease_year > 2100:
        raise ValueError(
            "Invalid lease_commence_date"
        )

    # -----------------------------------------
    # Storey range
    # -----------------------------------------

    try:
        get_storey_mid(
            str(
                payload["storey_range"]
            ).strip()
        )

    except Exception:

        raise ValueError(
            "Invalid storey_range"
        )

    # -----------------------------------------
    # Remaining lease
    # -----------------------------------------

    try:
        parse_remaining_lease(
            str(
                payload["remaining_lease"]
            ).strip()
        )

    except Exception:

        raise ValueError(
            "Invalid remaining_lease"
        )

    # -----------------------------------------
    # Asking price
    # Optional, but if supplied it must be valid.
    # -----------------------------------------

    if "asking_price" in payload:

        asking_price = payload[
            "asking_price"
        ]

        if (
            asking_price is None
            or (
                isinstance(
                    asking_price,
                    str
                )
                and not asking_price.strip()
            )
        ):
            raise ValueError(
                "asking_price cannot be empty"
            )

        try:
            asking_price = float(
                asking_price
            )

        except (TypeError, ValueError):

            raise ValueError(
                "asking_price must be numeric"
            )

        if asking_price <= 0:
            raise ValueError(
                "asking_price must be positive"
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
        str(
            payload["month"]
        ).strip(),
        format="%Y-%m"
    )

    target = {

        "month":
            month,

        "town":
            str(
                payload["town"]
            ).strip().upper(),

        "flat_type":
            str(
                payload["flat_type"]
            ).strip().upper(),

        "block":
            str(
                payload["block"]
            ).strip().upper(),

        "street_name":
            str(
                payload["street_name"]
            ).strip().upper(),

        "storey_range":
            str(
                payload["storey_range"]
            ).strip().upper(),

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
                payload[
                    "lease_commence_date"
                ]
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

    target_month = (
        target_row["month"]
    )

    start_month = (
        target_month
        - pd.DateOffset(
            months=12
        )
    )

    end_month = (
        target_month
        - pd.DateOffset(
            months=1
        )
    )

    start_key = (
        start_month.strftime(
            "%Y-%m"
        )
        + "#"
    )

    end_key = (
        end_month.strftime(
            "%Y-%m"
        )
        + "#\uffff"
    )

    return {
        "town_flat_type":
            partition_key,

        "start_key":
            start_key,

        "end_key":
            end_key
    }


def query_dynamodb_history(
    table_name,
    target_row,
    region_name="ap-southeast-1"
):
    """
    Query the DynamoDB table for transactions
    matching the target town and flat type
    within the preceding 12 months.
    """

    query_keys = (
        build_dynamodb_query_keys(
            target_row
        )
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
            Key(
                "town_flat_type"
            ).eq(
                query_keys[
                    "town_flat_type"
                ]
            )
            &
            Key(
                "month_flat_id"
            ).between(
                query_keys[
                    "start_key"
                ],
                query_keys[
                    "end_key"
                ]
            )
        )
    )

    items = response.get(
        "Items",
        []
    )

    # Defensive pagination support.
    # Normally the 12-month partition slice is small,
    # but DynamoDB Query can paginate at 1 MB.
    while (
        "LastEvaluatedKey"
        in response
    ):

        response = table.query(
            KeyConditionExpression=(
                Key(
                    "town_flat_type"
                ).eq(
                    query_keys[
                        "town_flat_type"
                    ]
                )
                &
                Key(
                    "month_flat_id"
                ).between(
                    query_keys[
                        "start_key"
                    ],
                    query_keys[
                        "end_key"
                    ]
                )
            ),
            ExclusiveStartKey=(
                response[
                    "LastEvaluatedKey"
                ]
            )
        )

        items.extend(
            response.get(
                "Items",
                []
            )
        )

    return items


def dynamodb_items_to_dataframe(
    items
):
    """
    Convert DynamoDB query results into the
    dataframe format expected by
    resale_service.py.
    """

    history_df = pd.DataFrame(
        items
    )

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

            history_df[col] = (
                pd.to_numeric(
                    history_df[col]
                )
            )

    if "month" in history_df.columns:

        history_df[
            "month"
        ] = pd.to_datetime(
            history_df[
                "month"
            ]
        )

    return history_df


def build_empty_response():
    """
    Return a controlled insufficient-evidence
    response when no historical transactions
    are available for a valid request.
    """

    return {
        "evidence_sufficient":
            False,

        "evidence": {
            "candidate_count":
                0,

            "top5_avg_score":
                0.0,

            "top5_strong_count":
                0,

            "top1_score":
                0.0
        },

        "comparables":
            [],

        "estimated_price":
            None,

        "prediction_interval":
            None
    }


def process_resale_request(
    payload,
    model,
    features,
    evidence_rule,
    interval_margin,
    table_name=(
        "hdb-resale-app-cs5224"
    ),
    region_name=(
        "ap-southeast-1"
    )
):
    """
    Validate request, query DynamoDB history,
    and return the resale analysis response.
    """

    validate_request(
        payload
    )

    target_row = (
        build_target_row(
            payload
        )
    )

    items = (
        query_dynamodb_history(
            table_name=table_name,
            target_row=target_row,
            region_name=region_name
        )
    )

    history_df = (
        dynamodb_items_to_dataframe(
            items
        )
    )

    if history_df.empty:

        return build_empty_response()

    response = (
        build_resale_response(
            target_row=target_row,
            history_df=history_df,
            model=model,
            features=features,
            evidence_rule=evidence_rule,
            interval_margin=interval_margin,
            top_n=5
        )
    )

    return response