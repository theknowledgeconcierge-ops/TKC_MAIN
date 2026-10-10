import { z } from "zod";
export const envSchema = z.object({
  APP_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  }, "Use an HTTPS origin, or HTTP localhost during development"),
  SUPABASE_URL: z
    .url()
    .refine(
      (value) =>
        new URL(value).protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(new URL(value).hostname),
    ),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
  RAZORPAY_KEY_SECRET: z.string().min(16),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(20).optional(),
  ),
  // Email delivery is optional configuration: checkout and downloads never depend on it.
  RESEND_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^re_[A-Za-z0-9_]{8,}$/).optional(),
  ),
  EMAIL_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .max(200)
      .regex(/^([^<>@\r\n]{1,80} <)?[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>?$/)
      .optional(),
  ),
  EMAIL_DELIVERY_CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  // These are runtime/platform values, not additional operator credentials.
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  DEPLOY_CONTEXT: z
    .enum(["", "dev", "deploy-preview", "branch-deploy", "production"])
    .optional(),
}).superRefine((env, context) => {
  const testMode = env.RAZORPAY_KEY_ID.startsWith("rzp_test_");
  const preview = ["deploy-preview", "branch-deploy"].includes(
    env.DEPLOY_CONTEXT ?? "",
  );
  const local =
    (!env.DEPLOY_CONTEXT || env.DEPLOY_CONTEXT === "dev") &&
    env.NODE_ENV !== "production";
  if (!env.RAZORPAY_WEBHOOK_SECRET && !(testMode && (preview || local)))
    context.addIssue({
      code: "custom",
      path: ["RAZORPAY_WEBHOOK_SECRET"],
      message: "Required for production deployments and live Razorpay credentials",
    });
});
