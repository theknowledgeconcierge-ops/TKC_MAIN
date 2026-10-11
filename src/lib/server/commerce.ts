import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { activeBooks, catalogue, type ProductId } from "@/lib/catalog";
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
  DeliveryClaim,
  DeliveryPayload,
  OrderRecord,
  PublicDelivery,
  PricingQuote,
  PublicOrder,
  ProviderOrder,
  ProviderPayment,
  PaymentEvidence,
} from "@/lib/commerce/types";
import type { Repository, PaymentProvider } from "./contracts";
import { HttpError } from "./errors";
import {
  DEFAULT_EMAIL_FROM,
  EmailDeliveryError,
  assertWithinEmailLimit,
  deliveryEmailContent,
  type EmailAttachment,
  type EmailMessage,
  type EmailProvider,
} from "./email";
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
// Email delivery bounds. Browser downloads never depend on these.
const delivery = {
  maxAttempts: 5,
  // The close-tab fallback retries a failed automatic send at most three times.
  fallbackMaxAttempts: 3,
  leaseSeconds: 120,
  graceSeconds: 300,
  // Older paid orders are never emailed automatically, e.g. after first deployment.
  maxAgeSeconds: 24 * 60 * 60,
  retryAfterSeconds: 15 * 60,
  batch: 3,
} as const;
const sessionRequired = () =>
  new HttpError(
    404,
    "PURCHASE_SESSION_REQUIRED",
    "Open this purchase in the browser used to complete payment.",
  );
// The order was priced or composed differently from what checkout charges today.
const priceChanged = () =>
  new HttpError(
    409,
    "CHECKOUT_PRICE_CHANGED",
    "Prices have changed since this checkout started. Start a new checkout to see the latest price.",
  );
