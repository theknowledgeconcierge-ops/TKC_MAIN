import { useState } from "react";
import { ArrowLeft, ExternalLink, LoaderCircle, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiPost } from "@/lib/api";
import { formatInr } from "@/lib/catalogue";
import {
  loadRazorpayCheckout,
  type Order,
  type OrderCreate,
  type RazorpayCheckoutOrder,
  type RazorpaySuccess,
  type RazorpayVerifyRequest,
} from "@/lib/payments";
import { useStore } from "@/lib/store";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    const detail = (error.body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export default function CheckoutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selectedIds, summary, setBagOpen } = useStore();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [coupon, setCoupon] = useState(selectedIds.length === 5 ? "First50" : "");
  const [checkoutOrder, setCheckoutOrder] = useState<RazorpayCheckoutOrder | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(false);

  const close = () => {
    setCheckoutOrder(null);
    setGatewayLoading(false);
    onClose();
  };

  const verifyMutation = useMutation({
    mutationFn: (payload: RazorpayVerifyRequest) => apiPost<Order>("/payments/razorpay/verify", payload),
    onSuccess: (order) => {
      window.sessionStorage.setItem("knowledge_concierge_last_order", JSON.stringify(order));
      close();
      setBagOpen(false);
      navigate(`/thank-you?order=${order.order_number}`);
      toast.success("Payment verified", { description: `Razorpay confirmed the captured ${order.payment_mode} payment.` });
    },
    onError: (error) => {
      setGatewayLoading(false);
      toast.error("Payment needs verification", { description: errorMessage(error, "We could not verify this payment yet. Please contact support with your payment reference.") });
    },
  });

  const orderMutation = useMutation({
    mutationFn: () => apiPost<RazorpayCheckoutOrder>("/payments/razorpay/order", {
      book_ids: selectedIds,
      full_name: fullName,
      email,
      mobile,
      coupon_code: selectedIds.length === 5 ? (coupon || undefined) : undefined,
    } satisfies OrderCreate),
    onSuccess: setCheckoutOrder,
    onError: (error) => toast.error("Checkout could not start", { description: errorMessage(error, "Please review your details and try again.") }),
  });

  const openRazorpay = async () => {
    if (!checkoutOrder) return;
    setGatewayLoading(true);
    try {
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");
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
        retry: { enabled: false },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setGatewayLoading(false);
            toast.info("Payment window closed", { description: "Your bag and checkout details have been preserved." });
          },
        },
        handler: (response: RazorpaySuccess) => {
          verifyMutation.mutate({
            internal_order_id: checkoutOrder.internal_order_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
        },
      });
      razorpay.on("payment.failed", () => {
        setGatewayLoading(false);
        toast.error("Payment was not completed", { description: "No access has been released. You can safely try again." });
      });
      razorpay.open();
    } catch (error) {
      setGatewayLoading(false);
      toast.error("Razorpay could not open", { description: error instanceof Error ? error.message : "Please check your connection and try again." });
    }
  };

  if (!open) return null;
  const confirmedTotal = checkoutOrder?.pricing.total_inr;
  const priceChanged = confirmedTotal !== undefined && confirmedTotal !== summary.total;

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#181412]/55 p-3 backdrop-blur-sm sm:p-4" data-testid="razorpay-checkout-modal"><div className="max-h-[94vh] w-full max-w-lg overflow-y-auto bg-[#fbf9f5] shadow-2xl"><div className="flex items-start justify-between border-b border-[#2e241f]/10 px-5 py-5 sm:px-6"><div><p className="mock-pill" data-testid="razorpay-mode-badge">{checkoutOrder ? `RAZORPAY · ${checkoutOrder.payment_mode.toUpperCase()} MODE` : "RAZORPAY SECURE CHECKOUT"}</p><h2 className="mt-3 font-serif text-3xl text-[#29231f]" data-testid="razorpay-checkout-title">{checkoutOrder ? "Review your verified total" : "Complete your order"}</h2></div><Button variant="ghost" size="icon" onClick={close} data-testid="razorpay-checkout-close-btn" aria-label="Close checkout"><X /></Button></div>{checkoutOrder ? <div className="space-y-5 p-5 sm:p-6" data-testid="razorpay-review-step">{priceChanged && <div className="border border-[#b49a6a]/55 bg-[#eadfcd] p-4" data-testid="razorpay-price-change-notice"><p className="font-medium text-[#7a5c32]">Your payable amount was updated after eligibility verification.</p><p className="mt-2 text-sm leading-relaxed text-[#6e655e]">Please confirm the revised amount below before opening Razorpay. You will never be charged more without this confirmation.</p></div>}<div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-5" data-testid="razorpay-confirmed-summary"><div className="flex justify-between text-sm text-[#6e655e]"><span>Regular price</span><span>{formatInr(checkoutOrder.pricing.regular_total_inr)}</span></div><div className="mt-2 flex justify-between text-sm text-[#8c6d46]"><span>Collection discount</span><span>−{formatInr(checkoutOrder.pricing.automatic_discount_inr)}</span></div>{checkoutOrder.pricing.coupon_discount_inr > 0 && <div className="mt-2 flex justify-between text-sm text-[#8c6d46]"><span>{checkoutOrder.pricing.coupon_code}</span><span>−{formatInr(checkoutOrder.pricing.coupon_discount_inr)}</span></div>}<div className="mt-4 flex justify-between border-t border-[#2e241f]/10 pt-4 font-serif text-3xl text-[#29231f]"><span>Payable</span><span data-testid="razorpay-confirmed-total">{formatInr(checkoutOrder.pricing.total_inr)}</span></div><p className="mt-3 text-xs leading-relaxed text-[#8c6d46]">{checkoutOrder.pricing.message}</p></div><div className="flex items-start gap-3 text-sm leading-relaxed text-[#6e655e]"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#b49a6a]" /><span>Razorpay will show the payment methods enabled for your account. The amount is locked to order {checkoutOrder.order_number}.</span></div><Button className="w-full" onClick={openRazorpay} disabled={gatewayLoading || verifyMutation.isPending} data-testid="razorpay-open-btn">{gatewayLoading || verifyMutation.isPending ? <><LoaderCircle className="mr-2 size-4 animate-spin" />Waiting for Razorpay…</> : <>Pay {formatInr(checkoutOrder.pricing.total_inr)} with Razorpay <ExternalLink className="ml-2 size-4" /></>}</Button><Button variant="ghost" className="w-full" onClick={() => setCheckoutOrder(null)} disabled={gatewayLoading || verifyMutation.isPending} data-testid="razorpay-edit-details-btn"><ArrowLeft className="mr-2 size-4" />Edit customer details</Button></div> : <form className="space-y-5 p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); orderMutation.mutate(); }}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-[#6e655e]">Full name<Input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2" autoComplete="name" data-testid="razorpay-checkout-name-input" /></label><label className="text-sm text-[#6e655e]">Mobile number<Input required minLength={7} value={mobile} onChange={(event) => setMobile(event.target.value)} className="mt-2" inputMode="tel" autoComplete="tel" data-testid="razorpay-checkout-mobile-input" /></label></div><label className="block text-sm text-[#6e655e]">Email for your confirmation<Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2" autoComplete="email" data-testid="razorpay-checkout-email-input" /></label>{selectedIds.length === 5 && <label className="block text-sm text-[#6e655e]">Coupon code<Input value={coupon} onChange={(event) => setCoupon(event.target.value)} className="mt-2 uppercase" placeholder="First50" data-testid="razorpay-checkout-coupon-input" /></label>}<div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-4" data-testid="razorpay-estimated-summary"><div className="flex justify-between text-sm text-[#6e655e]"><span>Selected books</span><span>{selectedIds.length}</span></div><div className="mt-2 flex justify-between font-serif text-2xl text-[#29231f]"><span>Estimated total</span><span>{formatInr(summary.total)}</span></div><p className="mt-2 text-xs leading-relaxed text-[#8c6d46]">The backend will verify products, pricing, payment mode, and first-time eligibility before creating the Razorpay order.</p></div><div className="flex items-center gap-2 text-xs text-[#6e655e]"><LockKeyhole className="size-4 text-[#b49a6a]" />The configured payment mode is shown before you open Razorpay.</div><Button type="submit" className="w-full" disabled={orderMutation.isPending} data-testid="razorpay-create-order-btn">{orderMutation.isPending ? <><LoaderCircle className="mr-2 size-4 animate-spin" />Creating secure order…</> : "Review verified total"}</Button></form>}</div></div>;
}
