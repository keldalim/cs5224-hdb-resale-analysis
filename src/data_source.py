import json
import time

import pandas as pd
import requests


DATASET_ID = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc"

API_URL = (
    "https://data.gov.sg/api/action/datastore_search"
)


def get_month_list(
    start_month,
    end_month
):
    """
    Generate YYYY-MM month strings from
    start_month to end_month inclusive.
    """

    months = pd.date_range(
        start=pd.Timestamp(start_month),
        end=pd.Timestamp(end_month),
        freq="MS"
    )

    return [
        month.strftime("%Y-%m")
        for month in months
    ]


def load_hdb_month_from_api(
    month,
    limit=1000,
    max_retries=5,
    api_key=None
):
    """
    Download all HDB resale records for
    one specific month.
    """

    all_records = []
    offset = 0

    headers = {}

    if api_key:
        headers["x-api-key"] = api_key

    while True:

        params = {
            "resource_id": DATASET_ID,
            "limit": limit,
            "offset": offset,
            "filters": json.dumps(
                {
                    "month": month
                }
            )
        }

        for attempt in range(
            max_retries
        ):

            response = requests.get(
                API_URL,
                params=params,
                headers=headers,
                timeout=30
            )

            if response.status_code == 429:

                wait_seconds = (
                    2 ** attempt
                )

                print(
                    f"Rate limited. "
                    f"Retrying in "
                    f"{wait_seconds}s..."
                )

                time.sleep(
                    wait_seconds
                )

                continue

            response.raise_for_status()

            break

        else:
            raise RuntimeError(
                "API rate limit exceeded "
                "after retries."
            )

        records = (
            response.json()
            .get("result", {})
            .get("records", [])
        )

        if not records:
            break

        all_records.extend(
            records
        )

        if len(records) < limit:
            break

        offset += limit

    df = pd.DataFrame(
        all_records
    )

    if "_id" in df.columns:
        df = df.drop(
            columns=["_id"]
        )

    return df


def load_recent_hdb_data_from_api(
    start_month,
    end_month,
    limit=1000,
    api_key=None
):
    """
    Download HDB resale records for a recent
    month range without scanning the full dataset.
    """

    month_list = get_month_list(
        start_month,
        end_month
    )

    monthly_data = []

    for month in month_list:

        print(
            f"Downloading {month}..."
        )

        month_df = (
            load_hdb_month_from_api(
                month=month,
                limit=limit,
                api_key=api_key
            )
        )

        print(
            f"{month}: "
            f"{len(month_df):,} rows"
        )

        monthly_data.append(
            month_df
        )

    if not monthly_data:
        return pd.DataFrame()

    df = pd.concat(
        monthly_data,
        ignore_index=True
    )

    return df