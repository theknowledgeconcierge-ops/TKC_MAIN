from datetime import datetime
from pydantic import BaseModel, Field


class PricingQuoteRequest(BaseModel):
    book_ids: list[str] = Field(min_length=1, max_length=5)
    customer_email: str | None = None
    coupon_code: str | None = None


class PricingQuote(BaseModel):
    book_count: int
    regular_total_inr: int
    automatic_discount_inr: int
    automatic_price_inr: int
    coupon_code: str | None = None
    coupon_discount_inr: int
    total_inr: int
    total_savings_inr: int
    eligible_first_time: bool | None
    eligibility_status: str
    message: str


class OrderCreate(BaseModel):
    book_ids: list[str] = Field(min_length=1, max_length=5)
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    mobile: str = Field(min_length=7, max_length=20)
    coupon_code: str | None = None


class Order(BaseModel):
    id: str
    order_number: str
    status: str
    customer_name: str
    customer_email: str
    books: list[str]
    pricing: PricingQuote
    created_at: datetime
    delivery_mode: str
