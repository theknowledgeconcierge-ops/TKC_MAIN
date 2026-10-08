import { ArrowRight, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCatalogue, formatInr } from "@/lib/catalogue";
import { useStore } from "@/lib/store";
import CheckoutModal from "@/components/CheckoutModal";
import BookCover from "@/components/BookCover";

export default function SmartBag() {
  const { books } = useCatalogue();
  const { selectedIds, bagOpen, setBagOpen, addBook, removeBook, clearBag, summary } = useStore();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const selected = books.filter((book) => selectedIds.includes(book.id));
  const remaining = books.filter((book) => !selectedIds.includes(book.id));
  const progress = `${summary.count * 20}%`;
  const message = summary.count === 0 ? "Your collection starts here." : summary.count === 1 ? "Add one more handbook and unlock your first collection discount." : summary.count === 4 ? "One more book. The complete collection." : summary.count === 5 ? "Your complete collection is unlocked." : "You're building a smarter business library.";
  const closeBag = () => {
    setConfirmClear(false);
    setBagOpen(false);
  };

  return <>
    {bagOpen && <div className="fixed inset-0 z-[60] bg-[#181412]/30 backdrop-blur-[2px]" onClick={closeBag} data-testid="smart-bag-backdrop" />}
    <aside className={`fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col bg-[#fbf9f5] shadow-2xl transition-transform duration-300 ${bagOpen ? "translate-x-0" : "translate-x-full"}`} data-testid="smart-bag-drawer" aria-label="Your book bag">
      <div className="flex items-center justify-between gap-3 border-b border-[#2e241f]/10 px-4 py-5 sm:px-6">
        <div><p className="overline" data-testid="smart-bag-overline">Your book bag</p><h2 className="mt-1 font-serif text-2xl text-[#29231f]" data-testid="smart-bag-title">Your Knowledge Collection</h2></div>
        <div className="flex shrink-0 items-center gap-1">{summary.count > 0 && <Button variant="ghost" size="sm" className="px-2 text-xs text-[#8c6d46]" onClick={() => setConfirmClear(true)} data-testid="smart-bag-remove-all-btn"><Trash2 className="mr-1 size-3.5" />Remove all</Button>}<Button variant="ghost" size="icon" onClick={closeBag} data-testid="smart-bag-close-btn" aria-label="Close book bag"><X /></Button></div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-[#2e241f]/10 bg-[#fbf9f5]/95 px-4 py-5 shadow-[0_8px_18px_rgba(24,20,18,0.04)] backdrop-blur-xl sm:-mx-6 sm:px-6" data-testid="smart-bag-tier-progress">
          <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-[0.16em] text-[#8c6d46]"><span>{summary.count} of 5 books selected</span><span>{progress}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e9dfcf]"><div className="h-full rounded-full bg-[#b49a6a] transition-all duration-500" style={{ width: progress }} /></div>
          <p className="mt-3 text-sm leading-relaxed text-[#6e655e]" data-testid="smart-bag-milestone-message">{message}</p>
        </div>

        {confirmClear && <div className="mb-6 border border-[#b49a6a]/50 bg-[#eadfcd] p-4" data-testid="smart-bag-clear-confirmation"><p className="font-serif text-lg text-[#29231f]">Remove every book?</p><p className="mt-1 text-sm leading-relaxed text-[#6e655e]">This clears your collection progress and current savings.</p><div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => setConfirmClear(false)} data-testid="smart-bag-clear-cancel-btn">Keep books</Button><Button size="sm" variant="destructive" onClick={() => { clearBag(); setConfirmClear(false); }} data-testid="smart-bag-clear-confirm-btn">Remove all</Button></div></div>}

        {selected.length === 0 ? <div className="border border-dashed border-[#b49a6a]/60 bg-[#f5f0e6] p-6 text-center" data-testid="smart-bag-empty-state"><Sparkles className="mx-auto mb-3 size-6 text-[#b49a6a]" /><p className="font-serif text-xl text-[#29231f]">Build your reading library</p><p className="mt-2 text-sm text-[#6e655e]">Choose the handbooks that match the decisions in front of you.</p></div> : <div className="space-y-4" data-testid="smart-bag-selected-items">
          {selected.map((book) => <div className="flex gap-4 border-b border-[#2e241f]/10 pb-4" key={book.id} data-testid={`smart-bag-item-${book.slug}`}><div className="h-20 w-14 shrink-0 overflow-hidden"><BookCover book={book} compact /></div><div className="min-w-0 flex-1"><p className="font-serif text-base text-[#29231f]">{book.title}</p><p className="mt-1 font-mono text-xs text-[#6e655e]">{formatInr(book.selling_price_inr)} · {book.pages} pages</p><button className="mt-2 text-xs uppercase tracking-[0.14em] text-[#8c6d46] underline-offset-4 hover:underline" onClick={() => removeBook(book.id)} data-testid={`smart-bag-remove-${book.slug}`}>Remove</button></div></div>)}
        </div>}

        {remaining.length > 0 && <div className="mt-8" data-testid="smart-bag-recommendations"><p className="overline">Complete your reading collection</p><div className="mt-4 space-y-3">{remaining.map((book) => <div key={book.id} className="flex items-center gap-3 border border-[#2e241f]/10 bg-white p-3"><div className="h-16 w-11 shrink-0 overflow-hidden"><BookCover book={book} compact /></div><div className="min-w-0 flex-1"><p className="line-clamp-2 font-serif text-sm leading-tight text-[#29231f]">{book.title}</p><p className="mt-1 text-xs text-[#6e655e]">{formatInr(book.selling_price_inr)}</p></div><Button size="icon-xs" variant="outline" onClick={() => addBook(book.id)} data-testid={`smart-bag-recommend-add-${book.slug}`} aria-label={`Add ${book.title}`}><Plus /></Button></div>)}</div></div>}
        {summary.count > 0 && <div className="mt-8 border-t border-[#2e241f]/10 pt-5" data-testid="smart-bag-price-summary"><div className="flex justify-between text-sm text-[#6e655e]"><span>Regular individual total</span><span>{formatInr(summary.regularTotal)}</span></div><div className="mt-2 flex justify-between text-sm text-[#8c6d46]"><span>Automatic collection discount</span><span>−{formatInr(summary.automaticDiscount)}</span></div>{summary.couponDiscount > 0 && <div className="mt-2 flex justify-between gap-4 text-sm text-[#8c6d46]"><span>First50 · eligibility checked at checkout</span><span>−{formatInr(summary.couponDiscount)}</span></div>}<div className="mt-4 flex justify-between border-t border-[#2e241f]/10 pt-4 font-serif text-2xl text-[#29231f]"><span>{summary.count === 5 ? "Estimated total" : "Total"}</span><span>{formatInr(summary.total)}</span></div><p className="mt-2 text-right text-xs font-mono uppercase tracking-[0.14em] text-[#8c6d46]">{summary.count === 5 ? `${formatInr(summary.totalSavings)} potential first-time savings` : `${formatInr(summary.totalSavings)} saved automatically`}</p></div>}
      </div>
      <div className="space-y-3 border-t border-[#2e241f]/10 bg-[#f5f0e6] p-6"><Button className="w-full" disabled={summary.count === 0} onClick={() => setCheckoutOpen(true)} data-testid="smart-bag-checkout-btn">{summary.count === 5 ? "Get complete collection" : "Checkout securely"}<ArrowRight className="ml-2 size-4" /></Button><p className="text-center text-[11px] uppercase tracking-[0.13em] text-[#6e655e]" data-testid="smart-bag-payment-note">Razorpay secure checkout · mode confirmed before payment</p></div>
    </aside>
    <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
  </>;
}
