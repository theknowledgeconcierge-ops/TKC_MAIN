"use client";
import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  LockKeyhole,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { CheckoutOrder, PublicOrder, PricingQuote } from "@/lib/commerce/types";
import { useCart, useCartActions } from "@/lib/store";
import { mergePurchaseState } from "@/lib/commerce/purchase-state";
import { createOrderSchema } from "@/lib/commerce/validation";
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const bookIds = [...selectedIds].sort();
  const quote = useQuery({
    queryKey: ["checkout-quote", bookIds, selectedIds.length === 5 ? coupon.trim() : ""],
    queryFn: () => apiPost<PricingQuote>("/orders/quote", {
      book_ids: bookIds,
      ...(selectedIds.length === 5 && coupon.trim() ? { coupon_code: coupon.trim() } : {}),
    }),
    enabled: open && online && bookIds.length > 0,
    retry: 1,
    staleTime: 30000,
  });
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
    setPaymentUncertain(false);
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
    setPaymentUncertain(false);
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
    onSuccess: async (order, recoverId) => {
      editingDetails.current = false;
      setCheckoutOrder(order);
      setFullName(order.customer_name);
      setEmail(order.customer_email ?? "");
      setMobile(order.customer_mobile);
      rememberOrder(order.internal_order_id);
      if (!recoverId) await openRazorpay(order);
    },
    onError: (error, recoverId) => {
      if (recoverId) {
        if (error instanceof ApiError && error.status === 404) { setUnavailableCheckout(recoverId); return; }
        if (error instanceof ApiError && error.code === "ORDER_COMPLETED") { goToPurchase(recoverId); return; }
        if (error instanceof ApiError && error.code === "CHECKOUT_PRICE_CHANGED") {
          editingDetails.current = true;
          setCheckoutOrder(null);
        }
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
    if (!open || unavailableCheckout || busy.current || submitting.current || verificationStarted || gatewayActive || paymentUncertain) return;
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
    // Fetch Razorpay while details are entered; Pay still waits for a verified order.
    if (open && online) loadRazorpayCheckout().catch(() => {});
  }, [open, online]);
  const openRazorpay = async (preparedOrder: CheckoutOrder) => {
    if (busy.current || !isOnline()) return;
    let checkoutOrder = preparedOrder;
    busy.current = true;
    paymentFailed.current = false;
    setNotice(null);
    setGatewayLoading(true);
    try {
      // Recheck across tabs and use the freshly returned authoritative amount/prefill.
      checkoutOrder = await apiPost<CheckoutOrder>("/orders/resume", { order_id: checkoutOrder.internal_order_id });
      setCheckoutOrder(checkoutOrder);
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
            setGatewayActive(false);
            try {
              const current = await apiPost<PublicOrder>("/orders/reconcile", { order_id: checkoutOrder.internal_order_id });
              if (current.status === "paid" || current.status === "refunded") { goToPurchase(checkoutOrder.internal_order_id); return; }
              if (!current.payment_retry_allowed) { showUncertainPayment(); return; }
              clearPaymentAttempt(checkoutOrder.internal_order_id);
            } catch { showUncertainPayment(); return; }
            busy.current = false;
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
          // Keep the verification state here until the server confirms capture.
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
      setGatewayActive(false);
      // Failed preflight/open is recoverable here. Uncertain charge outcomes never
      // enable another Pay until the existing server reconciliation permits it.
      if (getPaymentAttempt()?.order_id === checkoutOrder.internal_order_id ||
        error instanceof ApiError && ["ORDER_COMPLETED", "PAYMENT_PROCESSING"].includes(error.code)) {
        try {
          const current = await apiPost<PublicOrder>("/orders/reconcile", { order_id: checkoutOrder.internal_order_id });
          if (["paid", "refunded"].includes(current.status)) { goToPurchase(checkoutOrder.internal_order_id); return; }
          if (!current.payment_retry_allowed) { showUncertainPayment(); return; }
          clearPaymentAttempt(checkoutOrder.internal_order_id);
        } catch { showUncertainPayment(); return; }
      }
      busy.current = false;
      setGatewayLoading(false);
      setGatewayActive(false);
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
  const showUncertainPayment = () => {
    busy.current = false;
    setGatewayLoading(false);
    setPaymentUncertain(true);
    if (checkoutDialog.current && !checkoutDialog.current.open) checkoutDialog.current.showModal();
    setNotice({ tone: "info", title: "We're still checking your payment. Please don't pay again yet.", paymentIssue: true });
  };
  const checkUncertainPayment = async () => {
    if (!checkoutOrder || busy.current || !isOnline()) return;
    busy.current = true;
    setCheckingPayment(true);
    try {
      const current = await apiPost<PublicOrder>("/orders/reconcile", { order_id: checkoutOrder.internal_order_id });
      if (["paid", "refunded"].includes(current.status)) { goToPurchase(checkoutOrder.internal_order_id); return; }
      if (current.payment_retry_allowed) {
        clearPaymentAttempt(checkoutOrder.internal_order_id);
        setPaymentUncertain(false);
        setNotice({ tone: "info", title: "No payment was completed. You can safely retry this checkout." });
      }
    } catch { showUncertainPayment(); }
    finally { busy.current = false; setCheckingPayment(false); }
  };
  const editField = (field: string) => {
    editingDetails.current = true;
    setCheckoutOrder(null);
    setFieldErrors(current => ({ ...current, [field]: "" }));
  };
  if (!open) return null;
  const pricing = checkoutOrder?.pricing ?? quote.data;
  const total = pricing?.total_inr;
  const paymentBusy = orderMutation.isPending || gatewayLoading || checkingPayment;
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
                {verificationStarted ? "Payment verification" : unavailableCheckout ? "Checkout recovery" : "Complete your order"}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              onClick={close}
              disabled={paymentBusy}
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
          </> : (
            <form
              className="space-y-5 p-5 sm:p-6"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (submitting.current || busy.current || paymentUncertain || !isOnline() || !pricing) return;
                const valid = createOrderSchema.pick({ full_name: true, email: true, mobile: true }).safeParse({
                  full_name: fullName.trim(), email: email.trim(), mobile: mobile.trim(),
                });
                if (!valid.success) {
                  const errors: Record<string, string> = {};
                  for (const issue of valid.error.issues) {
                    const field = String(issue.path[0]);
                    errors[field] = field === "full_name" ? "Enter your full name (at least 2 characters)." : field === "email" ? "Enter a valid email address." : "Enter a valid mobile number (7–20 characters).";
                  }
                  setFieldErrors(errors);
                  const first = Object.keys(errors)[0];
                  document.getElementById(first === "full_name" ? "checkout-name" : first === "email" ? "checkout-email" : "checkout-mobile")?.focus();
                  return;
                }
                setFieldErrors({});
                submitting.current = true;
                setNotice(null);
                if (checkoutOrder) void openRazorpay(checkoutOrder).finally(() => { submitting.current = false; });
                else orderMutation.mutate(undefined);
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
                    disabled={paymentBusy || paymentUncertain}
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(event) => { editField("full_name"); setFullName(event.target.value); }}
                    className="mt-2 h-11 sm:h-8"
                    autoComplete="name"
                    aria-invalid={!!fieldErrors.full_name}
                    aria-describedby={fieldErrors.full_name ? "checkout-name-error" : undefined}
                    data-testid="razorpay-checkout-name-input"
                  />
                  {fieldErrors.full_name && <span id="checkout-name-error" className="mt-1 block text-xs text-[#9b3d32]" role="alert">{fieldErrors.full_name}</span>}
                </label>
                <label
                  className="text-sm text-[#6e655e]"
                  htmlFor="checkout-mobile"
                >
                  Mobile number <span aria-hidden="true">*</span>
                  <Input
                    id="checkout-mobile"
                    disabled={paymentBusy || paymentUncertain}
                    required
                    minLength={7}
                    value={mobile}
                    onChange={(event) => { editField("mobile"); setMobile(event.target.value); }}
                    className="mt-2 h-11 sm:h-8"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-invalid={!!fieldErrors.mobile}
                    aria-describedby={fieldErrors.mobile ? "checkout-mobile-error" : undefined}
                    data-testid="razorpay-checkout-mobile-input"
                  />
                  {fieldErrors.mobile && <span id="checkout-mobile-error" className="mt-1 block text-xs text-[#9b3d32]" role="alert">{fieldErrors.mobile}</span>}
                </label>
              </div>
              <label
                className="block text-sm text-[#6e655e]"
                htmlFor="checkout-email"
              >
                Email address <span aria-hidden="true">*</span>
                <Input
                  id="checkout-email"
                  disabled={paymentBusy || paymentUncertain}
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => { editField("email"); setEmail(event.target.value); }}
                  className="mt-2 h-11 sm:h-8"
                  autoComplete="email"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "checkout-email-note checkout-email-error" : "checkout-email-note"}
                  data-testid="razorpay-checkout-email-input"
                />
                {fieldErrors.email && <span id="checkout-email-error" className="mt-1 block text-xs text-[#9b3d32]" role="alert">{fieldErrors.email}</span>}
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
                    disabled={paymentBusy || paymentUncertain}
                    value={coupon}
                    onChange={(event) => { editField("coupon"); setCoupon(event.target.value); }}
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
                  <span>{pricing?.book_count ?? selectedIds.length}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-[#6e655e]">
                  <span>
                    {summary.count > 1
                      ? "Regular collection price"
                      : "Regular price"}
                  </span>
                  <span>{formatInr(pricing?.regular_total_inr ?? summary.regularTotal)}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                  <span>Collection discount</span>
                  <span>−{formatInr(pricing?.automatic_discount_inr ?? summary.automaticDiscount)}</span>
                </div>
                {(pricing?.coupon_discount_inr ?? summary.couponDiscount) > 0 && (
                  <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                    <span>Promotional discount</span>
                    <span>−{formatInr(pricing?.coupon_discount_inr ?? summary.couponDiscount)}</span>
                  </div>
                )}
                <div className="mt-3 flex justify-between border-t border-[#2e241f]/10 pt-3 font-serif text-2xl text-[#29231f]">
                  <span>Payable</span>
                  <span data-testid="razorpay-confirmed-total">{total === undefined ? "Checking…" : formatInr(total)}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#8c6d46]">
                  Your products and payable amount are verified securely before
                  payment.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6e655e]">
                <LockKeyhole className="size-4 text-[#b49a6a]" />
                Your payment details are handled securely by Razorpay.
              </div>
              {quote.isError && !checkoutOrder && <div role="alert" className="text-sm text-[#9b3d32]">
                {errorMessage(quote.error, "We couldn't check your total. Please retry.")}
                <Button type="button" variant="ghost" onClick={() => { void quote.refetch(); }}>Retry price check</Button>
              </div>}
              {paymentUncertain ? <Button type="button" className="min-h-11 w-full" disabled={!online || checkingPayment}
                onClick={() => { void checkUncertainPayment(); }} aria-busy={checkingPayment}>Check payment status</Button> : <Button
                type="submit"
                className="min-h-11 w-full bg-black text-white hover:bg-black/85 active:bg-black/75"
                disabled={!online || paymentBusy || total === undefined || (!checkoutOrder && quote.isError)}
                aria-busy={paymentBusy || quote.isPending}
                data-testid="razorpay-create-order-btn"
              >
                {paymentBusy ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    {gatewayLoading ? "Opening Razorpay…" : "Creating secure order…"}
                  </>
                ) : (
                  total === undefined ? "Checking total…" : `Pay ${formatInr(total)} with Razorpay`
                )}
              </Button>}
              <p className="text-center text-xs leading-relaxed text-[#6e655e]">Secure payment powered by Razorpay. Your books will be delivered to your email after successful payment.</p>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
