import numpy as np
import pandas as pd


def get_comparable_candidates(
    target_row,
    history_df
):
    """
    Return same-town, same-flat-type transactions
    from the previous 12 months.
    """

    target_month = target_row["month"]

    start_month = (
        target_month
        - pd.DateOffset(months=12)
    )

    candidates = history_df[
        (
            history_df["town"]
            == target_row["town"]
        )
        &
        (
            history_df["flat_type"]
            == target_row["flat_type"]
        )
        &
        (
            history_df["month"]
            < target_month
        )
        &
        (
            history_df["month"]
            >= start_month
        )
    ].copy()

    return candidates


def score_comparables(
    target_row,
    candidates
):
    """
    Score comparable transactions from 0 to 100.
    """

    scored = candidates.copy()

    scored["same_block"] = (
        (scored["block"] == target_row["block"])
        & (scored["street_name"] == target_row["street_name"])
    ).astype(int)

    scored["same_street"] = (
        scored["street_name"]
        == target_row["street_name"]
    ).astype(int)

    scored["same_model"] = (
        scored["flat_model"]
        == target_row["flat_model"]
    ).astype(int)

    scored["area_diff"] = np.abs(
        scored["floor_area_sqm"]
        - target_row["floor_area_sqm"]
    )

    scored["lease_diff"] = np.abs(
        scored["remaining_lease_months"]
        - target_row["remaining_lease_months"]
    )

    scored["storey_diff"] = np.abs(
        scored["storey_mid"]
        - target_row["storey_mid"]
    )

    scored["months_ago"] = (
        (
            target_row["month"].year
            - scored["month"].dt.year
        ) * 12
        +
        (
            target_row["month"].month
            - scored["month"].dt.month
        )
    )

    scored["area_score"] = (
        1
        - scored["area_diff"] / 20
    ).clip(
        lower=0,
        upper=1
    )

    scored["lease_score"] = (
        1
        - scored["lease_diff"] / 120
    ).clip(
        lower=0,
        upper=1
    )

    scored["storey_score"] = (
        1
        - scored["storey_diff"] / 15
    ).clip(
        lower=0,
        upper=1
    )

    scored["recency_score"] = (
        1
        - scored["months_ago"] / 12
    ).clip(
        lower=0,
        upper=1
    )

    scored["comparable_score"] = (
        scored["same_block"] * 20
        + scored["same_street"] * 15
        + scored["same_model"] * 10
        + scored["area_score"] * 20
        + scored["lease_score"] * 15
        + scored["storey_score"] * 10
        + scored["recency_score"] * 10
    )

    return (
        scored
        .sort_values(
            "comparable_score",
            ascending=False
        )
        .reset_index(
            drop=True
        )
    )


def calculate_evidence_summary(
    target_row,
    history_df,
    strong_score_threshold=75
):
    """
    Calculate evidence statistics for one target flat.
    """

    candidates = get_comparable_candidates(
        target_row,
        history_df
    )

    if candidates.empty:
        return {
            "candidate_count": 0,
            "top5_avg_score": np.nan,
            "top5_strong_count": 0,
            "top1_score": np.nan
        }

    scored = score_comparables(
        target_row,
        candidates
    )

    top5 = scored.head(5)

    return {
        "candidate_count":
            len(scored),

        "top5_avg_score":
            top5[
                "comparable_score"
            ].mean(),

        "top5_strong_count":
            (
                top5[
                    "comparable_score"
                ]
                >= strong_score_threshold
            ).sum(),

        "top1_score":
            scored[
                "comparable_score"
            ].iloc[0]
    }


def is_evidence_sufficient(
    evidence_summary,
    evidence_rule
):
    """
    Apply the frozen evidence rule.
    """

    return (
        evidence_summary["candidate_count"]
        >= evidence_rule[
            "min_candidate_count"
        ]
        and
        evidence_summary["top5_avg_score"]
        >= evidence_rule[
            "min_top5_avg_score"
        ]
        and
        evidence_summary["top5_strong_count"]
        >= evidence_rule[
            "min_top5_strong_count"
        ]
    )


def get_prediction_interval(
    predicted_price,
    interval_margin
):
    """
    Return lower and upper bounds around a prediction.
    """

    lower = (
        predicted_price
        - interval_margin
    )

    upper = (
        predicted_price
        + interval_margin
    )

    return {
        "lower": float(lower),
        "upper": float(upper)
    }


def build_resale_response(
    target_row,
    history_df,
    model,
    features,
    evidence_rule,
    interval_margin,
    top_n=5
):
    """
    Generate the complete resale assessment response
    for one target flat.
    """

    # ------------------------------------------
    # Comparable evidence
    # ------------------------------------------

    candidates = get_comparable_candidates(
        target_row,
        history_df
    )

    scored_candidates = score_comparables(
        target_row,
        candidates
    )

    evidence_summary = (
        calculate_evidence_summary(
            target_row=target_row,
            history_df=history_df,
            strong_score_threshold=(
                evidence_rule[
                    "strong_score_threshold"
                ]
            )
        )
    )

    evidence_sufficient = (
        is_evidence_sufficient(
            evidence_summary,
            evidence_rule
        )
    )

    # ------------------------------------------
    # Top comparables
    # ------------------------------------------

    top_comparables = (
        scored_candidates
        .head(top_n)
        .copy()
    )

    comparable_columns = [
        "month",
        "town",
        "flat_type",
        "block",
        "street_name",
        "storey_range",
        "floor_area_sqm",
        "flat_model",
        "remaining_lease",
        "resale_price",
        "comparable_score"
    ]

    top_comparables = (
        top_comparables[
            comparable_columns
        ]
    )

    # ------------------------------------------
    # Base response
    # ------------------------------------------

    response = {
        "evidence_sufficient":
            bool(evidence_sufficient),

        "evidence":
            {
                "candidate_count":
                    int(
                        evidence_summary[
                            "candidate_count"
                        ]
                    ),

                "top5_avg_score":
                    float(
                        evidence_summary[
                            "top5_avg_score"
                        ]
                    ),

                "top5_strong_count":
                    int(
                        evidence_summary[
                            "top5_strong_count"
                        ]
                    ),

                "top1_score":
                    float(
                        evidence_summary[
                            "top1_score"
                        ]
                    )
            },

        "comparables":
            top_comparables
            .assign(
                month=lambda x:
                    x["month"]
                    .dt.strftime(
                        "%Y-%m"
                    )
            )
            .to_dict(
                orient="records"
            )
    }

    # ------------------------------------------
    # Only show price estimate when evidence
    # is sufficient
    # ------------------------------------------

    if not evidence_sufficient:

        response[
            "estimated_price"
        ] = None

        response[
            "prediction_interval"
        ] = None

        return response

    # ------------------------------------------
    # Model prediction
    # ------------------------------------------

    target_features = (
        pd.DataFrame(
            [target_row[features]]
        )
    )

    predicted_price = float(
        model.predict(
            target_features
        )[0]
    )

    interval = get_prediction_interval(
        predicted_price=predicted_price,
        interval_margin=interval_margin
    )

    response[
        "estimated_price"
    ] = predicted_price

    response[
        "prediction_interval"
    ] = interval

    return response