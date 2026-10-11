"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Modal from "@/components/Modal";
import { PaymentSupport, VerificationRecovery } from "@/components/PaymentRecovery";
import ConnectivityNotice from "@/components/ConnectivityNotice";
import { isOnline, useConnectivity, useRecoveryEvents } from "@/lib/connectivity";
import { getCheckoutAttempt, saveCheckoutAttempt, getPaymentAttempt, markPaymentAttempt, clearPaymentAttempt } from "@/lib/checkout-recovery";
import { ApiError, apiPost } from "@/lib/api";
import { formatInr } from "@/lib/catalog";
import {
  randomCheckoutToken,
  rememberOrder,
} from "@/lib/browser-storage";
import {
  loadRazorpayCheckout,
  verifyCheckoutPayment,
  type RazorpaySuccess,
} from "@/lib/razorpay-checkout";
import type { CheckoutOrder, PublicOrder } from "@/lib/commerce/types";
import { useCart, useCartActions } from "@/lib/store";
import { mergePurchaseState } from "@/lib/commerce/purchase-state";
function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
// Shown inside the dialog: toasts render beneath a top-layer <dialog> and go unseen.
interface Notice {
  tone: "error" | "info";
  title: string;
  description?: string;
  paymentIssue?: boolean;
}
export default function CheckoutModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { selectedIds, summary } = useCart();
  const { setBagOpen } = useCartActions();
  const router = useRouter();
  const cache = useQueryClient();
  const online = useConnectivity();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [coupon, setCoupon] = useState("");
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(
    null,
  );
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayActive, setGatewayActive] = useState(false);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unavailableCheckout, setUnavailableCheckout] = useState<string | null>(null);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const submitting = useRef(false);
  const editingDetails = useRef(false);
  const paymentFailed = useRef(false);
  const callbackReceived = useRef(false);
  const leftVerification = useRef(false);
  const callbackProof = useRef<({ internal_order_id: string } & RazorpaySuccess) | null>(null);
  const close = () => {
    if (verificationStarted) { setConfirmLeave(true); return; }
    if (busy.current || submitting.current) return;
    setCheckoutOrder(null);
    setGatewayLoading(false);
    setNotice(null);
    setUnavailableCheckout(null);
    onClose();
  };
  const goToPurchase = (id: string) => {
    busy.current = false;
    setCheckoutOrder(null);
    setNotice(null);
    setGatewayLoading(false);
    setGatewayActive(false);
    setVerificationStarted(false);
    setConfirmLeave(false);
    setUnavailableCheckout(null);
    onClose();
    setBagOpen(false);
    router.push("/thank-you?order=" + id);
  };
  const verifyMutation = useMutation({
    networkMode: "always",
    mutationFn: (payload: { internal_order_id: string } & RazorpaySuccess) =>
      verifyCheckoutPayment(payload),
    onSuccess: async (order) => {
      clearPaymentAttempt(order.id);
      await cache.cancelQueries({ queryKey: ["purchase", order.id], exact: true });
      cache.setQueryData(["purchase", order.id], (current: PublicOrder | undefined) => mergePurchaseState(current, order));
      if (!leftVerification.current) goToPurchase(order.id);
    },
    onError: () => {
      busy.current = false;
      setGatewayLoading(false);
    },
  });
  const orderMutation = useMutation({
    networkMode: "always",
    onSettled: () => {
      submitting.current = false;
    },
    mutationFn: async (recoverId?: string) => {
      if (recoverId) return apiPost<CheckoutOrder>("/orders/resume", { order_id: recoverId, book_ids: [...selectedIds].sort() });
      const payload = {
        book_ids: [...selectedIds].sort(),
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile.trim(),
        ...(selectedIds.length === 5 && coupon ? { coupon_code: coupon } : {}),
      };
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(payload)),
          ),
        ),
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const continueCheckout = async () => {
        const attempt = getCheckoutAttempt();
        const start = (token: string) => {
          // This idempotency key can only continue checkout; it never authorizes a download.
          saveCheckoutAttempt({ fingerprint, token, book_ids: payload.book_ids });
          return apiPost<CheckoutOrder>("/orders", {
            ...payload,
            checkout_token: token,
          });
        };
        let order: CheckoutOrder;
        try {
          if (attempt?.fingerprint === fingerprint && attempt.order_id)
            order = await apiPost<CheckoutOrder>("/orders/resume", {
              order_id: attempt.order_id,
              book_ids: payload.book_ids,
            });
          else order = await start(
            attempt?.fingerprint === fingerprint &&
              typeof attempt.token === "string" &&
              /^[A-Za-z0-9_-]{43}$/.test(attempt.token)
              ? attempt.token
              : randomCheckoutToken(),
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.code === "CHECKOUT_PRICE_CHANGED"))
            throw error;
          // The server refused a remembered order priced before a change: start afresh once.
          order = await start(randomCheckoutToken());
          setNotice({
            tone: "info",
            title: "Your order has been refreshed with the latest price.",
          });
        }
        const latest = getCheckoutAttempt();
        saveCheckoutAttempt({
          fingerprint,
          book_ids: payload.book_ids,
          ...(latest?.fingerprint === fingerprint ? { token: latest.token } : {}),
          order_id: order.internal_order_id,
        });
        return order;
      };
      // Serialize shared checkout attempts across tabs, including stale-price replacement.
      return navigator.locks
        ? navigator.locks.request("tkc-checkout", continueCheckout)
        : continueCheckout();
    },
    onSuccess: (order) => {
      editingDetails.current = false;
      setCheckoutOrder(order);
      setFullName(order.customer_name);
      setEmail(order.customer_email ?? "");
      setMobile(order.customer_mobile);
      rememberOrder(order.internal_order_id);
    },
    onError: (error, recoverId) => {
      if (recoverId) {
        if (error instanceof ApiError && error.status === 404) { setUnavailableCheckout(recoverId); return; }
        if (!(error instanceof ApiError && error.code === "CHECKOUT_PRICE_CHANGED")) { goToPurchase(recoverId); return; }
        editingDetails.current = true;
      }
      setNotice({
        tone: "error",
        title: "Checkout could not start",
        description: errorMessage(
          error,
          "Check your connection and retry the same checkout.",
        ),
        paymentIssue: error instanceof ApiError && ["ORDER_COMPLETED", "PAYMENT_PROCESSING"].includes(error.code),
      });
    },
  });
  const recoverCheckout = () => {
    if (!open || unavailableCheckout || busy.current || submitting.current || verificationStarted || gatewayActive) return;
    const payment = getPaymentAttempt();
    if (payment) {
      if (isOnline()) goToPurchase(payment.order_id);
      else setNotice({ tone: "info", title: "We're checking your payment. Please don't make another payment yet.", description: "We'll check this checkout when your connection returns." });
      return;
    }
    const previous = getCheckoutAttempt();
    if (!editingDetails.current && isOnline() && previous?.order_id && JSON.stringify(previous.book_ids) === JSON.stringify([...selectedIds].sort())) {
      submitting.current = true;
      orderMutation.mutate(previous.order_id);
    }
  };
  const recoveryRef = useRef(recoverCheckout);
  recoveryRef.current = recoverCheckout;
  useEffect(() => { if (open) recoveryRef.current(); }, [open]);
  useRecoveryEvents(recoverCheckout, open);
  useEffect(() => {
    // Fetch Razorpay while the buyer reviews, so Pay does not wait on the network.
    if (checkoutOrder && online) loadRazorpayCheckout().catch(() => {});
  }, [checkoutOrder, online]);
  const openRazorpay = async () => {
    if (!checkoutOrder || busy.current || !isOnline()) return;
    busy.current = true;
    paymentFailed.current = false;
    setNotice(null);
    setGatewayLoading(true);
    let preflightComplete = false;
    try {
      // The order may have been paid in another tab since Review was rendered.
      await apiPost<CheckoutOrder>("/orders/resume", { order_id: checkoutOrder.internal_order_id });
      preflightComplete = true;
      await loadRazorpayCheckout();
      if (!window.Razorpay)
        throw new Error("Razorpay Checkout is unavailable.");
      const razorpay = new window.Razorpay({
        key: checkoutOrder.key_id,
        amount: checkoutOrder.amount_paise,
        currency: checkoutOrder.currency,
        name: "The Knowledge Concierge",
        description: checkoutOrder.description,
        order_id: checkoutOrder.razorpay_order_id,
        prefill: {
          name: checkoutOrder.customer_name,
          ...(checkoutOrder.customer_email
            ? { email: checkoutOrder.customer_email }
            : {}),
          contact: checkoutOrder.customer_mobile,
        },
        notes: {
          internal_order_id: checkoutOrder.internal_order_id,
          order_number: checkoutOrder.order_number,
        },
        theme: { color: "#302821" },
        retry: { enabled: true },
        modal: {
          confirm_close: true,
          ondismiss: async () => {
            if (callbackReceived.current) return;
            busy.current = false;
            setGatewayActive(false);
            try {
              const current = await apiPost<PublicOrder>("/orders/reconcile", { order_id: checkoutOrder.internal_order_id });
              if (!current.payment_retry_allowed) { goToPurchase(checkoutOrder.internal_order_id); return; }
              clearPaymentAttempt(checkoutOrder.internal_order_id);
            } catch { goToPurchase(checkoutOrder.internal_order_id); return; }
            setGatewayLoading(false);
            setNotice(
              paymentFailed.current
                ? {
                    tone: "error",
                    title: "Payment was not completed",
                    description:
                      "You can retry here, or check My purchases before paying again.",
                  }
                : {
                    tone: "info",
                    title: "Payment window closed",
                    description:
                      "You can return to this order from My purchases.",
                  },
            );
          },
        },
        handler: (response: RazorpaySuccess) => {
          // Razorpay has closed: show verification progress rather than a bare page.
          setGatewayActive(false);
          setGatewayLoading(false);
          callbackReceived.current = true;
          leftVerification.current = false;
          setVerificationStarted(true);
          if (checkoutDialog.current && !checkoutDialog.current.open)
            checkoutDialog.current.showModal();
          callbackProof.current = {
            internal_order_id: checkoutOrder.internal_order_id,
            ...response,
          };
          verifyMutation.mutate(callbackProof.current);
          // Refresh now returns to recovery; this URL still cannot authorize downloads.
          router.replace("/thank-you?order=" + checkoutOrder.internal_order_id);
        },
      });
      // The provider keeps its iframe open for retries after payment.failed.
      razorpay.on("payment.failed", () => {
        paymentFailed.current = true;
      });
      // Native top-layer dialogs would otherwise hide/inert Razorpay's body-mounted iframe.
      checkoutDialog.current?.close();
      callbackReceived.current = false;
      setGatewayActive(true);
      markPaymentAttempt(checkoutOrder.internal_order_id);
      razorpay.open();
    } catch (error) {
      if (getPaymentAttempt()?.order_id === checkoutOrder.internal_order_id) {
        try {
          const current = await apiPost<PublicOrder>("/orders/reconcile", { order_id: checkoutOrder.internal_order_id });
          if (!current.payment_retry_allowed) { goToPurchase(checkoutOrder.internal_order_id); return; }
          clearPaymentAttempt(checkoutOrder.internal_order_id);
        } catch { goToPurchase(checkoutOrder.internal_order_id); return; }
      }
      busy.current = false;
      setGatewayLoading(false);
      setGatewayActive(false);
      if (!preflightComplete || getPaymentAttempt()?.order_id === checkoutOrder.internal_order_id || error instanceof ApiError && ["ORDER_COMPLETED", "PAYMENT_PROCESSING"].includes(error.code)) {
        goToPurchase(checkoutOrder.internal_order_id);
        return;
      }
      // A synchronous open() failure can batch true/false state together, so restore explicitly.
      if (checkoutDialog.current && !checkoutDialog.current.open)
        checkoutDialog.current.showModal();
      setNotice({
        tone: "error",
        title: "Razorpay could not open",
        description: errorMessage(error, "Check your connection and try again."),
      });
    }
  };
  if (!open) return null;
  const confirmedTotal = checkoutOrder?.pricing.total_inr;
  const priceChanged =
    confirmedTotal !== undefined && confirmedTotal !== summary.total;
  return (
    <Modal
      open={open && !gatewayActive}
      dialogRef={checkoutDialog}
      onClose={close}
      label="Secure checkout"
    >
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-[#181412]/55 p-3 backdrop-blur-sm sm:p-4"
        data-testid="razorpay-checkout-modal"
      >
        <div className="animate-modal-in max-h-[94dvh] w-full max-w-lg overflow-y-auto overscroll-contain bg-[#fbf9f5] shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#2e241f]/10 bg-[#fbf9f5] px-5 py-5 sm:px-6">
            <div>
              {!verificationStarted && <p className="mock-pill" data-testid="razorpay-mode-badge">
                {checkoutOrder
                  ? `RAZORPAY · ${checkoutOrder.payment_mode.toUpperCase()} MODE`
                  : "RAZORPAY SECURE CHECKOUT"}
              </p>}
              <h2
                className={`${verificationStarted ? "text-2xl" : "mt-3 text-3xl"} font-serif text-[#29231f]`}
                data-testid="razorpay-checkout-title"
              >
                {verificationStarted ? "Payment verification" : unavailableCheckout ? "Checkout recovery" : checkoutOrder ? "Review your order" : "Complete your order"}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              onClick={close}
              disabled={orderMutation.isPending || gatewayLoading}
              data-testid="razorpay-checkout-close-btn"
              aria-label="Close checkout"
            >
              <X />
            </Button>
          </div>
          {!verificationStarted && <div className="px-5 sm:px-6"><ConnectivityNotice stage={checkoutOrder || unavailableCheckout ? "payment" : "details"} /></div>}
          {notice && (
            <div
              role={notice.tone === "error" ? "alert" : "status"}
              className={`mx-5 mt-5 border p-4 text-sm sm:mx-6 ${notice.tone === "error" ? "border-[#9b3d32]/40 bg-[#f6e7e3] text-[#7a2f26]" : "border-[#b49a6a]/55 bg-[#eadfcd] text-[#5d4b3f]"}`}
              data-testid="checkout-notice"
            >
              <p className="font-medium">{notice.title}</p>
              {notice.description && (
                <p className="mt-1 leading-relaxed">{notice.description}</p>
              )}
              {notice.paymentIssue && <PaymentSupport />}
            </div>
          )}
          {unavailableCheckout ? <section className="p-5 sm:p-6" data-testid="checkout-unavailable">
            <h3 className="font-serif text-2xl">This checkout is unavailable or expired.</h3>
            <p className="mt-3 text-sm leading-relaxed">Expiry does not mean a payment failed. Please check your saved purchase and checkout email before making another payment.</p>
            <PaymentSupport />
            <Button className="mt-5 min-h-11 w-full" disabled={!online} onClick={() => goToPurchase(unavailableCheckout)}>Check saved purchase</Button>
            <Button className="mt-3 min-h-11 w-full" variant="outline" onClick={close}>Return to store</Button>
          </section> : verificationStarted && checkoutOrder ? <>
            <VerificationRecovery pending={verifyMutation.isPending} confirmLeave={confirmLeave}
              onContinue={() => setConfirmLeave(false)}
              onLeave={() => { leftVerification.current = true; goToPurchase(checkoutOrder.internal_order_id); }}
              onCheckAgain={() => { if (callbackProof.current && !busy.current) { busy.current = true; verifyMutation.mutate(callbackProof.current); } }}
            />
            {verifyMutation.isPending && !confirmLeave && <Button className="mx-5 mb-5 min-h-11" disabled aria-busy="true" data-testid="razorpay-open-btn">Verifying payment…</Button>}
          </> : checkoutOrder ? (
            <div
              className="space-y-5 p-5 sm:p-6"
              data-testid="razorpay-review-step"
            >
              {priceChanged && (
                <div
                  className="border border-[#b49a6a]/55 bg-[#eadfcd] p-4"
                  data-testid="razorpay-price-change-notice"
                >
                  <p className="font-medium text-[#7a5c32]">
                    Your payable amount was updated after server
                    verification.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#6e655e]">
                    Please confirm the revised amount below before opening
                    Razorpay. You will never be charged more without this
                    confirmation.
                  </p>
                </div>
              )}
              <div
                className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-5"
                data-testid="razorpay-confirmed-summary"
              >
                <div className="flex justify-between text-sm text-[#6e655e]">
                  <span>Regular price</span>
                  <span>
                    {formatInr(checkoutOrder.pricing.regular_total_inr)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                  <span>Collection discount</span>
                  <span>
                    −{formatInr(checkoutOrder.pricing.automatic_discount_inr)}
                  </span>
                </div>
                {checkoutOrder.pricing.coupon_discount_inr > 0 && (
                  <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                    <span>Promotional discount</span>
                    <span>
                      −{formatInr(checkoutOrder.pricing.coupon_discount_inr)}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex justify-between border-t border-[#2e241f]/10 pt-4 font-serif text-3xl text-[#29231f]">
                  <span>Payable</span>
                  <span data-testid="razorpay-confirmed-total">
                    {formatInr(checkoutOrder.pricing.total_inr)}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#8c6d46]">
                  {checkoutOrder.pricing.message}
                </p>
              </div>
              {checkoutOrder.customer_email && (
                <div
                  className="text-sm text-[#6e655e]"
                  data-testid="razorpay-delivery-email"
                >
                  Delivery email:
                  <span className="mt-1 block break-all font-medium text-[#29231f]">
                    {checkoutOrder.customer_email}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3 text-sm leading-relaxed text-[#6e655e]">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#b49a6a]" />
                <span>
                  Razorpay will show the payment methods enabled for your
                  account. The amount is locked to order{" "}
                  {checkoutOrder.order_number}.
                </span>
              </div>
              <p className="text-xs text-[#6e655e]">
                Downloads become available in this browser only after your
                payment is verified.
              </p>
              <Button
                className="h-11 w-full sm:h-8"
                onClick={openRazorpay}
                disabled={!online || orderMutation.isPending || gatewayLoading || verifyMutation.isPending}
                aria-busy={gatewayLoading || verifyMutation.isPending}
                data-testid="razorpay-open-btn"
              >
                {gatewayLoading || verifyMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    {verifyMutation.isPending
                      ? "Verifying payment…"
                      : "Opening Razorpay…"}
                  </>
                ) : (
                  <>
                    Pay {formatInr(checkoutOrder.pricing.total_inr)} with
                    Razorpay <ExternalLink className="ml-2 size-4" />
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                className="h-11 w-full sm:h-8"
                onClick={() => {
                  setNotice(null);
                  editingDetails.current = true;
                  setCheckoutOrder(null);
                }}
                disabled={gatewayLoading || verifyMutation.isPending}
                data-testid="razorpay-edit-details-btn"
              >
                <ArrowLeft className="mr-2 size-4" />
                Edit customer details
              </Button>
            </div>
          ) : (
            <form
              className="space-y-5 p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (submitting.current || !isOnline()) return;
                submitting.current = true;
                setNotice(null);
                orderMutation.mutate(undefined);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className="text-sm text-[#6e655e]"
                  htmlFor="checkout-name"
                >
                  Full name <span aria-hidden="true">*</span>
                  <Input
                    id="checkout-name"
                    disabled={orderMutation.isPending}
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(event) => { editingDetails.current = true; setFullName(event.target.value); }}
                    className="mt-2 h-11 sm:h-8"
                    autoComplete="name"
                    data-testid="razorpay-checkout-name-input"
                  />
                </label>
                <label
                  className="text-sm text-[#6e655e]"
                  htmlFor="checkout-mobile"
                >
                  Mobile number <span aria-hidden="true">*</span>
                  <Input
                    id="checkout-mobile"
                    disabled={orderMutation.isPending}
                    required
                    minLength={7}
                    value={mobile}
                    onChange={(event) => { editingDetails.current = true; setMobile(event.target.value); }}
                    className="mt-2 h-11 sm:h-8"
                    inputMode="tel"
                    autoComplete="tel"
                    data-testid="razorpay-checkout-mobile-input"
                  />
                </label>
              </div>
              <label
                className="block text-sm text-[#6e655e]"
                htmlFor="checkout-email"
              >
                Email address <span aria-hidden="true">*</span>
                <Input
                  id="checkout-email"
                  disabled={orderMutation.isPending}
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => { editingDetails.current = true; setEmail(event.target.value); }}
                  className="mt-2 h-11 sm:h-8"
                  autoComplete="email"
                  aria-describedby="checkout-email-note"
                  data-testid="razorpay-checkout-email-input"
                />
                <span
                  id="checkout-email-note"
                  className="mt-1.5 block text-xs text-[#8c6d46]"
                >
                  Your books and purchase receipt will be delivered here.
                </span>
              </label>
              {selectedIds.length === 5 && (
                <label
                  className="block text-sm text-[#6e655e]"
                  htmlFor="checkout-coupon"
                >
                  Coupon code
                  <Input
                    id="checkout-coupon"
                    disabled={orderMutation.isPending}
                    value={coupon}
                    onChange={(event) => { editingDetails.current = true; setCoupon(event.target.value); }}
                    className="mt-2 h-11 uppercase sm:h-8"
                    placeholder="First50"
                    data-testid="razorpay-checkout-coupon-input"
                  />
                </label>
              )}
              <div
                className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-4"
                data-testid="razorpay-estimated-summary"
              >
                <div className="flex justify-between text-sm text-[#6e655e]">
                  <span>Selected books</span>
                  <span>{selectedIds.length}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-[#6e655e]">
                  <span>
                    {summary.count > 1
                      ? "Regular collection price"
                      : "Regular price"}
                  </span>
                  <span>{formatInr(summary.regularTotal)}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                  <span>Collection discount</span>
                  <span>−{formatInr(summary.automaticDiscount)}</span>
                </div>
                {summary.couponDiscount > 0 && (
                  <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                    <span>Promotional discount</span>
                    <span>−{formatInr(summary.couponDiscount)}</span>
                  </div>
                )}
                <div className="mt-3 flex justify-between border-t border-[#2e241f]/10 pt-3 font-serif text-2xl text-[#29231f]">
                  <span>Estimated total</span>
                  <span>{formatInr(summary.total)}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#8c6d46]">
                  Your products and payable amount are verified securely before
                  payment.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6e655e]">
                <LockKeyhole className="size-4 text-[#b49a6a]" />
                The configured payment mode is shown before you open Razorpay.
              </div>
              <Button
                type="submit"
                className="h-11 w-full sm:h-8"
                disabled={!online || orderMutation.isPending}
                aria-busy={orderMutation.isPending}
                data-testid="razorpay-create-order-btn"
              >
                {orderMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    Creating secure order…
                  </>
                ) : (
                  "Review order"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
