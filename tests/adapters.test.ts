import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentProvider } from "@/lib/server/razorpay";
import { createRepository } from "@/lib/server/supabase";
afterEach(() => vi.unstubAllGlobals());
describe("provider HTTP adapter", () => {
  it("sends only authoritative paise, stable receipt and internal mapping", async () => {
    const gateway = {
      id: "order_fixture",
      amount: 24900,
      currency: "INR",
      receipt: "TKC-fixture",
      notes: { internal_order_id: "internal-id" },
      status: "created",
    };
    const fetcher = vi.fn(async () => Response.json(gateway));
    vi.stubGlobal("fetch", fetcher);
    const adapter = createPaymentProvider("rzp_test_fixture", "private-secret");
    const result = await adapter.createOrder({
      id: "internal-id",
      total: 24900,
      currency: "INR",
      order_number: "TKC-fixture",
    } as Parameters<typeof adapter.createOrder>[0]);
    expect(result).toEqual(gateway);
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe("https://api.razorpay.com/v1/orders");
    expect(JSON.parse(init[1].body as string)).toEqual({
      amount: 24900,
      currency: "INR",
      receipt: "TKC-fixture",
      partial_payment: false,
      notes: { internal_order_id: "internal-id" },
    });
    expect(init[1].cache).toBe("no-store");
  });
  it("validates provider JSON and sanitizes provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "raw-private-provider-error" }, { status: 401 }),
      ),
    );
    await expect(
      createPaymentProvider("rzp_test_fixture", "secret").getPayment(
        "pay_fixture",
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "pay_fixture", amount: "1" })),
    );
    await expect(
      createPaymentProvider("rzp_test_fixture", "secret").getPayment(
        "pay_fixture",
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});
describe("Supabase HTTP adapter", () => {
  it("uses privileged server RPCs and returns only an expiring signed URL", async () => {
    const requests: {
      url: string;
      body: unknown;
      authorization: string | null;
    }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({
          url,
          body: init?.body ? JSON.parse(init.body as string) : null,
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return Response.json(
          url.includes("/rpc/")
            ? { duplicate: false }
            : {
                signedURL:
                  "/object/sign/handbooks/handbooks/the-first-table.pdf?token=temporary",
              },
        );
      }),
    );
    const repo = createRepository(
      "https://fixture.supabase.co",
      "server-fixture-key",
    );
    const evidence = { event_key: "fixture" } as Parameters<
      typeof repo.applyPayment
    >[0];
    expect(await repo.applyPayment(evidence)).toEqual({ duplicate: false });
    expect(requests[0].body).toEqual({ p: evidence });
    expect(requests[0].authorization).toBe("Bearer server-fixture-key");
    const url = await repo.signDownload("handbooks/the-first-table.pdf", 60);
    expect(url).toContain("token=temporary");
    expect(requests[1].body).toEqual({ expiresIn: 60 });
  });
  it("sanitizes database errors instead of returning raw exceptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "42501", message: "raw-private-database-error" },
          { status: 403 },
        ),
      ),
    );
    const repo = createRepository(
      "https://fixture.supabase.co",
      "server-fixture-key",
    );
    await expect(repo.getOrder(crypto.randomUUID())).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
