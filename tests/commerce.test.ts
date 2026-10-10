import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { CommerceService } from "@/lib/server/commerce";
import type { Repository, PaymentProvider } from "@/lib/server/contracts";
import type {
  OrderRecord,
  PaymentEvidence,
  Entitlement,
  ProviderOrder,
  ProviderPayment,
  PurchaseSession,
} from "@/lib/commerce/types";
import { createOrderSchema } from "@/lib/commerce/validation";
import { catalogue } from "@/lib/catalog";

const secret = "fixture-secret";
const token = "a".repeat(43);
const input = () =>
  createOrderSchema.parse({
    book_ids: ["the-first-table"],
    full_name: "Test Buyer",
    email: "buyer@example.com",
    mobile: "9876543210",
    checkout_token: token,
  });
let orders: Map<string, OrderRecord>;
let entitlements: Entitlement[];
let events: Set<string>;
let sessions: Map<string, PurchaseSession>;
let payments: ProviderPayment[];
let providerOrders: ProviderOrder[];
let repo: Repository;
let provider: PaymentProvider;
let service: CommerceService;
beforeEach(() => {
  orders = new Map();
  entitlements = [];
  events = new Set();
  sessions = new Map();
  payments = [];
  providerOrders = [];
  repo = {
    getOrder: async (id) => orders.get(id) ?? null,
    findByToken: async (hash) =>
      [...orders.values()].find((o) => o.checkout_token_hash === hash) ?? null,
    findByProviderOrder: async (id) =>
      [...orders.values()].find((o) => o.razorpay_order_id === id) ?? null,
    createOrder: async (data) => {
      const existing = [...orders.values()].find(
        (o) => o.checkout_token_hash === data.checkout_token_hash,
      );
      if (existing) return existing;
      const order: OrderRecord = {
        ...data,
        order_number: "TKC-" + data.id.replaceAll("-", ""),
        status: "created",
        currency: "INR",
        razorpay_order_id: null,
        razorpay_payment_id: null,
        gateway_started_at: null,
        paid_at: null,
        created_at: new Date().toISOString(),
        checkout_expires_at: new Date(Date.now() + 86400000).toISOString(),
        order_items: data.items,
      };
      orders.set(order.id, order);
      return order;
    },
    claimGateway: async (id) => {
      const o = orders.get(id)!;
      if (o.gateway_started_at) return false;
      o.gateway_started_at = new Date().toISOString();
      return true;
    },
    bindGateway: async (id, rid) => {
      const o = orders.get(id)!;
      o.razorpay_order_id = rid;
      if (o.status === "created") o.status = "payment_pending";
    },
    applyPayment: async (e: PaymentEvidence) => {
      if (events.has(e.event_key)) return { duplicate: true };
      events.add(e.event_key);
      const o = orders.get(e.order_id)!;
      if (e.status === "captured" && o.status !== "refunded") {
        o.status = "paid";
        o.razorpay_payment_id = e.payment_id;
        for (const item of o.order_items)
          if (
            !entitlements.some(
              (v) => v.order_id === o.id && v.product_id === item.product_id,
            )
          )
            entitlements.push({
              id: randomUUID(),
              order_id: o.id,
              product_id: item.product_id,
              customer_email: o.customer_email,
              payment_id: e.payment_id,
              storage_path: item.storage_path,
              revoked_at: null,
            });
      } else if (e.status === "refunded") {
        o.status = "refunded";
        entitlements
          .filter((v) => v.order_id === o.id)
          .forEach((v) => {
            v.revoked_at = new Date().toISOString();
          });
      } else if (o.status !== "paid" && o.status !== "refunded")
        o.status = "failed";
      return { duplicate: false };
    },
    getEntitlements: async (id) =>
      entitlements.filter((e) => e.order_id === id && !e.revoked_at),
    createPurchaseSession: async (orderId, paymentId, hash) => {
      const order = orders.get(orderId)!;
      if (
        order.status !== "paid" ||
        order.razorpay_payment_id !== paymentId ||
        entitlements.filter((e) => e.order_id === orderId && !e.revoked_at)
          .length !== order.order_items.length
      )
        throw new Error("purchase_not_fulfilled");
      const session = {
        token_hash: hash,
        order_id: orderId,
        payment_id: order.razorpay_payment_id!,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      };
      sessions.set(hash, session);
      return session;
    },
    getPurchaseSession: async (hash) => sessions.get(hash) ?? null,
    authorizeDownload: async (id, entitlementId, hash) => {
      const session = sessions.get(hash);
      const order = orders.get(id)!;
      const entitlement = entitlements.find(
        (e) =>
          e.order_id === id &&
          e.id === entitlementId &&
          !e.revoked_at &&
          e.payment_id === order.razorpay_payment_id &&
          e.customer_email === order.customer_email,
      );
      return session?.order_id === id &&
        Date.parse(session.expires_at) > Date.now() &&
        order.status === "paid" &&
        entitlement
        ? entitlement.storage_path
        : null;
    },
    signDownload: vi.fn(
      async () =>
        "https://fixture.supabase.co/storage/v1/object/sign/handbooks/test.pdf?token=temporary",
    ),
    rateLimit: async () => true,
  };
  provider = {
    createOrder: vi.fn(async (o) => {
      const result = {
        id: "order_abc",
        amount: o.total,
        currency: "INR",
        receipt: o.order_number,
        notes: { internal_order_id: o.id },
        status: "created",
      };
      providerOrders.push(result);
      return result;
    }),
    findOrders: async (receipt) =>
      providerOrders.filter((o) => o.receipt === receipt),
    getOrder: async (id) => {
      const o = providerOrders.find((v) => v.id === id);
      if (!o) throw new Error("unknown provider order");
      return o;
    },
    getPayment: async (id) => {
      const p = payments.find((v) => v.id === id);
      if (!p) throw new Error("unknown payment");
      return p;
    },
    listPayments: async (id) => payments.filter((p) => p.order_id === id),
  };
  service = new CommerceService(repo, provider, {
    keyId: "rzp_test_fixture",
    keySecret: secret,
    webhookSecret: "webhook-secret",
  });
});
async function captured(orderInput = input()) {
  const checkout = await service.create(orderInput);
  const payment = {
    id: "pay_abc",
    order_id: checkout.razorpay_order_id,
    amount: checkout.amount_paise,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
  };
  payments.push(payment);
  return { checkout, payment };
}
const signature = (order: string, payment: string) =>
  createHmac("sha256", secret).update(`${order}|${payment}`).digest("hex");
