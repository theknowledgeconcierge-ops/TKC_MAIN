"""Covers: progressive pricing tiers, First50 server-confirmed total/savings, and
Razorpay order creation being backend-confirmed + mode-aware (test mode)."""

import time

import pytest


def _catalogue_ids(client):
    resp = client.get("/catalogue")
    assert resp.status_code == 200, resp.text
    books = resp.json()["books"]
    assert len(books) == 5
    return [b["id"] for b in books]


@pytest.mark.parametrize(
    "count,expected_total",
    [(1, 249), (2, 399), (3, 549), (4, 699)],
)
def test_progressive_pricing_tiers(client, count, expected_total):
    ids = _catalogue_ids(client)
    email = f"tscheck-pricing-{count}-{int(time.time()*1000)}@example.com"
    resp = client.post("/pricing/quote", json={"book_ids": ids[:count], "email": email})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_count"] == count
    assert body["total_inr"] == expected_total, body


def test_five_book_quote_is_conditional_until_verified(client):
    ids = _catalogue_ids(client)
    email = f"tscheck-pricing-5-{int(time.time()*1000)}@example.com"
    resp = client.post("/pricing/quote", json={"book_ids": ids, "email": email})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_count"] == 5
    assert body["total_inr"] == 999
    assert body["eligibility_status"] == "needs_verification"
    assert body["eligible_first_time"] is None


def test_razorpay_order_confirms_first50_total_and_test_mode(client):
    """Server-confirmed five-book First50 order: 499 total, 746 savings, test mode."""
    ids = _catalogue_ids(client)
    email = f"tscheck-order-{int(time.time()*1000)}@example.com"
    resp = client.post(
        "/payments/razorpay/order",
        json={
            "book_ids": ids,
            "full_name": "TS Check Buyer",
            "email": email,
            "mobile": "9876543210",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["payment_mode"] == "test"
    assert body["amount_paise"] == 49900
    assert body["currency"] == "INR"
    pricing = body["pricing"]
    assert pricing["total_inr"] == 499
    assert pricing["total_savings_inr"] == 746
    assert pricing["eligible_first_time"] is True
    assert pricing["coupon_code"] == "FIRST50"
    assert body["razorpay_order_id"].startswith("order_")


def test_razorpay_order_rejects_invalid_book_id(client):
    email = f"tscheck-order-bad-{int(time.time()*1000)}@example.com"
    resp = client.post(
        "/payments/razorpay/order",
        json={
            "book_ids": ["not-a-real-book-id"],
            "full_name": "TS Check Buyer",
            "email": email,
            "mobile": "9876543210",
        },
    )
    assert resp.status_code in (400, 404, 422), resp.text
