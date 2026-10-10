import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { activeBooks } from "../src/lib/catalog";
import { environment } from "./environment";
const env = environment();
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
  },
});
try {
  for (const [table, columns] of [
    ["orders", "id,checkout_token_hash,checkout_expires_at"],
    ["order_items", "order_id,product_id"],
    ["payments", "id,order_id"],
    ["payment_events", "event_key"],
    ["download_entitlements", "id,order_id,payment_id"],
    ["rate_limits", "key"],
    ["purchase_sessions", "token_hash,order_id,payment_id,expires_at"],
    ["email_deliveries", "id,order_id,status,delivery_email,idempotency_key"],
  ]) {
    // GET with zero rows validates the current schema without reading customer data.
    // HEAD responses can lose the PostgREST error body in the SDK.
    const { error } = await db.from(table).select(columns).limit(0);
    if (error)
      throw new Error(
        `Cannot access ${table}. Apply migrations and check server credentials.`,
      );
  }
  console.log("Database: all eight tables accessible with server credentials");
  const { data: denied, error: authorizationError } = await db.rpc(
    "tkc_authorize_download",
    {
      p: {
        order_id: randomUUID(),
        entitlement_id: randomUUID(),
        session_hash: "0".repeat(64),
      },
    },
  );
  if (authorizationError || denied !== null)
    throw new Error(
      "Purchase authorization RPC is missing or unsafe. Apply the purchase-session migration.",
    );
  const { data: bucket, error } = await db.storage.getBucket("handbooks");
  if (error || !bucket || bucket.public)
    throw new Error("Storage bucket must exist and be private.");
  const { data: files, error: listError } = await db.storage
    .from("handbooks")
    .list("handbooks", { limit: 100 });
  if (listError) throw new Error("Cannot list private handbook objects.");
  for (const book of activeBooks) {
    const file = files?.find((item) => item.name === `${book.id}.pdf`);
    if (
      !file ||
      !file.metadata?.size ||
      file.metadata.mimetype !== "application/pdf"
    )
      throw new Error(`Missing or invalid private PDF: ${book.id}`);
    const url = new URL(
      `/storage/v1/object/public/handbooks/handbooks/${book.id}.pdf`,
      env.SUPABASE_URL,
    );
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) throw new Error(`Unsafe public PDF access: ${book.id}`);
  }
  console.log(
    `Storage: ${activeBooks.length} PDFs present; anonymous public object requests rejected`,
  );
  const response = await fetch("https://api.razorpay.com/v1/orders?count=1", {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
    },
  });
  if (!response.ok)
    throw new Error(
      "Razorpay authentication failed. Check the configured key pair.",
    );
  console.log(
    `Razorpay: ${env.RAZORPAY_KEY_ID.startsWith("rzp_live_") ? "live" : "test"} API authentication accepted`,
  );
  if (env.RESEND_API_KEY) {
    // Read-only: reports sender-domain verification. Sending-only keys cannot list domains.
    const domain = (env.EMAIL_FROM ?? "books@pixelnpalm.com")
      .replace(/^.*</, "")
      .replace(/>$/, "")
      .split("@")[1];
    const domains = await fetch("https://api.resend.com/domains", {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "User-Agent": "pixelnpalm-store/1.0",
      },
    });
    if (domains.status === 401 || domains.status === 403)
      console.log(
        "Resend: key accepted for sending only; verify the sender domain in the Resend dashboard",
      );
    else if (!domains.ok)
      throw new Error("Resend authentication failed. Check RESEND_API_KEY.");
    else {
      const { data } = (await domains.json()) as {
        data?: { name: string; status: string }[];
      };
      const match = data?.find((item) => item.name === domain);
      console.log(
        `Resend: sender domain ${domain} ${match ? `status ${match.status}` : "not added yet"}`,
      );
    }
  } else
    console.log(
      "Resend: RESEND_API_KEY not set; email delivery fails safely and downloads still work",
    );
  console.log(
    "Read-only checks passed. Complete the documented checkout/webhook/refund smoke test separately.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Integration check failed.",
  );
  process.exitCode = 1;
}
