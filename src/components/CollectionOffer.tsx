"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BookCover from "./BookCover";
import { Button } from "./ui/button";
import { formatInr } from "@/lib/catalog";
import { quoteFor } from "@/lib/commerce/pricing";
import { useCartActions } from "@/lib/store";
import PurchasePrice from "./PurchasePrice";
import WhatsAppPurchase from "./WhatsAppPurchase";

import { series, booksForSeries, type SeriesId } from "@/lib/catalog/series";
export default function CollectionOffer({ seriesId = "restaurant-playbooks" }: { seriesId?: SeriesId }) {
  const info = series.find(item => item.id === seriesId)!;
  const books = booksForSeries(seriesId);
  const collection = quoteFor(books.map(book => book.id));

  const { addBooks, setBagOpen, setCheckoutOpen } = useCartActions();
  return <section id={`bundle-${seriesId}`} className="bg-[#ede7dd]" data-testid="featured-collection-section">
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2">
      <div><p className="overline">{info.bundleName}</p><h2 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl" data-testid="collection-heading">{info.heading}</h2><p className="mt-4 text-sm leading-7 text-[#6e655e]" data-testid="collection-copy">{seriesId === "restaurant-playbooks" ? "Plan the opening, earn repeat visits, organise daily operations, understand the numbers and investigate weak demand. Choose the collection when you want to work across all five subjects." : info.description}</p>
        <div className="mt-5"><PurchasePrice original={books.reduce((sum, book) => sum + book.selling_price_inr, 0)} price={collection.total_inr} /></div>
        <p className="mt-2 text-xs leading-6 text-[#6e655e]">Buying each separately: {formatInr(books.reduce((sum, book) => sum + book.selling_price_inr, 0))}. Collection saving: {formatInr(books.reduce((sum, book) => sum + book.selling_price_inr, 0) - collection.total_inr)}.</p>
        <Button className="mt-5 h-12 w-full" size="lg" onClick={() => { addBooks(books.map((book) => book.id)); setBagOpen(false); setCheckoutOpen(true); }} data-testid="collection-primary-cta">Buy all {books.length} books · {formatInr(collection.total_inr)} <ArrowRight className="ml-2 size-4" /></Button>
        <div className="mt-3"><WhatsAppPurchase title={`${info.bundleName} (all ${books.length} books)`} /></div>
        <Link href={info.path} className="mt-2 flex min-h-11 items-center text-sm text-[#795c35] underline underline-offset-4">Explore the complete collection</Link>
      </div>
      <div className="grid items-center gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${books.length}, minmax(0, 1fr))` }} data-testid="collection-cover-grid">{books.map((book) => <Link href={`/books/${book.slug}`} key={book.id} data-testid={`collection-cover-link-${book.slug}`} className="transition-transform hover:-translate-y-1"><BookCover book={book} compact /></Link>)}</div>
    </div>
  </section>;
}
