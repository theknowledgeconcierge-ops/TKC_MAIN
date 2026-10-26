import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMAIL_FROM,
  MAX_ATTACHMENT_BYTES,
  assertWithinEmailLimit,
  createResendProvider,
  deliveryEmailContent,
  displayOrderNumber,
} from "@/lib/server/email";
import { renderPurchaseDeliveryEmail } from "@/lib/email/purchase-delivery-email";
import { activeBooks } from "@/lib/catalog";
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

describe("purchase delivery email template", () => {
  const titles = activeBooks.filter(book => book.seriesId === "restaurant-playbooks").map((book) => book.title);
  const uuidHex = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
  const render = (overrides: Partial<Parameters<typeof renderPurchaseDeliveryEmail>[0]> = {}) =>
    renderPurchaseDeliveryEmail({
      firstName: "Rahul",
      displayOrderId: "TKC-12345678",
      bookTitles: titles,
      formattedAmount: "₹499",
      ...overrides,
    });
  // Everything a recipient's client could fetch or follow.
  const urls = (html: string) =>
    [...html.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/gi)].map((match) => match[1]);

  it("renders the agreed subject, hero, greeting, summary and footer in both parts", () => {
    const email = render();
    expect(email.subject).toBe("Your Pixel n Palm books are here 📚");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("PIXEL N PALM");
      expect(part).toContain("Your books are here.");
      expect(part).toContain("Hi Rahul,");
      expect(part).toContain(
        "Your Pixel n Palm books are attached to this email and ready to read.",
      );
      expect(part).toContain("TKC-12345678");
      expect(part).toContain("PDF attachments");
      expect(part).toContain("Digital books for curious minds.");
      expect(part).toContain("pixelnpalm.com");
      expect(part).toContain(
        "This is a transactional email sent because you purchased digital books from Pixel n Palm.",
      );
      expect(part).not.toMatch(/unsubscribe/i);
    }
    expect(email.text).toContain(
      "Your books are attached directly to this email. Keep this email somewhere safe so you can access them again whenever you need them.",
    );
    expect(email.text).toMatch(/Order: TKC-12345678\nBooks: 5\nAmount paid: ₹499\nDelivery: PDF attachments/);
  });
  it("lists a five-book order in order with zero-padded numbers", () => {
    const { html, text } = render();
    titles.forEach((title, index) => {
      const number = String(index + 1).padStart(2, "0");
      expect(text).toContain(`${number}  ${title}`);
      expect(html).toContain(title);
    });
    expect(text.indexOf(titles[0])).toBeLessThan(text.indexOf(titles[4]));
    expect(text).not.toContain("06  ");
  });
  it("renders a one-book order with singular copy and only that title", () => {
    const { html, text } = render({ bookTitles: [titles[2]] });
    expect(text).toContain("Your book is here.");
    expect(text).toContain("Books: 1");
    expect(text).toContain(`01  ${titles[2]}`);
    expect(text).toContain("Your book is attached directly to this email.");
    for (const other of titles.filter((title) => title !== titles[2])) {
      expect(text).not.toContain(other);
      expect(html).not.toContain(other);
    }
    expect(() => render({ bookTitles: [] })).toThrow();
  });
  it("lets long book titles wrap instead of widening the layout", () => {
    const long = "An Exceptionally Long Restaurant Operations Handbook Title ".repeat(4).trim();
    const { html, text } = render({ bookTitles: [long] });
    expect(text).toContain(`01  ${long}`);
    expect(html).toContain(long);
    expect(html).toMatch(/word-break:break-word;overflow-wrap:anywhere;/);
    expect(html).toContain('max-width:600px');
  });
  it("escapes customer-controlled text and keeps special characters", () => {
    const { html, text } = render({
      firstName: `<img src=x onerror="alert(1)">&'Zoë`,
      displayOrderId: "TKC-<b>1</b>",
      formattedAmount: "₹499",
    });
    expect(html).toContain("Hi &lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;Zoë,");
    expect(html).toContain("TKC-&lt;b&gt;1&lt;/b&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=\"");
    // Plain text is not HTML: it keeps the characters but never breaks onto new lines.
    expect(text).toContain(`Hi <img src=x onerror="alert(1)">&'Zoë,`);
    expect(render({ firstName: "Søren\r\nBcc: x@example.com" }).text).toContain(
      "Hi Søren Bcc: x@example.com,",
    );
    expect(render({ firstName: "   " }).text).toContain("Hi there,");
  });
  it("formats ₹499 from integer paise through the server adapter", () => {
    const { html, text } = deliveryEmailContent({
      customerName: "Rahul Sharma",
      orderNumber: `TKC-${uuidHex}`,
      amountPaise: 49900,
      titles,
    });
    expect(text).toContain("Amount paid: ₹499");
    expect(html).toContain("₹499");
    expect(text).toContain("Hi Rahul,");
    expect(text).toContain("Order: TKC-0F1E2D3C");
    expect(displayOrderNumber("TKC-abcdef0123")).toBe("TKC-ABCDEF01");
  });
  it("contains no internal order UUID, storage URL, session token, image or tracking pixel", () => {
    const { html, text } = deliveryEmailContent({
      customerName: "Rahul",
      orderNumber: `TKC-${uuidHex}`,
      amountPaise: 49900,
      titles,
    });
    for (const part of [html, text]) {
      expect(part).not.toContain(uuidHex);
      expect(part).not.toMatch(/supabase|storage\/v1|token=|tkc_session|tkc_checkout|__Host-/i);
    }
    expect(html).not.toMatch(/<img|<script|<link|<iframe|<form|url\(|@import|javascript:/i);
    // The only followable URL is the static storefront link; nothing carries customer data.
    expect(urls(html)).toEqual(["https://pixelnpalm.com"]);
  });
  it("is deterministic so an idempotent retry sends an identical payload", () => {
    expect(render()).toEqual(render());
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
