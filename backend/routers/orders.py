import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import razorpay
from fastapi import APIRouter, Header, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from lib.db import db
from models.orders import (
    Order,
    OrderCreate,
    PricingQuote,
    PricingQuoteRequest,
    RazorpayCheckoutOrder,
    RazorpayVerifyRequest,
    WebhookAck,
)
from routers.catalogue import BOOKS

router = APIRouter()

TIER_PRICES = {1: 249, 2: 399, 3: 549, 4: 699, 5: 999}
FIRST50 = "FIRST50"
PAYMENT_MODE = os.environ.get("PAYMENT_MODE", "test")
RAZORPAY_KEY_ID = os.environ["RAZORPAY_KEY_ID"]
RAZORPAY_KEY_SECRET = os.environ["RAZORPAY_KEY_SECRET"]
RAZORPAY_WEBHOOK_SECRET = os.environ["RAZORPAY_WEBHOOK_SECRET"]
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


async def calculate_quote(request: PricingQuoteRequest) -> PricingQuote:
    unique_ids = list(dict.fromkeys(request.book_ids))
    book_map = {book.id: book for book in BOOKS}
    missing = [book_id for book_id in unique_ids if book_id not in book_map]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown book id: {missing[0]}")

    count = len(unique_ids)
    regular_total = count * 249
    automatic_price = TIER_PRICES[count]
    automatic_discount = regular_total - automatic_price
    coupon_code = request.coupon_code.upper().strip() if request.coupon_code else None
    eligible: bool | None = None
    eligibility_status = "not_applicable"
    coupon_discount = 0
    message = "Your individual book price is ready."

    if count != 5 and coupon_code:
        raise HTTPException(status_code=400, detail="First50 applies only to the complete five-book collection.")

    if count == 5:
        if request.customer_email:
            previous = await db.orders.find_one(
                {"customer_email": request.customer_email.lower(), "status": "paid"}
            )
            eligible = previous is None
            eligibility_status = "eligible" if eligible else "returning_customer"
        else:
            eligibility_status = "needs_verification"

        if coupon_code and coupon_code != FIRST50:
            raise HTTPException(
                status_code=400,
                detail="First50 is the only eligible code for the complete collection.",
            )
        if eligible is True:
            coupon_code = FIRST50
            coupon_discount = 500
            message = "First50 — automatically applied for eligible first-time buyers."
        elif eligible is False:
            coupon_code = None
            message = "The first-time collection offer is not available for this customer. The standard collection price applies."
        else:
            message = "The ₹499 first-time collection offer is conditional until customer details are verified."

    total = automatic_price - coupon_discount
    return PricingQuote(
        book_count=count,
        regular_total_inr=regular_total,
        automatic_discount_inr=automatic_discount,
        automatic_price_inr=automatic_price,
        coupon_code=coupon_code,
        coupon_discount_inr=coupon_discount,
        total_inr=total,
        total_savings_inr=regular_total - total,
        eligible_first_time=eligible,
        eligibility_status=eligibility_status,
        message=message,
    )


def order_from_document(document: dict) -> Order:
    document.pop("_id", None)
    return Order(**document)


@router.post("/pricing/quote", response_model=PricingQuote)
async def pricing_quote(request: PricingQuoteRequest) -> PricingQuote:
    return await calculate_quote(request)


