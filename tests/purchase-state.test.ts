import { expect, it } from "vitest";
import { mergePurchaseState } from "@/lib/commerce/purchase-state";
import type { PublicOrder } from "@/lib/commerce/types";
import { quoteFor } from "@/lib/commerce/pricing";

const order = (status: PublicOrder["status"], id = "one"): PublicOrder => ({
  id, status, order_number: "TKC-fixture", books: ["the-first-table"], pricing: quoteFor(["the-first-table"]),
  created_at: "2026-10-10T18:00:00Z", payment_mode: "test", razorpay_payment_id: status === "paid" ? "pay_fixture" : null,
  checkout_expires_at: "2026-10-17T18:00:00Z", download_authorized: status === "paid", entitlements: [], delivery: null,
});
it("does not invent payment or authorization before a server response", () => {
  const pending = order("payment_pending");
  expect(mergePurchaseState(undefined, pending)).toBe(pending);
  const paid = { ...order("paid"), download_authorized: false };
  expect(mergePurchaseState(pending, paid).download_authorized).toBe(false);
});
it.each(["created", "payment_pending", "failed"] as const)("ignores a stale %s response after paid", status => {
  const paid = order("paid");
  expect(mergePurchaseState(paid, order(status))).toBe(paid);
});
it("allows refund and never resurrects its access from a stale paid response", () => {
  const refund = order("refunded");
  expect(mergePurchaseState(order("paid"), refund)).toBe(refund);
  expect(mergePurchaseState(refund, order("paid"))).toBe(refund);
});
it("keeps Sent terminal while allowing authoritative access changes and other purchases", () => {
  const sent = { ...order("paid"), delivery: { email: "buyer@example.com", status: "sent", locked: true, sent_at: "2026-10-10T18:00:00Z", error: null, can_retry: false } } as PublicOrder;
  const newer = { ...order("paid"), download_authorized: false };
  expect(mergePurchaseState(sent, newer)).toMatchObject({ download_authorized: false, delivery: sent.delivery });
  expect(mergePurchaseState(sent, order("payment_pending", "two"))).toEqual(order("payment_pending", "two"));
});
