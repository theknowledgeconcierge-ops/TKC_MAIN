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
import { DEFAULT_EMAIL_FROM, createResendProvider } from "@/lib/server/email";

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
import { POST as deliver } from "@/app/api/orders/delivery/route";
import { POST as fallback } from "@/app/api/internal/email-deliveries/route";

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
const resendKey = "re_lifecycle_fixture_key";
const cronSecret = "lifecycle-cron-secret-not-real-0123456789";
const allIds = activeBooks.map((book) => book.id);
let gateways: ProviderOrder[];
let payments: ProviderPayment[];
let faults: {
  bind: number;
  apply: number;
  lostCommit: number;
  storage: number;
  lostCreate: number;
  session: number;
  lostSessionCommit: number;
  wrongPaymentReference: number;
  emailStatus: number;
  emailTimeout: number;
  emailLost: number;
};
let signedPaths: string[];
// Every Resend request, and the messages Resend accepted (keyed like its idempotency store).
let emailRequests: { key: string; body: { to: string[]; attachments: { filename: string; content: string }[] } & Record<string, unknown> }[];
let acceptedEmails: Map<string, { id: string; body: string }>;
let storageReads: string[];
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
const cookieFor = (id: string, token: string, kind = "checkout") =>
  `tkc_${kind}_${id}=${token}`;