@router.post("/payments/razorpay/order", response_model=RazorpayCheckoutOrder)
async def create_razorpay_order(request: OrderCreate) -> RazorpayCheckoutOrder:
    quote = await calculate_quote(
        PricingQuoteRequest(
            book_ids=request.book_ids,
            customer_email=str(request.email).lower(),
            coupon_code=request.coupon_code,
        )
    )
    internal_order_id = str(uuid.uuid4())
    order_number = f"TKC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    amount_paise = quote.total_inr * 100
    razorpay_payload = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": order_number,
        "notes": {
            "internal_order_id": internal_order_id,
            "book_count": str(quote.book_count),
        },
    }
    try:
        razorpay_order = await asyncio.to_thread(
            razorpay_client.order.create, data=razorpay_payload
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Razorpay could not create the payment order.") from exc

    order = Order(
        id=internal_order_id,
        order_number=order_number,
        status="payment_pending",
        customer_name=request.full_name.strip(),
        customer_email=str(request.email).lower().strip(),
        customer_mobile=request.mobile.strip(),
        books=list(dict.fromkeys(request.book_ids)),
        pricing=quote,
        created_at=datetime.now(timezone.utc),
        delivery_mode="Secure digital delivery will activate after payment verification.",
        payment_provider="razorpay",
        payment_mode=PAYMENT_MODE,
        razorpay_order_id=razorpay_order["id"],
    )
    await db.orders.insert_one(order.model_dump())
    return RazorpayCheckoutOrder(
        key_id=RAZORPAY_KEY_ID,
        payment_mode=PAYMENT_MODE,
        internal_order_id=internal_order_id,
        order_number=order_number,
        razorpay_order_id=razorpay_order["id"],
        amount_paise=amount_paise,
        currency="INR",
        pricing=quote,
        customer_name=order.customer_name,
        customer_email=order.customer_email,
        customer_mobile=order.customer_mobile,
        description=f"{quote.book_count} Knowledge Concierge handbook{'s' if quote.book_count != 1 else ''}",
    )


@router.post("/payments/razorpay/verify", response_model=Order)
async def verify_razorpay_payment(request: RazorpayVerifyRequest) -> Order:
    order_document = await db.orders.find_one({"id": request.internal_order_id})
    if not order_document or order_document.get("razorpay_order_id") != request.razorpay_order_id:
        raise HTTPException(status_code=404, detail="Payment order not found.")
    if order_document.get("status") == "paid" and order_document.get("razorpay_payment_id") == request.razorpay_payment_id:
        return order_from_document(order_document)

    try:
        await asyncio.to_thread(
            razorpay_client.utility.verify_payment_signature,
            {
                "razorpay_order_id": request.razorpay_order_id,
                "razorpay_payment_id": request.razorpay_payment_id,
                "razorpay_signature": request.razorpay_signature,
            },
        )
        payment = await asyncio.to_thread(
            razorpay_client.payment.fetch, request.razorpay_payment_id
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Payment verification failed.") from exc

    expected_amount = order_document["pricing"]["total_inr"] * 100
    if payment.get("order_id") != request.razorpay_order_id or payment.get("amount") != expected_amount:
        raise HTTPException(status_code=400, detail="Payment details do not match this order.")
    if payment.get("status") != "captured":
        raise HTTPException(status_code=409, detail="Payment is awaiting capture. Access has not been released.")

    await db.orders.update_one(
        {"id": request.internal_order_id, "status": {"$ne": "paid"}},
        {
            "$set": {
                "status": "paid",
                "razorpay_payment_id": request.razorpay_payment_id,
                "paid_at": datetime.now(timezone.utc),
            }
        },
    )
    updated = await db.orders.find_one({"id": request.internal_order_id})
    return order_from_document(updated)


@router.post("/payments/razorpay/webhook", response_model=WebhookAck)
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
    x_razorpay_event_id: str | None = Header(default=None),
) -> WebhookAck:
    if not x_razorpay_signature:
        raise HTTPException(status_code=400, detail="Missing Razorpay webhook signature.")
    raw_body = await request.body()
    try:
        await asyncio.to_thread(
            razorpay_client.utility.verify_webhook_signature,
            raw_body.decode("utf-8"),
            x_razorpay_signature,
            RAZORPAY_WEBHOOK_SECRET,
        )
        payload = json.loads(raw_body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Razorpay webhook signature.") from exc

    event = payload.get("event", "unknown")
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    order_entity = payload.get("payload", {}).get("order", {}).get("entity", {})
    razorpay_order_id = order_entity.get("id") or payment_entity.get("order_id")
    entity_id = payment_entity.get("id") or order_entity.get("id") or "unknown"
    event_key = x_razorpay_event_id or f"{event}:{entity_id}"
    try:
        await db.razorpay_webhook_events.insert_one(
            {
                "event_key": event_key,
                "event": event,
                "entity_id": entity_id,
                "received_at": datetime.now(timezone.utc),
            }
        )
    except DuplicateKeyError:
        return WebhookAck(status="already_processed", duplicate=True)

    if razorpay_order_id and event in {"order.paid", "payment.captured"}:
        await db.orders.update_one(
            {"razorpay_order_id": razorpay_order_id, "status": {"$ne": "paid"}},
            {
                "$set": {
                    "status": "paid",
                    "razorpay_payment_id": payment_entity.get("id"),
                    "paid_at": datetime.now(timezone.utc),
                }
            },
        )
    elif razorpay_order_id and event == "payment.failed":
        await db.orders.update_one(
            {"razorpay_order_id": razorpay_order_id, "status": {"$ne": "paid"}},
            {
                "$set": {
                    "status": "payment_failed",
                    "razorpay_payment_id": payment_entity.get("id"),
                    "payment_error": payment_entity.get("error_description"),
                }
            },
        )
    return WebhookAck(status="processed")