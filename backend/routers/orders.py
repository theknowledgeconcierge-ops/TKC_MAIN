from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, HTTPException

from lib.db import db
from models.orders import Order, OrderCreate, PricingQuote, PricingQuoteRequest
from routers.catalogue import BOOKS

router = APIRouter()

TIER_PRICES = {1: 249, 2: 399, 3: 549, 4: 699, 5: 999}
FIRST50 = "FIRST50"


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

    if count == 5:
        if request.customer_email:
            previous = await db.orders.find_one({"customer_email": request.customer_email.lower(), "status": {"$in": ["mocked_paid", "paid"]}})
            eligible = previous is None
            eligibility_status = "eligible" if eligible else "returning_customer"
        else:
            eligibility_status = "needs_verification"

        if coupon_code and coupon_code != FIRST50:
            raise HTTPException(status_code=400, detail="First50 is the only eligible code for the complete collection.")
        if eligible is True or (eligible is None and coupon_code == FIRST50):
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


@router.post("/pricing/quote", response_model=PricingQuote)
async def pricing_quote(request: PricingQuoteRequest) -> PricingQuote:
    return await calculate_quote(request)


@router.post("/orders", response_model=Order)
async def create_mock_order(request: OrderCreate) -> Order:
    quote = await calculate_quote(PricingQuoteRequest(book_ids=request.book_ids, customer_email=request.email.lower(), coupon_code=request.coupon_code))
    order = Order(
        id=str(uuid.uuid4()),
        order_number=f"TKC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        status="mocked_paid",
        customer_name=request.full_name.strip(),
        customer_email=request.email.lower().strip(),
        books=list(dict.fromkeys(request.book_ids)),
        pricing=quote,
        created_at=datetime.now(timezone.utc),
        delivery_mode="MOCKED — secure delivery is not active in this demo",
    )
    await db.orders.insert_one(order.model_dump())
    return order
