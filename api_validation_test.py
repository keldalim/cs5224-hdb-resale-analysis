import requests

API_URL = (
    "https://a34gvnw0hg.execute-api."
    "ap-southeast-1.amazonaws.com/estimate"
)

VALID_PAYLOAD = {
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


def without_field(payload, field):
    new_payload = payload.copy()
    new_payload.pop(field, None)
    return new_payload


TESTS = [
    (
        "valid request",
        VALID_PAYLOAD
    ),
    (
        "missing town",
        without_field(
            VALID_PAYLOAD,
            "town"
        )
    ),
    (
        "empty town",
        {
            **VALID_PAYLOAD,
            "town": ""
        }
    ),
    (
        "invalid town",
        {
            **VALID_PAYLOAD,
            "town": "NOT A REAL TOWN"
        }
    ),
    (
        "empty flat type",
        {
            **VALID_PAYLOAD,
            "flat_type": ""
        }
    ),
    (
        "invalid flat type",
        {
            **VALID_PAYLOAD,
            "flat_type": "9 ROOM"
        }
    ),
    (
        "invalid floor area",
        {
            **VALID_PAYLOAD,
            "floor_area_sqm": -10
        }
    ),
    (
        "non-numeric floor area",
        {
            **VALID_PAYLOAD,
            "floor_area_sqm": "abc"
        }
    ),
    (
        "invalid lease commencement year",
        {
            **VALID_PAYLOAD,
            "lease_commence_date": -1
        }
    ),
    (
        "non-numeric asking price",
        {
            **VALID_PAYLOAD,
            "asking_price": "abc"
        }
    ),
    (
        "negative asking price",
        {
            **VALID_PAYLOAD,
            "asking_price": -100000
        }
    ),
    (
        "valid but no comparables",
        {
            **VALID_PAYLOAD,
            "town": "BUKIT TIMAH",
            "flat_type": "1 ROOM"
        }
    ),
    (
        "empty payload",
        {}
    )
]


def run_test(name, payload):

    print("\n" + "=" * 70)
    print(name)
    print("-" * 70)

    try:
        response = requests.post(
            API_URL,
            json=payload,
            timeout=30
        )

        print(
            "HTTP:",
            response.status_code
        )

        try:
            body = response.json()

            print(
                "Response:",
                body
            )

        except ValueError:
            print(
                "Response:",
                response.text
            )

        return response.status_code

    except requests.RequestException as error:
        print(
            "Request error:",
            error
        )

        return None


def main():

    results = []

    for name, payload in TESTS:

        status_code = run_test(
            name,
            payload
        )

        results.append(
            (
                name,
                status_code
            )
        )

    print("\n")
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)

    for name, status_code in results:
        print(
            f"{name:<35} "
            f"{status_code}"
        )


if __name__ == "__main__":
    main()