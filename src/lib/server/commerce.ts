import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { activeBooks, type ProductId } from "@/lib/catalog";
import { pdfPaths } from "@/lib/catalog/storage";
import { quoteFor } from "@/lib/commerce/pricing";
import {
  orderIdSchema,
  paymentId,
  providerOrderId,
  verifySchema,
  tokenSchema,
  type CreateOrderInput,
} from "@/lib/commerce/validation";
import type {
  CheckoutOrder,
  OrderRecord,
  PublicOrder,
  ProviderOrder,
  ProviderPayment,
  PaymentEvidence,
} from "@/lib/commerce/types";
import type { Repository, PaymentProvider } from "./contracts";
import { HttpError } from "./errors";
import {
  assertCapturedPayment,
  assertPaymentMatches,
  authorizeCheckout,
  hashToken,
  verifySignature,
} from "./security";

const webhookSchema = z.object({
  event: z.string().min(1).max(100),
  payload: z.object({
    payment: z.object({ entity: z.object({ id: paymentId }) }).optional(),
    order: z.object({ entity: z.object({ id: providerOrderId }) }).optional(),
    refund: z
      .object({ entity: z.object({ payment_id: paymentId }) })
      .optional(),
  }),
});
export class CommerceService {
  constructor(
    readonly repo: Repository,
    readonly provider: PaymentProvider,
    private readonly config: {
      keyId: string;
      keySecret: string;
      webhookSecret?: string;
    },
  ) {}
  get mode(): "test" | "live" {
    return this.config.keyId.startsWith("rzp_live_") ? "live" : "test";
  }

  async create(input: CreateOrderInput): Promise<CheckoutOrder> {
    const ids = [...new Set(input.book_ids)].sort();
    const requestHash = hashToken(
      JSON.stringify({
        ids,
        name: input.full_name,
        email: input.email,
        mobile: input.mobile,
        coupon: input.coupon_code?.toUpperCase() || null,
      }),
    );
    const tokenHash = hashToken(input.checkout_token);
    let order = await this.repo.findByToken(tokenHash);
    if (order && order.request_hash !== requestHash)
      throw new HttpError(
        409,
        "CHECKOUT_CONFLICT",
        "This checkout already has different details. Start a new checkout.",
      );
    if (!order) {
      let pricing;
      try {
        pricing = quoteFor(ids, input.coupon_code);
      } catch {
        throw new HttpError(
          400,
          "INVALID_SELECTION",
          "Please review your books and coupon code.",
        );
      }
      order = await this.repo.createOrder({
        id: randomUUID(),
        checkout_token_hash: tokenHash,
        request_hash: requestHash,
        customer_name: input.full_name,
        customer_email: input.email,
        customer_mobile: input.mobile,
        subtotal: pricing.regular_total_inr * 100,
        total: pricing.total_inr * 100,
        payment_mode: this.mode,
        pricing,
        items: ids.map((id) => {
          const book = activeBooks.find((b) => b.id === id)!;
          return {
            product_id: book.id,
            product_title: book.title,
            unit_price: book.price_paise,
            quantity: 1,
            storage_path: pdfPaths[book.id as ProductId],
          };
        }),
      });
    }
    authorizeCheckout(order, input.checkout_token);
    if (order.status === "paid" || order.status === "refunded")
      throw new HttpError(
        409,
        "ORDER_COMPLETED",
        "This order already has a payment. Open your purchase page to check its status.",
      );
    const gatewayId = await this.ensureGateway(order);
    return {
      key_id: this.config.keyId,
      payment_mode: this.mode,
      internal_order_id: order.id,
      order_number: order.order_number,
      razorpay_order_id: gatewayId,
      amount_paise: order.total,
      currency: order.currency,
      pricing: order.pricing,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_mobile: order.customer_mobile,
      description: `${order.order_items.length} Knowledge Concierge handbooks`,
    };
  }

