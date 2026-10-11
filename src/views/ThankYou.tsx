"use client";
import { CheckCircle2, Download, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Modal from "@/components/Modal";
import { PaymentSupport, VerificationRecovery } from "@/components/PaymentRecovery";
import ConnectivityNotice from "@/components/ConnectivityNotice";
import { isOnline, useConnectivity, useRecoveryEvents } from "@/lib/connectivity";
import { markPaymentAttempt, clearPaymentAttempt } from "@/lib/checkout-recovery";
import { PAYMENT_WAIT_COPY } from "@/lib/payment-support";
import { catalogue, formatInr } from "@/lib/catalog";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { readStorage } from "@/lib/browser-storage";
import { orderIdSchema } from "@/lib/commerce/validation";
import { mergePurchaseState } from "@/lib/commerce/purchase-state";
import type {
  CheckoutOrder,
  PublicDelivery,
  PublicOrder,
} from "@/lib/commerce/types";
import {
  loadRazorpayCheckout,
  verifyCheckoutPayment,
  hasPendingPaymentVerification,
  retryPaymentVerification,
  type RazorpaySuccess,
} from "@/lib/razorpay-checkout";
import { useCartActions } from "@/lib/store";

export default function ThankYou() {
  const params = useSearchParams();
  const cache = useQueryClient();
  const online = useConnectivity();
  const candidate = params.get("order");
  const id = orderIdSchema.safeParse(candidate).success ? candidate! : null;
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [downloading, setDownloading] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [retryFresh, setRetryFresh] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const checkInFlight = useRef(false);
  const reconcileInFlight = useRef(false);
  const deliveryInFlight = useRef(false);
  const downloadInFlight = useRef(false);
  const paymentInFlight = useRef(false);
  const { removePurchased } = useCartActions();
  const cleared = useRef<string | null>(null);
  const pollingStarted = useRef(Date.now());
  useEffect(() => { if (!online) setRetryFresh(false); }, [online]);
  useEffect(() => {
    const saved = readStorage("tkc_purchase_ids");
    setRecent(
      Array.isArray(saved)
        ? saved.filter(
            (value): value is string => orderIdSchema.safeParse(value).success,
          )
        : [],
    );
    // Discard legacy bearer fragments without exchanging or accepting them.
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    setReady(true);
    pollingStarted.current = Date.now();
  }, [id]);
  const query = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => apiGet<PublicOrder>(`/orders/${id}`),
    structuralSharing: (previous, next) => mergePurchaseState(previous as PublicOrder | undefined, next as PublicOrder),
    enabled: !!id && ready && online,
    refetchOnReconnect: false,
    retry: (attempt, error) =>
      !(error instanceof ApiError && error.status === 404) && attempt < 1,
    refetchInterval: (query) => !isOnline() || Date.now() - pollingStarted.current > 120000 ? false :
      ["created", "payment_pending"].includes(query.state.data?.status ?? "") ||
      query.state.data?.delivery?.status === "sending"
        ? 3000
        : query.state.data?.delivery?.status === "pending" ? 15000 : false,
  });
  // The server derives recipients and attachments; the client names only its order.
  const deliver = useMutation({
    networkMode: "always",
    mutationFn: (email?: string) =>
      apiPost<PublicOrder>("/orders/delivery", {
        order_id: id,
        ...(email ? { email } : {}),
      }),
    onSuccess: (order) => cache.setQueryData(["purchase", order.id], (current: PublicOrder | undefined) => mergePurchaseState(current, order)),
    onSettled: () => { deliveryInFlight.current = false; },
  });
  const sendBooks = (email?: string) => {
    if (!isOnline() || deliveryInFlight.current || query.data?.delivery?.status === "sending" || query.data?.delivery?.locked) return;
    deliveryInFlight.current = true;
    deliver.mutate(email);
  };
  const reconcile = useMutation<PublicOrder, Error, boolean>({
    networkMode: "always",
    mutationFn: () =>
      apiPost<PublicOrder>("/orders/reconcile", { order_id: id }),
    onSuccess: (order, authorizedAtStart) => {
      setRetryFresh(true);
      const current = cache.getQueryData<PublicOrder>(["purchase", order.id]);
      // A pre-session request cannot hide a newly verified session; later reads can revoke it.
      if (!authorizedAtStart && current?.download_authorized && order.status === "paid" && !order.download_authorized) return;
      cache.setQueryData(["purchase", order.id], mergePurchaseState(current, order));
      if (["paid", "refunded"].includes(order.status) || order.payment_retry_allowed === true) clearPaymentAttempt(order.id);
    },
    onSettled: () => { checkInFlight.current = false; reconcileInFlight.current = false; },
  });
  const reconcilePayment = () => {
    if (!id || !isOnline() || reconcileInFlight.current) return;
    reconcileInFlight.current = true;
    checkInFlight.current = true;
    reconcile.mutate(!!cache.getQueryData<PublicOrder>(["purchase", id])?.download_authorized);
  };
  const proofCheck = useMutation({
    networkMode: "always",
    mutationFn: (proof?: { internal_order_id: string } & RazorpaySuccess) => proof
      ? verifyCheckoutPayment(proof) : retryPaymentVerification(id!),
    onSuccess: async order => {
      await cache.cancelQueries({ queryKey: ["purchase", order.id], exact: true });
      cache.setQueryData(["purchase", order.id], (current: PublicOrder | undefined) => mergePurchaseState(current, order));
      clearPaymentAttempt(order.id);
      setVerificationOpen(false);
    },
    onSettled: () => { checkInFlight.current = false; paymentInFlight.current = false; setRetrying(false); },
  });
  const checkPayment = () => {
    if (!id || !isOnline() || checkInFlight.current) return;
    checkInFlight.current = true;
    if (hasPendingPaymentVerification(id)) proofCheck.mutate(undefined);
    else reconcilePayment();
  };
  const reconcileRef = useRef(checkPayment);
  reconcileRef.current = checkPayment;
  useRecoveryEvents(() => {
    // Reconnect reads durable state, including email. It never resends or opens Razorpay.
    reconcilePayment();
  }, !!id && ready);
  useEffect(() => {
    if (!id || !ready) return;
    reconcileRef.current();
    let tries = 0;
    const timer = setInterval(() => {
      const current = cache.getQueryData<PublicOrder>(["purchase", id]);
      if (
        ++tries >= 8 ||
        current?.status === "paid" ||
        current?.status === "refunded"
      ) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState === "hidden" || !isOnline()) return;
      reconcileRef.current();
    }, 15000);
    return () => clearInterval(timer);
  }, [id, ready, cache]);
  const order = query.data;
  const paid = order?.status === "paid" && order.download_authorized;
  
