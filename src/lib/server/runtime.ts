import "server-only";
import { serverEnv } from "./env";
import { CommerceService } from "./commerce";
import { createRepository } from "./supabase";
import { createPaymentProvider } from "./razorpay";
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
  );
}
