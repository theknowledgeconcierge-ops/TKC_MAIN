import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CONTEXT", "");
  vi.stubEnv("DEPLOY_PRIME_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Netlify build metadata", () => {
  it("limits production noindex response headers to private routes", async () => {
    vi.stubEnv("CONTEXT", "production");
    const { default: config } = await import("../next.config");
    const headers = await config.headers!();
    const noindex = headers.filter((rule) =>
      rule.headers.some((header) => header.key === "X-Robots-Tag"),
    );
    expect(noindex.map((rule) => rule.source)).toEqual(
      expect.arrayContaining([
        "/api/:path*",
        "/thank-you/:path*",
        "/checkout/:path*",
        "/payment/:path*",
        "/orders/:path*",
        "/downloads/:path*",
        "/purchases/:path*",
      ]),
    );
    expect(noindex.some((rule) => rule.source === "/:path*")).toBe(false);
  });

  it("adds a global noindex response header for preview builds", async () => {
    vi.stubEnv("CONTEXT", "deploy-preview");
    vi.stubEnv("DEPLOY_PRIME_URL", "https://preview.example.com");
    const { default: config } = await import("../next.config");
    expect(await config.headers!()).toContainEqual({
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    });
  });

  it("normalizes trailing slashes and permanently redirects only the legacy site alias", async () => {
    const { default: config } = await import("../next.config");
    expect(config.trailingSlash).toBe(false);
    expect(await config.redirects!()).toEqual([
      {
        source: "/:path*",
        has: [{ type: "host", value: "stately-praline-26f65f.netlify.app" }],
        destination: "https://pixelnpalm.com/:path*",
        permanent: true,
      },
    ]);
  });
  it.each(["deploy-preview", "branch-deploy"])(
    "locks %s checkout to its primary deployment origin",
    async (context) => {
      vi.stubEnv("CONTEXT", context);
      vi.stubEnv("DEPLOY_PRIME_URL", "https://preview--store.example.com");
      vi.stubEnv("APP_URL", "https://production.example.com");
      const { default: config } = await import("../next.config");
      expect(config.env).toEqual({
        DEPLOY_CONTEXT: context,
        APP_URL: "https://preview--store.example.com",
      });
    },
  );

  it.each(["", "production", "dev"])(
    "keeps the runtime APP_URL authoritative for context %j",
    async (context) => {
      vi.stubEnv("CONTEXT", context);
      vi.stubEnv("DEPLOY_PRIME_URL", "https://unrelated.example.com");
      const { default: config } = await import("../next.config");
      expect(config.env).toEqual({ DEPLOY_CONTEXT: context });
    },
  );

  it.each([
    "",
    "http://preview.example.com",
    "https://user:password@preview.example.com",
    "https://preview.example.com/unexpected-path",
    "https://preview.example.com?unexpected=query",
    "https://preview.example.com/#unexpected-fragment",
  ])("fails closed on an invalid preview origin %j", async (url) => {
    vi.stubEnv("CONTEXT", "deploy-preview");
    vi.stubEnv("DEPLOY_PRIME_URL", url);
    await expect(import("../next.config")).rejects.toThrow(
      "Netlify preview requires DEPLOY_PRIME_URL to be an HTTPS origin",
    );
  });

  it("never embeds privileged credentials in Next.js build environment", async () => {
    vi.stubEnv("CONTEXT", "deploy-preview");
    vi.stubEnv("DEPLOY_PRIME_URL", "https://preview.example.com");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-privileged-service-key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "fixture-privileged-payment-key");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "fixture-privileged-webhook-key");
    const { default: config } = await import("../next.config");
    expect(Object.keys(config.env ?? {}).sort()).toEqual([
      "APP_URL",
      "DEPLOY_CONTEXT",
    ]);
    expect(JSON.stringify(config.env)).not.toContain("fixture-privileged");
  });
});
