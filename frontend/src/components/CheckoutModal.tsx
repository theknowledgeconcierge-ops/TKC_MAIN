import { LoaderCircle, LockKeyhole, X } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { formatInr } from "@/lib/catalogue";
import { useStore } from "@/lib/store";

interface OrderResponse { id: string; order_number: string; status: string; customer_name: string; customer_email: string; books: string[]; pricing: { total_inr: number; coupon_discount_inr: number; message: string }; created_at: string; delivery_mode: string }

export default function CheckoutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selectedIds, summary, setBagOpen } = useStore();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [coupon, setCoupon] = useState(selectedIds.length === 5 ? "First50" : "");
  const mutation = useMutation({
    mutationFn: () => apiPost<OrderResponse>("/orders", { book_ids: selectedIds, full_name: fullName, email, mobile, coupon_code: coupon || undefined }),
    onSuccess: (order) => { window.sessionStorage.setItem("knowledge_concierge_last_order", JSON.stringify(order)); onClose(); setBagOpen(false); navigate(`/thank-you?order=${order.order_number}`); toast.success("Mocked payment verified", { description: "Your confirmation page is ready." }); },
    onError: () => toast.error("We could not create the mocked order", { description: "Please review your details and try again." }),
  });
  if (!open) return null;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#181412]/55 p-4 backdrop-blur-sm" data-testid="mock-checkout-modal"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto bg-[#fbf9f5] shadow-2xl"><div className="flex items-start justify-between border-b border-[#2e241f]/10 px-6 py-5"><div><p className="mock-pill" data-testid="mock-checkout-badge">MOCKED RAZORPAY GATEWAY · TEST MODE</p><h2 className="mt-3 font-serif text-3xl text-[#29231f]" data-testid="mock-checkout-title">Complete your order</h2></div><Button variant="ghost" size="icon" onClick={onClose} data-testid="mock-razorpay-close-btn" aria-label="Close checkout"><X /></Button></div><form className="space-y-5 p-6" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-[#6e655e]">Full name<Input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2" data-testid="mock-checkout-name-input" /></label><label className="text-sm text-[#6e655e]">Mobile number<Input required minLength={7} value={mobile} onChange={(event) => setMobile(event.target.value)} className="mt-2" data-testid="mock-checkout-mobile-input" /></label></div><label className="block text-sm text-[#6e655e]">Email for your confirmation<Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2" data-testid="mock-checkout-email-input" /></label><label className="block text-sm text-[#6e655e]">Coupon code<Input value={coupon} onChange={(event) => setCoupon(event.target.value)} className="mt-2 uppercase" placeholder="First50 for eligible first-time buyers" data-testid="mock-checkout-coupon-input" /></label><div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-4" data-testid="mock-checkout-summary"><div className="flex justify-between text-sm text-[#6e655e]"><span>Selected books</span><span>{selectedIds.length}</span></div><div className="mt-2 flex justify-between font-serif text-2xl text-[#29231f]"><span>Demo total</span><span>{formatInr(summary.total)}</span></div><p className="mt-2 text-xs leading-relaxed text-[#8c6d46]">The final amount is rechecked server-side after your email is verified. {selectedIds.length === 5 ? "First50 is conditional on first-time eligibility." : "Your collection discount is applied automatically."}</p></div><div className="flex items-center gap-2 text-xs text-[#6e655e]"><LockKeyhole className="size-4 text-[#b49a6a]" />No financial charge is made in this MOCKED flow.</div><Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="mock-razorpay-confirm-btn">{mutation.isPending ? <><LoaderCircle className="mr-2 size-4 animate-spin" />Verifying demo order…</> : "Confirm mocked payment"}</Button></form></div></div>;
}
