"use client";
import { ArrowRight } from "lucide-react";
import { activeBooks, formatInr } from "@/lib/catalog";
import type { PricingQuote } from "@/lib/commerce/types";
import { series, booksForSeries, type SeriesId } from "@/lib/catalog/series";
import { bundleOffer } from "@/lib/bundle-offer";
import BookCover from "./BookCover";
import { Button } from "./ui/button";

export default function BundleUpsell({ seriesId, ids, current, bundle, loading, onUpgrade, onDecline, onRetry }: {
  seriesId: SeriesId; ids: string[]; current?: PricingQuote; bundle?: PricingQuote; loading: boolean;
  onUpgrade: () => void; onDecline: () => void; onRetry: () => void;
}) {
  const info = series.find(item => item.id === seriesId)!;
  const books = booksForSeries(seriesId);
  const offer = current && bundle ? bundleOffer(current, bundle, books.length, info.bundlePrice) : null;
  const selection = activeBooks.filter(book => ids.includes(book.id));
  return <section className="space-y-3 px-5 pb-5 pt-3 sm:px-6 sm:pb-6" data-testid="bundle-upsell">
    {offer && bundle ? <>
      <h3 className="font-serif text-2xl leading-tight text-[#29231f]" data-testid="bundle-upsell-headline">{offer.headline}</h3>
      <p className="text-xs leading-relaxed text-[#6e655e]">{offer.supporting}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1.25fr)] items-center gap-2">
        <div className="min-w-0" data-testid="bundle-upsell-selection">
          <p className="mb-2 text-[9px] tracking-[0.12em] text-[#8c6d46]">YOUR SELECTION</p>
          <div className="flex items-center py-1">
            {selection.map((book, index) => <div key={book.id} className="relative w-9 shrink-0 sm:w-12" style={{ marginLeft: index ? -20 : 0, zIndex: index }}>
              <BookCover book={book} compact loading="eager" sizes="48px" />
            </div>)}
          </div>
          <p className="mt-2 text-[10px] text-[#6e655e]">{selection.length} {selection.length === 1 ? "BOOK" : "BOOKS"} · {formatInr(current!.total_inr)}</p>
        </div>
        <ArrowRight className="size-5 text-[#b49a6a]" aria-hidden="true" />
        <div className="min-w-0 border border-[#b49a6a]/50 bg-[#f5f0e6] px-2 py-2" data-testid="bundle-upsell-collection">
          <p className="mb-2 text-[9px] tracking-[0.12em] text-[#8c6d46]">ALL {books.length} BOOKS</p>
          <div className="flex items-center py-1">
            {books.map((book, index) => <div key={book.id} className="relative w-9 shrink-0 sm:w-12" style={{ marginLeft: index ? -20 : 0, zIndex: index }}>
              <BookCover book={book} compact loading="eager" sizes="48px" />
            </div>)}
          </div>
        </div>
      </div>
      <div className="border-y border-[#b49a6a]/25 py-3 text-center">
        <p className="font-serif text-3xl text-[#8c6d46]" data-testid="bundle-upsell-difference">{offer.highlight}</p>
        <p className="mt-1 text-xs text-[#6e655e]">{info.name}: get {offer.remaining} more {offer.remaining === 1 ? "book" : "books"} and complete your collection.</p>
        <p className="mt-2 text-[10px] text-[#8c6d46]">Bundle {formatInr(info.bundlePrice)} · Bag total {formatInr(bundle.total_inr)} · Just {offer.perBook} per book</p>
      </div>
    </> : <output className="block py-8 text-center text-sm text-[#6e655e]">
      {loading ? "Checking your collection offer…" : <>We couldn't check the offer. <button type="button" onClick={onRetry} className="underline">Try again</button></>}
    </output>}
    <Button className="min-h-11 w-full bg-black text-white sm:min-h-11" disabled={!offer || loading} onClick={onUpgrade} data-testid="bundle-upsell-upgrade">
      {bundle ? `Complete series · Bag ${formatInr(bundle.total_inr)} →` : "Complete series →"}
    </Button>
    <button type="button" className="min-h-11 w-full text-sm text-[#6e655e] underline underline-offset-4" onClick={onDecline} data-testid="bundle-upsell-decline">Continue with my selection</button>
  </section>;
}
