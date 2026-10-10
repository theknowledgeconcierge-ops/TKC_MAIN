"use client";
import { CheckCircle2, Download, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/lib/razorpay-checkout";
import { useCartActions } from "@/lib/store";

export default function ThankYou() {
  const params = useSearchParams();
  const cache = useQueryClient();
  const candidate = params.get("order");
  const id = orderIdSchema.safeParse(candidate).success ? candidate! : null;
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [downloading, setDownloading] = useState("");
  const [retrying, setRetrying] = useState(false);
  const deliveryInFlight = useRef(false);
  const downloadInFlight = useRef(false);
  const paymentInFlight = useRef(false);
  const { removePurchased } = useCartActions();
  const cleared = useRef<string | null>(null);
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
  }, [id]);
  const query = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => apiGet<PublicOrder>(`/orders/${id}`),
    structuralSharing: (previous, next) => mergePurchaseState(previous as PublicOrder | undefined, next as PublicOrder),
    enabled: !!id && ready,
    retry: (attempt, error) =>
      !(error instanceof ApiError && error.status === 404) && attempt < 1,
    refetchInterval: (query) =>
      ["created", "payment_pending"].includes(query.state.data?.status ?? "") ||
      query.state.data?.delivery?.status === "sending"
        ? 3000
        : false,
  });
  // The server derives recipients and attachments; the client names only its order.
  const deliver = useMutation({
    mutationFn: (email?: string) =>
      apiPost<PublicOrder>("/orders/delivery", {
        order_id: id,
        ...(email ? { email } : {}),
      }),
    onSuccess: (order) => cache.setQueryData(["purchase", order.id], order),
    onSettled: () => { deliveryInFlight.current = false; },
  });
  const sendBooks = (email?: string) => {
    if (deliveryInFlight.current || query.data?.delivery?.status === "sending" || query.data?.delivery?.locked) return;
    deliveryInFlight.current = true;
    deliver.mutate(email);
  };
  const reconcile = useMutation({
    mutationFn: () =>
      apiPost<PublicOrder>("/orders/reconcile", { order_id: id }),
    onSuccess: (order) => cache.setQueryData(["purchase", order.id], order),
  });
  const reconcileRef = useRef(reconcile.mutate);
  reconcileRef.current = reconcile.mutate;
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
      reconcileRef.current();
    }, 15000);
    return () => clearInterval(timer);
  }, [id, ready, cache]);
  const order = query.data;
  const paid = order?.status === "paid" && order.download_authorized;
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
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    setDownloading(entitlementId);
    try {
      window.location.assign(await downloadUrl(entitlementId));
    } catch (error) {
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
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
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
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    setRetrying(true);
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
            reconcile.mutate();
          },
        },
        handler: async (result) => {
          try {
            await verifyCheckoutPayment({
              internal_order_id: checkout.internal_order_id,
              ...result,
            });
          } catch {
            toast.info(
              "Checking your payment. Please wait before paying again.",
            );
          } finally {
            paymentInFlight.current = false;
            setRetrying(false);
            reconcile.mutate();
          }
        },
      });
      instance.on("payment.failed", () => {
        // Razorpay remains open for its own retry flow until dismissal or success.
        reconcile.mutate();
      });
      instance.open();
    } catch (error) {
      paymentInFlight.current = false;
      setRetrying(false);
      reconcile.mutate();
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
            : order.status === "failed"
              ? "Payment was not completed."
              : order.status === "refunded"
                ? "This purchase has been refunded."
                : "Processing payment…";
  const copy = paid
    ? "Download your books below now. We can also email the PDFs to you."
    : order?.status === "paid"
      ? "Payment is confirmed, but this browser has no verified purchase session. If you entered an email at checkout, your books will be emailed to it automatically within about 10 minutes. Do not pay again."
      : order?.status === "refunded"
        ? "Download access has been revoked because this purchase was refunded."
        : "Payment status comes from our server and Razorpay. If you were charged, check the status before paying again.";
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      data-testid="thank-you-page"
    >
      <div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-7 text-center sm:p-14">
        {paid ? (
          <CheckCircle2 className="mx-auto size-10 text-[#b49a6a]" />
        ) : (
          <RefreshCw className="mx-auto size-10 text-[#b49a6a]" />
        )}
        <p className="overline mt-5" data-testid="thank-you-overline">
          {paid ? "✓ Payment successful" : "Your private purchase"}
        </p>
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
                  onClick={() => reconcile.mutate()}
                  disabled={reconcile.isPending}
                  aria-busy={reconcile.isPending}
                  data-testid="check-payment-status"
                >
                  {reconcile.isPending ? "Checking payment…" : "Check payment status"}
                </Button>
                {["created", "payment_pending", "failed"].includes(
                  order.status,
                ) && (
                  <Button
                    onClick={retryPayment}
                    disabled={retrying}
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
            {reconcile.isError && (
              <p role="alert" className="mt-4 text-sm text-[#9b3d32]">
                {reconcile.error.message} Your order is preserved; please check
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
      {paid && (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
          {order.delivery && (
            <DeliveryPanel
              delivery={order.delivery}
              books={books}
              count={count}
              pending={deliver.isPending}
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
          )}
          <section
            id="downloads"
            className="border border-[#2e241f]/10 bg-white p-6 sm:p-8"
            data-testid="downloads-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="overline">Download now</p>
              <Button
                variant="outline"
                onClick={downloadAll}
                disabled={!!downloading || !order.entitlements.length}
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
                      disabled={!entitlement || !!downloading}
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
              email delivery is unavailable.
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
  failure,
  onSend,
  onShowDownloads,
}: {
  delivery: PublicDelivery;
  books: string;
  count: number;
  pending: boolean;
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
        <Button type="submit" disabled={sending} aria-busy={sending} data-testid="delivery-update-btn">
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
        <p role="alert" className="mt-4 font-medium text-[#9b3d32]">
          {delivery.error === "delivery_needs_reconciliation"
            ? "The previous send may have succeeded. Download your books here, and keep your payment reference if you need delivery help."
            : delivery.can_retry || failure
            ? failure || "We couldn't send the email right now."
            : "We couldn't send the email. Your books are ready to download, and you can keep your payment reference if you need help."}
        </p>
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
