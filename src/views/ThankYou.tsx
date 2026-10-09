"use client";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BookCover from "@/components/BookCover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogue, formatInr } from "@/lib/catalog";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { readStorage, rememberOrder } from "@/lib/browser-storage";
import { orderIdSchema, tokenSchema } from "@/lib/commerce/validation";
import type { CheckoutOrder, PublicOrder } from "@/lib/commerce/types";
import { loadRazorpayCheckout } from "@/lib/payments";
import { useStore } from "@/lib/store";

export default function ThankYou() {
  const params = useSearchParams();
  const cache = useQueryClient();
  const candidate = params.get("order");
  const id = orderIdSchema.safeParse(candidate).success ? candidate! : null;
  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [recovery, setRecovery] = useState("");
  const [downloading, setDownloading] = useState("");
  const [retrying, setRetrying] = useState(false);
  const { removePurchased } = useStore();
  const cleared = useRef<string | null>(null);
  const accessExchange = useRef<{ id: string; promise: Promise<void> } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setAccessError("");
    const saved = readStorage("tkc_purchase_ids");
    setRecent(
      Array.isArray(saved)
        ? saved.filter(
            (value): value is string => orderIdSchema.safeParse(value).success,
          )
        : [],
    );
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "access",
    );
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    const authorize = async () => {
      if (token && id) {
        if (!tokenSchema.safeParse(token).success)
          throw new Error("Invalid private purchase link.");
        await apiPost("/orders/access", { order_id: id, token });
        rememberOrder(id);
      }
    };
    // Reuse an in-flight fragment exchange when React replays effects in development.
    if (token && id) accessExchange.current = { id, promise: authorize() };
    const exchange =
      accessExchange.current?.id === id
        ? accessExchange.current.promise
        : Promise.resolve();
    exchange
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        if (!cancelled)
          setAccessError(
            error instanceof Error
              ? error.message
              : "Unable to open this private link.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const query = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => apiGet<PublicOrder>(`/orders/${id}`),
    enabled: !!id && ready,
    retry: (attempt, error) =>
      !(error instanceof ApiError && error.status === 404) && attempt < 1,
    refetchInterval: (query) =>
      ["created", "payment_pending"].includes(query.state.data?.status ?? "")
        ? 3000
        : false,
  });
  const reconcile = useMutation({
    mutationFn: () =>
      apiPost<PublicOrder>("/orders/reconcile", { order_id: id }),
    onSuccess: (order) => cache.setQueryData(["purchase", id], order),
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
  const paid = order?.status === "paid";
  useEffect(() => {
    if (order?.status === "paid" && cleared.current !== order.id) {
      cleared.current = order.id;
      removePurchased(order.books);
    }
  }, [order, removePurchased]);
  const purchased = catalogue.filter((book) => order?.books.includes(book.id));
  const download = async (entitlementId: string) => {
    setDownloading(entitlementId);
    try {
      const result = await apiPost<{ url: string }>("/downloads", {
        order_id: id,
        entitlement_id: entitlementId,
      });
      const url = new URL(result.url);
      if (url.protocol !== "https:" && url.hostname !== "localhost")
        throw new Error("Invalid download URL.");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Download unavailable. Please retry.",
      );
    } finally {
      setDownloading("");
    }
  };
  const saveLink = async () => {
    try {
      const { url } = await apiPost<{ url: string }>("/orders/recovery-link", {
        order_id: id,
      });
      const href = URL.createObjectURL(
        new Blob(
          [
            url +
              "\nKeep this private. This link grants access to your purchase.\n",
          ],
          { type: "text/plain" },
        ),
      );
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${order?.order_number}-purchase-link.txt`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your link.",
      );
    }
  };
  const retryPayment = async () => {
    if (retrying) return;
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
          email: checkout.customer_email,
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
            setRetrying(false);
            reconcile.mutate();
          },
        },
        handler: async (result) => {
          try {
            await apiPost("/payments/verify", {
              internal_order_id: id,
              ...result,
            });
          } catch {
            toast.info(
              "Checking your payment. Please wait before paying again.",
            );
          } finally {
            setRetrying(false);
            reconcile.mutate();
          }
        },
      });
      instance.on("payment.failed", () => {
        setRetrying(false);
        reconcile.mutate();
      });
      instance.open();
    } catch (error) {
      setRetrying(false);
      reconcile.mutate();
      toast.error(
        error instanceof Error ? error.message : "Unable to resume checkout.",
      );
    }
  };
  const error =
    accessError || (query.error instanceof Error ? query.error.message : "");
  const heading = !id
    ? "Return to your purchases."
    : error
      ? "We couldn’t open this purchase."
      : !order
        ? "Loading your purchase…"
        : paid
          ? "Your business companions are ready."
          : order.status === "failed"
            ? "Payment was not completed."
            : order.status === "refunded"
              ? "This purchase has been refunded."
              : "Processing payment…";
  const copy = paid
    ? "Your captured payment is confirmed. Download each handbook below and save your private purchase link for later."
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
        <p className="overline mt-5">
          {paid
            ? `Payment confirmed · ${order.payment_mode} mode`
            : "Your private purchase"}
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
              : "Open a saved purchase from this browser, or paste your private purchase link. Order numbers alone cannot open a purchase.")}
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
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => reconcile.mutate()}
                disabled={reconcile.isPending}
                data-testid="check-payment-status"
              >
                Check payment status
              </Button>
              <Button
                variant="outline"
                onClick={saveLink}
                data-testid="save-purchase-link"
              >
                Save private purchase link
              </Button>
              {["created", "payment_pending", "failed"].includes(
                order.status,
              ) && (
                <Button
                  onClick={retryPayment}
                  disabled={retrying}
                  data-testid="resume-payment"
                >
                  {retrying
                    ? "Opening checkout…"
                    : `Resume payment · ${formatInr(order.pricing.total_inr)}`}
                </Button>
              )}
            </div>
            {reconcile.isError && (
              <p role="alert" className="mt-4 text-sm text-[#9b3d32]">
                {reconcile.error.message} Your order is preserved; please check
                again shortly.
              </p>
            )}
            <p className="mt-5 text-xs leading-relaxed text-[#8c6d46]">
              No email is sent. Save your private link before clearing browser
              cookies. Keep it private; it grants access to this purchase.
            </p>
          </>
        )}
        {(!id || error) && (
          <form
            className="mx-auto mt-8 max-w-xl text-left"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const url = new URL(recovery);
                const rid = url.searchParams.get("order");
                const rt = new URLSearchParams(url.hash.slice(1)).get("access");
                if (
                  !orderIdSchema.safeParse(rid).success ||
                  !tokenSchema.safeParse(rt).success
                )
                  throw new Error("Invalid link");
                window.location.assign(`/thank-you?order=${rid}#access=${rt}`);
              } catch {
                toast.error(
                  "Please paste your complete private purchase link.",
                );
              }
            }}
          >
            <label className="text-sm" htmlFor="purchase-link">
              Private purchase link
              <Input
                id="purchase-link"
                value={recovery}
                onChange={(event) => setRecovery(event.target.value)}
                required
                type="url"
                className="mt-2"
                autoComplete="off"
              />
            </label>
            <Button className="mt-4" type="submit">
              Open purchase
            </Button>
          </form>
        )}
        {!id && recent.length > 0 && (
          <div className="mx-auto mt-8 max-w-xl space-y-3 text-left">
            <p className="overline">Purchases saved on this browser</p>
            {recent.map((rid) => (
              <Link
                key={rid}
                href={`/thank-you?order=${rid}`}
                className="block break-all text-sm underline"
              >
                Open purchase {rid.slice(0, 8)}
              </Link>
            ))}
          </div>
        )}
        <Link
          href="/books"
          className="mt-8 inline-block text-sm underline"
          data-testid="thank-you-explore-btn"
        >
          Continue exploring
        </Link>
      </div>
      {paid && (
        <div className="mt-12">
          <p className="overline">Your handbooks</p>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {purchased.map((book) => {
              const entitlement = order.entitlements.find(
                (item) => item.product_id === book.id,
              );
              return (
                <div
                  key={book.id}
                  className="border border-[#2e241f]/10 bg-white p-3"
                >
                  <BookCover book={book} compact />
                  <p className="mt-3 font-serif text-lg text-[#29231f]">
                    {book.title}
                  </p>
                  <Button
                    className="mt-4 w-full"
                    disabled={!entitlement || !!downloading}
                    onClick={() => entitlement && download(entitlement.id)}
                    data-testid={`download-${book.id}`}
                  >
                    <Download className="mr-2 size-4" />
                    {downloading === entitlement?.id
                      ? "Preparing…"
                      : "Download PDF"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
