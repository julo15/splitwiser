import schemas
from ocr.llm_service import MAX_TAB_CENTS, _sanitize_receipt_result


def test_receipt_output_is_accepted_by_tab_create_schema():
    result = _sanitize_receipt_result(
        {
            "items": [
                {
                    "description": " x " * 150,
                    "price_cents": MAX_TAB_CENTS + 1,
                    "quantity": 0,
                },
                {
                    "description": "",
                    "price_cents": "not-a-number",
                    "quantity": "not-a-number",
                },
            ],
            "tax_cents": -1,
            "tip_cents": "not-a-number",
            "total_cents": MAX_TAB_CENTS + 1,
        }
    )

    payload = schemas.TabCreate(
        name="Bar Sol",
        items=[
            {
                "description": item["description"],
                "price": item["price_cents"],
            }
            for item in result["items"]
        ],
        tax=result["tax_cents"] or 0,
        tip=result["tip_cents"] or 0,
        total=result["total_cents"],
    )

    assert len(payload.items[0].description) == 200
    assert payload.items[0].price == MAX_TAB_CENTS
    assert payload.items[1].description == "Unknown item"
    assert payload.items[1].price == 0
    assert payload.tax == 0
    assert payload.tip == 0
    assert payload.total == MAX_TAB_CENTS