describe("checkout and recovery", () => {
  const collection = (details: { email?: string } = {}) =>
    createOrderSchema.parse({
      ...input(),
      ...details,
      book_ids: catalogue.map((book) => book.id),
      checkout_token: randomBytes(32).toString("base64url"),
    });
  // Seeds the durable paid history that the removed eligibility lookup used to read.
  const purchaseHistory = async (details: { email?: string }) => {
    const { internal_order_id } = await service.create(collection(details));
    await repo.applyPayment({
      order_id: internal_order_id,
      razorpay_order_id: "order_abc",
      payment_id: `pay_${randomUUID().replaceAll("-", "")}`,
      amount: 49900,
      currency: "INR",
      status: "captured",
      amount_refunded: 0,
      event_key: `history:${internal_order_id}`,
      event_type: "payment.captured",
    });
  };
  it.each([
    ["a new customer", []],
    ["a previous customer using the same email", [{}]],
    [
      "a previous customer using the same mobile and a new email",
      [{ email: "earlier@example.com" }],
    ],
    [
      "a customer with multiple previous orders",
      [{}, {}, { email: "earlier@example.com" }],
    ],
  ] as const)(
    "prices the collection at ₹499 for %s and asks Razorpay for 49900 paise",
    async (_, history) => {
      for (const details of history) await purchaseHistory(details);
      expect(
        [...orders.values()].filter((order) => order.status === "paid"),
      ).toHaveLength(history.length);
      const checkout = await service.create(collection());
      expect(checkout.amount_paise).toBe(49900);
      expect(checkout.pricing).toMatchObject({
        regular_total_inr: 1245,
        automatic_discount_inr: 246,
        coupon_code: "FIRST50",
        coupon_discount_inr: 500,
        total_inr: 499,
      });
      const order = orders.get(checkout.internal_order_id)!;
      expect(order.subtotal).toBe(124500);
      expect(order.total).toBe(49900);
      expect(order.order_items).toHaveLength(5);
      expect(provider.createOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: order.id, total: 49900 }),
      );
    },
  );
  it("creates an internal order before calling the provider and reuses repeated submissions", async () => {
    const a = await service.create(input());
    const b = await service.create(input());
    expect(a.internal_order_id).toBe(b.internal_order_id);
    expect(orders.size).toBe(1);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(a.amount_paise).toBe(24900);
  });
  it("rejects reuse of checkout token for different customer details", async () => {
    await service.create(input());
    await expect(
      service.create({ ...input(), email: "other@example.com" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("recovers a provider order after a lost creation response", async () => {
    vi.mocked(provider.createOrder).mockImplementationOnce(async (o) => {
      providerOrders.push({
        id: "order_lost",
        amount: o.total,
        currency: "INR",
        receipt: o.order_number,
        notes: { internal_order_id: o.id },
        status: "created",
      });
      throw new Error("timeout");
    });
    await expect(service.create(input())).rejects.toThrow();
    const recovered = await service.create(input());
    expect(recovered.razorpay_order_id).toBe("order_lost");
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
  });
  it("recovers provider binding after the database write fails", async () => {
    const bind = repo.bindGateway;
    repo.bindGateway = vi
      .fn()
      .mockRejectedValueOnce(new Error("DB unavailable"))
      .mockImplementation(bind);
    await expect(service.create(input())).rejects.toThrow("DB unavailable");
    const recovered = await service.create(input());
    expect(recovered.razorpay_order_id).toBe("order_abc");
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
  });
  it("keeps the purchase payment mode and refuses to pay a test order with live credentials", async () => {
    const checkout = await service.create(input());
    const live = new CommerceService(repo, provider, {
      keyId: "rzp_live_fixture",
      keySecret: secret,
      webhookSecret: "webhook-secret",
    });
    expect(
      (await live.read(checkout.internal_order_id, token)).payment_mode,
    ).toBe("test");
    await expect(
      live.resume(checkout.internal_order_id, token),
    ).rejects.toMatchObject({ code: "PAYMENT_MODE_MISMATCH" });
  });
});
describe("trusted verification and private downloads", () => {
  it("a checkout credential cannot download after a webhook fulfills the order", async () => {
    const { checkout, payment } = await captured();
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: payment.id } } },
    });
    await service.webhook(
      Buffer.from(raw),
      createHmac("sha256", "webhook-secret").update(raw).digest("hex"),
    );
    await expect(
      service.download(checkout.internal_order_id, entitlements[0].id, token),
    ).rejects.toMatchObject({ status: 404 });
    const getOrder = vi.spyOn(repo, "getOrder");
    await expect(
      service.download(checkout.internal_order_id, entitlements[0].id),
    ).rejects.toMatchObject({
      status: 404,
      code: "PURCHASE_SESSION_REQUIRED",
    });
    // A missing session is rejected before any order or checkout lookup.
    expect(getOrder).not.toHaveBeenCalled();
    expect(repo.signDownload).not.toHaveBeenCalled();
  });
  it("checkout status reads never expose entitlements even after payment", async () => {
    const { checkout } = await captured();
    await service.reconcile(checkout.internal_order_id, token);
    expect(
      (await service.read(checkout.internal_order_id, token)).entitlements,
    ).toEqual([]);
  });
  it("fulfills all five titles once and signs the fifth PDF only for its owner", async () => {
    const orderInput = createOrderSchema.parse({
      ...input(),
      book_ids: catalogue.map((book) => book.id),
    });
    const { checkout, payment } = await captured(orderInput);
    const verification = {
      internal_order_id: checkout.internal_order_id,
      razorpay_order_id: payment.order_id,
      razorpay_payment_id: payment.id,
      razorpay_signature: signature(payment.order_id, payment.id),
    };
    await service.verify(verification, token);
    await service.verify(verification, token);
    expect(entitlements).toHaveLength(5);
    const fifth = entitlements.find(
      (item) => item.product_id === "empty-tables-to-full-house",
    )!;
    await expect(
      service.download(checkout.internal_order_id, fifth.id, "b".repeat(43)),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.signDownload).not.toHaveBeenCalled();
    await service.download(
      checkout.internal_order_id,
      fifth.id,
      await service.issuePurchaseSession(
        checkout.internal_order_id,
        payment.id,
      ),
    );
    expect(repo.signDownload).toHaveBeenCalledWith(
      "handbooks/empty-tables-to-full-house.pdf",
      60,
    );
  });
  it("verifies a captured test payment and permits downloads without webhook configuration", async () => {
    service = new CommerceService(repo, provider, {
      keyId: "rzp_test_fixture",
      keySecret: secret,
    });
    const { checkout, payment } = await captured();
    expect(
      (
        await service.verify(
          {
            internal_order_id: checkout.internal_order_id,
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
            razorpay_signature: signature(payment.order_id, payment.id),
          },
          token,
        )
      ).status,
    ).toBe("paid");
    const result = await service.download(
      checkout.internal_order_id,
      entitlements[0].id,
      await service.issuePurchaseSession(
        checkout.internal_order_id,
        payment.id,
      ),
    );
    expect(result.expires_in).toBe(60);
    expect(repo.signDownload).toHaveBeenCalledTimes(1);
  });
  it("verifies and fulfills a captured payment exactly once", async () => {
    const { checkout, payment } = await captured();
    const verify = {
      internal_order_id: checkout.internal_order_id,
      razorpay_order_id: payment.order_id,
      razorpay_payment_id: payment.id,
      razorpay_signature: signature(payment.order_id, payment.id),
    };
    expect((await service.verify(verify, token)).status).toBe("paid");
    await service.verify(verify, token);
    expect(entitlements).toHaveLength(1);
  });
  it("rejects a forged callback even when another callback already paid the order", async () => {
    const { checkout, payment } = await captured();
    const verify = {
      internal_order_id: checkout.internal_order_id,
      razorpay_order_id: payment.order_id,
      razorpay_payment_id: payment.id,
      razorpay_signature: signature(payment.order_id, payment.id),
    };
    await service.verify(verify, token);
    await expect(
      service.verify({ ...verify, razorpay_signature: "0".repeat(64) }, token),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([{ amount: 100 }, { currency: "USD" }, { order_id: "order_other" }])(
    "rejects mismatched payment evidence %j",
    async (bad) => {
      const { checkout, payment } = await captured();
      Object.assign(payment, bad);
      await expect(
        service.verify(
          {
            internal_order_id: checkout.internal_order_id,
            razorpay_order_id: checkout.razorpay_order_id,
            razorpay_payment_id: payment.id,
            razorpay_signature: signature(
              checkout.razorpay_order_id,
              payment.id,
            ),
          },
          token,
        ),
      ).rejects.toThrow();
      expect(entitlements).toHaveLength(0);
    },
  );
  it("does not fulfill merely authorized payments", async () => {
    const { checkout, payment } = await captured();
    payment.status = "authorized";
    payment.captured = false;
    expect(
      (
        await service.verify(
          {
            internal_order_id: checkout.internal_order_id,
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
            razorpay_signature: signature(payment.order_id, payment.id),
          },
          token,
        )
      ).status,
    ).toBe("payment_pending");
    expect(entitlements).toHaveLength(0);
  });
  it("reconciles captured payment when the browser callback was lost", async () => {
    const { checkout } = await captured();
    expect(
      (await service.reconcile(checkout.internal_order_id, token)).status,
    ).toBe("paid");
  });
  it("allows a successful payment after a failed attempt on the same order", async () => {
    const { checkout, payment } = await captured();
    payment.status = "failed";
    payment.captured = false;
    expect(
      (await service.reconcile(checkout.internal_order_id, token)).status,
    ).toBe("failed");
    payments.push({
      ...payment,
      id: "pay_retry",
      status: "captured",
      captured: true,
    });
    const paid = await service.reconcile(checkout.internal_order_id, token);
    expect(paid.status).toBe("paid");
    expect(paid.razorpay_payment_id).toBe("pay_retry");
    expect(entitlements).toHaveLength(1);
  });
  it("denies unpaid, wrong-owner and wrong-entitlement downloads", async () => {
    const o = await service.create(input());
    await expect(
      service.download(o.internal_order_id, randomUUID(), token),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.download(o.internal_order_id, randomUUID(), "b".repeat(43)),
    ).rejects.toMatchObject({ status: 404 });
    payments.push({
      id: "pay_abc",
      order_id: o.razorpay_order_id,
      amount: o.amount_paise,
      currency: "INR",
      status: "captured",
      captured: true,
      amount_refunded: 0,
    });
    await service.reconcile(o.internal_order_id, token);
    await expect(
      service.download(
        o.internal_order_id,
        randomUUID(),
        await service.issuePurchaseSession(o.internal_order_id, "pay_abc"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.signDownload).not.toHaveBeenCalled();
  });
  it("issues only 60-second access and revokes access after even a partial refund", async () => {
    const { checkout, payment } = await captured();
    await service.reconcile(checkout.internal_order_id, token);
    await service.download(
      checkout.internal_order_id,
      entitlements[0].id,
      await service.issuePurchaseSession(
        checkout.internal_order_id,
        payment.id,
      ),
    );
    expect(repo.signDownload).toHaveBeenCalledWith(
      "handbooks/the-first-table.pdf",
      60,
    );
    const session = await service.issuePurchaseSession(
      checkout.internal_order_id,
      payment.id,
    );
    payment.amount_refunded = 100;
    await expect(
      service.download(checkout.internal_order_id, entitlements[0].id, session),
    ).rejects.toMatchObject({ status: 403 });
  });
});
describe("webhook authenticity, duplicates and retry", () => {
  const signed = (body: string) =>
    createHmac("sha256", "webhook-secret").update(body).digest("hex");
  it.each([undefined, ""])(
    "rejects webhooks before provider/database access when the secret is %j",
    async (webhookSecret) => {
      service = new CommerceService(repo, provider, {
        keyId: "rzp_test_fixture",
        keySecret: secret,
        webhookSecret,
      });
      const providerRead = vi.spyOn(provider, "getPayment");
      const orderRead = vi.spyOn(repo, "findByProviderOrder");
      const fulfill = vi.spyOn(repo, "applyPayment");
      const body = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_abc" } } },
      });
      for (const signingSecret of ["", secret]) {
        const forged = createHmac("sha256", signingSecret)
          .update(body)
          .digest("hex");
        await expect(
          service.webhook(Buffer.from(body), forged),
        ).rejects.toMatchObject({
          status: 503,
          code: "CONFIGURATION_REQUIRED",
        });
      }
      expect(providerRead).not.toHaveBeenCalled();
      expect(orderRead).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
      expect(entitlements).toHaveLength(0);
    },
  );
  it("accepts signed captured events; duplicate and repeated paid events fulfill once", async () => {
    const { payment } = await captured();
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: payment.id } } },
    });
    expect(
      (await service.webhook(Buffer.from(body), signed(body), "evt1"))
        .duplicate,
    ).toBe(false);
    expect(
      (await service.webhook(Buffer.from(body), signed(body), "evt1"))
        .duplicate,
    ).toBe(true);
    const repeat = JSON.stringify({
      event: "order.paid",
      payload: { order: { entity: { id: payment.order_id } } },
    });
    await service.webhook(Buffer.from(repeat), signed(repeat), "evt2");
    expect(entitlements).toHaveLength(1);
  });
  it("rejects spoofed and malformed webhook requests", async () => {
    await expect(
      service.webhook(Buffer.from("{}"), "0".repeat(64)),
    ).rejects.toMatchObject({ status: 400 });
    const body = "{broken";
    await expect(
      service.webhook(Buffer.from(body), signed(body)),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("does not acknowledge a transient DB failure as processed; retry succeeds", async () => {
    const { payment } = await captured();
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: payment.id } } },
    });
    const apply = repo.applyPayment;
    repo.applyPayment = vi
      .fn()
      .mockRejectedValueOnce(new Error("DB unavailable"))
      .mockImplementation(apply);
    await expect(
      service.webhook(Buffer.from(body), signed(body)),
    ).rejects.toThrow("DB unavailable");
    await service.webhook(Buffer.from(body), signed(body));
    expect(entitlements).toHaveLength(1);
  });
  it("rejects unknown payment/order without fulfillment", async () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_unknown" } } },
    });
    await expect(
      service.webhook(Buffer.from(body), signed(body)),
    ).rejects.toThrow();
    expect(entitlements).toHaveLength(0);
  });
  it("retries refund notifications while the provider read still lags behind", async () => {
    const { checkout, payment } = await captured();
    await service.reconcile(checkout.internal_order_id, token);
    const body = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { payment_id: payment.id } } },
    });
    await expect(
      service.webhook(Buffer.from(body), signed(body)),
    ).rejects.toMatchObject({ status: 409 });
    payment.amount_refunded = 100;
    await service.webhook(Buffer.from(body), signed(body));
    expect(orders.get(checkout.internal_order_id)?.status).toBe("refunded");
    expect(entitlements[0].revoked_at).not.toBeNull();
  });
});
