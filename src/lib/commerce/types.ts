type OrderStatus =
  | "created"
  | "payment_pending"
  | "paid"
  | "failed"
  | "refunded";
export interface PricingQuote {
  book_count: number;
  regular_total_inr: number;
  automatic_discount_inr: number;
  automatic_price_inr: number;
  coupon_code: string | null;
  coupon_discount_inr: number;
  total_inr: number;
  total_savings_inr: number;
  message: string;
}
export interface OrderItem {
  product_id: string;
  product_title: string;
  unit_price: number;
  quantity: number;
  storage_path: string;
}
export interface OrderRecord {
  id: string;
  order_number: string;
  checkout_token_hash: string;
  checkout_expires_at: string;
  request_hash: string;
  customer_name: string;
  customer_email: string | null;
  customer_mobile: string;
  status: OrderStatus;
  payment_mode: "test" | "live";
  currency: "INR";
  subtotal: number;
  total: number;
  pricing: PricingQuote;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  gateway_started_at: string | null;
  created_at: string;
  paid_at: string | null;
  order_items: OrderItem[];
}
export interface Entitlement {
  id: string;
  order_id: string;
  product_id: string;
  payment_id: string;
  customer_email: string | null;
  revoked_at: string | null;
  storage_path: string;
}
export interface PaymentEvidence {
  order_id: string;
  razorpay_order_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: "captured" | "failed" | "refunded";
  amount_refunded: number;
  event_key: string;
  event_type: string;
  provider_event_id?: string;
}
export interface ProviderOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  notes: { internal_order_id?: string };
}
export interface ProviderPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  amount_refunded: number;
}
export interface PublicOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  books: string[];
  pricing: PricingQuote;
  created_at: string;
  payment_mode: "test" | "live";
  razorpay_payment_id: string | null;
  checkout_expires_at: string;
  download_authorized: boolean;
  entitlements: { id: string; product_id: string }[];
  // Present only for a verified purchase session on a paid order.
  delivery: PublicDelivery | null;
}
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed";
export interface PublicDelivery {
  email: string | null;
  status: DeliveryStatus;
  locked: boolean;
  sent_at: string | null;
  error: string | null;
  can_retry: boolean;
}
export interface EmailDeliveryRecord {
  id: string;
  order_id: string;
  delivery_email: string;
  status: DeliveryStatus;
  attempt_count: number;
  lease_expires_at: string | null;
  delivery_email_locked_at: string | null;
  last_error: string | null;
  sent_at: string | null;
}
export interface DeliveryClaim {
  delivery_id: string;
  claim_token: string;
}
export type DeliveryClaimResult =
  | ({ outcome: "claimed" } & DeliveryClaim)
  | { outcome: "sent" | "in_progress" | "exhausted" };
export interface DeliveryPayload {
  delivery_email: string;
  idempotency_key: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  total: number;
  currency: string;
  razorpay_payment_id: string;
  item_count: number;
  attachments: { product_id: string; storage_path: string }[];
}
export interface CheckoutOrder {
  key_id: string;
  payment_mode: "test" | "live";
  internal_order_id: string;
  order_number: string;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  pricing: PricingQuote;
  customer_name: string;
  customer_email: string | null;
  customer_mobile: string;
  description: string;
}

export interface PurchaseSession {
  token_hash: string;
  order_id: string;
  payment_id: string;
  expires_at: string;
}
