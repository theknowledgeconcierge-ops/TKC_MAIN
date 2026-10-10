import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest, type NextResponse } from "next/server";
import { activeBooks } from "@/lib/catalog";
import type {
  CheckoutOrder,
  ProviderOrder,
  ProviderPayment,
  PublicOrder,
} from "@/lib/commerce/types";
import { CommerceService } from "@/lib/server/commerce";
import { createRepository } from "@/lib/server/supabase";
import { createPaymentProvider } from "@/lib/server/razorpay";

const runtime = vi.hoisted(() => ({
  service: null as unknown as CommerceService,
}));
vi.mock("@/lib/server/runtime", () => ({ commerce: () => runtime.service }));
import { POST as create } from "@/app/api/orders/route";
import { GET as read } from "@/app/api/orders/[id]/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as reconcile } from "@/app/api/orders/reconcile/route";
import { POST as resume } from "@/app/api/orders/resume/route";
import { POST as download } from "@/app/api/downloads/route";
import { POST as access } from "@/app/api/orders/access/route";
import { POST as recoveryLink } from "@/app/api/orders/recovery-link/route";

const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 8,
});
const origin = "http://localhost:3000";
const supabase = "https://lifecycle-fixture.supabase.co";
const keyId = "rzp_test_lifecycle";
const secret = "lifecycle-api-secret-not-real";
const webhookSecret = "lifecycle-webhook-secret-not-real";
const serviceKey = "lifecycle-service-key-not-real";
const allIds = activeBooks.map((book) => book.id);
let gateways: ProviderOrder[];
let payments: ProviderPayment[];
let faults: {
  bind: number;
  apply: number;
  lostCommit: number;
  storage: number;
  lostCreate: number;
};
let signedPaths: string[];
let clientIp: string;

const hmac = (body: string, key = secret) =>
  createHmac("sha256", key).update(body).digest("hex");