useEffect(() => {
  if (
    !order ||
    !paid ||
    order.payment_mode !== "live" ||
    typeof window === "undefined"
  ) return;

  const storageKey = `tkc_meta_purchase_${order.id}`;

  try {
    if (localStorage.getItem(storageKey)) return;
  } catch {
    // Continue without persistent duplicate protection.
  }

  const fbq = (
    window as Window & {
      fbq?: (
        command: string,
        event: string,
        parameters: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => void;
    }
  ).fbq;

  if (typeof fbq !== "function") return;

  fbq(
    "track",
    "Purchase",
    {
      value: order.pricing.total_inr,
      currency: "INR",
      content_type: "product",
      content_ids: order.books,
      num_items: order.books.length,
    },
    {
      eventID: `purchase_${order.id}`,
    }
  );

  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    // Tracking still works if storage is unavailable.
  }
}, [order, paid]);

  useEffect(() => {
    if (order?.status === "paid" && cleared.current !== order.id) {
      cleared.current = order.id;
      removePurchased(order.books);
    }
  }, [order, removePurchased]);
  const purchased = catalogue.filter((book) => order?.books.includes(book.id));
  const downloadUrl = async (entitlementId: string) => {
    const result = await apiPost<{ url: string }>("/downloads", {
      order_id: id,
      entitlement_id: entitlementId,
    });
    const url = new URL(result.url);
    if (url.protocol !== "https:" && url.hostname !== "localhost")
      throw new Error("Invalid download URL.");
    return result.url;
  };
  const download = async (entitlementId: string) => {
    if (!isOnline() || downloadInFlight.current) return;
    downloadInFlight.current = true;
    setDownloadError(false);
    setDownloading(entitlementId);
    try {
      window.location.assign(await downloadUrl(entitlementId));
    } catch (error) {
      setDownloadError(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Download unavailable. Please retry.",
      );
    } finally {
      downloadInFlight.current = false;
      setDownloading("");
    }
  };
  const downloadAll = async () => {
    if (!isOnline() || downloadInFlight.current) return;
    downloadInFlight.current = true;
    setDownloadError(false);
    setDownloading("all");
    try {
      const ordered = purchased
        .map((book) => order?.entitlements.find((e) => e.product_id === book.id))
        .filter((entitlement) => !!entitlement);
      for (const [index, entitlement] of ordered.entries()) {
        // Space attachment navigations so the browser starts every download.
        if (index) await new Promise((resolve) => setTimeout(resolve, 900));
        window.location.assign(await downloadUrl(entitlement.id));
      }
    } catch (error) {
      setDownloadError(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Download unavailable. Please retry.",
      );
    } finally {
      downloadInFlight.current = false;
      setDownloading("");
    }
  };
  const showDownloads = () =>
    document
      .getElementById("downloads")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const retryPayment = async () => {
    if (!isOnline() || paymentInFlight.current) return;
    paymentInFlight.current = true;
    setRetrying(true);
    setRetryFresh(false);
    try {
      const checkout = await apiPost<CheckoutOrder>("/orders/resume", {
        order_id: id,
      });
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay is unavailable.");
      const instance = new window.Razorpay({
        key: checkout.key_id,
        amount: checkout.amount_paise,
        currency: checkout.currency,
        name: "The Knowledge Concierge",
        description: checkout.description,
        order_id: checkout.razorpay_order_id,
        prefill: {
          name: checkout.customer_name,
          ...(checkout.customer_email
            ? { email: checkout.customer_email }
            : {}),
          contact: checkout.customer_mobile,
        },
        notes: {
          internal_order_id: checkout.internal_order_id,
          order_number: checkout.order_number,
        },
        theme: { color: "#302821" },
        retry: { enabled: true },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            paymentInFlight.current = false;
            setRetrying(false);
            reconcilePayment();
          },
        },
        handler: (result) => {
          checkInFlight.current = true;
          setVerificationOpen(true);
          setConfirmLeave(false);
          proofCheck.mutate({ internal_order_id: checkout.internal_order_id, ...result });
        },
      });
      instance.on("payment.failed", () => {
        // Razorpay remains open for its own retry flow until dismissal or success.
        reconcilePayment();
      });
      markPaymentAttempt(checkout.internal_order_id);
      instance.open();
    } catch (error) {
      paymentInFlight.current = false;
      setRetrying(false);
      reconcilePayment();
      toast.error(
        error instanceof Error ? error.message : "Unable to resume checkout.",
      );
    }
  };
  // A copied URL in another browser learns nothing about the purchase.
  const unavailable =
    query.error instanceof ApiError && query.error.status === 404;
  const error = query.error instanceof Error ? query.error.message : "";
  const count = order?.books.length ?? 0;
  const books = count === 1 ? "book" : `${count} books`;
  if (id && unavailable)
    return (
      <div
        className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        data-testid="thank-you-page"
      >
        <ConnectivityNotice />
        <div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-7 text-center sm:p-14">
          <RefreshCw className="mx-auto size-10 text-[#b49a6a]" />
          <h1
            className="mt-6 font-serif text-3xl text-[#29231f] sm:text-4xl"
            data-testid="thank-you-heading"
            aria-live="polite"
          >
            This purchase is not available in this browser.
          </h1>
          <p
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#6e655e]"
            data-testid="thank-you-copy"
          >
            Downloads and delivery settings are available only from the browser
            used to complete the purchase.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#6e655e]">Once payment is confirmed, books are also delivered to the email used at checkout. If that email has not arrived, we can help investigate.</p>
          <PaymentSupport />
          <Link
            href="/books"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 sm:h-9"
            data-testid="thank-you-return-store"
          >
            Return to store
          </Link>
        </div>
      </div>
    );
  const heading = !id
    ? "Return to your purchases."
    : error
      ? "We couldn’t open this purchase."
      : !order
        ? "Loading your purchase…"
        : paid
          ? `Your ${books} ${count === 1 ? "is" : "are"} ready.`
          : order.status === "paid"
            ? "Payment confirmed. Purchase session unavailable."
            : order.status === "failed" && reconcile.data?.payment_retry_allowed === true
              ? "Payment was not completed."
              : order.status === "refunded"
                ? "This purchase has been refunded."
                : "We're still checking your payment.";
  const copy = paid
    ? "Download your books below now. We can also email the PDFs to you."
    : order?.status === "paid"
      ? "Payment is confirmed, but this browser has no verified purchase session. Books are also delivered to the email used at checkout, usually within about 10 minutes after confirmation. If delivery has not arrived, contact us below. Do not pay again."
      : order?.status === "refunded"
        ? "Download access has been revoked because this purchase was refunded."
        : order?.status === "failed" && reconcile.data?.payment_retry_allowed === true
          ? "Razorpay confirmed that this payment attempt failed. You can safely retry this order below."
          : PAYMENT_WAIT_COPY;
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      data-testid="thank-you-page"
    >
      {!verificationOpen && <ConnectivityNotice stage={order?.status === "paid" ? "paid" : "payment"} />}
      <div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-7 text-center sm:p-14">
        {paid ? (
          <CheckCircle2 className="mx-auto size-10 text-[#b49a6a]" />
        ) : (
          <RefreshCw className="mx-auto size-10 text-[#b49a6a]" />
        )}
        <p className="overline mt-5" data-testid="thank-you-overline">
          {paid ? "✓ Payment successful" : "Your private purchase"}
        </p>
        {id && (order ? !paid && order.status !== "refunded" || paid && (!order.delivery || order.entitlements.length !== order.books.length) : query.isError) && <PaymentSupport mode={order?.status === "paid" ? "paid" : "uncertain"} />}
        <h1
          className="mt-4 font-serif text-4xl text-[#29231f] sm:text-5xl"
          data-testid="thank-you-heading"
          aria-live="polite"
        >
          {heading}
        </h1>
        <p
          className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#6e655e]"
          data-testid="thank-you-copy"
        >
          {error ||
            (id
              ? copy
              : "Open a purchase saved on the browser used to complete payment. An order number or copied URL cannot authorize downloads.")}
        </p>
        {order && (
          <>
            <div className="mx-auto mt-8 max-w-lg border-y border-[#2e241f]/10 py-5 text-left text-sm text-[#6e655e]">
              <div className="flex justify-between gap-5">
                <span>Order</span>
                <span
                  className="break-all font-mono text-xs text-[#29231f]"
                  data-testid="thank-you-order-number"
                >
                  {order.order_number}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Amount</span>
                <span data-testid="thank-you-order-total">
                  {formatInr(order.pricing.total_inr)}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Status</span>
                <span
                  className="font-mono uppercase"
                  data-testid="thank-you-payment-status"
                >
                  {order.status}
                </span>
              </div>
            </div>
            {!paid && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={checkPayment}
                  className="min-h-11"
                  disabled={!online || reconcile.isPending || proofCheck.isPending}
                  aria-busy={reconcile.isPending || proofCheck.isPending}
                  data-testid="check-payment-status"
                >
                  {reconcile.isPending || proofCheck.isPending ? "Checking payment…" : "Check again"}
                </Button>
                {["created", "payment_pending", "failed"].includes(
                  order.status,
                ) && retryFresh && online && reconcile.data?.id === id && reconcile.data.payment_retry_allowed === true && !reconcile.isPending && !reconcile.isError && !hasPendingPaymentVerification(order.id) && (
                  <Button
                    onClick={retryPayment}
                    className="min-h-11"
                    disabled={!online || retrying}
                    aria-busy={retrying}
                    data-testid="resume-payment"
                  >
                    {retrying
                      ? "Opening checkout…"
                      : `Resume payment · ${formatInr(order.pricing.total_inr)}`}
                  </Button>
                )}
              </div>
            )}
            {!paid && (reconcile.isError || proofCheck.isError) && (
              <p role="alert" className="mt-4 text-sm text-[#9b3d32]">
                {reconcile.error?.message || proofCheck.error?.message} Your order is preserved; please check
                again shortly.
              </p>
            )}
          </>
        )}
        {!id && recent.length > 0 && (
          <div className="mx-auto mt-8 max-w-xl space-y-3 text-left">
            <p className="overline">Purchases saved on this browser</p>
            {recent.map((rid) => (
              <Link
                key={rid}
                href={`/thank-you?order=${rid}`}
                className="flex min-h-11 items-center break-all text-sm underline sm:block sm:min-h-0"
              >
                Open purchase {rid.slice(0, 8)}
              </Link>
            ))}
          </div>
        )}
        <Link
          href="/books"
          className="mt-8 inline-flex min-h-11 items-center text-sm underline sm:min-h-0"
          data-testid="thank-you-explore-btn"
        >
          Continue exploring
        </Link>
      </div>
      {verificationOpen && <Modal open onClose={() => setConfirmLeave(true)} label="Payment verification">
        <div className="fixed inset-0 flex items-center justify-center p-3">
          <div className="max-h-[94dvh] w-full max-w-lg overflow-y-auto overscroll-contain bg-[#fbf9f5]">
            <Button className="sticky top-0 ml-auto flex min-h-11" variant="ghost" onClick={() => setConfirmLeave(true)} aria-label="Close payment verification">Close</Button>
            <VerificationRecovery pending={proofCheck.isPending} confirmLeave={confirmLeave}
              onContinue={() => setConfirmLeave(false)} onLeave={() => { setVerificationOpen(false); setConfirmLeave(false); }}
              onCheckAgain={checkPayment} />
          </div>
        </div>
      </Modal>}
      {paid && (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
          {order.delivery && (
            <div>
            <DeliveryPanel
              delivery={order.delivery}
              books={books}
              count={count}
              pending={deliver.isPending}
              online={online}
              failure={
                deliver.isError
                  ? deliver.error instanceof ApiError &&
                    deliver.error.code !== "EMAIL_UNAVAILABLE"
                    ? deliver.error.message
                    : "We couldn't send the email right now."
                  : ""
              }
              onSend={sendBooks}
              onShowDownloads={showDownloads}
            />
            {(deliver.isError || order.delivery.status === "sending") && <Button className="mt-3 min-h-11" variant="outline" disabled={!online || reconcile.isPending} onClick={reconcilePayment} data-testid="delivery-check-status">{reconcile.isPending ? "Checking delivery…" : "Check delivery status"}</Button>}
            {reconcile.isError && <p role="alert" className="mt-3 text-sm text-[#9b3d32]">{reconcile.error.message} Please check delivery status again before retrying a send.</p>}
            {order.delivery.status !== "failed" && order.delivery.status !== "sent" && order.paid_at && Date.now() - Date.parse(order.paid_at) >= 10 * 60 * 1000 && <PaymentSupport mode="paid" />}
            </div>
          )}
          <section
            id="downloads"
            className="border border-[#2e241f]/10 bg-white p-6 sm:p-8"
            data-testid="downloads-panel"
          >
            {downloadError && <div role="alert"><p>We couldn't prepare your download. Please check again.</p><PaymentSupport mode="paid" /></div>}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="overline">Download now</p>
              <Button
                variant="outline"
                onClick={downloadAll}
                className="min-h-11"
                disabled={!online || !!downloading || !order.entitlements.length}
                aria-busy={downloading === "all"}
                data-testid="downloads-all-btn"
              >
                <Download className="mr-2 size-4" />
                {downloading === "all" ? "Preparing…" : "Download all"}
              </Button>
            </div>
            <ul className="mt-6 divide-y divide-[#2e241f]/10">
              {purchased.map((book) => {
                const entitlement = order.entitlements.find(
                  (item) => item.product_id === book.id,
                );
                return (
                  <li
                    key={book.id}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <span className="font-serif text-lg text-[#29231f]">
                      {book.title}
                    </span>
                    <Button
                      size="sm"
                      className="min-h-11 shrink-0"
                      disabled={!online || !entitlement || !!downloading}
                      aria-busy={downloading === entitlement?.id}
                      onClick={() => entitlement && download(entitlement.id)}
                      data-testid={`download-${book.id}`}
                    >
                      {downloading === entitlement?.id
                        ? "Preparing…"
                        : "Download"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-[#8c6d46]">
              Downloads use a private session in this browser and work even if
              email delivery is unavailable. If a transfer is interrupted, reconnect and tap Download again for a fresh link.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function DeliveryPanel({
  delivery,
  books,
  count,
  pending,
  online,
  failure,
  onSend,
  onShowDownloads,
}: {
  delivery: PublicDelivery;
  books: string;
  count: number;
  pending: boolean;
  online: boolean;
  failure: string;
  onSend: (email?: string) => void;
  onShowDownloads: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [draft, setDraft] = useState("");
  const sending = pending || delivery.status === "sending";
  const failed = !sending && (!!failure || delivery.status === "failed");
  const editable = !delivery.locked && delivery.can_retry && !sending;
  if (delivery.locked)
    return (
      <section
        className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-6 sm:p-8"
        data-testid="delivery-sent"
      >
        <p className="overline">✓ Books sent</p>
        <p className="mt-4 text-base text-[#6e655e]">
          Your {books} {count === 1 ? "was" : "were"} sent to:
        </p>
        <p
          className="mt-1 break-all font-medium text-[#29231f]"
          data-testid="delivery-email"
        >
          {delivery.email}
        </p>
        <p className="mt-4 text-sm text-[#6e655e]">
          Check Spam/Promotions if you don&apos;t see the email.
        </p>
        <Button className="mt-6" variant="outline" onClick={onShowDownloads}>
          Download books
        </Button>
      </section>
    );
  const form = (label: string, action: string) => (
    <form
      className="mt-5 space-y-3"
      data-testid="delivery-change-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSend(draft.trim().toLowerCase());
      }}
    >
      <label className="block text-sm text-[#6e655e]" htmlFor="delivery-email">
        {label}
        <Input
          id="delivery-email"
          type="email"
          required
          maxLength={254}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="mt-2"
          autoComplete="email"
          data-testid="delivery-email-input"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-11" type="submit" disabled={!online || sending} aria-busy={sending} data-testid="delivery-update-btn">
          {sending ? "Sending…" : action}
        </Button>
        {delivery.email && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setChanging(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
  return (
    <section
      className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-6 sm:p-8"
      data-testid={
        sending ? "delivery-sending" : failed ? "delivery-failed" : "delivery-pending"
      }
    >
      <p className="overline flex items-center gap-2">
        <Mail className="size-4" aria-hidden="true" />
        Send your books
      </p>
      {failed && (
        <>
        <p role="alert" className="mt-4 font-medium text-[#9b3d32]">
          {delivery.error === "delivery_needs_reconciliation"
            ? "The previous send may have succeeded. Download your books here, and keep your payment reference if you need delivery help."
            : delivery.can_retry || failure
            ? failure || "We couldn't send the email right now."
            : "We couldn't send the email. Your books are ready to download, and you can keep your payment reference if you need help."}
        </p>
        <PaymentSupport mode="email" />
        </>
      )}
      {changing || !delivery.email ? (
        <>
          {delivery.email && (
            <>
              <p className="mt-4 text-sm text-[#6e655e]">Change delivery email</p>
              <p className="mt-1 text-sm text-[#6e655e]">
                Current:{" "}
                <span
                  className="break-all font-medium text-[#29231f]"
                  data-testid="delivery-email"
                >
                  {delivery.email}
                </span>
              </p>
            </>
          )}
          {editable &&
            form(
              delivery.email
                ? "Send my books instead to:"
                : "Where should we send your books?",
              delivery.email ? "Update & send books" : "Send books",
            )}
        </>
      ) : (
        <>
          <p className="mt-4 text-base text-[#6e655e]">
            {sending ? "Sending your books to:" : "We'll send the PDFs to:"}
          </p>
          <p
            className="mt-1 break-all font-medium text-[#29231f]"
            data-testid="delivery-email"
          >
            {delivery.email}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {editable && (
              <Button
                className="min-h-11"
                disabled={!online}
                onClick={() => onSend()}
                data-testid={failed ? "delivery-retry-btn" : "delivery-confirm-btn"}
              >
                {failed ? "Try sending again" : "Confirm & send books"}
              </Button>
            )}
            {sending && (
              <Button disabled aria-busy="true" data-testid="delivery-confirm-btn">
                Sending…
              </Button>
            )}
            {failed && (
              <Button variant="outline" onClick={onShowDownloads}>
                Download books now
              </Button>
            )}
          </div>
          {editable && delivery.can_change_email !== false && (
            <p className="mt-4 text-sm text-[#6e655e]">
              Wrong email?{" "}
              <button
                type="button"
                className="inline-flex min-h-11 items-center underline sm:min-h-0"
                onClick={() => {
                  setDraft("");
                  setChanging(true);
                }}
                data-testid="delivery-change-btn"
              >
                Change email
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
