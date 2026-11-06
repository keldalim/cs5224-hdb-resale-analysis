import hashlib
import re
import pandas as pd

from datetime import date
from pathlib import Path

# ==================================================
# Required source columns
# ==================================================

REQUIRED_COLUMNS = [
    "month",
    "town",
    "flat_type",
    "block",
    "street_name",
    "storey_range",
    "floor_area_sqm",
    "flat_model",
    "lease_commence_date",
    "remaining_lease",
    "resale_price"
]


# ==================================================
# Schema validation
# ==================================================

def validate_schema(df):
    """
    Check that all required HDB source columns exist.
    """

    missing_columns = [
        col
        for col in REQUIRED_COLUMNS
        if col not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    return True


# ==================================================
# Individual transformations
# ==================================================

def get_storey_mid(storey_range):
    """
    Convert a storey range such as '04 TO 06'
    into its midpoint: 5.
    """

    if not isinstance(storey_range, str):
        raise ValueError(
            f"Invalid storey_range: {storey_range}"
        )

    parts = storey_range.strip().split(" TO ")

    if len(parts) != 2:
        raise ValueError(
            f"Invalid storey_range format: {storey_range}"
        )

    try:
        low = int(parts[0])
        high = int(parts[1])

    except ValueError:
        raise ValueError(
            f"Invalid storey_range values: {storey_range}"
        )

    if low <= 0 or high < low:
        raise ValueError(
            f"Invalid storey_range values: {storey_range}"
        )

    return (low + high) // 2


def parse_remaining_lease(value):
    """
    Convert remaining lease such as
    '61 years 04 months'
    into total remaining lease months.
    """

    if not isinstance(value, str):
        raise ValueError(
            f"Invalid remaining_lease: {value}"
        )

    value = value.strip()

    years_match = re.search(
        r"(\d+)\s+years?",
        value
    )

    months_match = re.search(
        r"(\d+)\s+months?",
        value
    )

    if not years_match:
        raise ValueError(
            f"Invalid remaining_lease format: {value}"
        )

    years = int(
        years_match.group(1)
    )

    months = (
        int(months_match.group(1))
        if months_match
        else 0
    )

    if months < 0 or months > 11:
        raise ValueError(
            f"Invalid remaining lease months: {value}"
        )

    total_months = (
        years * 12
        + months
    )

    if (
        total_months <= 0
        or total_months > 99 * 12
    ):
        raise ValueError(
            f"Remaining lease out of range: {value}"
        )

    return total_months


# ==================================================
# Row-level validation
# ==================================================

def validate_row(row):
    """
    Validate one HDB resale transaction.

    Returns:
        None if valid.
        Error message if invalid.
    """

    # Required values
    for field in REQUIRED_COLUMNS:

        if pd.isna(row[field]):
            return (
                f"Missing value: {field}"
            )

    # Storey range
    try:
        get_storey_mid(
            row["storey_range"]
        )

    except ValueError as e:
        return str(e)

    # Remaining lease
    try:
        parse_remaining_lease(
            row["remaining_lease"]
        )

    except ValueError as e:
        return str(e)

    # Floor area
    try:
        floor_area = float(
            row["floor_area_sqm"]
        )

    except (TypeError, ValueError):
        return (
            "Invalid floor_area_sqm: "
            f"{row['floor_area_sqm']}"
        )

    if floor_area <= 0:
        return (
            "Invalid floor_area_sqm: "
            f"{floor_area}"
        )

    # Resale price
    try:
        resale_price = float(
            row["resale_price"]
        )

    except (TypeError, ValueError):
        return (
            "Invalid resale_price: "
            f"{row['resale_price']}"
        )

    if resale_price <= 0:
        return (
            "Invalid resale_price: "
            f"{resale_price}"
        )

    # Lease commencement year
    try:
        lease_year = int(
            row["lease_commence_date"]
        )

    except (TypeError, ValueError):
        return (
            "Invalid lease_commence_date: "
            f"{row['lease_commence_date']}"
        )

    if (
        lease_year < 1900
        or lease_year > 2100
    ):
        return (
            "Invalid lease_commence_date: "
            f"{lease_year}"
        )

    return None


def separate_valid_invalid_rows(df):
    """
    Separate valid records from records
    that fail row-level validation.
    """

    validate_schema(df)

    df = df.copy()

    df["validation_error"] = (
        df.apply(
            validate_row,
            axis=1
        )
    )

    valid_df = (
        df[
            df["validation_error"].isna()
        ]
        .drop(
            columns=[
                "validation_error"
            ]
        )
        .copy()
    )

    invalid_df = (
        df[
            df["validation_error"].notna()
        ]
        .copy()
    )

    return (
        valid_df,
        invalid_df
    )


# ==================================================
# Feature preparation
# ==================================================

def prepare_data(df):
    """
    Apply transformations required for
    modelling, comparable ranking and storage.

    Data types are standardised so records loaded
    from CSV and data.gov.sg API are consistent.
    """

    validate_schema(df)

    df = df.copy()

    # ----------------------------------------------
    # Standardise text fields
    # ----------------------------------------------

    text_columns = [
        "town",
        "flat_type",
        "block",
        "street_name",
        "storey_range",
        "flat_model",
        "remaining_lease"
    ]

    for column in text_columns:
        df[column] = (
            df[column]
            .astype(str)
            .str.strip()
        )

    # ----------------------------------------------
    # Standardise numeric fields
    # ----------------------------------------------

    df["floor_area_sqm"] = pd.to_numeric(
        df["floor_area_sqm"]
    )

    df["resale_price"] = pd.to_numeric(
        df["resale_price"]
    )

    df["lease_commence_date"] = (
        pd.to_numeric(
            df["lease_commence_date"]
        )
        .astype(int)
    )

    # ----------------------------------------------
    # Transaction month
    # ----------------------------------------------

    df["month"] = pd.to_datetime(
        df["month"],
        format="mixed"
    )

    # ----------------------------------------------
    # Derived features
    # ----------------------------------------------

    df["storey_mid"] = (
        df["storey_range"]
        .apply(get_storey_mid)
    )

    df["remaining_lease_months"] = (
        df["remaining_lease"]
        .apply(parse_remaining_lease)
    )

    df["month_index"] = (
        (df["month"].dt.year - 2017) * 12
        + df["month"].dt.month
        - 1
    )

    return df


# ==================================================
# Occurrence-count refresh handling
# ==================================================

def add_occurrence_number(df):
    """
    Add an occurrence number for identical-looking
    HDB transaction records.

    This allows legitimate duplicate-looking
    transactions to be preserved during refreshes.
    """

    validate_schema(df)

    df = df.copy()

    # Standardise month representation
    df["month"] = pd.to_datetime(
        df["month"]
    )

    # Stable ordering
    df = (
        df
        .sort_values(
            REQUIRED_COLUMNS
        )
        .reset_index(
            drop=True
        )
    )

    # Sequence identical-looking records
    df["occurrence_seq"] = (
        df.groupby(
            REQUIRED_COLUMNS,
            dropna=False
        )
        .cumcount()
    )

    return df


def get_new_records_by_occurrence(
    master_df,
    refresh_df
):
    """
    Return only genuinely new records from a
    refreshed API snapshot.

    Identical-looking transactions are compared
    using occurrence counts, so valid repeated
    transactions are not accidentally removed.
    """

    validate_schema(
        master_df
    )

    validate_schema(
        refresh_df
    )

    master_temp = (
        add_occurrence_number(
            master_df
        )
    )

    refresh_temp = (
        add_occurrence_number(
            refresh_df
        )
    )

    comparison_fields = (
        REQUIRED_COLUMNS
        + ["occurrence_seq"]
    )

    # Convert comparison fields to strings
    # using the same month representation
    for temp_df in [
        master_temp,
        refresh_temp
    ]:

        temp_df["month"] = (
            pd.to_datetime(
                temp_df["month"]
            )
            .dt.strftime(
                "%Y-%m"
            )
        )

        temp_df["_comparison_key"] = (
            temp_df[
                comparison_fields
            ]
            .astype(str)
            .agg(
                "|".join,
                axis=1
            )
        )

    existing_keys = set(
        master_temp[
            "_comparison_key"
        ]
    )

    new_records = (
        refresh_temp[
            ~refresh_temp[
                "_comparison_key"
            ].isin(
                existing_keys
            )
        ]
        .copy()
    )

    new_records = (
        new_records
        .drop(
            columns=[
                "occurrence_seq",
                "_comparison_key"
            ]
        )
    )

    # Restore month as datetime
    if len(new_records) > 0:
        new_records["month"] = (
            pd.to_datetime(
                new_records["month"],
                format="%Y-%m"
            )
        )

    return new_records


# ==================================================
# Update master
# ==================================================

def update_master_data(
    master_df,
    refresh_df
):
    """
    Add genuinely new refresh records to the master dataset.

    Returns:
        updated_master_df
        new_records_df
    """

    master_clean = prepare_data(
        master_df
    )

    refresh_clean = prepare_data(
        refresh_df
    )

    new_records = (
        get_new_records_by_occurrence(
            master_clean,
            refresh_clean
        )
    )

    if new_records.empty:
        return (
            master_clean.copy(),
            new_records
        )

    updated_master = pd.concat(
        [
            master_clean,
            new_records
        ],
        ignore_index=True
    )

    updated_master = (
        updated_master
        .sort_values(
            [
                "month",
                "town",
                "flat_type",
                "block",
                "street_name"
            ]
        )
        .reset_index(
            drop=True
        )
    )

    return (
        updated_master,
        new_records
    )


# ==================================================
# Save master
# ==================================================
def save_refreshed_master(
    master_df,
    base_dir,
    snapshot_date=None
):
    """
    Save the active master dataset and a dated snapshot.

    Returns:
        master_path
        snapshot_path
    """

    if snapshot_date is None:
        snapshot_date = date.today().isoformat()

    base_dir = Path(base_dir)

    master_dir = (
        base_dir
        / "master"
    )

    snapshot_dir = (
        base_dir
        / "snapshots"
        / snapshot_date
    )

    master_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    snapshot_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    master_path = (
        master_dir
        / "hdb_resale_clean.csv"
    )

    snapshot_path = (
        snapshot_dir
        / "hdb_resale_clean.csv"
    )

    master_df.to_csv(
        master_path,
        index=False
    )

    master_df.to_csv(
        snapshot_path,
        index=False
    )

    return (
        master_path,
        snapshot_path
    )


# ==================================================
# DynamoDB key generation
# ==================================================

ID_FIELDS = (
    REQUIRED_COLUMNS.copy()
)


def make_flat_id(row):
    """
    Create a deterministic transaction ID.

    duplicate_seq differentiates legitimate
    duplicate-looking transactions.
    """

    month_value = row["month"]

    if isinstance(
        month_value,
        pd.Timestamp
    ):

        month_text = (
            month_value.strftime(
                "%Y-%m"
            )
        )

    else:

        month_text = (
            str(month_value)[:7]
        )

    values = [
        month_text,
        str(
            row["town"]
        ).strip(),
        str(
            row["flat_type"]
        ).strip(),
        str(
            row["block"]
        ).strip(),
        str(
            row["street_name"]
        ).strip(),
        str(
            row["storey_range"]
        ).strip(),
        str(
            row["floor_area_sqm"]
        ),
        str(
            row["flat_model"]
        ).strip(),
        str(
            row["lease_commence_date"]
        ),
        str(
            row["remaining_lease"]
        ).strip(),
        str(
            row["resale_price"]
        ),
        str(
            row["duplicate_seq"]
        )
    ]

    text = "|".join(
        values
    )

    hash_value = (
        hashlib.sha256(
            text.encode(
                "utf-8"
            )
        )
        .hexdigest()[:12]
        .upper()
    )

    return (
        f"FLAT-{hash_value}"
    )


def add_dynamodb_keys(df):
    """
    Add deterministic DynamoDB key fields.

    Partition key:
        town_flat_type

    Sort key:
        month_flat_id
    """

    validate_schema(df)

    df = df.copy()

    # Ensure month is datetime
    df["month"] = (
        pd.to_datetime(
            df["month"]
        )
    )

    # Stable ordering
    df = (
        df
        .sort_values(
            ID_FIELDS
        )
        .reset_index(
            drop=True
        )
    )

    # Preserve duplicate-looking transactions
    df["duplicate_seq"] = (
        df.groupby(
            ID_FIELDS,
            dropna=False
        )
        .cumcount()
    )

    # Deterministic transaction ID
    df["flat_id"] = (
        df.apply(
            make_flat_id,
            axis=1
        )
    )

    # DynamoDB partition key
    df["town_flat_type"] = (
        df["town"]
        .str.strip()
        + "#"
        + df["flat_type"]
        .str.strip()
    )

    # DynamoDB sort key
    df["month_flat_id"] = (
        df["month"]
        .dt.strftime(
            "%Y-%m"
        )
        + "#"
        + df["flat_id"]
    )

    return df