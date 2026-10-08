import { CheckCircle2, Download } from "lucide-react";
import { Link } from "react-router-dom";

import BookCover from "@/components/BookCover";
import { Button } from "@/components/ui/button";
import { useCatalogue, formatInr } from "@/lib/catalogue";
import type { Order } from "@/lib/payments";

export default function ThankYou() {
  const { books } = useCatalogue();
  let order: Order | null = null;
  try {
    const stored = window.sessionStorage.getItem("knowledge_concierge_last_order");
    order = stored ? JSON.parse(stored) as Order : null;
  } catch {
    order = null;
  }
  const purchased = books.filter((book) => order?.books.includes(book.id));
  const verified = order?.status === "paid";
  return <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8" data-testid="thank-you-page"><div className="border border-[#b49a6a]/40 bg-[#f5f0e6] p-7 text-center sm:p-14"><CheckCircle2 className="mx-auto size-10 text-[#b49a6a]" /><p className="overline mt-5">{verified ? `Payment verified · ${order?.payment_mode} mode` : "Payment confirmation unavailable"}</p><h1 className="mt-4 font-serif text-4xl text-[#29231f] sm:text-5xl" data-testid="thank-you-heading">{verified ? (purchased.length === 5 ? "Your complete restaurant business library is ready." : "Your new business companion is ready.") : "We could not verify this purchase."}</h1><p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#6e655e]" data-testid="thank-you-copy">{verified ? `Razorpay has confirmed your ${order?.payment_mode} payment. Secure digital delivery is the next launch integration and remains unavailable in this preview.` : "Downloads are only revealed after a verified captured payment. Please return to your bag or contact support."}</p><div className="mx-auto mt-8 max-w-md border-y border-[#2e241f]/10 py-5 text-left text-sm text-[#6e655e]"><div className="flex justify-between gap-5"><span>Order</span><span className="font-mono text-[#29231f]" data-testid="thank-you-order-number">{order?.order_number ?? "—"}</span></div><div className="mt-2 flex justify-between"><span>Amount</span><span className="font-mono text-[#29231f]" data-testid="thank-you-order-total">{order ? formatInr(order.pricing.total_inr) : "—"}</span></div><div className="mt-2 flex justify-between"><span>Status</span><span className="font-mono uppercase text-[#29231f]" data-testid="thank-you-payment-status">{order?.status ?? "unverified"}</span></div></div><div className="mt-8 flex flex-wrap justify-center gap-3"><Button disabled data-testid="thank-you-download-btn"><Download className="mr-2 size-4" />Secure delivery pending</Button><Link to="/books" className="inline-flex h-10 items-center border border-[#2e241f]/20 px-5 text-sm font-medium text-[#29231f]" data-testid="thank-you-explore-btn">Continue exploring</Link></div><p className="mt-5 text-xs uppercase tracking-[0.14em] text-[#8c6d46]" data-testid="thank-you-delivery-note">{order?.delivery_mode ?? "No download access without verified payment"}</p></div>{verified && purchased.length > 0 && <div className="mt-12"><p className="overline">Your selected handbooks</p><div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">{purchased.map((book) => <div key={book.id} className="border border-[#2e241f]/10 bg-white p-3"><div className="overflow-hidden"><BookCover book={book} compact /></div><p className="mt-3 font-serif text-base text-[#29231f] sm:text-lg">{book.title}</p></div>)}</div></div>}</div>;
}