import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { catalogue } from "@/lib/catalog";
import { quoteFor } from "@/lib/commerce/pricing";
import { createOrderSchema, verifySchema } from "@/lib/commerce/validation";
import {
  verifySignature,
  assertPaymentMatches,
  authorizeOrder,
  hashToken,
} from "@/lib/server/security";

const ids = catalogue.filter((book) => book.active).map((book) => book.id);
describe("catalogue and authoritative pricing", () => {
  it("offers all five handbooks, including Empty Tables to Full House", () => {
    expect(ids).toHaveLength(5);
    expect(ids).toContain("empty-tables-to-full-house");
  });
  it.each([
    [1, 249],
    [2, 399],
    [3, 549],
    [4, 699],
    [5, 999],
  ])("prices %i books from trusted configuration", (count, total) => {
    expect(quoteFor(ids.slice(0, count)).total_inr).toBe(total);
  });
  it.each([
    [true, 499],
    [false, 999],
    [null, 999],
  ] as const)(
    "prices the full collection with first-time eligibility %s",
    (eligible, total) => {
      expect(quoteFor(ids, eligible).total_inr).toBe(total);
    },
  );
  it("accepts First50 only for the complete collection and verifies eligibility separately", () => {
    expect(quoteFor(ids, true, "First50").total_inr).toBe(499);
    expect(quoteFor(ids, false, "First50").total_inr).toBe(999);
    expect(() => quoteFor(ids.slice(0, 4), true, "First50")).toThrow();
  });
  it("rejects unknown products and empty selections", () => {
    expect(() => quoteFor(["unknown"])).toThrow();
    expect(() => quoteFor([])).toThrow();
  });
  it("deduplicates digital titles", () =>
    expect(quoteFor([ids[0], ids[0]]).book_count).toBe(1));
  it("ignores client-supplied monetary fields", () => {
    const input = createOrderSchema.parse({
      book_ids: [ids[0]],
      full_name: "A Buyer",
      email: "A@EXAMPLE.COM",
      mobile: "9876543210",
      checkout_token: "a".repeat(43),
      total: 1,
      status: "paid",
      price: 1,
    });
    expect(input).not.toHaveProperty("total");
    expect(input).not.toHaveProperty("status");
    expect(input.email).toBe("a@example.com");
    expect(quoteFor(input.book_ids).total_inr).toBe(249);
  });
  it.each([
    { email: "invalid" },
    { full_name: "" },
    { mobile: "x" },
    { checkout_token: "123" },
    { book_ids: ["unknown"] },
    { book_ids: [] },
  ])("rejects malformed order input %j", (invalid) => {
    expect(
      createOrderSchema.safeParse({
        book_ids: [ids[0]],
        full_name: "A Buyer",
        email: "a@example.com",
        mobile: "9876543210",
        checkout_token: "a".repeat(43),
        ...invalid,
      }).success,
    ).toBe(false);
  });
  it("rejects malformed Razorpay IDs", () =>
    expect(
      verifySchema.safeParse({
        internal_order_id: crypto.randomUUID(),
        razorpay_order_id: "../secret",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "0".repeat(64),
      }).success,
    ).toBe(false));
});

describe("cryptographic and purchase boundaries", () => {
  const secret = "test-secret";
  const signature = (body: string) =>
    createHmac("sha256", secret).update(body).digest("hex");
  it("accepts the official order|payment HMAC and raw webhook HMAC", () => {
    expect(
      verifySignature(
        "order_abc|pay_def",
        signature("order_abc|pay_def"),
        secret,
      ),
    ).toBe(true);
    expect(
      verifySignature(
        '{ "event": "payment.captured" }',
        signature('{ "event": "payment.captured" }'),
        secret,
      ),
    ).toBe(true);
  });
  it("rejects tampered signatures and differently serialized bodies", () => {
    expect(
      verifySignature(
        "order_wrong|pay_def",
        signature("order_abc|pay_def"),
        secret,
      ),
    ).toBe(false);
    expect(verifySignature("body", "z".repeat(64), secret)).toBe(false);
    expect(verifySignature("body", "00", secret)).toBe(false);
    expect(
      verifySignature(
        '{"event":"payment.captured"}',
        signature('{ "event": "payment.captured" }'),
        secret,
      ),
    ).toBe(false);
  });
  const order = {
    id: crypto.randomUUID(),
    razorpay_order_id: "order_abc",
    total: 24900,
    currency: "INR",
  };
  const payment = {
    id: "pay_abc",
    order_id: "order_abc",
    amount: 24900,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
  };
  it("validates the expected order, amount and currency", () =>
    expect(() => assertPaymentMatches(order, payment)).not.toThrow());
  it.each([{ order_id: "order_other" }, { amount: 100 }, { currency: "USD" }])(
    "rejects mismatched provider evidence %j",
    (tampered) =>
      expect(() =>
        assertPaymentMatches(order, { ...payment, ...tampered }),
      ).toThrow(),
  );
  const token = "a".repeat(43);
  const protectedOrder = {
    access_token_hash: hashToken(token),
    access_expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  it("authorizes a valid unexpired recovery token", () =>
    expect(() => authorizeOrder(protectedOrder, token)).not.toThrow());
  it.each([undefined, "b".repeat(43), "123"])(
    "denies missing/wrong tokens",
    (value) => expect(() => authorizeOrder(protectedOrder, value)).toThrow(),
  );
  it("denies expired tokens", () =>
    expect(() =>
      authorizeOrder(
        { ...protectedOrder, access_expires_at: "2020-01-01T00:00:00Z" },
        token,
      ),
    ).toThrow());
});
