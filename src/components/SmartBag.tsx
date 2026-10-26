"use client";
import { ArrowRight, Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { activeBooks as books, formatInr } from "@/lib/catalog";
import { useBagOpen, useCheckoutOpen, useCart, useCartActions } from "@/lib/store";
import Modal from "@/components/Modal";
import CheckoutModal from "@/components/CheckoutModal";
import ConnectivityNotice from "@/components/ConnectivityNotice";
import BookCover from "@/components/BookCover";

import { seriesForBook, booksForSeries, type SeriesId } from "@/lib/catalog/series";

export default function SmartBag() {
  const { selectedIds, summary, persistenceError } = useCart();
  const bagOpen = useBagOpen();
  const { setBagOpen, setCheckoutOpen, addBook, removeBook, clearBag } = useCartActions();
  const checkoutOpen = useCheckoutOpen();
  const [confirmClear, setConfirmClear] = useState(false);
  const lastRemovalTap = useRef<{ x: number; y: number; at: number } | null>(null);
  const [addedRecommendationIds, setAddedRecommendationIds] = useState<string[]>([]);
  const [expandedRecommendations, setExpandedRecommendations] = useState<SeriesId | null>(null);
  const selected = books.filter((book) => selectedIds.includes(book.id));
  // Selection order follows additions, including additions in another tab. A
  // deliberately mixed bag stays intact while its newest series guides discovery.
  const latestBook = books.find(book => book.id === selectedIds.at(-1));
  const focusedSeries = latestBook ? seriesForBook(latestBook) : null;
  const focusedBooks = focusedSeries ? booksForSeries(focusedSeries.id) : [];
  const remaining = focusedBooks.filter(book => !selectedIds.includes(book.id));
  // Retain an acknowledged recommendation so its neighbour cannot slide under a repeat tap.
  const recommendations = remaining.length ? focusedBooks.filter(
    (book) => !selectedIds.includes(book.id) || addedRecommendationIds.includes(book.id),
  ) : [];
  const visibleRecommendations = expandedRecommendations === focusedSeries?.id ? recommendations : recommendations.slice(0, 2);
  const closeBag = () => {
    setConfirmClear(false);
    lastRemovalTap.current = null;
    setAddedRecommendationIds([]);
    setExpandedRecommendations(null);
    setBagOpen(false);
  };
  const remove = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      const previous = lastRemovalTap.current;
      lastRemovalTap.current = {
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
      };
      // Absorb a tap burst where the next row slides under the finger, without delaying removal.
      if (
        previous && event.timeStamp - previous.at < 400 &&
        Math.abs(event.clientX - previous.x) < 24 &&
        Math.abs(event.clientY - previous.y) < 24
      ) return;
    }
    removeBook(id);
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
              {!checkoutOpen && <ConnectivityNotice stage="details" />}
              {persistenceError && <p role="alert" className="my-4 border border-[#9b3d32]/40 p-3 text-sm text-[#9b3d32]" data-testid="cart-storage-error">{persistenceError}</p>}
              {(focusedSeries ? [focusedSeries] : []).map(info => {
                const seriesBooks = booksForSeries(info.id);
                const count = seriesBooks.filter(book => selectedIds.includes(book.id)).length;
                const progress = `${Math.round(count / seriesBooks.length * 100)}%`;
                const milestones = seriesBooks.map((_, index) => ({ count: index + 1, label: index + 1 === seriesBooks.length ? `All ${seriesBooks.length}` : `${index + 1} ${index ? "Books" : "Book"}`, price: formatInr(index + 1 === seriesBooks.length ? info.bundlePrice : seriesBooks.slice(0, index + 1).reduce((sum, book) => sum + book.selling_price_inr, 0)) }));
                const message = count === seriesBooks.length ? `Complete series unlocked: ₹499.` : `Add ${seriesBooks.length - count} ${seriesBooks.length - count === 1 ? "book" : "books"} to complete this series for ₹499.`;
                return <div key={info.id}
                className="relative top-0 z-20 -mx-4 mb-6 border-b border-[#2e241f]/10 bg-[#fbf9f5]/95 px-4 py-5 shadow-[0_8px_18px_rgba(24,20,18,0.04)] backdrop-blur-xl sm:sticky sm:-mx-6 sm:px-6"
                data-testid="smart-bag-tier-progress"
                data-series={info.id}
              >
                <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-[0.16em] text-[#8c6d46]">
                  <span>
                    {info.name}: {count} of {seriesBooks.length} books selected
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
                    const reached = count >= milestone.count;
                    const current = count === milestone.count;
                    const next = count + 1 === milestone.count;
                    const bestValue = milestone.count === seriesBooks.length;
                    return (
                      <span
                        key={milestone.count}
                        className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[background-color,border-color,transform] duration-300 ${bestValue ? "border-[#b49a6a] bg-[#302821] ring-2 ring-[#b49a6a]/25" : reached ? "border-[#b49a6a] bg-[#b49a6a]" : "border-[#cdbfae] bg-[#fbf9f5]"} ${current ? "scale-125" : next ? "scale-110" : ""}`}
                        style={{
                          left: `${(milestone.count / seriesBooks.length) * 100}%`,
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
                  className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${seriesBooks.length}, minmax(0, 1fr))` }}
                  data-testid="smart-bag-milestone-labels"
                >
                  {milestones.map((milestone) => {
                    const current = count === milestone.count;
                    const next = count + 1 === milestone.count;
                    const bestValue = milestone.count === seriesBooks.length;
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
                            Bundle price
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
                  {formatInr(seriesBooks[0].selling_price_inr)} per book · Complete this {seriesBooks.length}-book series for {formatInr(info.bundlePrice)}. Savings apply automatically.
                </p>
              </div>;
              })}

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
                        lastRemovalTap.current = null;
                        setConfirmClear(false);
                      }}
                      data-testid="smart-bag-clear-confirm-btn"
                    >
                      Remove all
                    </Button>
                  </div>
                </div>
              )}

              {selected.length === 0 ? (
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
                    {selected.map((book) => (
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
                            onClick={(event) => remove(book.id, event)}
                            aria-label={`Remove ${book.title}`}
                            data-testid={`smart-bag-remove-${book.slug}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recommendations.length > 0 && focusedSeries && (
                <div className="mt-6" data-testid="smart-bag-recommendations" data-series={focusedSeries.id}>
                  <p className="overline">Recommended next</p>
                  <p className="mt-1 text-xs text-[#6e655e]">Continue the {focusedSeries.name}.</p>
                  <div className="mt-3 space-y-2">
                    {visibleRecommendations.map((book) => (
                      <div
                        key={book.id}
                        className="flex items-center gap-3 border border-[#2e241f]/10 bg-white px-3 py-2"
                      >
                        <div className="h-12 w-8 shrink-0 overflow-hidden">
                          <BookCover book={book} compact sizes="32px" />
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
                            lastRemovalTap.current = null;
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
                  {recommendations.length > 2 && (
                    <Button variant="ghost" size="sm" className="mt-2 min-h-11 w-full text-xs text-[#795c35]" data-testid="smart-bag-more-recommendations" aria-expanded={expandedRecommendations === focusedSeries.id} onClick={() => setExpandedRecommendations(expandedRecommendations === focusedSeries.id ? null : focusedSeries.id)}>
                      {expandedRecommendations === focusedSeries.id ? "Show fewer recommendations" : `See ${recommendations.length - 2} more from this series`}
                    </Button>
                  )}
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
                      Total
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
                Checkout securely
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
