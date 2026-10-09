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
  RAZORPAY_WEBHOOK_SECRET: z.string().min(20),
});
