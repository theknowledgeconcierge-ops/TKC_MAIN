from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


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
    email: EmailStr
    mobile: str = Field(min_length=7, max_length=20, pattern=r"^[0-9+() -]+$")
    coupon_code: str | None = None


class Order(BaseModel):
    id: str
    order_number: str
    status: str
    customer_name: str
    customer_email: str
    customer_mobile: str
    books: list[str]
    pricing: PricingQuote
    created_at: datetime
    delivery_mode: str
    payment_provider: str
    payment_mode: str
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None


class RazorpayCheckoutOrder(BaseModel):
    key_id: str
    payment_mode: str
    internal_order_id: str
    order_number: str
    razorpay_order_id: str
    amount_paise: int
    currency: str
    pricing: PricingQuote
    customer_name: str
    customer_email: str
    customer_mobile: str
    description: str


class RazorpayVerifyRequest(BaseModel):
    internal_order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class WebhookAck(BaseModel):
    status: str
    duplicate: bool = False
