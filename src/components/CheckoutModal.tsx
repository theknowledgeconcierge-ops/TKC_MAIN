"use client";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Modal from "@/components/Modal";
import { ApiError, apiPost } from "@/lib/api";
import { formatInr } from "@/lib/catalog";
import {
  readStorage,
  writeStorage,
  randomCheckoutToken,
  rememberOrder,
} from "@/lib/browser-storage";
import { loadRazorpayCheckout, type RazorpaySuccess } from "@/lib/razorpay-checkout";
import type { CheckoutOrder, PublicOrder } from "@/lib/commerce/types";
import { useStore } from "@/lib/store";
function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
export default function CheckoutModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { selectedIds, summary, setBagOpen } = useStore();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [coupon, setCoupon] = useState("");
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(
    null,
  );
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayActive, setGatewayActive] = useState(false);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const close = () => {
    if (busy.current) return;
    setCheckoutOrder(null);
    setGatewayLoading(false);
    onClose();
  };
  const goToPurchase = (id: string) => {
    busy.current = false;
    setGatewayLoading(false);
    setGatewayActive(false);
    onClose();
    setBagOpen(false);
    router.push("/thank-you?order=" + id);
  };
  const verifyMutation = useMutation({
    mutationFn: (payload: { internal_order_id: string } & RazorpaySuccess) =>
      apiPost<PublicOrder>("/payments/verify", payload),
    onSuccess: (order) => {
      goToPurchase(order.id);
    },
    onError: (error) => {
      toast.info("Checking your payment", {
        description: errorMessage(
          error,
          "The payment may have succeeded. Check its status before trying again.",
        ),
      });
      if (checkoutOrder) goToPurchase(checkoutOrder.internal_order_id);
    },
  });
  const orderMutation = useMutation({
    mutationFn: async () => {
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
      const stored = readStorage("tkc_checkout_attempt");
      const attempt =
        stored && typeof stored === "object"
          ? (stored as {
              fingerprint?: string;
              token?: string;
              order_id?: string;
            })
          : null;
      if (attempt?.fingerprint === fingerprint && attempt.order_id)
        return apiPost<CheckoutOrder>("/orders/resume", {
          order_id: attempt.order_id,
        });
      const token =
        attempt?.fingerprint === fingerprint &&
        typeof attempt.token === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(attempt.token)
          ? attempt.token
          : randomCheckoutToken();
      // Persist only the retry capability, not customer details. Discard it once the HttpOnly cookie is set.
      writeStorage("tkc_checkout_attempt", { fingerprint, token });
      return apiPost<CheckoutOrder>("/orders", {
        ...payload,
        checkout_token: token,
      });
    },
    onSuccess: (order) => {
      setCheckoutOrder(order);
      rememberOrder(order.internal_order_id);
      const previous = readStorage("tkc_checkout_attempt") as {
        fingerprint?: string;
      } | null;
      writeStorage("tkc_checkout_attempt", {
        fingerprint: previous?.fingerprint,
        order_id: order.internal_order_id,
      });
    },
    onError: (error) =>
      toast.error("Checkout could not start", {
        description: errorMessage(
          error,
          "Check your connection and retry the same checkout.",
        ),
      }),
  });
  const saveLink = async () => {
    if (!checkoutOrder) return;
    try {
      const { url } = await apiPost<{ url: string }>("/orders/recovery-link", {
        order_id: checkoutOrder.internal_order_id,
      });
      const blob = new Blob(
        [
          url +
            "\nKeep this private. This link grants access to your purchase.\n",
        ],
        { type: "text/plain" },
      );
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = checkoutOrder.order_number + "-purchase-link.txt";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(
        errorMessage(error, "Could not save the purchase link. Try again."),
      );
    }
  };
  const openRazorpay = async () => {
    if (!checkoutOrder || busy.current) return;
    busy.current = true;
    setGatewayLoading(true);
    try {
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
          email: checkoutOrder.customer_email,
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
          ondismiss: () => {
            busy.current = false;
            setGatewayLoading(false);
            setGatewayActive(false);
            toast.info("Payment window closed", {
              description: "You can return to this order from My purchases.",
            });
          },
        },
        handler: (response: RazorpaySuccess) => {
          verifyMutation.mutate({
            internal_order_id: checkoutOrder.internal_order_id,
            ...response,
          });
        },
      });
      // The provider keeps its iframe open for retries after payment.failed.
      razorpay.on("payment.failed", () => {
        toast.error("Payment was not completed", {
          description:
            "Retry within Razorpay, or close it and check My purchases.",
        });
      });
      // Native top-layer dialogs would otherwise hide/inert Razorpay's body-mounted iframe.
      checkoutDialog.current?.close();
      setGatewayActive(true);
      razorpay.open();
    } catch (error) {
      busy.current = false;
      setGatewayLoading(false);
      setGatewayActive(false);
      // A synchronous open() failure can batch true/false state together, so restore explicitly.
      if (checkoutDialog.current && !checkoutDialog.current.open)
        checkoutDialog.current.showModal();
      toast.error("Razorpay could not open", {
        description: errorMessage(
          error,
          "Check your connection and try again.",
        ),
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
        <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto bg-[#fbf9f5] shadow-2xl">
          <div className="flex items-start justify-between border-b border-[#2e241f]/10 px-5 py-5 sm:px-6">
            <div>
              <p className="mock-pill" data-testid="razorpay-mode-badge">
                {checkoutOrder
                  ? `RAZORPAY · ${checkoutOrder.payment_mode.toUpperCase()} MODE`
                  : "RAZORPAY SECURE CHECKOUT"}
              </p>
              <h2
                className="mt-3 font-serif text-3xl text-[#29231f]"
                data-testid="razorpay-checkout-title"
              >
                {checkoutOrder
                  ? "Review your verified total"
                  : "Complete your order"}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={close}
              data-testid="razorpay-checkout-close-btn"
              aria-label="Close checkout"
            >
              <X />
            </Button>
          </div>
          {checkoutOrder ? (
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
                    Your payable amount was updated after eligibility
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
                    <span>{checkoutOrder.pricing.coupon_code}</span>
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
              <div className="flex items-start gap-3 text-sm leading-relaxed text-[#6e655e]">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#b49a6a]" />
                <span>
                  Razorpay will show the payment methods enabled for your
                  account. The amount is locked to order{" "}
                  {checkoutOrder.order_number}.
                </span>
              </div>
              <button
                type="button"
                className="w-full text-sm text-[#8c6d46] underline"
                onClick={saveLink}
                data-testid="checkout-save-purchase-link"
              >
                Save your private purchase link
              </button>
              <p className="text-xs text-[#6e655e]">
                Keep this link to return on another device. It grants access to
                your purchase; keep it private. No email is sent.
              </p>
              <Button
                className="w-full"
                onClick={openRazorpay}
                disabled={gatewayLoading || verifyMutation.isPending}
                data-testid="razorpay-open-btn"
              >
                {gatewayLoading || verifyMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    Waiting for Razorpay…
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
                className="w-full"
                onClick={() => setCheckoutOrder(null)}
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
                orderMutation.mutate();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className="text-sm text-[#6e655e]"
                  htmlFor="checkout-name"
                >
                  Full name
                  <Input
                    id="checkout-name"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="mt-2"
                    autoComplete="name"
                    data-testid="razorpay-checkout-name-input"
                  />
                </label>
                <label
                  className="text-sm text-[#6e655e]"
                  htmlFor="checkout-mobile"
                >
                  Mobile number
                  <Input
                    id="checkout-mobile"
                    required
                    minLength={7}
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    className="mt-2"
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
                Email for your purchase record
                <Input
                  id="checkout-email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2"
                  autoComplete="email"
                  data-testid="razorpay-checkout-email-input"
                />
              </label>
              {selectedIds.length === 5 && (
                <label
                  className="block text-sm text-[#6e655e]"
                  htmlFor="checkout-coupon"
                >
                  Coupon code
                  <Input
                    id="checkout-coupon"
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value)}
                    className="mt-2 uppercase"
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
                <div className="mt-2 flex justify-between font-serif text-2xl text-[#29231f]">
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
                className="w-full"
                disabled={orderMutation.isPending}
                data-testid="razorpay-create-order-btn"
              >
                {orderMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    Creating secure order…
                  </>
                ) : (
                  "Review verified total"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
