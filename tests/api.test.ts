import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/server/errors";
const fixture = vi.hoisted(() => ({
  service: {
    create: vi.fn(),
    verify: vi.fn(),
    read: vi.fn(),
    reconcile: vi.fn(),
    download: vi.fn(),
    webhook: vi.fn(),
    issuePurchaseSession: vi.fn(),
    deliver: vi.fn(),
    processFallbackDeliveries: vi.fn(),
    repo: { rateLimit: vi.fn() },
  },
}));
vi.mock("@/lib/server/runtime", () => ({ commerce: () => fixture.service }));
import { POST as create } from "@/app/api/orders/route";
import { GET as read } from "@/app/api/orders/[id]/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as download } from "@/app/api/downloads/route";
import { POST as deliver } from "@/app/api/orders/delivery/route";
import { POST as fallback } from "@/app/api/internal/email-deliveries/route";
const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
const token = "a".repeat(43);
const request = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new NextRequest(`http://localhost:3000/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  fixture.service.repo.rateLimit.mockResolvedValue(true);
  process.env.APP_URL = "http://localhost:3000";
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key-not-real";
  process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
  process.env.RAZORPAY_KEY_SECRET = "fixture-secret-not-real";
  process.env.RAZORPAY_WEBHOOK_SECRET = "fixture-webhook-secret-not-real";
});
describe("Next.js HTTP boundaries", () => {
  const orderInput = {
    book_ids: ["the-first-table"],
    full_name: "Test Buyer",
    email: "buyer@example.com",
    mobile: "9876543210",
    checkout_token: token,
  };
  it("never issues a purchase session before verified payment", async () => {
    fixture.service.create.mockResolvedValue({ internal_order_id: id });
    const response = await create(request("orders", orderInput));
    expect(response.status).toBe(201);
    expect(response.cookies.get(`tkc_purchase_${id}`)).toBeUndefined();
    expect(response.cookies.getAll().map((cookie) => cookie.name)).toEqual([
      `tkc_checkout_${id}`,
    ]);
    expect(fixture.service.issuePurchaseSession).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty("token");
  });
  it("creates a checkout with a separate HttpOnly continuation cookie", async () => {
    fixture.service.create.mockResolvedValue({
      internal_order_id: id,
      amount_paise: 24900,
    });
    const response = await create(request("orders", orderInput));
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects invalid payloads before calling payment logic", async () => {
    expect(
      (
        await create(
          request("orders", { ...orderInput, book_ids: ["unknown"] }),
        )
      ).status,
    ).toBe(400);
    expect(fixture.service.create).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "not-an-email", "buyer@"])(
    "rejects checkout without a valid email (%j) before calling payment logic",
    async (email) => {
      const response = await create(
        request("orders", { ...orderInput, email }),
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(fixture.service.create).not.toHaveBeenCalled();
    },
  );
  it.each(["https://attacker.example", "null", ""])(
    "denies cross-origin or missing-origin checkout %s",
    async (origin) => {
      expect(
        (await create(request("orders", orderInput, { Origin: origin })))
          .status,
      ).toBe(403);
    },
  );
  it("limits oversized bodies with and without Content-Length", async () => {
    expect(
      (
        await create(
          request("orders", { ...orderInput, padding: "a".repeat(20000) }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await create(
          request("orders", orderInput, { "Content-Length": "20000" }),
        )
      ).status,
    ).toBe(413);
  });
  it("rejects malformed JSON and content types", async () => {
    const malformed = new NextRequest("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expect((await create(malformed)).status).toBe(400);
    expect(
      (
        await create(
          request("orders", orderInput, { "Content-Type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
  });
  it("never authorizes read from an order ID alone", async () => {
    fixture.service.read.mockRejectedValue(
      new HttpError(404, "ORDER_NOT_FOUND", "Private purchase unavailable."),
    );
    const response = await read(
      new NextRequest(`http://localhost:3000/api/orders/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(404);
    expect(fixture.service.read).toHaveBeenCalledWith(id, undefined, undefined);
  });
  it("rejects fake payment signatures through the API", async () => {
    fixture.service.verify.mockRejectedValue(
      new HttpError(400, "INVALID_PAYMENT_SIGNATURE", "Invalid signature."),
    );
    const response = await verify(
      request("payments/verify", {
        internal_order_id: id,
        razorpay_order_id: "order_abc",
        razorpay_payment_id: "pay_abc",
        razorpay_signature: "0".repeat(64),
      }),
    );
    expect(response.status).toBe(400);
  });
  it("passes raw webhook bytes unchanged, with no browser Origin requirement", async () => {
    fixture.service.webhook.mockResolvedValue({
      status: "processed",
      duplicate: true,
    });
    const raw = '{ "event": "payment.captured" }';
    const response = await webhook(
      new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": "signature" },
        body: raw,
      }),
    );
    expect(response.status).toBe(200);
    expect(fixture.service.webhook.mock.calls[0][0].toString()).toBe(raw);
  });
  it("returns a retryable error rather than acknowledging a failed webhook", async () => {
    fixture.service.webhook.mockRejectedValue(
      new Error("secret-database-password"),
    );
    const response = await webhook(request("webhooks/razorpay", {}));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "secret-database-password",
    );
  });
  it("denies unauthorized downloads and sends no URL", async () => {
    fixture.service.download.mockRejectedValue(
      new HttpError(404, "ORDER_NOT_FOUND", "Private purchase unavailable."),
    );
    const response = await download(
      request("downloads", { order_id: id, entitlement_id: id }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("url");
  });
  it("returns a short-lived URL only from authorized download logic", async () => {
    fixture.service.download.mockResolvedValue({
      url: "https://fixture.supabase.co/temporary",
      expires_in: 60,
    });
    expect(
      await (
        await download(
          request("downloads", { order_id: id, entitlement_id: id }),
        )
      ).json(),
    ).toEqual({ url: "https://fixture.supabase.co/temporary", expires_in: 60 });
  });
  it("issues a random HttpOnly purchase session only after verified fulfillment", async () => {
    process.env.APP_URL = "https://store.example";
    const session = "b".repeat(43);
    fixture.service.verify.mockResolvedValue({ id, status: "paid" });
    fixture.service.issuePurchaseSession.mockResolvedValue(session);
    fixture.service.read.mockResolvedValue({
      id,
      status: "paid",
      download_authorized: true,
      entitlements: [],
    });
    const response = await verify(
      request(
        "payments/verify",
        {
          internal_order_id: id,
          razorpay_order_id: "order_abc",
          razorpay_payment_id: "pay_abc",
          razorpay_signature: "0".repeat(64),
        },
        { Origin: "https://store.example" },
      ),
    );
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(`__Host-tkc_session_${id}`)!;
    expect(cookie.value).toBe(session);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe("strict");
    expect(cookie.domain).toBeUndefined();
    expect(JSON.stringify(await response.json())).not.toContain(session);
    expect(fixture.service.read).toHaveBeenCalledWith(id, undefined, session);
  });
  it.each(["created", "payment_pending", "failed", "refunded"])(
    "never issues a purchase session for %s",
    async (status) => {
      fixture.service.verify.mockResolvedValue({ id, status });
      const response = await verify(
        request("payments/verify", {
          internal_order_id: id,
          razorpay_order_id: "order_abc",
          razorpay_payment_id: "pay_abc",
          razorpay_signature: "0".repeat(64),
        }),
      );
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(fixture.service.issuePurchaseSession).not.toHaveBeenCalled();
    },
  );
  it("uses shared rate limits and safe errors", async () => {
    fixture.service.repo.rateLimit.mockResolvedValue(false);
    const response = await create(request("orders", orderInput));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
describe("email delivery HTTP boundaries", () => {
  it("names only the order and an optional address; client file selections are discarded", async () => {
    fixture.service.deliver.mockResolvedValue({ id, delivery: null });
    const response = await deliver(
      request("orders/delivery", {
        order_id: id,
        email: "Reader@Example.com",
        attachments: ["handbooks/the-full-table.pdf"],
        storage_path: "handbooks/the-full-table.pdf",
        product_ids: ["the-full-table"],
      }),
    );
    expect(response.status).toBe(200);
    // No purchase-session cookie was sent, so the service receives none.
    expect(fixture.service.deliver).toHaveBeenCalledWith(
      id,
      undefined,
      "reader@example.com",
    );
  });
  it.each(["not-an-email", "a@", ""])(
    "rejects a malformed delivery email %j before calling delivery logic",
    async (email) => {
      const response = await deliver(
        request("orders/delivery", { order_id: id, email }),
      );
      expect(response.status).toBe(400);
      expect(fixture.service.deliver).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin delivery requests", async () => {
    const response = await deliver(
      request(
        "orders/delivery",
        { order_id: id },
        { Origin: "https://attacker.example" },
      ),
    );
    expect(response.status).toBe(403);
    expect(fixture.service.deliver).not.toHaveBeenCalled();
  });
  it("keeps the fallback endpoint closed without its configured secret", async () => {
    delete process.env.EMAIL_DELIVERY_CRON_SECRET;
    const response = await fallback(
      request("internal/email-deliveries", {}, { Authorization: "Bearer x" }),
    );
    expect(response.status).toBe(503);
    expect(fixture.service.processFallbackDeliveries).not.toHaveBeenCalled();
  });
  it.each([undefined, "Bearer wrong", `Bearer ${"s".repeat(39)}`])(
    "hides the fallback endpoint from %s",
    async (authorization) => {
      process.env.EMAIL_DELIVERY_CRON_SECRET = "s".repeat(40);
      const response = await fallback(
        request(
          "internal/email-deliveries",
          {},
          authorization ? { Authorization: authorization } : {},
        ),
      );
      expect(response.status).toBe(404);
      expect(fixture.service.processFallbackDeliveries).not.toHaveBeenCalled();
      delete process.env.EMAIL_DELIVERY_CRON_SECRET;
    },
  );
  it("runs the fallback for the scheduler and returns counts only", async () => {
    process.env.EMAIL_DELIVERY_CRON_SECRET = "s".repeat(40);
    fixture.service.processFallbackDeliveries.mockResolvedValue({
      claimed: 1,
      sent: 1,
      failed: 0,
    });
    const response = await fallback(
      request(
        "internal/email-deliveries",
        {},
        { Authorization: `Bearer ${"s".repeat(40)}`, Origin: "" },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, failed: 0 });
    delete process.env.EMAIL_DELIVERY_CRON_SECRET;
  });
});