  private assertProviderOrder(
    order: OrderRecord,
    providerOrder: ProviderOrder,
  ) {
    this.assertMode(order);
    if (
      providerOrder.amount !== order.total ||
      providerOrder.currency !== order.currency ||
      providerOrder.receipt !== order.order_number ||
      providerOrder.notes.internal_order_id !== order.id ||
      (order.razorpay_order_id && order.razorpay_order_id !== providerOrder.id)
    ) {
      throw new HttpError(
        409,
        "PROVIDER_ORDER_MISMATCH",
        "The payment order needs reconciliation. Please try again shortly.",
      );
    }
  }
  private assertMode(order: OrderRecord) {
    if (order.payment_mode !== this.mode)
      throw new HttpError(
        409,
        "PAYMENT_MODE_MISMATCH",
        "This purchase belongs to a different payment environment. Please contact support using your saved purchase reference.",
      );
  }
  private async ensureGateway(order: OrderRecord): Promise<string> {
    this.assertMode(order);
    if (order.razorpay_order_id) return order.razorpay_order_id;
    // A timeout can mean Razorpay accepted the request. Always recover the stable receipt first.
    if (order.gateway_started_at) {
      const matches = (
        await this.provider.findOrders(order.order_number)
      ).filter((o) => o.receipt === order.order_number);
      if (matches.length > 1)
        throw new HttpError(
          409,
          "PROVIDER_ORDER_CONFLICT",
          "This order needs reconciliation. Please keep your purchase reference.",
        );
      if (matches[0]) {
        this.assertProviderOrder(order, matches[0]);
        await this.repo.bindGateway(order.id, matches[0].id);
        return matches[0].id;
      }
    }
    if (!(await this.repo.claimGateway(order.id)))
      throw new HttpError(
        409,
        "CHECKOUT_PROCESSING",
        "Your checkout is being prepared. Wait a moment, then retry the same checkout.",
      );
    const gateway = await this.provider.createOrder(order);
    this.assertProviderOrder(order, gateway);
    await this.repo.bindGateway(order.id, gateway.id);
    return gateway.id;
  }

