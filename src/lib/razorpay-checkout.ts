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

type CallbackProof = { internal_order_id: string } & RazorpaySuccess;
// No callback proof in URLs or browser storage. Reload recovery uses cookies/webhooks/email.
const pendingProofs = new Map<string, CallbackProof>();
const checks = new Map<string, Promise<PublicOrder>>();
export const hasPendingPaymentVerification = (id: string) => pendingProofs.has(id);
export function retryPaymentVerification(id: string) {
  const proof = pendingProofs.get(id);
  if (!proof) throw new Error("No callback proof is available in this page.");
  return verifyCheckoutPayment(proof);
}
export function verifyCheckoutPayment(payload: CallbackProof): Promise<PublicOrder> {
  const key = JSON.stringify(payload);
  const existing = checks.get(key);
  if (existing) return existing;
  pendingProofs.set(payload.internal_order_id, payload);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiError(409, "PAYMENT_PROCESSING", "We're still checking your payment. If your account was charged, please don't make another payment yet."));
    }, 30000);
  });
  const check = Promise.race([verifyWithRetries(payload, controller.signal), timeout])
    .then(order => {
      if (pendingProofs.get(payload.internal_order_id) === payload) pendingProofs.delete(payload.internal_order_id);
      return order;
    }).finally(() => {
      clearTimeout(timer);
      checks.delete(key);
    });
  checks.set(key, check);
  return check;
}
async function verifyWithRetries(payload: CallbackProof, signal: AbortSignal): Promise<PublicOrder> {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new ApiError(409, "PAYMENT_PROCESSING", "Payment confirmation is still processing.");
    try {
      const order = await apiPost<PublicOrder>("/payments/verify", payload, signal);
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
