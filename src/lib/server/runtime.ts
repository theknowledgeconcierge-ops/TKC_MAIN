import "server-only";
import { serverEnv } from "./env";
import { CommerceService } from "./commerce";
import { createRepository } from "./supabase";
import { createPaymentProvider } from "./razorpay";
import { DEFAULT_EMAIL_FROM, createResendProvider } from "./email";
export function commerce() {
  const env = serverEnv();
  return new CommerceService(
    createRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    createPaymentProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET),
    {
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    },
    {
      // Without a key, delivery fails safely; checkout and downloads are unaffected.
      provider: env.RESEND_API_KEY
        ? createResendProvider(env.RESEND_API_KEY)
        : null,
      from: env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    },
  );
}
