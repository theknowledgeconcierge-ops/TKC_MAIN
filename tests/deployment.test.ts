import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CONTEXT", "");
  vi.stubEnv("DEPLOY_PRIME_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Netlify build metadata", () => {
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