  async authorizedCheckout(id: string, token?: string): Promise<OrderRecord> {
    const order = await this.repo.getOrder(id);
    authorizeCheckout(order, token);
    return order!;
  }
  async sessionOrder(id: string, token?: string): Promise<OrderRecord> {
    if (!token || !tokenSchema.safeParse(token).success)
      throw new HttpError(
        404,
        "PURCHASE_SESSION_REQUIRED",
        "Open this purchase in the browser used to complete payment.",
      );
    const session = await this.repo.getPurchaseSession(hashToken(token));
    if (
      !session ||
      session.order_id !== id ||
      Date.parse(session.expires_at) <= Date.now()
    )
      throw new HttpError(
        404,
        "PURCHASE_SESSION_REQUIRED",
        "Your purchase session is invalid or expired.",
      );
    const order = await this.repo.getOrder(id);
    if (!order || order.razorpay_payment_id !== session.payment_id)
      throw new HttpError(
        404,
        "PURCHASE_SESSION_REQUIRED",
        "This purchase session is unavailable.",
      );
    return order;
  }
  // Called only after the payment verification route has validated provider evidence.
  async issuePurchaseSession(id: string, paymentId: string) {
    const token = randomBytes(32).toString("base64url");
    await this.repo.createPurchaseSession(id, paymentId, hashToken(token));
    return token;
  }
  async publicOrder(
    order: OrderRecord,
    purchaseSession = false,
  ): Promise<PublicOrder> {
    const entitlements =
      order.status === "paid" && purchaseSession
        ? await this.repo.getEntitlements(order.id)
        : [];
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      books: order.order_items.map((item) => item.product_id),
      pricing: order.pricing,
      created_at: order.created_at,
      payment_mode: order.payment_mode,
      razorpay_payment_id: order.razorpay_payment_id,
      checkout_expires_at: order.checkout_expires_at,
      download_authorized: order.status === "paid" && purchaseSession,
      entitlements: entitlements.map(({ id, product_id }) => ({
        id,
        product_id,
      })),
    };
  }
  async read(id: string, checkoutToken?: string, sessionToken?: string) {
    const order = sessionToken
      ? await this.sessionOrder(id, sessionToken)
      : await this.authorizedCheckout(id, checkoutToken);
    return this.publicOrder(order, !!sessionToken);
  }

  async resume(id: string, token?: string): Promise<CheckoutOrder> {
    const current = await this.reconcile(id, token);
    if (current.status === "paid" || current.status === "refunded")
      throw new HttpError(
        409,
        "ORDER_COMPLETED",
        "This order already has a payment. Open My purchases before paying again.",
      );
    const order = await this.authorizedCheckout(id, token);
    const gatewayId = await this.ensureGateway(order);
    return {
      key_id: this.config.keyId,
      payment_mode: this.mode,
      internal_order_id: order.id,
      order_number: order.order_number,
      razorpay_order_id: gatewayId,
      amount_paise: order.total,
      currency: order.currency,
      pricing: order.pricing,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_mobile: order.customer_mobile,
      description: `${order.order_items.length} Knowledge Concierge handbooks`,
    };
  }

  private async apply(
    order: OrderRecord,
    payment: ProviderPayment,
    event: { key: string; type: string; providerId?: string },
  ): Promise<{ duplicate: boolean }> {
    assertPaymentMatches(order, payment);
    let status: PaymentEvidence["status"];
    if (
      payment.amount_refunded > 0 &&
      ["captured", "refunded"].includes(payment.status)
    )
      status = "refunded";
    else if (payment.status === "captured" && payment.captured)
      status = "captured";
    else if (payment.status === "failed") status = "failed";
    else return { duplicate: false };
    return this.repo.applyPayment({
      order_id: order.id,
      razorpay_order_id: payment.order_id,
      payment_id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status,
      amount_refunded: payment.amount_refunded,
      event_key: `${event.key}:${status}:${payment.amount_refunded}`,
      event_type: event.type,
      provider_event_id: event.providerId,
    });
  }
  async verify(
    input: z.infer<typeof verifySchema>,
    token?: string,
  ): Promise<PublicOrder> {
    const order = await this.authorizedCheckout(input.internal_order_id, token);
    this.assertMode(order);
    if (
      input.razorpay_order_id !== order.razorpay_order_id ||
      !verifySignature(
        `${order.razorpay_order_id}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        this.config.keySecret,
      )
    ) {
      throw new HttpError(
        400,
        "INVALID_PAYMENT_SIGNATURE",
        "Payment verification failed. Check your purchase page before paying again.",
      );
    }
    const payment = await this.provider.getPayment(input.razorpay_payment_id);
    if (payment.id !== input.razorpay_payment_id)
      throw new HttpError(
        409,
        "PAYMENT_MISMATCH",
        "Payment reference mismatch.",
      );
    this.assertProviderOrder(
      order,
      await this.provider.getOrder(payment.order_id),
    );
    await this.apply(order, payment, {
      key: `verify:${payment.id}`,
      type: "callback.verified",
    });
    const current = await this.read(order.id, token);
    if (current.status === "paid")
      assertCapturedPayment(payment, current.razorpay_payment_id);
    return current;
  }
  async reconcile(
    id: string,
    checkoutToken?: string,
    sessionToken?: string,
  ): Promise<PublicOrder> {
    let order = sessionToken
      ? await this.sessionOrder(id, sessionToken)
      : await this.authorizedCheckout(id, checkoutToken);
    this.assertMode(order);
    if (!order.razorpay_order_id && order.gateway_started_at) {
      const matches = (
        await this.provider.findOrders(order.order_number)
      ).filter((o) => o.receipt === order.order_number);
      if (matches.length === 1) {
        this.assertProviderOrder(order, matches[0]);
        await this.repo.bindGateway(order.id, matches[0].id);
        order = (await this.repo.getOrder(id))!;
      }
    }
    if (!order.razorpay_order_id)
      return this.publicOrder(order, !!sessionToken);
    this.assertProviderOrder(
      order,
      await this.provider.getOrder(order.razorpay_order_id),
    );
    const payments = order.razorpay_payment_id
      ? [await this.provider.getPayment(order.razorpay_payment_id)]
      : await this.provider.listPayments(order.razorpay_order_id);
    if (
      order.razorpay_payment_id &&
      payments[0]?.id !== order.razorpay_payment_id
    )
      throw new HttpError(
        409,
        "PAYMENT_MISMATCH",
        "Payment reference mismatch. No download access has been issued.",
      );
    // Failed attempts cannot hide a later successful payment on the same provider order.
    payments.sort(
      (a, b) =>
        Number(b.captured || b.amount_refunded > 0) -
        Number(a.captured || a.amount_refunded > 0),
    );
    for (const payment of payments) {
      await this.apply(order, payment, {
        key: `reconcile:${payment.id}`,
        type: "payment.reconciled",
      });
      if (payment.captured || payment.amount_refunded > 0) break;
    }
    const current = await this.read(id, checkoutToken, sessionToken);
    // Preserve durable paid history, but fail closed on contradictory provider reads.
    if (current.status === "paid")
      assertCapturedPayment(
        payments.find((payment) => payment.id === current.razorpay_payment_id),
        current.razorpay_payment_id,
      );
    return current;
  }
  async download(id: string, entitlementId: string, sessionToken?: string) {
    // Checkout continuation credentials never enter this authorization path.
    if (!sessionToken)
      throw new HttpError(
        404,
        "PURCHASE_SESSION_REQUIRED",
        "Open this purchase in the browser used to complete payment.",
      );
    const order = await this.reconcile(id, undefined, sessionToken);
    if (order.status !== "paid")
      throw new HttpError(
        403,
        "PAYMENT_REQUIRED",
        "Downloads require a captured payment and are revoked on refund.",
      );
    const path = await this.repo.authorizeDownload(
      id,
      entitlementId,
      hashToken(sessionToken),
    );
    if (!path)
      throw new HttpError(
        404,
        "DOWNLOAD_NOT_FOUND",
        "This download is unavailable for your purchase.",
      );
    return { url: await this.repo.signDownload(path, 60), expires_in: 60 };
  }
  async webhook(
    raw: Buffer,
    signature: string | null,
    providerId?: string,
  ): Promise<{ status: string; duplicate: boolean }> {
    if (!this.config.webhookSecret)
      throw new HttpError(
        503,
        "CONFIGURATION_REQUIRED",
        "Webhook verification is not configured.",
      );
    if (!verifySignature(raw, signature, this.config.webhookSecret))
      throw new HttpError(
        400,
        "INVALID_WEBHOOK_SIGNATURE",
        "Invalid webhook signature.",
      );
    let payload;
    try {
      payload = webhookSchema.parse(JSON.parse(raw.toString("utf8")));
    } catch {
      throw new HttpError(400, "INVALID_WEBHOOK", "Invalid webhook payload.");
    }
    if (
      ![
        "payment.captured",
        "payment.failed",
        "order.paid",
        "refund.processed",
      ].includes(payload.event)
    )
      return { status: "ignored", duplicate: false };
    const pid =
      payload.payload.payment?.entity.id ??
      payload.payload.refund?.entity.payment_id;
    let payment = pid ? await this.provider.getPayment(pid) : undefined;
    const rid = payment?.order_id ?? payload.payload.order?.entity.id;
    if (!rid)
      throw new HttpError(
        400,
        "INVALID_WEBHOOK",
        "Missing provider reference.",
      );
    const gateway = await this.provider.getOrder(rid);
    let order = await this.repo.findByProviderOrder(rid);
    if (
      !order &&
      orderIdSchema.safeParse(gateway.notes.internal_order_id).success
    )
      order = await this.repo.getOrder(gateway.notes.internal_order_id!);
    if (!order)
      throw new HttpError(
        404,
        "UNKNOWN_PAYMENT_ORDER",
        "Payment order not found.",
      );
    this.assertProviderOrder(order, gateway);
    if (!order.razorpay_order_id) {
      await this.repo.bindGateway(order.id, rid);
      order = (await this.repo.getOrder(order.id))!;
    }
    if (!payment)
      payment = (await this.provider.listPayments(rid)).find(
        (p) => p.captured || p.amount_refunded > 0,
      );
    if (
      payload.event === "refund.processed" &&
      (!payment || payment.amount_refunded === 0)
    )
      throw new HttpError(
        409,
        "REFUND_PROCESSING",
        "Refund evidence is not available yet. Retry this notification.",
      );
    if (
      !payment ||
      (payload.event !== "payment.failed" &&
        !payment.captured &&
        payment.amount_refunded === 0)
    )
      throw new HttpError(
        409,
        "PAYMENT_PROCESSING",
        "Payment is awaiting provider confirmation.",
      );
    const result = await this.apply(order, payment, {
      key: `webhook:${hashToken(raw.toString("utf8"))}`,
      type: payload.event,
      providerId: providerId?.slice(0, 200),
    });
    return { status: "processed", duplicate: result.duplicate };
  }
}
