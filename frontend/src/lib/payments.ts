export interface PricingQuote {
  book_count: number;
  regular_total_inr: number;
  automatic_discount_inr: number;
  automatic_price_inr: number;
  coupon_code: string | null;
  coupon_discount_inr: number;
  total_inr: number;
  total_savings_inr: number;
  eligible_first_time: boolean | null;
  eligibility_status: string;
  message: string;
}

export interface OrderCreate {
  book_ids: string[];
  full_name: string;
  email: string;
  mobile: string;
  coupon_code?: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  books: string[];
  pricing: PricingQuote;
  created_at: string;
  delivery_mode: string;
  payment_provider: string;
  payment_mode: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
}

export interface RazorpayCheckoutOrder {
  key_id: string;
  payment_mode: string;
  internal_order_id: string;
  order_number: string;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  pricing: PricingQuote;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  description: string;
}

export interface RazorpayVerifyRequest {
  internal_order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface WebhookAck {
  status: string;
  duplicate: boolean;
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccess) => void;
  prefill: { name: string; email: string; contact: string };
  notes: { internal_order_id: string; order_number: string };
  theme: { color: string };
  modal: { ondismiss: () => void; confirm_close: boolean };
  retry: { enabled: boolean };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, callback: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export async function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return;
  const existing = document.getElementById("razorpay-checkout-script") as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay Checkout failed to load.")), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay Checkout failed to load."));
    document.body.appendChild(script);
  });
}
