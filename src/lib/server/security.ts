import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { tokenSchema } from "@/lib/commerce/validation";
import type { ProviderPayment } from "@/lib/commerce/types";
import { HttpError } from "./errors";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function verifySignature(
  message: string | Buffer,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function authorizeCheckout(
  order: { checkout_token_hash: string; checkout_expires_at: string } | null,
  token?: string,
): void {
  if (
    !order ||
    !tokenSchema.safeParse(token).success ||
    !token ||
    !timingSafeEqual(
      Buffer.from(order.checkout_token_hash, "hex"),
      Buffer.from(hashToken(token), "hex"),
    ) ||
    Date.parse(order.checkout_expires_at) <= Date.now()
  ) {
    throw new HttpError(
      404,
      "ORDER_NOT_FOUND",
      "This checkout is unavailable or expired.",
    );
  }
}
export function assertPaymentMatches(
  order: { razorpay_order_id: string | null; total: number; currency: string },
  payment: ProviderPayment,
): void {
  if (
    payment.order_id !== order.razorpay_order_id ||
    payment.amount !== order.total ||
    payment.currency !== order.currency
  ) {
    throw new HttpError(
      409,
      "PAYMENT_MISMATCH",
      "The payment does not match this order. No access has been released.",
    );
  }
}

export function assertCapturedPayment(
  payment: ProviderPayment | undefined,
  expectedId: string | null,
): void {
  if (
    !payment ||
    payment.id !== expectedId ||
    payment.status !== "captured" ||
    !payment.captured ||
    payment.amount_refunded !== 0
  )
    throw new HttpError(
      409,
      "PAYMENT_PROCESSING",
      "Current payment evidence has not established purchase access. Check your purchase before paying again.",
    );
}
