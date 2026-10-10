import { z } from "zod";
import { activeBooks } from "@/lib/catalog";
export const orderIdSchema = z.uuid();
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const productIdSchema = z
  .string()
  .refine(
    (id) => activeBooks.some((book) => book.id === id),
    "Unknown product",
  );
export const createOrderSchema = z.object({
  book_ids: z.array(productIdSchema).min(1).max(5),
  full_name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  mobile: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+() -]+$/),
  coupon_code: z.string().trim().max(32).optional(),
  checkout_token: tokenSchema,
});
export const providerOrderId = z.string().regex(/^order_[A-Za-z0-9]{1,64}$/);
export const paymentId = z.string().regex(/^pay_[A-Za-z0-9]{1,64}$/);
export const verifySchema = z.object({
  internal_order_id: orderIdSchema,
  razorpay_order_id: providerOrderId,
  razorpay_payment_id: paymentId,
  razorpay_signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
export const accessSchema = z.object({
  order_id: orderIdSchema,
  token: tokenSchema,
});
export const downloadSchema = z.object({
  order_id: orderIdSchema,
  entitlement_id: z.uuid(),
});
export const reconcileSchema = z.object({ order_id: orderIdSchema });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
