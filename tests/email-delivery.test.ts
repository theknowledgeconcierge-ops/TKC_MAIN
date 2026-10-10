import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMAIL_FROM,
  MAX_ATTACHMENT_BYTES,
  assertWithinEmailLimit,
  createResendProvider,
  deliveryEmailContent,
  displayOrderNumber,
} from "@/lib/server/email";
import { envSchema } from "@/lib/env-schema";
import emailDeliveryFallback, {
  config as fallbackSchedule,
} from "../netlify/functions/email-delivery-fallback";

const message = {
  from: DEFAULT_EMAIL_FROM,
  to: "buyer@example.com",
  subject: "Your Pixel n Palm books are here 📚",
  html: "<p>Hi</p>",
  text: "Hi",
  attachments: [
    { filename: "The First Table.pdf", content: Buffer.from("%PDF-1.7 a") },
  ],
  idempotencyKey: "pnp-delivery-1-v1",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Resend provider adapter", () => {
  it("sends one Base64 attachment message with idempotency and User-Agent headers", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createResendProvider("re_fixture_key_123").send(message),
    ).resolves.toEqual({ id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_fixture_key_123");
    expect(headers.get("idempotency-key")).toBe("pnp-delivery-1-v1");
    expect(headers.get("user-agent")).toMatch(/\S/);
    expect(JSON.parse(init.body as string)).toEqual({
      from: DEFAULT_EMAIL_FROM,
      to: ["buyer@example.com"],
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: [
        {
          filename: "The First Table.pdf",
          content: Buffer.from("%PDF-1.7 a").toString("base64"),
        },
      ],
    });
  });
  it.each([
    [500, {}, "provider_unavailable"],
    [429, {}, "provider_rate_limited"],
    [403, { name: "validation_error" }, "provider_rejected"],
    [409, { name: "concurrent_idempotent_requests" }, "provider_busy"],
    [409, { name: "invalid_idempotent_request" }, "provider_conflict"],
  ])("maps HTTP %i to a payload-free error code", async (status, body, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body, { status })),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      createResendProvider("re_fixture_key_123").send(message),
    ).rejects.toMatchObject({ code });
    expect(JSON.stringify(log.mock.calls)).not.toContain("buyer@example.com");
    log.mockRestore();
  });
  it("treats a network failure or timeout as an unknown outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    );
    await expect(
      createResendProvider("re_fixture_key_123").send(message),
    ).rejects.toMatchObject({ code: "provider_timeout" });
  });
});

describe("delivery email content and limits", () => {
  const content = deliveryEmailContent({
    customerName: "  <Asha> Kumar ",
    orderNumber: "TKC-0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    amountPaise: 49900,
    paymentReference: "pay_ABC123",
    titles: ["The First Table", "Empty Tables to Full House"],
  });
  it("uses the agreed subject, first name, amount and safe order reference", () => {
    expect(content.subject).toBe("Your Pixel n Palm books are here 📚");
    expect(content.text).toContain("Hi <Asha>,");
    expect(content.text).toContain("Order: TKC-0F1E2D3C");
    expect(content.text).toContain("Amount paid: ₹499");
    expect(content.text).toContain("- Empty Tables to Full House");
    expect(content.text).toContain(
      "Keep this email safe so you can access your books again whenever you need them.",
    );
    // The full order number embeds the internal order UUID.
    expect(content.text + content.html).not.toContain(
      "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    );
    expect(displayOrderNumber("TKC-abcdef0123")).toBe("TKC-ABCDEF01");
  });
  it("escapes customer-controlled text in HTML", () => {
    expect(content.html).toContain("Hi &lt;Asha&gt;,");
    expect(content.html).not.toContain("<Asha>");
  });
  it("rejects attachments beyond the provider limit after Base64 encoding", () => {
    const limit = Math.floor((MAX_ATTACHMENT_BYTES / 4) * 3);
    expect(() =>
      assertWithinEmailLimit([
        { filename: "a.pdf", content: Buffer.alloc(limit) },
      ]),
    ).not.toThrow();
    expect(() =>
      assertWithinEmailLimit([
        { filename: "a.pdf", content: Buffer.alloc(limit + 3) },
      ]),
    ).toThrow(expect.objectContaining({ code: "attachments_too_large" }));
  });
});

describe("close-tab fallback scheduler", () => {
  it("runs every five minutes and calls only the protected internal endpoint", async () => {
    expect(fallbackSchedule).toEqual({ schedule: "*/5 * * * *" });
    vi.stubEnv("APP_URL", "https://pixelnpalm.com");
    vi.stubEnv("EMAIL_DELIVERY_CRON_SECRET", "s".repeat(40));
    const fetcher = vi.fn(async () => Response.json({ claimed: 0 }));
    vi.stubGlobal("fetch", fetcher);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await emailDeliveryFallback();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://pixelnpalm.com/api/internal/email-deliveries");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${"s".repeat(40)}`,
    );
    log.mockRestore();
  });
  it("does nothing without its secret", async () => {
    vi.stubEnv("APP_URL", "https://pixelnpalm.com");
    vi.stubEnv("EMAIL_DELIVERY_CRON_SECRET", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await emailDeliveryFallback();
    expect(fetcher).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("email environment configuration", () => {
  const base = {
    APP_URL: "http://localhost:3000",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key-not-real",
    RAZORPAY_KEY_ID: "rzp_test_fixture",
    RAZORPAY_KEY_SECRET: "fixture-secret-not-real",
  };
  it("keeps email delivery optional so checkout never depends on it", () => {
    expect(envSchema.safeParse(base).success).toBe(true);
    expect(
      envSchema.safeParse({
        ...base,
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        EMAIL_DELIVERY_CRON_SECRET: "",
      }).success,
    ).toBe(true);
  });
  it("accepts a Resend key, branded sender and strong scheduler secret", () => {
    expect(
      envSchema.safeParse({
        ...base,
        RESEND_API_KEY: "re_123456789abc",
        EMAIL_FROM: DEFAULT_EMAIL_FROM,
        EMAIL_DELIVERY_CRON_SECRET: "x".repeat(32),
      }).success,
    ).toBe(true);
  });
  it.each([
    { RESEND_API_KEY: "sk_wrong" },
    { EMAIL_FROM: "Pixel n Palm <not an address>" },
    { EMAIL_DELIVERY_CRON_SECRET: "short" },
  ])("rejects malformed email configuration %j", (invalid) => {
    expect(envSchema.safeParse({ ...base, ...invalid }).success).toBe(false);
  });
});
