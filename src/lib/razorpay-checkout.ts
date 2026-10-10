"use client";
import { ApiError, apiPost } from "./api";
import type { PublicOrder } from "./commerce/types";
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
  prefill: { name: string; email?: string; contact: string };
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

let checkoutScript: Promise<void> | null = null;
export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      script.remove();
      checkoutScript = null;
      reject(new Error("Razorpay timed out. Please retry."));
    }, 15000);
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.nonce =
      document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')
        ?.content ?? "";
    script.onload = () => {
      clearTimeout(timeout);
      if (window.Razorpay) resolve();
      else {
        checkoutScript = null;
        script.remove();
        reject(new Error("Razorpay is unavailable."));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      checkoutScript = null;
      reject(new Error("Razorpay failed to load. Please retry."));
    };
    document.body.appendChild(script);
  });
  return checkoutScript;
}

// Keep the provider callback proof only in memory while retrying a transient failure.
export async function verifyCheckoutPayment(
  payload: { internal_order_id: string } & RazorpaySuccess,
): Promise<PublicOrder> {
  for (let attempt = 0; ; attempt++) {
    try {
      const order = await apiPost<PublicOrder>("/payments/verify", payload);
      if (order.status !== "paid" && order.status !== "refunded")
        throw new ApiError(
          409,
          "PAYMENT_PROCESSING",
          "Payment capture is processing. Check your purchase before paying again.",
        );
      return order;
    } catch (error) {
      const retryable =
        !(error instanceof ApiError) ||
        error.status >= 500 ||
        error.code === "PAYMENT_PROCESSING";
      if (attempt >= 3 || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
