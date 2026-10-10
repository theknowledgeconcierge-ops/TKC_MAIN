"use client";
import { ArrowRight, Check, Plus, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { activeBooks as books, formatInr } from "@/lib/catalog";
import { useBagOpen, useCart, useCartActions } from "@/lib/store";
import Modal from "@/components/Modal";
import CheckoutModal from "@/components/CheckoutModal";
import BookCover from "@/components/BookCover";

const milestones = [
  { count: 1, label: "1 Book", price: "₹249" },
  { count: 2, label: "2 Books", price: "₹399" },
  { count: 3, label: "3 Books", price: "₹549" },
  { count: 4, label: "4 Books", price: "₹699" },
  { count: 5, label: "All 5", price: "₹499*" },
];

export default function SmartBag() {
  const { selectedIds, summary, persistenceError } = useCart();
  const bagOpen = useBagOpen();
  const { setBagOpen, addBook, removeBook, clearBag } = useCartActions();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Removed rows stay in place as an Undo line so the next row never slides under the finger.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [addedRecommendationIds, setAddedRecommendationIds] = useState<string[]>([]);
  const selected = books.filter((book) => selectedIds.includes(book.id));
  const rows = books.filter(
    (book) => selectedIds.includes(book.id) || removedIds.includes(book.id),
  );
  // Retain an acknowledged recommendation so its neighbour cannot slide under a repeat tap.
  const recommendations = books.filter(
    (book) => !selectedIds.includes(book.id) || addedRecommendationIds.includes(book.id),
  );
  const progress = `${(summary.count / books.length) * 100}%`;
  const message =
    summary.count === 0
      ? "Choose your first handbook to begin building your collection."
      : summary.count === 1
        ? "Add 1 more book to unlock 2 for ₹399 and save ₹99."
        : summary.count === 2
          ? "Add 1 more book to unlock 3 for ₹549 and save ₹198."
          : summary.count === 3
            ? "Add 1 more book to unlock 4 for ₹699 and save ₹297."
            : summary.count === 4
              ? "Add 1 more book to unlock all 5 for ₹499 and save ₹746."
              : "Complete collection unlocked: ₹499 promotional price (regular ₹999).";
  const closeBag = () => {
    setConfirmClear(false);
    setRemovedIds([]);
    setAddedRecommendationIds([]);
    setBagOpen(false);
  };
  const remove = (id: string) => {
    removeBook(id);
    setRemovedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  };

  return (
    <>
      <Modal
        open={bagOpen && !checkoutOpen}
        onClose={closeBag}
        label="Your book bag"
      >
        {bagOpen && (
          <button
            type="button"
            aria-label="Close shopping bag"
            className="fixed inset-0 z-[60] bg-[#181412]/30 backdrop-blur-[2px]"
            onClick={closeBag}
            data-testid="smart-bag-backdrop"
          />
        )}
        {/* A closed bag renders nothing, so cart changes elsewhere skip this whole drawer. */}
        {bagOpen && (
          <aside
            className="animate-bag-in fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col bg-[#fbf9f5] shadow-2xl"
            data-testid="smart-bag-drawer"
            aria-label="Your book bag"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#2e241f]/10 px-4 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="overline" data-testid="smart-bag-overline">
                  Your book bag
                </p>
                <h2
                  className="mt-1 font-serif text-xl text-[#29231f] sm:text-2xl"
                  data-testid="smart-bag-title"
                >
                  Your Knowledge Collection
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-1">
                {summary.count > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 px-2 text-xs text-[#8c6d46] sm:h-7"
                    onClick={() => setConfirmClear(true)}
                    aria-label="Remove all books"
                    data-testid="smart-bag-remove-all-btn"
                  >
                    <Trash2 className="size-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Remove all</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-8"
                  onClick={closeBag}
                  data-testid="smart-bag-close-btn"
                  aria-label="Close book bag"
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6">
              {persistenceError && <p role="alert" className="my-4 border border-[#9b3d32]/40 p-3 text-sm text-[#9b3d32]" data-testid="cart-storage-error">{persistenceError}</p>}
              <div
                className="relative top-0 z-20 -mx-4 mb-6 border-b border-[#2e241f]/10 bg-[#fbf9f5]/95 px-4 py-5 shadow-[0_8px_18px_rgba(24,20,18,0.04)] backdrop-blur-xl sm:sticky sm:-mx-6 sm:px-6"
                data-testid="smart-bag-tier-progress"
              >
                <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-[0.16em] text-[#8c6d46]">
                  <span>
                    {summary.count} of {books.length} books selected
                  </span>
                  <span>{progress}</span>
                </div>
                <div
                  className="relative h-3"
                  data-testid="smart-bag-milestone-track"
                >
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-[#e9dfcf]">
                    <div
                      className="h-full rounded-full bg-[#b49a6a] transition-[width] duration-500"
                      style={{ width: progress }}
                    />
                  </div>
                  {milestones.map((milestone) => {
                    const reached = summary.count >= milestone.count;
                    const current = summary.count === milestone.count;
                    const next = summary.count + 1 === milestone.count;
                    const bestValue = milestone.count === books.length;
                    return (
                      <span
                        key={milestone.count}
                        className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[background-color,border-color,transform] duration-300 ${bestValue ? "border-[#b49a6a] bg-[#302821] ring-2 ring-[#b49a6a]/25" : reached ? "border-[#b49a6a] bg-[#b49a6a]" : "border-[#cdbfae] bg-[#fbf9f5]"} ${current ? "scale-125" : next ? "scale-110" : ""}`}
                        style={{
                          left: `${(milestone.count / books.length) * 100}%`,
                        }}
                        data-testid={`smart-bag-milestone-stop-${milestone.count}`}
                        data-current={current || undefined}
                        data-next={next || undefined}
                        data-best-value={bestValue || undefined}
                      />
                    );
                  })}
                </div>
                <div
                  className="mt-2 grid grid-cols-5 gap-1"
                  data-testid="smart-bag-milestone-labels"
                >
                  {milestones.map((milestone) => {
                    const current = summary.count === milestone.count;
                    const next = summary.count + 1 === milestone.count;
                    const bestValue = milestone.count === books.length;
                    return (
                      <div
                        key={milestone.count}
                        className={`min-w-0 px-0.5 py-1.5 text-center transition-[background-color,color,border-color,transform] duration-300 ${bestValue ? "border border-[#b49a6a] bg-[#302821] text-[#f7f4ee] shadow-[0_4px_12px_rgba(48,40,33,0.2)]" : current ? "bg-[#302821] text-[#fbf9f5]" : next ? "border border-[#b49a6a]/60 bg-[#eadfcd] text-[#29231f]" : "text-[#7f736a]"} ${bestValue && (current || next) ? "-translate-y-0.5" : ""}`}
                        data-testid={`smart-bag-milestone-label-${milestone.count}`}
                        data-current={current || undefined}
                        data-next={next || undefined}
                        data-best-value={bestValue || undefined}
                      >
                        {bestValue && (
                          <span
                            className="mb-0.5 block text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-[#d8bd8a] sm:text-[7px]"
                            data-testid="smart-bag-best-value-badge"
                          >
                            Best value
                          </span>
                        )}
                        <span className="block truncate text-[10px] font-medium leading-tight sm:text-[9px]">
                          {milestone.label}
                        </span>
                        <span
                          className={`mt-0.5 block whitespace-nowrap font-mono text-[11px] leading-tight sm:text-[10px] ${bestValue ? "text-[#e9c98f]" : current ? "text-[#e9dfcf]" : next ? "text-[#7a5c32]" : "text-[#8c6d46]"}`}
                        >
                          {milestone.price}
                        </span>
                        {bestValue && (
                          <span
                            className="mt-0.5 block text-[9px] leading-[1.05] text-[#d7c8b8] sm:text-[7px]"
                            data-testid="smart-bag-best-value-promo"
                          >
                            Promo price
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p
                  className="mt-3 text-sm font-medium leading-relaxed text-[#5f554e]"
                  data-testid="smart-bag-milestone-message"
                >
                  {message}
                </p>
                <p
                  className="mt-1 text-[11px] leading-relaxed text-[#8c6d46] sm:text-[9px]"
                  data-testid="smart-bag-milestone-footnote"
                >
                  *Promotional price for all five books. The regular collection
                  price is ₹999. Your exact amount is confirmed before payment.
                </p>
              </div>

              {confirmClear && (
                <div
                  className="mb-6 border border-[#b49a6a]/50 bg-[#eadfcd] p-4"
                  data-testid="smart-bag-clear-confirmation"
                >
                  <p className="font-serif text-lg text-[#29231f]">
                    Remove every book?
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#6e655e]">
                    This clears your collection progress and current savings.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 sm:h-7"
                      onClick={() => setConfirmClear(false)}
                      data-testid="smart-bag-clear-cancel-btn"
                    >
                      Keep books
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-11 sm:h-7"
                      onClick={() => {
                        clearBag();
                        setRemovedIds([]);
                        setConfirmClear(false);
                      }}
                      data-testid="smart-bag-clear-confirm-btn"
                    >
                      Remove all
                    </Button>
                  </div>
                </div>
              )}

              {rows.length === 0 ? (
                <div
                  className="border border-dashed border-[#b49a6a]/60 bg-[#f5f0e6] p-6 text-center"
                  data-testid="smart-bag-empty-state"
                >
                  <Sparkles className="mx-auto mb-3 size-6 text-[#b49a6a]" />
                  <p className="font-serif text-xl text-[#29231f]">
                    Build your reading library
                  </p>
                  <p className="mt-2 text-sm text-[#6e655e]">
                    Choose the handbooks that match the decisions in front of you.
                  </p>
                </div>
              ) : (
                <div
                  className="border border-[#b49a6a]/35 bg-[#ded2c2] p-3"
                  data-testid="smart-bag-selected-section"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p
                      className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#5d4b3f]"
                      data-testid="smart-bag-selected-heading"
                    >
                      In your bag
                    </p>
                    <span
                      className="text-[10px] font-mono text-[#6a584c]"
                      data-testid="smart-bag-selected-count"
                    >
                      {selected.length} selected
                    </span>
                  </div>
                  <div
                    className="space-y-2"
                    data-testid="smart-bag-selected-items"
                  >
                    {rows.map((book) =>
                      selectedIds.includes(book.id) ? (
                        <div
                          className="flex gap-4 border border-[#b49a6a]/45 bg-[#cfc0ae] p-3 shadow-[0_3px_10px_rgba(46,36,31,0.06)]"
                          key={book.id}
                          data-testid={`smart-bag-item-${book.slug}`}
                        >
                          <div className="h-20 w-14 shrink-0 overflow-hidden">
                            <BookCover book={book} compact />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-serif text-base text-[#29231f]">
                              {book.title}
                            </p>
                            <p className="mt-1 font-mono text-xs text-[#584b42]">
                              {formatInr(book.selling_price_inr)} · {book.pages}{" "}
                              pages
                            </p>
                            <button
                              type="button"
                              className="-ml-2 mt-0.5 inline-flex h-11 items-center px-2 text-xs font-medium uppercase tracking-[0.14em] text-[#6d4f2d] underline-offset-4 hover:text-[#29231f] hover:underline sm:mt-1 sm:h-8"
                              onClick={() => remove(book.id)}
                              aria-label={`Remove ${book.title}`}
                              data-testid={`smart-bag-remove-${book.slug}`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="flex gap-4 border border-dashed border-[#b49a6a]/60 bg-[#e6dccf] p-3"
                          key={book.id}
                          data-testid={`smart-bag-removed-${book.slug}`}
                        >
                          <div className="h-20 w-14 shrink-0 overflow-hidden opacity-40">
                            <BookCover book={book} compact />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <p className="font-serif text-base text-[#6a584c] line-through">
                              {book.title}
                            </p>
                            <output
                              className="mt-1 text-xs text-[#584b42]"
                            >
                              Removed from your bag
                            </output>
                            {/* Undo sits away from where Remove was, so extra taps land on nothing. */}
                            <div className="mt-0.5 flex h-11 items-center justify-end sm:mt-1 sm:h-8">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-11 sm:h-8"
                                onClick={() => {
                                  addBook(book.id);
                                  setRemovedIds((ids) =>
                                    ids.filter((id) => id !== book.id),
                                  );
                                }}
                                aria-label={`Undo removing ${book.title}`}
                                data-testid={`smart-bag-undo-${book.slug}`}
                              >
                                <Undo2 className="mr-1 size-3.5" />
                                Undo
                              </Button>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {recommendations.length > 0 && (
                <div className="mt-8" data-testid="smart-bag-recommendations">
                  <p className="overline">Complete your reading collection</p>
                  <div className="mt-4 space-y-3">
                    {recommendations.map((book) => (
                      <div
                        key={book.id}
                        className="flex items-center gap-3 border border-[#2e241f]/10 bg-white p-3"
                      >
                        <div className="h-16 w-11 shrink-0 overflow-hidden">
                          <BookCover book={book} compact />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-serif text-sm leading-tight text-[#29231f]">
                            {book.title}
                          </p>
                          <p className="mt-1 text-xs text-[#6e655e]">
                            {formatInr(book.selling_price_inr)}
                          </p>
                        </div>
                        <Button
                          size="icon-xs"
                          variant="outline"
                          className="size-11 sm:size-6"
                          disabled={selectedIds.includes(book.id)}
                          onClick={() => {
                            addBook(book.id);
                            setAddedRecommendationIds((ids) => ids.includes(book.id) ? ids : [...ids, book.id]);
                          }}
                          data-testid={`smart-bag-recommend-add-${book.slug}`}
                          aria-label={selectedIds.includes(book.id) ? `${book.title} added to your bag` : `Add ${book.title}`}
                        >
                          {selectedIds.includes(book.id) ? <Check /> : <Plus />}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {summary.count > 0 && (
                <div
                  className="mt-8 border-t border-[#2e241f]/10 pt-5"
                  data-testid="smart-bag-price-summary"
                >
                  <div className="flex justify-between text-sm text-[#6e655e]">
                    <span>Regular individual total</span>
                    <span>{formatInr(summary.regularTotal)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-[#8c6d46]">
                    <span>Automatic collection discount</span>
                    <span>−{formatInr(summary.automaticDiscount)}</span>
                  </div>
                  {summary.couponDiscount > 0 && (
                    <div className="mt-2 flex justify-between gap-4 text-sm text-[#8c6d46]">
                      <span>Promotional discount</span>
                      <span>−{formatInr(summary.couponDiscount)}</span>
                    </div>
                  )}
                  <div className="mt-4 flex justify-between border-t border-[#2e241f]/10 pt-4 font-serif text-2xl text-[#29231f]">
                    <span>
                      {summary.count === 5 ? "Estimated total" : "Total"}
                    </span>
                    <span>{formatInr(summary.total)}</span>
                  </div>
                  <p className="mt-2 text-right text-xs font-mono uppercase tracking-[0.14em] text-[#8c6d46]">
                    {`${formatInr(summary.totalSavings)} saved automatically`}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-3 border-t border-[#2e241f]/10 bg-[#f5f0e6] p-6">
              <Button
                className="h-11 w-full sm:h-8"
                disabled={summary.count === 0}
                onClick={() => setCheckoutOpen(true)}
                data-testid="smart-bag-checkout-btn"
              >
                {summary.count === 5
                  ? "Get complete collection"
                  : "Checkout securely"}
                <ArrowRight className="ml-2 size-4" />
              </Button>
              <p
                className="text-center text-[11px] uppercase tracking-[0.13em] text-[#6e655e]"
                data-testid="smart-bag-payment-note"
              >
                Razorpay secure checkout · mode confirmed before payment
              </p>
            </div>
          </aside>
        )}
      </Modal>
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
      />
    </>
  );
}
