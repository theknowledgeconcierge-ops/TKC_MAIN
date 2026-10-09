import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { orderIdSchema } from "../src/lib/commerce/validation";
import { environment } from "./environment";
const id = orderIdSchema.parse(process.argv[2]);
if (process.argv[3] !== "--ownership-verified")
  throw new Error(
    "Verify the customer's ownership against Razorpay records first. Then use: npm run order:recover -- ORDER_UUID --ownership-verified",
  );
const env = environment();
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const token = randomBytes(32).toString("base64url");
const { data, error } = await db
  .from("orders")
  .update({
    access_token_hash: createHash("sha256").update(token).digest("hex"),
    access_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq("id", id)
  .select("id")
  .single();
if (error || !data)
  throw new Error(
    "Order recovery failed. Check the order ID and database configuration.",
  );
const url = new URL("/thank-you", env.APP_URL);
url.searchParams.set("order", id);
url.hash = `access=${token}`;
console.log(url.toString());
