import "server-only";
import type {
  OrderRecord,
  OrderItem,
  PricingQuote,
  PaymentEvidence,
  Entitlement,
  ProviderOrder,
  ProviderPayment,
} from "@/lib/commerce/types";
export interface NewOrder {
  id: string;
  access_token_hash: string;
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
  hasPreviousPurchase(email: string): Promise<boolean>;
  claimGateway(id: string): Promise<boolean>;
  bindGateway(id: string, providerId: string): Promise<void>;
  applyPayment(evidence: PaymentEvidence): Promise<{ duplicate: boolean }>;
  getEntitlements(orderId: string): Promise<Entitlement[]>;
  signDownload(path: string, seconds: number): Promise<string>;
  rateLimit(key: string, limit: number, seconds: number): Promise<boolean>;
}
export interface PaymentProvider {
  createOrder(order: OrderRecord): Promise<ProviderOrder>;
  findOrders(receipt: string): Promise<ProviderOrder[]>;
  getOrder(id: string): Promise<ProviderOrder>;
  getPayment(id: string): Promise<ProviderPayment>;
  listPayments(orderId: string): Promise<ProviderPayment[]>;
}