function request(path: string, body: unknown, cookie = "") {
  return new NextRequest(`${origin}/api/${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Forwarded-For": clientIp,
    },
    body: JSON.stringify(body),
  });
}
const cookieFor = (id: string, token: string) => `tkc_purchase_${id}=${token}`;
const cookieFrom = (response: NextResponse, id: string) =>
  cookieFor(id, response.cookies.get(`tkc_purchase_${id}`)!.value);
const input = (ids = [allIds[0]]) => ({
  book_ids: ids,
  full_name: "Lifecycle Buyer",
  email: `lifecycle-${randomUUID()}@example.com`,
  mobile: "9876543210",
  checkout_token: randomBytes(32).toString("base64url"),
  total: 1,
  price: 1,
  quantity: 999,
  status: "paid",
  eligible_first_time: true,
});
async function start(ids = [allIds[0]]) {
  const payload = input(ids);
  const response = await create(request("orders", payload));
  expect(response.status).toBe(201);
  const checkout = (await response.json()) as CheckoutOrder;
  return {
    payload,
    checkout,
    cookie: cookieFrom(response, checkout.internal_order_id),
  };
}
function capture(
  checkout: Pick<CheckoutOrder, "razorpay_order_id" | "amount_paise">,
  overrides: Partial<ProviderPayment> = {},
) {
  const payment: ProviderPayment = {
    id: `pay_${randomUUID().replaceAll("-", "")}`,
    order_id: checkout.razorpay_order_id,
    amount: checkout.amount_paise,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
    ...overrides,
  };
  payments.push(payment);
  return payment;
}
function verification(checkout: CheckoutOrder, payment: ProviderPayment) {
  return {
    internal_order_id: checkout.internal_order_id,
    razorpay_order_id: checkout.razorpay_order_id,
    razorpay_payment_id: payment.id,
    razorpay_signature: hmac(`${checkout.razorpay_order_id}|${payment.id}`),
  };
}
function notify(
  payment: ProviderPayment,
  event = "payment.captured",
  extraHeaders = {},
) {
  const raw = JSON.stringify({
    event,
    payload: { payment: { entity: { id: payment.id } } },
  });
  return webhook(
    new NextRequest(`${origin}/api/webhooks/razorpay`, {
      method: "POST",
      body: raw,
      headers: {
        "x-razorpay-signature": hmac(raw, webhookSecret),
        ...extraHeaders,
      },
    }),
  );
}
async function snapshot(id: string) {
  return (
    await pool.query(
      `select status, total, subtotal, razorpay_order_id, razorpay_payment_id,
    (select count(*)::int from public.order_items where order_id=o.id) items,
    (select count(*)::int from public.payments where order_id=o.id) payments,
    (select count(*)::int from public.payment_events where order_id=o.id) events,
    (select count(*)::int from public.download_entitlements where order_id=o.id and revoked_at is null) entitlements
    from public.orders o where id=$1`,
      [id],
    )
  ).rows[0];
}

beforeEach(() => {
  gateways = [];
  payments = [];
  signedPaths = [];
  clientIp = `fixture-${randomUUID()}`;
  faults = { bind: 0, apply: 0, lostCommit: 0, storage: 0, lostCreate: 0 };
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("SUPABASE_URL", supabase);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
  vi.stubEnv("RAZORPAY_KEY_ID", keyId);
  vi.stubEnv("RAZORPAY_KEY_SECRET", secret);
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", webhookSecret);
  // Only external HTTP is replaced. Real route handlers, services, SDKs, adapters and SQL execute.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(value));
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.origin === "https://api.razorpay.com") {
        expect(headers.get("authorization")).toBe(
          `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
        );
        if (url.pathname === "/v1/orders" && init?.method === "POST") {
          const internal = (
            await pool.query(
              "select total, status from public.orders where id=$1",
              [body.notes.internal_order_id],
            )
          ).rows[0];
          expect(internal).toMatchObject({
            total: body.amount,
            status: "created",
          });
          expect(body.partial_payment).toBe(false);
          const gateway = {
            ...body,
            id: `order_${randomUUID().replaceAll("-", "")}`,
            status: "created",
          };
          gateways.push(gateway);
          if (faults.lostCreate-- > 0)
            throw new Error("fixture_lost_provider_response");
          return Response.json(gateway);
        }
        if (url.pathname === "/v1/orders")
          return Response.json({
            items: gateways.filter(
              (g) => g.receipt === url.searchParams.get("receipt"),
            ),
          });
        const parts = url.pathname.split("/");
        if (parts[2] === "orders" && parts[4] === "payments")
          return Response.json({
            items: payments.filter((p) => p.order_id === parts[3]),
          });
        const record =
          parts[2] === "orders"
            ? gateways.find((g) => g.id === parts[3])
            : payments.find((p) => p.id === parts[3]);
        return Response.json(
          record ?? { error: "fixture_unknown_provider_record" },
          { status: record ? 200 : 404 },
        );
      }
      expect(url.origin).toBe(supabase);
      expect(headers.get("apikey")).toBe(serviceKey);
      const rpc = url.pathname.split("/rpc/")[1];
      if (rpc) {
        expect([
          "tkc_create_order",
          "tkc_claim_gateway",
          "tkc_bind_gateway",
          "tkc_apply_payment",
          "tkc_rate_limit",
        ]).toContain(rpc);
        if (
          (rpc === "tkc_bind_gateway" && faults.bind-- > 0) ||
          (rpc === "tkc_apply_payment" && faults.apply-- > 0)
        )
          return Response.json(
            { code: "fixture_failure", message: "temporary database failure" },
            { status: 503 },
          );
        try {
          const result = (
            await pool.query(`select public.${rpc}($1::jsonb) as result`, [
              JSON.stringify(body.p),
            ])
          ).rows[0].result;
          if (rpc === "tkc_apply_payment" && faults.lostCommit-- > 0)
            return Response.json(
              {
                code: "fixture_lost_response",
                message: "commit response lost",
              },
              { status: 503 },
            );
          return Response.json(result);
        } catch (error) {
          return Response.json(
            {
              code: (error as { code: string }).code,
              message: (error as Error).message,
            },
            { status: 400 },
          );
        }
      }
      if (url.pathname === "/rest/v1/orders") {
        const field = [
          "id",
          "access_token_hash",
          "razorpay_order_id",
          "customer_email",
        ].find((f) => url.searchParams.has(f))!;
        expect(field).toBeDefined();
        const value = url.searchParams.get(field)!.replace(/^eq\./, "");
        const previous = url.searchParams.has("status")
          ? "and o.status in ('paid','refunded')"
          : "";
        const rows = (
          await pool.query(
            `select o.*, coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id=o.id),'[]') order_items from public.orders o where o.${field}=$1 ${previous}`,
            [value],
          )
        ).rows;
        return Response.json(rows);
      }
      if (url.pathname === "/rest/v1/download_entitlements") {
        const id = url.searchParams.get("order_id")!.replace(/^eq\./, "");
        return Response.json(
          (
            await pool.query(
              "select * from public.download_entitlements where order_id=$1 and revoked_at is null",
              [id],
            )
          ).rows,
        );
      }
      if (url.pathname.startsWith("/storage/v1/object/sign/handbooks/")) {
        expect(body).toEqual({ expiresIn: 60 });
        if (faults.storage-- > 0)
          return Response.json(
            { message: "temporary storage failure" },
            { status: 503 },
          );
        const path = url.pathname.split("/sign/handbooks/")[1];
        signedPaths.push(path);
        return Response.json({
          signedURL: `/object/sign/handbooks/${path}?token=fixture-expiring-storage-token`,
        });
      }
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    }),
  );
  runtime.service = new CommerceService(
    createRepository(supabase, serviceKey),
    createPaymentProvider(keyId, secret),
    {
      keyId,
      keySecret: secret,
      webhookSecret,
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => pool.end());

describe("real routes → SDK/adapters → PostgreSQL purchase lifecycle (external HTTP fixtures)", () => {
  it.each(
    Array.from({ length: (1 << allIds.length) - 1 }, (_, index) => {
      const ids = allIds.filter((_, bit) => (index + 1) & (1 << bit));
      return {
        ids,
        amount: [0, 24900, 39900, 54900, 69900, 49900][ids.length],
      };
    }),
  )(
    "delivers every purchased PDF for $ids at $amount paise",
    async ({ ids, amount }) => {
      const { payload, checkout, cookie } = await start(ids);
      expect(checkout.amount_paise).toBe(amount);
      expect(gateways[0].amount).toBe(amount);
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        status: "payment_pending",
        total: amount,
        items: ids.length,
        entitlements: 0,
      });
      const duplicate = await create(request("orders", payload));
      expect(duplicate.status).toBe(201);
      expect((await duplicate.json()).internal_order_id).toBe(
        checkout.internal_order_id,
      );
      expect(gateways).toHaveLength(1);
      expect(
        (
          await download(
            request(
              "downloads",
              {
                order_id: checkout.internal_order_id,
                entitlement_id: randomUUID(),
              },
              cookie,
            ),
          )
        ).status,
      ).toBe(403);
      const payment = capture(checkout);
      const callback = verification(checkout, payment);
      const responses = await Promise.all([
        verify(request("payments/verify", callback, cookie)),
        notify(payment),
        verify(request("payments/verify", callback, cookie)),
        notify(payment, "order.paid"),
      ]);
      for (const response of responses) expect(response.status).toBe(200);
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        status: "paid",
        payments: 1,
        events: 3,
        entitlements: ids.length,
      });
      const purchaseResponse = await read(
        new NextRequest(`${origin}/api/orders/${checkout.internal_order_id}`, {
          headers: { Cookie: cookie },
        }),
        { params: Promise.resolve({ id: checkout.internal_order_id }) },
      );
      expect(purchaseResponse.headers.get("cache-control")).toContain(
        "no-store",
      );
      const purchase = (await purchaseResponse.json()) as PublicOrder;
      expect(purchase.entitlements.map((e) => e.product_id).sort()).toEqual(
        [...ids].sort(),
      );
      for (const entitlement of purchase.entitlements) {
        const response = await download(
          request(
            "downloads",
            { order_id: purchase.id, entitlement_id: entitlement.id },
            cookie,
          ),
        );
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.expires_in).toBe(60);
        expect(result.url).toContain(
          `/object/sign/handbooks/handbooks/${entitlement.product_id}.pdf?`,
        );
        expect(result.url).not.toContain("/object/public/");
      }
      expect(signedPaths.sort()).toEqual(
        ids.map((id) => `handbooks/${id}.pdf`).sort(),
      );
      const rows = (
        await pool.query(
          "select product_id, storage_path, payment_id, customer_email from public.download_entitlements where order_id=$1",
          [purchase.id],
        )
      ).rows;
      for (const row of rows)
        expect(row).toEqual({
          product_id: row.product_id,
          storage_path: `handbooks/${row.product_id}.pdf`,
          payment_id: payment.id,
          customer_email: payload.email,
        });
    },
  );

  it("deduplicates browser titles and ignores quantity, price and paid-state tampering", async () => {
    const { checkout } = await start([allIds[0], allIds[0], allIds[1]]);
    expect(checkout.amount_paise).toBe(39900);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      subtotal: 49800,
      total: 39900,
      items: 2,
      status: "payment_pending",
      entitlements: 0,
    });
    expect(
      (
        await pool.query(
          "select quantity from public.order_items where order_id=$1",
          [checkout.internal_order_id],
        )
      ).rows,
    ).toEqual([{ quantity: 1 }, { quantity: 1 }]);
  });

  it("derives returning-buyer collection pricing from real paid database history", async () => {
    const first = await start(allIds);
    expect((await notify(capture(first.checkout))).status).toBe(200);
    const second = await create(
      request("orders", { ...input(allIds), email: first.payload.email }),
    );
    expect(second.status).toBe(201);
    const checkout = (await second.json()) as CheckoutOrder;
    expect(checkout.amount_paise).toBe(99900);
    expect(checkout.pricing.eligible_first_time).toBe(false);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      total: 99900,
      subtotal: 124500,
      items: 5,
      entitlements: 0,
    });
  });

  it("serializes simultaneous checkout submissions without creating extra gateway orders", async () => {
    const payload = input();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => create(request("orders", payload))),
    );
    expect(responses.some((response) => response.status === 201)).toBe(true);
    for (const response of responses)
      expect([201, 409]).toContain(response.status);
    expect(gateways).toHaveLength(1);
    const { rows } = await pool.query(
      "select count(*)::int n from public.orders where customer_email=$1",
      [payload.email],
    );
    expect(rows[0].n).toBe(1);
  });

  it.each(["signature", "amount", "currency", "order"])(
    "denies %s tampering through the actual verification route",
    async (field) => {
      const { checkout, cookie } = await start();
      const payment = capture(checkout);
      const callback = verification(checkout, payment);
      if (field === "signature") callback.razorpay_signature = "0".repeat(64);
      if (field === "amount") payment.amount = 100;
      if (field === "currency") payment.currency = "USD";
      if (field === "order") callback.razorpay_order_id = "order_other";
      expect([400, 409]).toContain(
        (await verify(request("payments/verify", callback, cookie))).status,
      );
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        status: "payment_pending",
        payments: 0,
        events: 0,
        entitlements: 0,
      });
      expect(signedPaths).toHaveLength(0);
    },
  );

  it("denies a spoofed webhook before changing any payment state", async () => {
    const { checkout } = await start();
    const payment = capture(checkout);
    expect(
      (
        await notify(payment, "payment.captured", {
          "x-razorpay-signature": "0".repeat(64),
        })
      ).status,
    ).toBe(400);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "payment_pending",
      payments: 0,
      events: 0,
      entitlements: 0,
    });
  });

  it("recovers creation after provider acceptance and failed database binding", async () => {
    const payload = input();
    faults.lostCreate = 1;
    expect((await create(request("orders", payload))).status).toBe(502);
    faults.bind = 1;
    expect((await create(request("orders", payload))).status).toBe(503);
    const retry = await create(request("orders", payload));
    expect(retry.status).toBe(201);
    expect(gateways).toHaveLength(1);
    expect((await retry.json()).razorpay_order_id).toBe(gateways[0].id);
  });

  it.each([true, false])(
    "recovers payment with the browser closed (webhook delivered: %s)",
    async (delivered) => {
      const { checkout, cookie } = await start(allIds.slice(0, 4));
      const payment = capture(checkout);
      if (delivered) expect((await notify(payment)).status).toBe(200);
      const response = await reconcile(
        request(
          "orders/reconcile",
          { order_id: checkout.internal_order_id },
          cookie,
        ),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe("paid");
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        payments: 1,
        entitlements: 4,
      });
      expect(
        (
          await resume(
            request(
              "orders/resume",
              { order_id: checkout.internal_order_id },
              cookie,
            ),
          )
        ).status,
      ).toBe(409);
      expect(gateways).toHaveLength(1);
    },
  );

  it("retries failed fulfillment and a lost commit response without partial or duplicate delivery", async () => {
    const { checkout, cookie } = await start(allIds);
    const payment = capture(checkout);
    faults.apply = 1;
    expect((await notify(payment)).status).toBe(503);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "payment_pending",
      payments: 0,
      events: 0,
      entitlements: 0,
    });
    faults.lostCommit = 1;
    expect(
      (
        await verify(
          request("payments/verify", verification(checkout, payment), cookie),
        )
      ).status,
    ).toBe(503);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "paid",
      payments: 1,
      events: 1,
      entitlements: 5,
    });
    expect((await notify(payment)).status).toBe(200);
    expect(
      (
        await verify(
          request("payments/verify", verification(checkout, payment), cookie),
        )
      ).status,
    ).toBe(200);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "paid",
      payments: 1,
      events: 2,
      entitlements: 5,
    });
  });

  it("keeps paid entitlements intact after storage failure and signs on retry", async () => {
    const { checkout, cookie } = await start();
    const payment = capture(checkout);
    expect((await notify(payment)).status).toBe(200);
    const entitlement = (
      await pool.query(
        "select id from public.download_entitlements where order_id=$1",
        [checkout.internal_order_id],
      )
    ).rows[0];
    faults.storage = 1;
    const body = {
      order_id: checkout.internal_order_id,
      entitlement_id: entitlement.id,
    };
    const failed = await download(request("downloads", body, cookie));
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty("url");
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "paid",
      payments: 1,
      entitlements: 1,
    });
    expect((await download(request("downloads", body, cookie))).status).toBe(
      200,
    );
  });

  it("recovers a webhook that arrives before the provider order was bound in the database", async () => {
    const payload = input(allIds);
    faults.bind = 1;
    expect((await create(request("orders", payload))).status).toBe(503);
    const gateway = gateways[0];
    const payment = capture({
      razorpay_order_id: gateway.id,
      amount_paise: gateway.amount,
    });
    expect((await notify(payment)).status).toBe(200);
    expect(await snapshot(gateway.notes.internal_order_id!)).toMatchObject({
      status: "paid",
      razorpay_order_id: gateway.id,
      payments: 1,
      entitlements: 5,
    });
    expect((await create(request("orders", payload))).status).toBe(409);
    expect(gateways).toHaveLength(1);
  });

  it("revokes every book on refund and does not resurrect access from stale capture evidence", async () => {
    const { checkout, cookie } = await start(allIds);
    const payment = capture(checkout);
    expect((await notify(payment)).status).toBe(200);
    const entitlement = (
      await pool.query(
        "select id from public.download_entitlements where order_id=$1 limit 1",
        [checkout.internal_order_id],
      )
    ).rows[0];
    payment.amount_refunded = 100;
    expect((await notify(payment, "refund.processed")).status).toBe(200);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "refunded",
      entitlements: 0,
    });
    payment.amount_refunded = 0;
    expect(
      (
        await verify(
          request("payments/verify", verification(checkout, payment), cookie),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await download(
          request(
            "downloads",
            {
              order_id: checkout.internal_order_id,
              entitlement_id: entitlement.id,
            },
            cookie,
          ),
        )
      ).status,
    ).toBe(403);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "refunded",
      entitlements: 0,
    });
    expect(signedPaths).toHaveLength(0);
  });

  it("recovers cancelled/failed checkout on the same order and waits for capture", async () => {
    const { checkout, cookie } = await start();
    const body = { order_id: checkout.internal_order_id };
    const cancelled = await resume(request("orders/resume", body, cookie));
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).razorpay_order_id).toBe(
      checkout.razorpay_order_id,
    );
    const failed = capture(checkout, { status: "failed", captured: false });
    expect((await notify(failed, "payment.failed")).status).toBe(200);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "failed",
      entitlements: 0,
    });
    const payment = capture(checkout, {
      status: "authorized",
      captured: false,
    });
    const callback = await verify(
      request("payments/verify", verification(checkout, payment), cookie),
    );
    expect((await callback.json()).status).toBe("failed");
    expect((await notify(payment)).status).toBe(409);
    expect(
      (
        await download(
          request(
            "downloads",
            { ...body, entitlement_id: randomUUID() },
            cookie,
          ),
        )
      ).status,
    ).toBe(403);
    payment.status = "captured";
    payment.captured = true;
    expect((await notify(payment)).status).toBe(200);
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "paid",
      payments: 2,
      entitlements: 1,
    });
    expect(gateways).toHaveLength(1);
  });

  it("exchanges a saved recovery link, denies foreign entitlements and rejects expired access", async () => {
    const owner = await start();
    const other = await start([allIds[1]]);
    for (const purchase of [owner, other])
      expect((await notify(capture(purchase.checkout))).status).toBe(200);
    const id = owner.checkout.internal_order_id;
    const body = { order_id: id };
    const link = await recoveryLink(
      request("orders/recovery-link", body, owner.cookie),
    );
    expect(link.status).toBe(200);
    const url = new URL((await link.json()).url);
    expect(url.origin).toBe(origin);
    expect(url.searchParams.has("access")).toBe(false);
    const token = new URLSearchParams(url.hash.slice(1)).get("access")!;
    const recovered = await access(
      request("orders/access", { ...body, token }),
    );
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("set-cookie")).toContain("HttpOnly");
    const entitlement = (
      await pool.query(
        "select id from public.download_entitlements where order_id=$1",
        [other.checkout.internal_order_id],
      )
    ).rows[0];
    for (const cookie of [
      "",
      other.cookie,
      cookieFor(id, other.payload.checkout_token),
      cookieFrom(recovered, id),
    ]) {
      const denied = await download(
        request(
          "downloads",
          { ...body, entitlement_id: entitlement.id },
          cookie,
        ),
      );
      expect(denied.status).toBe(404);
      expect(await denied.json()).not.toHaveProperty("url");
    }
    expect(signedPaths).toHaveLength(0);
    await pool.query(
      "update public.orders set access_expires_at=now()-interval '1 second' where id=$1",
      [id],
    );
    expect(
      (await access(request("orders/access", { ...body, token }))).status,
    ).toBe(404);
    expect(
      (await reconcile(request("orders/reconcile", body, owner.cookie))).status,
    ).toBe(404);
  });
});
