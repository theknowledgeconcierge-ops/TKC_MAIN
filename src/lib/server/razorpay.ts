import "server-only";
import { z } from "zod";
import { paymentId, providerOrderId } from "@/lib/commerce/validation";
import type { PaymentProvider } from "./contracts";
import { HttpError } from "./errors";

const orderSchema = z.object({
  id: providerOrderId,
  amount: z.number().int().positive(),
  currency: z.string(),
  receipt: z.string(),
  status: z.string(),
  notes: z.object({ internal_order_id: z.string().optional() }),
});
const paymentSchema = z.object({
  id: paymentId,
  order_id: providerOrderId,
  amount: z.number().int().positive(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
  amount_refunded: z.number().int().nonnegative().default(0),
});

export function createPaymentProvider(
  keyId: string,
  secret: string,
): PaymentProvider {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    try {
      const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        console.error(
          JSON.stringify({
            event: "payment_provider_http_failure",
            status: response.status,
          }),
        );
        throw new Error("provider_http_error");
      }
      return schema.parse(await response.json());
    } catch {
      throw new HttpError(
        502,
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "Razorpay could not confirm this request. Wait a moment and retry the same checkout; check your purchase page before paying again.",
      );
    }
  }
  return {
    createOrder: (order) =>
      request("orders", orderSchema, {
        amount: order.total,
        currency: order.currency,
        receipt: order.order_number,
        partial_payment: false,
        notes: { internal_order_id: order.id },
      }),
    async findOrders(receipt) {
      return (
        await request(
          `orders?receipt=${encodeURIComponent(receipt)}&count=100`,
          z.object({ items: z.array(orderSchema) }),
        )
      ).items;
    },
    getOrder: (id) =>
      request(`orders/${providerOrderId.parse(id)}`, orderSchema),
    getPayment: (id) =>
      request(`payments/${paymentId.parse(id)}`, paymentSchema),
    async listPayments(id) {
      return (
        await request(
          `orders/${providerOrderId.parse(id)}/payments`,
          z.object({ items: z.array(paymentSchema) }),
        )
      ).items;
    },
  };
}
