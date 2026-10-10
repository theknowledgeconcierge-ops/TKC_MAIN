import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/env-schema";

const configuration = {
  APP_URL: "https://preview.example.com",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key-not-real",
  RAZORPAY_KEY_ID: "rzp_test_fixture",
  RAZORPAY_KEY_SECRET: "fixture-secret-not-real",
};

describe("checkout environment policy", () => {
  it.each([
    { NODE_ENV: "development" },
    { NODE_ENV: "test" },
    {},
    { DEPLOY_CONTEXT: "dev", NODE_ENV: "development" },
    { DEPLOY_CONTEXT: "deploy-preview", NODE_ENV: "production" },
    { DEPLOY_CONTEXT: "branch-deploy", NODE_ENV: "production" },
  ])("allows test checkout without a webhook secret in %j", (context) => {
    expect(
      envSchema.safeParse({ ...configuration, ...context }).success,
    ).toBe(true);
    expect(
      envSchema.safeParse({
        ...configuration,
        ...context,
        RAZORPAY_WEBHOOK_SECRET: "",
      }).success,
    ).toBe(true);
  });

  it.each([
    { NODE_ENV: "production" },
    { DEPLOY_CONTEXT: "production", NODE_ENV: "production" },
    { DEPLOY_CONTEXT: "production", NODE_ENV: "development" },
    { DEPLOY_CONTEXT: "dev", NODE_ENV: "production" },
    { RAZORPAY_KEY_ID: "rzp_live_fixture", NODE_ENV: "development" },
    { RAZORPAY_KEY_ID: "rzp_live_fixture", DEPLOY_CONTEXT: "deploy-preview" },
    { RAZORPAY_KEY_ID: "rzp_live_fixture", DEPLOY_CONTEXT: "branch-deploy" },
  ])("requires a webhook secret in %j", (context) => {
    const result = envSchema.safeParse({ ...configuration, ...context });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "RAZORPAY_WEBHOOK_SECRET",
      );
    expect(
      envSchema.safeParse({
        ...configuration,
        ...context,
        RAZORPAY_WEBHOOK_SECRET: "fixture-webhook-secret-not-real",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed supplied secret even in a test preview", () => {
    expect(
      envSchema.safeParse({
        ...configuration,
        DEPLOY_CONTEXT: "deploy-preview",
        RAZORPAY_WEBHOOK_SECRET: "short",
      }).success,
    ).toBe(false);
  });

  it("preserves the exact configured webhook secret for HMAC verification", () => {
    const secret = " fixture-webhook-secret-not-real ";
    const result = envSchema.parse({
      ...configuration,
      NODE_ENV: "production",
      RAZORPAY_WEBHOOK_SECRET: secret,
    });
    expect(result.RAZORPAY_WEBHOOK_SECRET).toBe(secret);
  });
});