const cookieFrom = (response: NextResponse, id: string, kind = "checkout") =>
  cookieFor(id, response.cookies.get(`tkc_${kind}_${id}`)!.value, kind);
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
  emailRequests = [];
  acceptedEmails = new Map();
  storageReads = [];
  clientIp = `fixture-${randomUUID()}`;
  faults = {
    bind: 0,
    apply: 0,
    lostCommit: 0,
    storage: 0,
    lostCreate: 0,
    session: 0,
    lostSessionCommit: 0,
    wrongPaymentReference: 0,
    emailStatus: 0,
    emailTimeout: 0,
    emailLost: 0,
  };
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("SUPABASE_URL", supabase);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
  vi.stubEnv("RAZORPAY_KEY_ID", keyId);
  vi.stubEnv("RAZORPAY_KEY_SECRET", secret);
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("EMAIL_DELIVERY_CRON_SECRET", cronSecret);
  // Only external HTTP is replaced. Real route handlers, services, SDKs, adapters and SQL execute.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(value));
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.origin === "https://api.resend.com") {
        expect(url.pathname).toBe("/emails");
        expect(headers.get("authorization")).toBe(`Bearer ${resendKey}`);
        expect(headers.get("user-agent")).toBeTruthy();
        const key = headers.get("idempotency-key")!;
        emailRequests.push({ key, body });
        if (faults.emailTimeout-- > 0) throw new Error("fixture_email_timeout");
        if (faults.emailStatus-- > 0)
          return Response.json({ name: "application_error" }, { status: 500 });
        // Mirrors Resend: a repeated key returns the original email instead of sending again.
        const previous = acceptedEmails.get(key);
        if (previous)
          return previous.body === String(init!.body)
            ? Response.json({ id: previous.id })
            : Response.json({ name: "invalid_idempotent_request" }, { status: 409 });
        const accepted = { id: randomUUID(), body: String(init!.body) };
        acceptedEmails.set(key, accepted);
        if (faults.emailLost-- > 0) throw new Error("fixture_email_response_lost");
        return Response.json({ id: accepted.id });
      }
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
        if (
          record &&
          parts[2] === "payments" &&
          faults.wrongPaymentReference-- > 0
        )
          return Response.json({ ...record, id: "pay_wrongreference" });
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
          "tkc_create_purchase_session",
          "tkc_authorize_download",
          "tkc_claim_email_delivery",
          "tkc_claim_fallback_deliveries",
          "tkc_email_delivery_payload",
          "tkc_finish_email_delivery",
        ]).toContain(rpc);
        if (
          (rpc === "tkc_bind_gateway" && faults.bind-- > 0) ||
          (rpc === "tkc_apply_payment" && faults.apply-- > 0) ||
          (rpc === "tkc_create_purchase_session" && faults.session-- > 0)
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
          if (
            (rpc === "tkc_apply_payment" && faults.lostCommit-- > 0) ||
            (rpc === "tkc_create_purchase_session" &&
              faults.lostSessionCommit-- > 0)
          )
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
          "checkout_token_hash",
          "razorpay_order_id",
          "customer_email",
          "customer_mobile",
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
      if (url.pathname === "/rest/v1/purchase_sessions") {
        const hash = url.searchParams.get("token_hash")!.replace(/^eq\./, "");
        return Response.json(
          (
            await pool.query(
              "select * from public.purchase_sessions where token_hash=$1",
              [hash],
            )
          ).rows,
        );
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
      if (url.pathname === "/rest/v1/email_deliveries") {
        const id = url.searchParams.get("order_id")!.replace(/^eq\./, "");
        return Response.json(
          (
            await pool.query(
              "select * from public.email_deliveries where order_id=$1",
              [id],
            )
          ).rows,
        );
      }
      // Private object read with the service key (never the public or signed endpoint).
      if (url.pathname.startsWith("/storage/v1/object/handbooks/")) {
        expect(init?.method ?? "GET").toBe("GET");
        const path = url.pathname.split("/object/handbooks/")[1];
        storageReads.push(path);
        return new Response(Buffer.from(`%PDF-1.7\n${path}\n%%EOF`), {
          headers: { "Content-Type": "application/pdf" },
        });
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
    { provider: createResendProvider(resendKey), from: DEFAULT_EMAIL_FROM },
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
      ).toBe(404);
      expect(
        await pool.query(
          "select 1 from public.purchase_sessions where order_id=$1",
          [checkout.internal_order_id],
        ),
      ).toMatchObject({ rowCount: 0 });
      const payment = capture(checkout);
      const callback = verification(checkout, payment);
      const responses = await Promise.all([
        verify(request("payments/verify", callback, cookie)),
        notify(payment),
        verify(request("payments/verify", callback, cookie)),
        notify(payment, "order.paid"),
      ]);
      for (const response of responses) expect(response.status).toBe(200);
      const purchaseCookie = cookieFrom(
        responses[0],
        checkout.internal_order_id,
        "session",
      );
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        status: "paid",
        payments: 1,
        events: 3,
        entitlements: ids.length,
      });
      const purchaseResponse = await read(
        new NextRequest(`${origin}/api/orders/${checkout.internal_order_id}`, {
          headers: { Cookie: purchaseCookie },
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
            purchaseCookie,
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

  it("charges ₹499 for the collection to new and repeat customers despite real paid history", async () => {
    const promotional = async (body: ReturnType<typeof input>) => {
      const response = await create(request("orders", body));
      expect(response.status).toBe(201);
      const checkout = (await response.json()) as CheckoutOrder;
      expect(checkout.amount_paise).toBe(49900);
      expect(checkout.pricing).toMatchObject({
        regular_total_inr: 1245,
        automatic_discount_inr: 246,
        coupon_discount_inr: 500,
        total_inr: 499,
      });
      expect(gateways.at(-1)).toMatchObject({
        amount: 49900,
        currency: "INR",
        notes: { internal_order_id: checkout.internal_order_id },
      });
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        total: 49900,
        subtotal: 124500,
        items: 5,
      });
      return checkout;
    };
    const pay = async (checkout: CheckoutOrder) => {
      expect((await notify(capture(checkout))).status).toBe(200);
      expect((await snapshot(checkout.internal_order_id)).status).toBe("paid");
    };
    const customer = { ...input(allIds), mobile: "9123456780" };
    await pay(await promotional(customer));
    await pay(await promotional({ ...input(allIds), email: customer.email }));
    await pay(
      await promotional({ ...input(allIds), mobile: customer.mobile }),
    );
    const { rows } = await pool.query(
      `select count(*) filter (where customer_email=$1)::int email,
        count(*) filter (where customer_mobile=$2)::int mobile
        from public.orders where status='paid'`,
      [customer.email, customer.mobile],
    );
    // Orders 1-2 share the email and orders 1/3 the mobile: three prior paid orders.
    expect(rows[0]).toEqual({ email: 2, mobile: 2 });
    await promotional({
      ...input(allIds),
      email: customer.email,
      mobile: customer.mobile,
    });
    expect(gateways).toHaveLength(4);
  });

  it("ignores client price, discount and eligibility claims for the collection", async () => {
    const response = await create(
      request("orders", {
        ...input(allIds),
        total: 99900,
        amount: 1,
        amount_paise: 100,
        currency: "USD",
        coupon_discount_inr: 0,
        automatic_discount_inr: 0,
        eligible_first_time: false,
        returning_customer: true,
        pricing: { total_inr: 1, coupon_discount_inr: 0 },
      }),
    );
    expect(response.status).toBe(201);
    const checkout = (await response.json()) as CheckoutOrder;
    expect(checkout).toMatchObject({ amount_paise: 49900, currency: "INR" });
    expect(gateways).toEqual([
      expect.objectContaining({ amount: 49900, currency: "INR" }),
    ]);
    const { rows } = await pool.query(
      "select total, subtotal, pricing from public.orders where id=$1",
      [checkout.internal_order_id],
    );
    expect(rows[0]).toMatchObject({
      total: 49900,
      subtotal: 124500,
      pricing: { total_inr: 499, coupon_discount_inr: 500 },
    });
    expect(rows[0].pricing).not.toHaveProperty("eligible_first_time");
    for (const coupon_code of ["SAVE90", "FIRST100"])
      expect(
        (await create(request("orders", { ...input(allIds), coupon_code })))
          .status,
      ).toBe(400);
    expect(gateways).toHaveLength(1);
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
      expect(await response.json()).toMatchObject({
        status: "paid",
        download_authorized: false,
        entitlements: [],
      });
      expect(response.headers.get("set-cookie")).toBeNull();
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
    const confirmed = await verify(
      request("payments/verify", verification(checkout, payment), cookie),
    );
    const purchaseCookie = cookieFrom(
      confirmed,
      checkout.internal_order_id,
      "session",
    );
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
    const failed = await download(request("downloads", body, purchaseCookie));
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty("url");
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      status: "paid",
      payments: 1,
      entitlements: 1,
    });
    expect(
      (await download(request("downloads", body, purchaseCookie))).status,
    ).toBe(200);
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
    const confirmed = await verify(
      request("payments/verify", verification(checkout, payment), cookie),
    );
    const purchaseCookie = cookieFrom(
      confirmed,
      checkout.internal_order_id,
      "session",
    );
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
            purchaseCookie,
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
    ).toBe(404);
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

  it("requires a post-payment session, denies copied URLs, legacy tokens, foreign orders and expired sessions", async () => {
    const owner = await start();
    const other = await start([allIds[1]]);
    const ownerPayment = capture(owner.checkout);
    const otherPayment = capture(other.checkout);
    for (const payment of [ownerPayment, otherPayment])
      expect((await notify(payment)).status).toBe(200);
    const id = owner.checkout.internal_order_id;
    const otherId = other.checkout.internal_order_id;
    const body = { order_id: id };
    const ownerConfirmation = await verify(
      request(
        "payments/verify",
        verification(owner.checkout, ownerPayment),
        owner.cookie,
      ),
    );
    const otherConfirmation = await verify(
      request(
        "payments/verify",
        verification(other.checkout, otherPayment),
        other.cookie,
      ),
    );
    expect(ownerConfirmation.status).toBe(200);
    const ownerCookie = cookieFrom(ownerConfirmation, id, "session");
    const otherCookie = cookieFrom(otherConfirmation, otherId, "session");
    const ownerToken = ownerConfirmation.cookies.get(
      `tkc_session_${id}`,
    )!.value;
    expect(ownerToken).not.toBe(owner.payload.checkout_token);
    expect(JSON.stringify(await ownerConfirmation.json())).not.toContain(
      ownerToken,
    );
    expect(
      (
        await pool.query(
          "select token_hash from public.purchase_sessions where order_id=$1",
          [id],
        )
      ).rows[0].token_hash,
    ).not.toBe(ownerToken);
    const entitlements = (
      await pool.query(
        "select id,order_id from public.download_entitlements where order_id=any($1::uuid[])",
        [[id, otherId]],
      )
    ).rows;
    const own = entitlements.find((e) => e.order_id === id)!;
    const foreign = entitlements.find((e) => e.order_id === otherId)!;
    const checkoutRead = await read(
      new NextRequest(`${origin}/api/orders/${id}`, {
        headers: { Cookie: owner.cookie },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(await checkoutRead.json()).toMatchObject({
      status: "paid",
      download_authorized: false,
      entitlements: [],
    });
    const refresh = await reconcile(
      request("orders/reconcile", body, owner.cookie),
    );
    expect(refresh.headers.get("set-cookie")).toBeNull();
    expect(await refresh.json()).toMatchObject({
      download_authorized: false,
      entitlements: [],
    });
    const copied = await read(new NextRequest(`${origin}/api/orders/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(copied.status).toBe(404);
    for (const cookie of [
      "",
      owner.cookie,
      otherCookie,
      `tkc_purchase_${id}=${owner.payload.checkout_token}`,
      cookieFor(id, owner.payload.checkout_token, "session"),
      cookieFor(id, "b".repeat(43), "session"),
    ]) {
      const denied = await download(
        request("downloads", { ...body, entitlement_id: own.id }, cookie),
      );
      expect(denied.status).toBe(404);
      expect(await denied.json()).not.toHaveProperty("url");
    }
    expect(
      (
        await download(
          request(
            "downloads",
            { ...body, entitlement_id: foreign.id },
            ownerCookie,
          ),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await download(
          request(
            "downloads",
            { order_id: otherId, entitlement_id: foreign.id },
            cookieFor(otherId, ownerToken, "session"),
          ),
        )
      ).status,
    ).toBe(404);
    expect(signedPaths).toHaveLength(0);
    expect(
      (
        await download(
          request(
            "downloads",
            { ...body, entitlement_id: own.id },
            ownerCookie,
          ),
        )
      ).status,
    ).toBe(200);
    await pool.query(
      "update public.purchase_sessions set created_at=now()-interval '31 days', expires_at=now()-interval '1 second' where order_id=$1",
      [id],
    );
    expect(
      (
        await download(
          request(
            "downloads",
            { ...body, entitlement_id: own.id },
            ownerCookie,
          ),
        )
      ).status,
    ).toBe(404);
  });

  it("does not issue a session when callback verification is fabricated or a payment is not captured", async () => {
    const { checkout, cookie } = await start();
    const payment = capture(checkout, {
      status: "authorized",
      captured: false,
    });
    const callback = verification(checkout, payment);
    for (const response of [
      await verify(
        request(
          "payments/verify",
          { ...callback, razorpay_signature: "0".repeat(64) },
          cookie,
        ),
      ),
      await verify(request("payments/verify", callback, cookie)),
    ])
      expect(response.headers.get("set-cookie")).toBeNull();
    expect(
      (
        await pool.query(
          "select count(*)::int n from public.purchase_sessions where order_id=$1",
          [checkout.internal_order_id],
        )
      ).rows[0].n,
    ).toBe(0);
    await expect(
      pool.query("select public.tkc_create_purchase_session($1::jsonb)", [
        JSON.stringify({
          order_id: checkout.internal_order_id,
          token_hash: "c".repeat(64),
        }),
      ]),
    ).rejects.toThrow("purchase_not_fulfilled");
  });

  it.each([undefined, "", "not-an-email", "buyer@"])(
    "rejects checkout without a valid email (%j) before creating any order",
    async (email) => {
      const payload = {
        ...input(allIds),
        full_name: `Email Check ${randomUUID()}`,
        email,
      };
      const response = await create(request("orders", payload));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_REQUEST" },
      });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(gateways).toHaveLength(0);
      const { rows } = await pool.query(
        "select count(*)::int n from public.orders where customer_name=$1",
        [payload.full_name],
      );
      expect(rows[0].n).toBe(0);
    },
  );

  it("cannot exchange a different or uncaptured attempt for a session on an already-paid order", async () => {
    const { checkout, cookie } = await start();
    const paidPayment = capture(checkout);
    expect((await notify(paidPayment)).status).toBe(200);
    for (const status of ["authorized", "failed"]) {
      const otherAttempt = capture(checkout, { status, captured: false });
      const response = await verify(
        request(
          "payments/verify",
          verification(checkout, otherAttempt),
          cookie,
        ),
      );
      expect(response.status).toBe(409);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(
      (
        await pool.query(
          "select count(*)::int n from public.purchase_sessions where order_id=$1",
          [checkout.internal_order_id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await verify(
          request(
            "payments/verify",
            verification(checkout, paidPayment),
            cookie,
          ),
        )
      ).status,
    ).toBe(200);
  });

  it.each(["session", "lostSessionCommit"] as const)(
    "retries %s failure after durable fulfillment without granting checkout-only access",
    async (fault) => {
      const { checkout, cookie } = await start();
      const payment = capture(checkout);
      const payload = verification(checkout, payment);
      faults[fault] = 1;
      const failed = await verify(request("payments/verify", payload, cookie));
      expect(failed.status).toBe(503);
      expect(failed.headers.get("set-cookie")).toBeNull();
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        status: "paid",
        payments: 1,
        entitlements: 1,
      });
      const entitlement = (
        await pool.query(
          "select id from public.download_entitlements where order_id=$1",
          [checkout.internal_order_id],
        )
      ).rows[0];
      const downloadBody = {
        order_id: checkout.internal_order_id,
        entitlement_id: entitlement.id,
      };
      expect(
        (await download(request("downloads", downloadBody, cookie))).status,
      ).toBe(404);
      const retried = await verify(request("payments/verify", payload, cookie));
      expect(retried.status).toBe(200);
      expect(
        (
          await download(
            request(
              "downloads",
              downloadBody,
              cookieFrom(retried, checkout.internal_order_id, "session"),
            ),
          )
        ).status,
      ).toBe(200);
      expect(await snapshot(checkout.internal_order_id)).toMatchObject({
        status: "paid",
        payments: 1,
        entitlements: 1,
      });
    },
  );

  it.each(["authorized", "failed", "created", "captured"])(
    "fails closed if current provider payment evidence is %s with captured=false",
    async (status) => {
      const { checkout, cookie } = await start();
      const payment = capture(checkout);
      const confirmed = await verify(
        request("payments/verify", verification(checkout, payment), cookie),
      );
      const purchase = (await confirmed.json()) as PublicOrder;
      payment.status = status;
      payment.captured = false;
      const response = await download(
        request(
          "downloads",
          {
            order_id: purchase.id,
            entitlement_id: purchase.entitlements[0].id,
          },
          cookieFrom(confirmed, purchase.id, "session"),
        ),
      );
      expect(response.status).toBe(409);
      expect(await response.json()).not.toHaveProperty("url");
      expect(signedPaths).toHaveLength(0);
      // Do not corrupt durable paid history in response to inconsistent provider reads.
      expect((await snapshot(purchase.id)).status).toBe("paid");
    },
  );

  it("rejects a provider payment reference that differs from the paid session's payment", async () => {
    const { checkout, cookie } = await start();
    const payment = capture(checkout);
    const confirmed = await verify(
      request("payments/verify", verification(checkout, payment), cookie),
    );
    const purchase = (await confirmed.json()) as PublicOrder;
    payment.status = "authorized";
    payment.captured = false;
    faults.wrongPaymentReference = 1;
    const response = await download(
      request(
        "downloads",
        { order_id: purchase.id, entitlement_id: purchase.entitlements[0].id },
        cookieFrom(confirmed, purchase.id, "session"),
      ),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("url");
    expect(signedPaths).toHaveLength(0);
  });
});

describe("post-purchase email delivery through real routes and PostgreSQL", () => {
  const pdf = (id: string) => `handbooks/${id}.pdf`;
  const title = (id: string) => activeBooks.find((book) => book.id === id)!.title;
  async function paidPurchase(ids = [allIds[0]]) {
    const started = await start(ids);
    const payment = capture(started.checkout);
    const confirmed = await verify(
      request(
        "payments/verify",
        verification(started.checkout, payment),
        started.cookie,
      ),
    );
    expect(confirmed.status).toBe(200);
    const id = started.checkout.internal_order_id;
    return {
      ...started,
      id,
      payment,
      purchase: (await confirmed.json()) as PublicOrder,
      session: cookieFrom(confirmed, id, "session"),
    };
  }
  async function paidByWebhook(ids = [allIds[0]]) {
    const started = await start(ids);
    const payment = capture(started.checkout);
    expect((await notify(payment)).status).toBe(200);
    return { ...started, id: started.checkout.internal_order_id, payment };
  }
  const orderRead = (id: string, cookie: string) =>
    read(
      new NextRequest(`${origin}/api/orders/${id}`, {
        headers: { Cookie: cookie, "X-Forwarded-For": clientIp },
      }),
      { params: Promise.resolve({ id }) },
    );
  const send = (id: string, cookie: string, extra: Record<string, unknown> = {}) =>
    deliver(request("orders/delivery", { order_id: id, ...extra }, cookie));
  const runFallback = () =>
    fallback(
      new NextRequest(`${origin}/api/internal/email-deliveries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      }),
    );
  const deliveryRow = async (id: string) =>
    (
      await pool.query("select * from public.email_deliveries where order_id=$1", [
        id,
      ])
    ).rows[0];
  const backdate = (ids: string[], interval: string) =>
    pool.query(
      `update public.orders set paid_at = now() - interval '${interval}' where id = any($1::uuid[])`,
      [ids],
    );

  it("shows and sends delivery only to the verified purchase session; a copied URL controls nothing", async () => {
    const paid = await paidPurchase([allIds[0], allIds[2]]);
    // Payment verification and webhooks never send email or create delivery state.
    expect(emailRequests).toHaveLength(0);
    expect(await deliveryRow(paid.id)).toBeUndefined();
    const owner = (await (await orderRead(paid.id, paid.session)).json()) as PublicOrder;
    expect(owner.delivery).toEqual({
      email: paid.payload.email,
      status: "pending",
      locked: false,
      sent_at: null,
      error: null,
      can_retry: true,
    });
    const copied = await orderRead(paid.id, "");
    expect(copied.status).toBe(404);
    const copiedText = await copied.text();
    for (const secret of [paid.payload.email, paid.payload.full_name, paid.payload.mobile])
      expect(copiedText).not.toContain(secret);
    const other = await paidPurchase();
    const otherToken = other.session.split("=")[1];
    for (const cookie of [
      "",
      paid.cookie,
      other.session,
      cookieFor(paid.id, otherToken, "session"),
      cookieFor(paid.id, "b".repeat(43), "session"),
    ]) {
      for (const extra of [{}, { email: "attacker@example.com" }]) {
        const denied = await send(paid.id, cookie, extra);
        expect(denied.status).toBe(404);
        expect(await denied.text()).not.toContain(paid.payload.email);
      }
      const view = await orderRead(paid.id, cookie);
      expect(JSON.stringify(await view.json())).not.toContain(paid.payload.email);
      expect(
        (
          await download(
            request(
              "downloads",
              { order_id: paid.id, entitlement_id: paid.purchase.entitlements[0].id },
              cookie,
            ),
          )
        ).status,
      ).toBe(404);
    }
    expect(await deliveryRow(paid.id)).toBeUndefined();
    expect(emailRequests).toHaveLength(0);
    // The probes above exhausted that client's per-order delivery rate limit; the buyer is elsewhere.
    expect((await send(paid.id, paid.session)).status).toBe(429);
    clientIp = `buyer-${randomUUID()}`;

    const sent = await send(paid.id, paid.session);
    expect(sent.status).toBe(200);
    expect(((await sent.json()) as PublicOrder).delivery).toMatchObject({
      email: paid.payload.email,
      status: "sent",
      locked: true,
      can_retry: false,
    });
    const row = await deliveryRow(paid.id);
    expect(row).toMatchObject({
      status: "sent",
      delivery_email: paid.payload.email,
      attempt_count: 1,
      provider: "resend",
      last_error: null,
    });
    expect(row.delivery_email_locked_at).not.toBeNull();
    expect(row.delivery_email_confirmed_at).not.toBeNull();
    expect(emailRequests).toHaveLength(1);
    const [{ key, body }] = emailRequests;
    expect(key).toBe(`pnp-delivery-${row.id}-v1`);
    expect(body).toMatchObject({
      from: DEFAULT_EMAIL_FROM,
      to: [paid.payload.email],
      subject: "Your Pixel n Palm books are here 📚",
    });
    expect(body.attachments.map((file) => file.filename)).toEqual([
      `${title(allIds[0])}.pdf`,
      `${title(allIds[2])}.pdf`,
    ]);
    // The version-controlled template lists exactly the purchased titles in both parts.
    const html = String(body.html);
    const text = String(body.text);
    expect(text).toContain(`01  ${title(allIds[0])}`);
    expect(text).toContain(`02  ${title(allIds[2])}`);
    for (const other of allIds.filter((id) => id !== allIds[0] && id !== allIds[2]))
      expect(html + text).not.toContain(title(other));
    expect(html + text).not.toMatch(/supabase|storage\/v1|token=|tkc_session/i);
    expect(html + text).not.toContain(paid.id);
    expect(html + text).not.toContain(paid.id.replaceAll("-", ""));
    expect(html).not.toMatch(/<img/i);
    for (const file of body.attachments) {
      // Content only: no URL or storage path is handed to the provider.
      expect(Object.keys(file).sort()).toEqual(["content", "filename"]);
      expect(Buffer.from(file.content, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    }
    expect(storageReads.sort()).toEqual([pdf(allIds[0]), pdf(allIds[2])].sort());
    expect(signedPaths).toHaveLength(0);
    expect(await snapshot(paid.id)).toMatchObject({ status: "paid", entitlements: 2 });
  });

  it("corrects the address before delivery, rejects malformed addresses and keeps the checkout email", async () => {
    const paid = await paidPurchase();
    for (const email of ["not-an-email", "a@", "spaces in@example.com"])
      expect((await send(paid.id, paid.session, { email })).status).toBe(400);
    expect(await deliveryRow(paid.id)).toBeUndefined();
    const corrected = await send(paid.id, paid.session, {
      email: "Reader.Correct@Example.com",
    });
    expect(corrected.status).toBe(200);
    expect(((await corrected.json()) as PublicOrder).delivery).toMatchObject({
      email: "reader.correct@example.com",
      status: "sent",
      locked: true,
    });
    expect(emailRequests.map((entry) => entry.body.to)).toEqual([
      ["reader.correct@example.com"],
    ]);
    const { rows } = await pool.query(
      "select customer_email from public.orders where id=$1",
      [paid.id],
    );
    expect(rows[0].customer_email).toBe(paid.payload.email);
    const locked = await send(paid.id, paid.session, { email: "third@example.com" });
    expect(locked.status).toBe(409);
    expect((await locked.json()).error.code).toBe("DELIVERY_LOCKED");
    expect((await deliveryRow(paid.id)).delivery_email).toBe("reader.correct@example.com");
    expect(emailRequests).toHaveLength(1);
  });

  it("attaches only the books in the paid order and ignores client-chosen files", async () => {
    const paid = await paidPurchase([allIds[3]]);
    const response = await send(paid.id, paid.session, {
      attachments: [pdf(allIds[0]), "../../secrets.pdf"],
      storage_path: pdf(allIds[1]),
      product_ids: allIds,
      book_ids: allIds,
    });
    expect(response.status).toBe(200);
    expect(emailRequests).toHaveLength(1);
    expect(emailRequests[0].body.attachments.map((file) => file.filename)).toEqual([
      `${title(allIds[3])}.pdf`,
    ]);
    expect(storageReads).toEqual([pdf(allIds[3])]);
  });

  it("sends exactly one email for double clicks, concurrent requests and repeats after SENT", async () => {
    const paid = await paidPurchase(allIds);
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => send(paid.id, paid.session)),
    );
    for (const response of responses) expect(response.status).toBe(200);
    expect(emailRequests).toHaveLength(1);
    expect(emailRequests[0].body.attachments).toHaveLength(5);
    const again = await send(paid.id, paid.session);
    expect(((await again.json()) as PublicOrder).delivery?.status).toBe("sent");
    expect(emailRequests).toHaveLength(1);
    expect(await deliveryRow(paid.id)).toMatchObject({ status: "sent", attempt_count: 1 });
  });

  it("keeps the payment paid and downloads working through provider failures, and retries idempotently", async () => {
    const paid = await paidPurchase([allIds[1]]);
    const before = await snapshot(paid.id);
    faults.emailStatus = 1;
    const failed = await send(paid.id, paid.session);
    expect(failed.status).toBe(200);
    expect(((await failed.json()) as PublicOrder).delivery).toMatchObject({
      status: "failed",
      error: "provider_unavailable",
      locked: false,
      can_retry: true,
    });
    expect(await snapshot(paid.id)).toMatchObject({
      status: before.status,
      payments: before.payments,
      entitlements: before.entitlements,
    });
    const downloadBody = {
      order_id: paid.id,
      entitlement_id: paid.purchase.entitlements[0].id,
    };
    expect((await download(request("downloads", downloadBody, paid.session))).status).toBe(200);
    faults.emailTimeout = 1;
    expect(((await (await send(paid.id, paid.session)).json()) as PublicOrder).delivery).toMatchObject({
      status: "failed",
      error: "provider_timeout",
    });
    // Resend accepted the email but the response was lost: the retry must not send twice.
    faults.emailLost = 1;
    expect(((await (await send(paid.id, paid.session)).json()) as PublicOrder).delivery?.status).toBe("failed");
    const retried = await send(paid.id, paid.session);
    expect(((await retried.json()) as PublicOrder).delivery).toMatchObject({
      status: "sent",
      locked: true,
    });
    expect(emailRequests).toHaveLength(4);
    expect(new Set(emailRequests.map((entry) => entry.key)).size).toBe(1);
    expect(acceptedEmails.size).toBe(1);
    expect(await deliveryRow(paid.id)).toMatchObject({ status: "sent", attempt_count: 4 });
    expect(await snapshot(paid.id)).toMatchObject({ status: "paid", payments: 1, entitlements: 1 });
    expect((await download(request("downloads", downloadBody, paid.session))).status).toBe(200);
  });

  it("lets a failed delivery be redirected to a corrected address with a new idempotency key", async () => {
    const paid = await paidPurchase();
    faults.emailStatus = 1;
    await send(paid.id, paid.session);
    const redirected = await send(paid.id, paid.session, { email: "fixed@example.com" });
    expect(((await redirected.json()) as PublicOrder).delivery).toMatchObject({
      email: "fixed@example.com",
      status: "sent",
    });
    const row = await deliveryRow(paid.id);
    expect(emailRequests.map((entry) => [entry.key, entry.body.to[0]])).toEqual([
      [`pnp-delivery-${row.id}-v1`, paid.payload.email],
      [`pnp-delivery-${row.id}-v2`, "fixed@example.com"],
    ]);
  });

  it("blocks delivery after a refund, as downloads already are", async () => {
    const paid = await paidPurchase();
    paid.payment.amount_refunded = paid.payment.amount;
    expect((await notify(paid.payment, "refund.processed")).status).toBe(200);
    expect((await send(paid.id, paid.session)).status).toBe(403);
    expect(
      (
        await download(
          request(
            "downloads",
            { order_id: paid.id, entitlement_id: paid.purchase.entitlements[0].id },
            paid.session,
          ),
        )
      ).status,
    ).toBe(403);
    expect(emailRequests).toHaveLength(0);
  });

  it("fails safely without RESEND_API_KEY: no delivery state, payment and downloads intact", async () => {
    runtime.service = new CommerceService(
      createRepository(supabase, serviceKey),
      createPaymentProvider(keyId, secret),
      { keyId, keySecret: secret, webhookSecret },
    );
    const paid = await paidPurchase();
    const response = await send(paid.id, paid.session);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("EMAIL_UNAVAILABLE");
    expect(await deliveryRow(paid.id)).toBeUndefined();
    expect(await snapshot(paid.id)).toMatchObject({ status: "paid", entitlements: 1 });
    expect(
      (
        await download(
          request(
            "downloads",
            { order_id: paid.id, entitlement_id: paid.purchase.entitlements[0].id },
            paid.session,
          ),
        )
      ).status,
    ).toBe(200);
    expect((await runFallback()).status).toBe(503);
  });

  it("loads historical paid orders without an email and delivers only to an address the session supplies", async () => {
    const paid = await paidPurchase();
    await pool.query("update public.orders set customer_email=null where id=$1", [paid.id]);
    await pool.query(
      "update public.download_entitlements set customer_email=null where order_id=$1",
      [paid.id],
    );
    const view = await orderRead(paid.id, paid.session);
    expect(view.status).toBe(200);
    expect(((await view.json()) as PublicOrder).delivery).toMatchObject({
      email: null,
      status: "pending",
    });
    expect(
      (
        await download(
          request(
            "downloads",
            { order_id: paid.id, entitlement_id: paid.purchase.entitlements[0].id },
            paid.session,
          ),
        )
      ).status,
    ).toBe(200);
    const missing = await send(paid.id, paid.session);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("DELIVERY_EMAIL_REQUIRED");
    expect(await deliveryRow(paid.id)).toBeUndefined();
    const supplied = await send(paid.id, paid.session, { email: "Recovered@Example.com" });
    expect(((await supplied.json()) as PublicOrder).delivery).toMatchObject({
      email: "recovered@example.com",
      status: "sent",
    });
  });

  it("emails unconfirmed paid orders to the checkout email after the grace period, exactly once and only when deliverable", async () => {
    const eligible = await paidByWebhook([allIds[4]]);
    const manual = await paidPurchase();
    expect((await send(manual.id, manual.session)).status).toBe(200);
    const confirmedFailure = await paidPurchase();
    faults.emailStatus = 1;
    await send(confirmedFailure.id, confirmedFailure.session);
    const recent = await paidByWebhook();
    const stale = await paidByWebhook();
    const noEmail = await paidByWebhook();
    await pool.query("update public.orders set customer_email=null where id=$1", [noEmail.id]);
    await pool.query(
      "update public.download_entitlements set customer_email=null where order_id=$1",
      [noEmail.id],
    );
    const unpaid = await start();
    const failedPayment = await start();
    expect(
      (
        await notify(
          capture(failedPayment.checkout, { status: "failed", captured: false }),
          "payment.failed",
        )
      ).status,
    ).toBe(200);
    const refunded = await paidByWebhook();
    refunded.payment.amount_refunded = refunded.payment.amount;
    expect((await notify(refunded.payment, "refund.processed")).status).toBe(200);
    await backdate(
      [
        eligible.id,
        manual.id,
        confirmedFailure.id,
        noEmail.id,
        refunded.id,
        unpaid.checkout.internal_order_id,
        failedPayment.checkout.internal_order_id,
      ],
      "6 minutes",
    );
    await backdate([stale.id], "2 days");
    const earlier = emailRequests.length;

    const run = await runFallback();
    expect(run.status).toBe(200);
    expect(await run.json()).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const automatic = emailRequests.slice(earlier);
    expect(automatic).toHaveLength(1);
    expect(automatic[0].body.to).toEqual([eligible.payload.email]);
    expect(automatic[0].body.attachments.map((file) => file.filename)).toEqual([
      `${title(allIds[4])}.pdf`,
    ]);
    const row = await deliveryRow(eligible.id);
    expect(row).toMatchObject({ status: "sent", delivery_email: eligible.payload.email });
    expect(row.delivery_email_confirmed_at).toBeNull();
    expect(row.delivery_email_locked_at).not.toBeNull();
    for (const id of [recent.id, stale.id, noEmail.id, refunded.id])
      expect(await deliveryRow(id)).toBeUndefined();
    expect(await deliveryRow(confirmedFailure.id)).toMatchObject({
      status: "failed",
      attempt_count: 1,
    });
    expect(await deliveryRow(manual.id)).toMatchObject({ status: "sent", attempt_count: 1 });

    const repeat = await runFallback();
    expect(await repeat.json()).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(emailRequests).toHaveLength(earlier + 1);
  });

  it("retries a failed automatic delivery a bounded number of times", async () => {
    const paid = await paidByWebhook();
    await backdate([paid.id], "6 minutes");
    faults.emailStatus = 10;
    expect(await (await runFallback()).json()).toMatchObject({ claimed: 1, failed: 1 });
    for (let attempt = 2; attempt <= 4; attempt++) {
      await pool.query(
        "update public.email_deliveries set failed_at = now() - interval '16 minutes' where order_id=$1",
        [paid.id],
      );
      await runFallback();
    }
    expect(await deliveryRow(paid.id)).toMatchObject({ status: "failed", attempt_count: 3 });
    expect(emailRequests).toHaveLength(3);
    expect(await snapshot(paid.id)).toMatchObject({ status: "paid", entitlements: 1 });
  });
});

describe("stale unpaid orders after a price change (real routes and PostgreSQL)", () => {
  // Recreates production order 103e70bf: unpaid, stored at ₹999 with a 99,900 paise Razorpay order.
  async function historical(ids = allIds) {
    const started = await start(ids);
    const id = started.checkout.internal_order_id;
    await pool.query(
      "update public.orders set total=99900, pricing = pricing || $2::jsonb where id=$1",
      [
        id,
        JSON.stringify({
          coupon_code: null,
          coupon_discount_inr: 0,
          total_inr: 999,
          total_savings_inr: 246,
          message: "The standard collection price applies to returning customers.",
        }),
      ],
    );
    gateways.find((gateway) => gateway.id === started.checkout.razorpay_order_id)!.amount = 99900;
    return { ...started, id };
  }
  const orderRow = async (id: string) =>
    (
      await pool.query(
        "select status, total, subtotal, pricing, razorpay_order_id, razorpay_payment_id, gateway_started_at, updated_at from public.orders where id=$1",
        [id],
      )
    ).rows[0];

  it("rejects the stale ₹999 order on every path, concurrently, and creates a fresh ₹499 order instead", async () => {
    const stale = await historical();
    const before = await orderRow(stale.id);
    const oldGateway = structuredClone(gateways[0]);
    const resumeBody = { order_id: stale.id, book_ids: allIds };
    const attempts = await Promise.all([
      ...Array.from({ length: 4 }, () =>
        resume(request("orders/resume", resumeBody, stale.cookie)),
      ),
      ...Array.from({ length: 2 }, () => create(request("orders", stale.payload))),
    ]);
    for (const response of attempts) {
      expect(response.status).toBe(409);
      const text = await response.text();
      expect(JSON.parse(text).error.code).toBe("CHECKOUT_PRICE_CHANGED");
      // The stale Razorpay order is never handed out.
      expect(text).not.toContain(oldGateway.id);
      expect(text).not.toContain("99900");
    }
    expect(gateways).toEqual([oldGateway]);
    expect(await orderRow(stale.id)).toEqual(before);

    // The client's retry: same customer and cart, fresh checkout token.
    const fresh = await create(
      request("orders", {
        ...stale.payload,
        checkout_token: randomBytes(32).toString("base64url"),
      }),
    );
    expect(fresh.status).toBe(201);
    const checkout = (await fresh.json()) as CheckoutOrder;
    expect(checkout.internal_order_id).not.toBe(stale.id);
    expect(checkout.amount_paise).toBe(49900);
    expect(checkout.pricing).toMatchObject({ total_inr: 499, coupon_discount_inr: 500 });
    expect(gateways).toHaveLength(2);
    expect(gateways[0]).toEqual(oldGateway);
    expect(gateways[1]).toMatchObject({
      amount: 49900,
      currency: "INR",
      notes: { internal_order_id: checkout.internal_order_id },
    });
    expect(await snapshot(checkout.internal_order_id)).toMatchObject({
      total: 49900,
      subtotal: 124500,
      status: "payment_pending",
    });
    expect(await orderRow(stale.id)).toEqual(before);
  });

  it("resumes a current-price unpaid order normally and only with the same books", async () => {
    const current = await start([allIds[0], allIds[1]]);
    const id = current.checkout.internal_order_id;
    const narrowed = await resume(
      request("orders/resume", { order_id: id, book_ids: [allIds[0]] }, current.cookie),
    );
    expect(narrowed.status).toBe(409);
    expect((await narrowed.json()).error.code).toBe("CHECKOUT_PRICE_CHANGED");
    const resumed = await resume(
      request("orders/resume", { order_id: id, book_ids: [allIds[1], allIds[0]] }, current.cookie),
    );
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      internal_order_id: id,
      razorpay_order_id: gateways[0].id,
      amount_paise: 39900,
    });
    expect(gateways).toHaveLength(1);
  });

  it("never reprices a paid historical ₹999 order", async () => {
    const paid = await historical();
    const payment = capture({
      razorpay_order_id: paid.checkout.razorpay_order_id,
      amount_paise: 99900,
    });
    expect((await notify(payment)).status).toBe(200);
    for (const response of [
      await resume(request("orders/resume", { order_id: paid.id, book_ids: allIds }, paid.cookie)),
      await create(request("orders", paid.payload)),
    ]) {
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("ORDER_COMPLETED");
    }
    const row = await orderRow(paid.id);
    expect(row).toMatchObject({ status: "paid", total: 99900, razorpay_payment_id: payment.id });
    expect(row.pricing.total_inr).toBe(999);
    expect(gateways).toHaveLength(1);
  });
});