const paymentProcessing = () => new HttpError(
  409, "PAYMENT_PROCESSING",
  "We're still checking your payment. If your account was charged, please don't make another payment yet.",
);
export class CommerceService {
  constructor(
    readonly repo: Repository,
    readonly provider: PaymentProvider,
    private readonly config: {
      keyId: string;
      keySecret: string;
      webhookSecret?: string;
    },
    private readonly email: {
      provider: EmailProvider | null;
      from: string;
    } = { provider: null, from: DEFAULT_EMAIL_FROM },
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
    const completed = () =>
      new HttpError(
        409,
        "ORDER_COMPLETED",
        "This order already has a payment. Open your purchase page to check its status.",
      );
    if (order.status === "paid" || order.status === "refunded") throw completed();
    if (order.razorpay_order_id || order.gateway_started_at) {
      const current = await this.reconcile(order.id, input.checkout_token);
      if (current.status === "paid" || current.status === "refunded") throw completed();
      if (!current.payment_retry_allowed) throw paymentProcessing();
    }
    const pricing = this.currentQuote(order);
    if (!pricing) {
      // A captured payment may not be recorded yet: never invite a second payment.
      const current = await this.reconcile(order.id, input.checkout_token);
      if (current.status === "paid" || current.status === "refunded")
        throw completed();
      throw priceChanged();
    }
    const gatewayId = await this.ensureGateway(order);
    return {
      key_id: this.config.keyId,
      payment_mode: this.mode,
      internal_order_id: order.id,
      order_number: order.order_number,
      razorpay_order_id: gatewayId,
      amount_paise: order.total,
      currency: order.currency,
      pricing,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_mobile: order.customer_mobile,
      description: `${order.order_items.length} Knowledge Concierge handbooks`,
    };
  }
  // An unpaid order may be resumed only while it still matches today's catalogue and
  // price. Paid orders never reach this check and keep their original amount.
  private currentQuote(
    order: OrderRecord,
    bookIds?: readonly string[],
  ): PricingQuote | null {
    const ids = order.order_items.map((item) => item.product_id).sort();
    if (bookIds && [...new Set(bookIds)].sort().join() !== ids.join())
      return null;
    let quote: PricingQuote;
    try {
      quote = quoteFor(ids);
    } catch {
      return null;
    }
    const itemsCurrent = order.order_items.every((item) => {
      const book = activeBooks.find((candidate) => candidate.id === item.product_id);
      return (
        !!book &&
        item.quantity === 1 &&
        item.unit_price === book.price_paise &&
        item.storage_path === pdfPaths[book.id as ProductId]
      );
    });
    return itemsCurrent &&
      order.currency === "INR" &&
      order.subtotal === quote.regular_total_inr * 100 &&
      order.total === quote.total_inr * 100
      ? quote
      : null;
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
    const paidSession = order.status === "paid" && purchaseSession;
    const entitlements = paidSession
      ? await this.repo.getEntitlements(order.id)
      : [];
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      books: order.order_items.map((item) => item.product_id),
      pricing: order.pricing,
      created_at: order.created_at,
      paid_at: order.paid_at,
      payment_mode: order.payment_mode,
      razorpay_payment_id: order.razorpay_payment_id,
      checkout_expires_at: order.checkout_expires_at,
      download_authorized: order.status === "paid" && purchaseSession,
      entitlements: entitlements.map(({ id, product_id }) => ({
        id,
        product_id,
      })),
      // Email state must never block a paid buyer's downloads.
      delivery: paidSession
        ? await this.deliveryView(order).catch(() => null)
        : null,
    };
  }
  private async deliveryView(order: OrderRecord): Promise<PublicDelivery> {
    const record = await this.repo.getEmailDelivery(order.id);
    if (!record)
      return {
        email: order.customer_email,
        status: "pending",
        locked: false,
        sent_at: null,
        error: null,
        can_retry: true,
      };
    // A lease that expired without a recorded outcome is shown as a retryable failure.
    const interrupted =
      record.status === "sending" &&
      Date.parse(record.lease_expires_at ?? "") <= Date.now();
    const needsReconciliation =
      record.status !== "sent" &&
      record.outcome_uncertain &&
      Date.parse(record.send_window_started_at ?? "") <= Date.now() - 23 * 60 * 60 * 1000;
    return {
      email: record.delivery_email,
      status: interrupted ? "failed" : record.status,
      locked: record.status === "sent",
      sent_at: record.sent_at,
      error: needsReconciliation ? "delivery_needs_reconciliation" : interrupted
        ? "interrupted"
        : record.status === "failed"
          ? record.last_error
          : null,
      can_retry:
        record.status !== "sent" && !needsReconciliation && record.attempt_count < delivery.maxAttempts,
      can_change_email: !record.outcome_uncertain && record.status !== "sent",
    };
  }
  async read(id: string, checkoutToken?: string, sessionToken?: string) {
    const order = sessionToken
      ? await this.sessionOrder(id, sessionToken)
      : await this.authorizedCheckout(id, checkoutToken);
    return this.publicOrder(order, !!sessionToken);
  }

  async resume(
    id: string,
    token?: string,
    bookIds?: readonly string[],
  ): Promise<CheckoutOrder> {
    const current = await this.reconcile(id, token);
    if (current.status === "paid" || current.status === "refunded")
      throw new HttpError(
        409,
        "ORDER_COMPLETED",
        "This order already has a payment. Open My purchases before paying again.",
      );
    if (!current.payment_retry_allowed) throw paymentProcessing();
    const order = await this.authorizedCheckout(id, token);
    // Never hand out a stale order or its Razorpay order; the client starts a fresh one.
    const pricing = this.currentQuote(order, bookIds);
    if (!pricing) throw priceChanged();
    const gatewayId = await this.ensureGateway(order);
    return {
      key_id: this.config.keyId,
      payment_mode: this.mode,
      internal_order_id: order.id,
      order_number: order.order_number,
      razorpay_order_id: gatewayId,
      amount_paise: order.total,
      currency: order.currency,
      pricing,
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
      // No payment order was found. ensureGateway still enforces receipt recovery
      // and the creation lease before creating anything at the provider.
      return { ...await this.publicOrder(order, !!sessionToken), payment_retry_allowed: true };
    const gateway = await this.provider.getOrder(order.razorpay_order_id);
    this.assertProviderOrder(order, gateway);
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
    return {
      ...current,
      payment_retry_allowed: !["paid", "refunded"].includes(current.status) &&
        ["created", "attempted"].includes(gateway.status) &&
        (payments.length === 0 ? gateway.status === "created" : payments.every(payment =>
          payment.status === "failed" && !payment.captured && payment.amount_refunded === 0)),
    };
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
  // Confirm, correct or retry delivery for the order bound to this purchase session.
  async deliver(
    id: string,
    sessionToken?: string,
    email?: string,
  ): Promise<PublicOrder> {
    // Authorization precedes every order, delivery and provider lookup.
    if (!sessionToken) throw sessionRequired();
    // The same fresh Razorpay evidence as a download: refunds and contradictions block delivery.
    const current = await this.reconcile(id, undefined, sessionToken);
    if (current.status !== "paid")
      throw new HttpError(
        403,
        "PAYMENT_REQUIRED",
        "Book delivery requires a captured payment and is unavailable after a refund.",
      );
    const provider = this.email.provider;
    if (!provider)
      throw new HttpError(
        503,
        "EMAIL_UNAVAILABLE",
        "We couldn't send the email right now. Your books are ready to download.",
      );
    const claim = await this.repo.claimEmailDelivery({
      order_id: id,
      session_hash: hashToken(sessionToken),
      email: email ?? null,
      provider: provider.name,
      max_attempts: delivery.maxAttempts,
      lease_seconds: delivery.leaseSeconds,
    });
    if (claim.outcome === "claimed")
      await this.sendClaimed(provider, claim, false);
    return this.read(id, undefined, sessionToken);
  }
  // Close-tab/callback-loss fallback, invoked by the scheduled function.
  async processFallbackDeliveries() {
    const provider = this.email.provider;
    if (!provider)
      throw new HttpError(
        503,
        "EMAIL_UNAVAILABLE",
        "Email delivery is not configured.",
      );
    const claims = await this.repo.claimFallbackDeliveries({
      payment_mode: this.mode,
      provider: provider.name,
      limit: delivery.batch,
      grace_seconds: delivery.graceSeconds,
      max_age_seconds: delivery.maxAgeSeconds,
      max_attempts: delivery.fallbackMaxAttempts,
      retry_after_seconds: delivery.retryAfterSeconds,
      lease_seconds: delivery.leaseSeconds,
    });
    let sent = 0;
    for (const claim of claims)
      if (await this.sendClaimed(provider, claim, true)) sent++;
    return { claimed: claims.length, sent, failed: claims.length - sent };
  }
  // Only the claim holder sends. Failures are recorded on the delivery, never the order.
  private async sendClaimed(
    provider: EmailProvider,
    claim: DeliveryClaim,
    verifyPayment: boolean,
  ): Promise<boolean> {
    let result:
      | { outcome: "sent"; provider_message_id: string }
      | { outcome: "failed"; error: string };
    try {
      const payload = await this.repo.emailDeliveryPayload(claim);
      if (!payload) throw new EmailDeliveryError("not_deliverable");
      if (verifyPayment) await this.confirmCurrentPayment(payload.order_id);
      const { id } = await provider.send(await this.deliveryMessage(payload));
      result = { outcome: "sent", provider_message_id: id };
    } catch (error) {
      result = {
        outcome: "failed",
        error:
          error instanceof EmailDeliveryError ? error.code : "delivery_error",
      };
    }
    // If this write is lost the lease expires; the stable idempotency key makes the retry safe.
    const recorded = await this.repo.finishEmailDelivery({
      ...claim,
      ...result,
    });
    return recorded && result.outcome === "sent";
  }
  // Without a buyer request, recheck Razorpay before attaching PDFs (refunds revoke access).
  private async confirmCurrentPayment(orderId: string) {
    try {
      const order = await this.repo.getOrder(orderId);
      if (!order?.razorpay_payment_id) throw new Error("not_paid");
      this.assertMode(order);
      const payment = await this.provider.getPayment(order.razorpay_payment_id);
      await this.apply(order, payment, {
        key: `delivery:${payment.id}`,
        type: "payment.reconciled",
      });
      assertCapturedPayment(payment, order.razorpay_payment_id);
    } catch {
      throw new EmailDeliveryError("payment_not_confirmed");
    }
  }
  // Attachments are derived from the paid order's entitlements, never from the client.
  private async deliveryMessage(payload: DeliveryPayload): Promise<EmailMessage> {
    if (
      !payload.attachments.length ||
      payload.attachments.length !== payload.item_count
    )
      throw new EmailDeliveryError("incomplete_entitlements");
    const books = payload.attachments
      .map(({ product_id, storage_path }) => {
        const index = catalogue.findIndex((book) => book.id === product_id);
        if (
          index < 0 ||
          pdfPaths[product_id as ProductId] !== storage_path
        )
          throw new EmailDeliveryError("attachment_mapping_mismatch");
        return { index, title: catalogue[index].title, storage_path };
      })
      .sort((a, b) => a.index - b.index);
    const attachments: EmailAttachment[] = [];
    for (const book of books) {
      let content: Buffer;
      try {
        content = await this.repo.readPdf(book.storage_path);
      } catch {
        throw new EmailDeliveryError("storage_unavailable");
      }
      if (content.subarray(0, 5).toString("latin1") !== "%PDF-")
        throw new EmailDeliveryError("invalid_attachment");
      attachments.push({ filename: `${book.title}.pdf`, content });
      // Never silently drop a purchased book: an oversize order fails as a whole.
      assertWithinEmailLimit(attachments);
    }
    return {
      from: this.email.from,
      to: payload.delivery_email,
      ...deliveryEmailContent({
        customerName: payload.customer_name,
        orderNumber: payload.order_number,
        amountPaise: payload.total,
        titles: books.map((book) => book.title),
      }),
      attachments,
      idempotencyKey: payload.idempotency_key,
    };
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
    if (pid && payment?.id !== pid)
      throw new HttpError(409, "PAYMENT_MISMATCH", "Payment reference mismatch.");
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
