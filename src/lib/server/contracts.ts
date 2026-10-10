import "server-only";
import type {
  OrderRecord,
  OrderItem,
  PricingQuote,
  PaymentEvidence,
  Entitlement,
  ProviderOrder,
  ProviderPayment,
  PurchaseSession,
  EmailDeliveryRecord,
  DeliveryClaim,
  DeliveryClaimResult,
  DeliveryPayload,
} from "@/lib/commerce/types";
export interface NewOrder {
  id: string;
  checkout_token_hash: string;
  request_hash: string;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  subtotal: number;
  total: number;
  payment_mode: "test" | "live";
  pricing: PricingQuote;
  items: OrderItem[];
}
export interface Repository {
  createOrder(data: NewOrder): Promise<OrderRecord>;
  getOrder(id: string): Promise<OrderRecord | null>;
  findByToken(hash: string): Promise<OrderRecord | null>;
  findByProviderOrder(id: string): Promise<OrderRecord | null>;
  claimGateway(id: string): Promise<boolean>;
  bindGateway(id: string, providerId: string): Promise<void>;
  applyPayment(evidence: PaymentEvidence): Promise<{ duplicate: boolean }>;
  getEntitlements(orderId: string): Promise<Entitlement[]>;
  createPurchaseSession(
    orderId: string,
    paymentId: string,
    hash: string,
  ): Promise<PurchaseSession>;
  getPurchaseSession(hash: string): Promise<PurchaseSession | null>;
  authorizeDownload(
    orderId: string,
    entitlementId: string,
    sessionHash: string,
  ): Promise<string | null>;
  signDownload(path: string, seconds: number): Promise<string>;
  rateLimit(key: string, limit: number, seconds: number): Promise<boolean>;
  getEmailDelivery(orderId: string): Promise<EmailDeliveryRecord | null>;
  claimEmailDelivery(input: {
    order_id: string;
    session_hash: string;
    email: string | null;
    provider: string;
    max_attempts: number;
    lease_seconds: number;
  }): Promise<DeliveryClaimResult>;
  claimFallbackDeliveries(input: {
    payment_mode: "test" | "live";
    provider: string;
    limit: number;
    grace_seconds: number;
    max_age_seconds: number;
    max_attempts: number;
    retry_after_seconds: number;
    lease_seconds: number;
  }): Promise<DeliveryClaim[]>;
  emailDeliveryPayload(claim: DeliveryClaim): Promise<DeliveryPayload | null>;
  finishEmailDelivery(
    input: DeliveryClaim &
      (
        | { outcome: "sent"; provider_message_id: string }
        | { outcome: "failed"; error: string }
      ),
  ): Promise<boolean>;
  // Private object read with the service role; never a public or signed URL.
  readPdf(path: string): Promise<Buffer>;
}
export interface PaymentProvider {
  createOrder(order: OrderRecord): Promise<ProviderOrder>;
  findOrders(receipt: string): Promise<ProviderOrder[]>;
  getOrder(id: string): Promise<ProviderOrder>;
  getPayment(id: string): Promise<ProviderPayment>;
  listPayments(orderId: string): Promise<ProviderPayment[]>;
}
