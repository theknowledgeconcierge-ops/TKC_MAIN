import "server-only";
import { createClient } from "@supabase/supabase-js";
import type {
  DeliveryClaim,
  DeliveryClaimResult,
  DeliveryPayload,
  EmailDeliveryRecord,
  Entitlement,
  OrderRecord,
  PaymentEvidence,
  PurchaseSession,
} from "@/lib/commerce/types";
import { PDF_BUCKET } from "@/lib/catalog/storage";
import type { Repository, NewOrder } from "./contracts";
import { HttpError, unavailable } from "./errors";

// Expected delivery refusals raised inside the locked SQL transition.
const deliveryErrors: Record<string, HttpError> = {
  delivery_not_authorized: new HttpError(
    404,
    "PURCHASE_SESSION_REQUIRED",
    "Open this purchase in the browser used to complete payment.",
  ),
  delivery_not_allowed: new HttpError(
    403,
    "PAYMENT_REQUIRED",
    "Book delivery requires a captured payment and is unavailable after a refund.",
  ),
  delivery_email_required: new HttpError(
    400,
    "DELIVERY_EMAIL_REQUIRED",
    "Enter the email address where your books should be sent.",
  ),
  delivery_locked: new HttpError(
    409,
    "DELIVERY_LOCKED",
    "Your books were already sent. The delivery email can no longer be changed.",
  ),
  delivery_too_many_changes: new HttpError(
    409,
    "DELIVERY_EMAIL_CHANGE_LIMIT",
    "The delivery email has been changed too many times. Download your books from this page.",
  ),
};

export function createRepository(url: string, key: string): Repository {
  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        }),
    },
  });
  function checked<T>(result: {
    data: T;
    error: { code?: string; message?: string } | null;
  }): T {
    if (result.error) {
      if (result.error.message === "idempotency_conflict")
        throw new HttpError(
          409,
          "CHECKOUT_CONFLICT",
          "This checkout already has different details.",
        );
      const delivery = deliveryErrors[result.error.message ?? ""];
      if (delivery)
        throw new HttpError(delivery.status, delivery.code, delivery.message);
      console.error(
        JSON.stringify({
          event: "database_operation_failed",
          code: result.error.code ?? "unknown",
        }),
      );
      throw unavailable();
    }
    return result.data;
  }
  async function rpc<T>(name: string, input: unknown): Promise<T> {
    return checked(await db.rpc(name, { p: input })) as T;
  }
  async function find(
    field: string,
    value: string,
  ): Promise<OrderRecord | null> {
    return checked(
      await db
        .from("orders")
        .select("*,order_items(*)")
        .eq(field, value)
        .maybeSingle(),
    ) as OrderRecord | null;
  }
  return {
    getOrder: (id) => find("id", id),
    findByToken: (hash) => find("checkout_token_hash", hash),
    findByProviderOrder: (id) => find("razorpay_order_id", id),
    async createOrder(input: NewOrder) {
      const row = await rpc<{ id: string }>("tkc_create_order", input);
      const order = await find("id", row.id);
      if (!order) throw unavailable();
      return order;
    },
    claimGateway: (id) => rpc<boolean>("tkc_claim_gateway", { order_id: id }),
    async bindGateway(id, providerId) {
      await rpc("tkc_bind_gateway", {
        order_id: id,
        razorpay_order_id: providerId,
      });
    },
    applyPayment: (evidence: PaymentEvidence) =>
      rpc("tkc_apply_payment", evidence),
    async getEntitlements(id) {
      return checked(
        await db
          .from("download_entitlements")
          .select("*")
          .eq("order_id", id)
          .is("revoked_at", null),
      ) as Entitlement[];
    },
    createPurchaseSession: (orderId, paymentId, hash) =>
      rpc<PurchaseSession>("tkc_create_purchase_session", {
        order_id: orderId,
        payment_id: paymentId,
        token_hash: hash,
      }),
    async getPurchaseSession(hash) {
      return checked(
        await db
          .from("purchase_sessions")
          .select("token_hash,order_id,payment_id,expires_at")
          .eq("token_hash", hash)
          .maybeSingle(),
      ) as PurchaseSession | null;
    },
    authorizeDownload: (orderId, entitlementId, sessionHash) =>
      rpc<string | null>("tkc_authorize_download", {
        order_id: orderId,
        entitlement_id: entitlementId,
        session_hash: sessionHash,
      }),
    async signDownload(path, seconds) {
      const result = checked(
        await db.storage
          .from(PDF_BUCKET)
          .createSignedUrl(path, seconds, { download: path.split("/").at(-1) }),
      );
      if (!result?.signedUrl) throw unavailable();
      const signed = new URL(result.signedUrl);
      if (signed.origin !== new URL(url).origin) throw unavailable();
      return result.signedUrl;
    },
    rateLimit: (key, limit, seconds) =>
      rpc<boolean>("tkc_rate_limit", { key, limit, seconds }),
    async getEmailDelivery(orderId) {
      return checked(
        await db
          .from("email_deliveries")
          .select(
            "id,order_id,delivery_email,status,attempt_count,lease_expires_at,delivery_email_locked_at,last_error,sent_at",
          )
          .eq("order_id", orderId)
          .maybeSingle(),
      ) as EmailDeliveryRecord | null;
    },
    claimEmailDelivery: (input) =>
      rpc<DeliveryClaimResult>("tkc_claim_email_delivery", input),
    claimFallbackDeliveries: (input) =>
      rpc<DeliveryClaim[]>("tkc_claim_fallback_deliveries", input),
    emailDeliveryPayload: (claim) =>
      rpc<DeliveryPayload | null>("tkc_email_delivery_payload", claim),
    finishEmailDelivery: (input) =>
      rpc<boolean>("tkc_finish_email_delivery", input),
    async readPdf(path) {
      const result = await db.storage.from(PDF_BUCKET).download(path);
      if (result.error || !result.data) {
        console.error(JSON.stringify({ event: "storage_read_failed" }));
        throw unavailable();
      }
      return Buffer.from(await result.data.arrayBuffer());
    },
  };
}
