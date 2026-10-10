import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCheckoutPayment } from "@/lib/razorpay-checkout";
const payload = {
  internal_order_id: "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612",
  razorpay_order_id: "order_fixture",
  razorpay_payment_id: "pay_fixture",
  razorpay_signature: "a".repeat(64),
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("in-memory callback verification retry", () => {
  it("retries a lost response and delayed capture with the same provider proof", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "SERVICE_UNAVAILABLE", message: "Retry" } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ status: "payment_pending" }))
      .mockResolvedValueOnce(
        Response.json({ status: "paid", download_authorized: true }),
      );
    vi.stubGlobal("fetch", fetcher);
    const promise = verifyCheckoutPayment(payload);
    await vi.runAllTimersAsync();
    expect(await promise).toMatchObject({
      status: "paid",
      download_authorized: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [path, init] of fetcher.mock.calls) {
      expect(path).toBe("/api/payments/verify");
      expect(JSON.parse(init.body)).toEqual(payload);
      expect(init.credentials).toBe("same-origin");
    }
  });
  it("never retries a fabricated payment signature", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "INVALID_PAYMENT_SIGNATURE",
            message: "Invalid signature",
          },
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(verifyCheckoutPayment(payload)).rejects.toMatchObject({
      code: "INVALID_PAYMENT_SIGNATURE",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds processing retries without granting access", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () =>
      Response.json({ status: "payment_pending", download_authorized: false }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = expect(verifyCheckoutPayment(payload)).rejects.toMatchObject(
      { code: "PAYMENT_PROCESSING" },
    );
    await vi.runAllTimersAsync();
    await result;
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
