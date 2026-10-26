"use client";
import { useEffect, useState } from "react";
import CollectionOffer from "@/components/CollectionOffer";
import { series, type SeriesId } from "@/lib/catalog/series";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/BookCard";
import { activeBooks as books, formatInr } from "@/lib/catalog";
import { useCart, useCartActions } from "@/lib/store";

export default function Library() {
  const [filter, setFilter] = useState<"all" | "bundles" | SeriesId>("all");
  useEffect(() => { if (window.location.hash === "#bundles") setFilter("bundles"); }, []);
  const visibleBooks = books.filter(book => filter === "all" || book.seriesId === filter);
  const { summary } = useCart();
  const { setBagOpen } = useCartActions();
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
      data-testid="library-page"
    >
      <div className="max-w-3xl">
        <p className="overline">The Knowledge Concierge library</p>
        <h1
          className="mt-5 font-serif text-4xl leading-tight text-[#29231f] sm:text-5xl"
          data-testid="library-heading"
        >
          Build your business library.
        </h1>
        <p
          className="mt-5 text-base leading-relaxed text-[#6e655e] sm:text-lg"
          data-testid="library-description"
        >
          Choose the handbooks that match your challenges. Nine books across two series, ₹199 each. Complete either series for ₹499.
        </p>
      </div>
      <div
        className="mt-10 flex flex-col items-stretch justify-between gap-4 border-y border-[#2e241f]/10 py-5 sm:mt-12 sm:flex-row sm:items-center"
        data-testid="library-progress-summary"
      >
        <div>
          <p className="overline">Your collection progress</p>
          <p className="mt-2 font-serif text-xl text-[#29231f] sm:text-2xl">
            {summary.count} of {books.length} books selected ·{" "}
            {formatInr(summary.total)}
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => setBagOpen(true)}
          variant="outline"
          data-testid="library-view-bag-btn"
        >
          View your bag <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
      <nav id="bundles" aria-label="Filter books" className="mt-8 flex flex-wrap gap-2">{([{ id: "all", name: "All Books" }, ...series, { id: "bundles", name: "Complete Bundles" }] as const).map(item => <Button key={item.id} variant={filter === item.id ? "default" : "outline"} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className="min-h-11">{item.name}</Button>)}</nav>
      {filter === "bundles" ? <div className="mt-10 space-y-8">{series.map(info => <CollectionOffer key={info.id} seriesId={info.id} />)}</div> : <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 sm:mt-14 sm:gap-x-6 sm:gap-y-16 lg:grid-cols-5">
        <h2 className="sr-only">Business PDF handbooks</h2>
        {visibleBooks.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>}
      <section
        className="mt-16 bg-[#302821] p-6 text-[#f7f4ee] sm:mt-24 sm:p-12"
        data-testid="library-build-section"
      >
        <p className="overline text-[#c5a880]">Make it a complete companion</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="font-serif text-3xl sm:text-4xl">
              One book is a start. The collection goes further.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#d2c3b3]">
              Choose the series that fits your next step. Each complete series is ₹499 automatically: five restaurant books or four selling-online books.
            </p>
          </div>
          <Link
            href="/books#bundles"
            className="inline-flex items-center text-sm font-medium uppercase tracking-[0.12em] text-[#c5a880]"
            onClick={() => setFilter("bundles")}
            data-testid="library-collection-link"
          >
            Explore complete bundles <ArrowRight className="ml-2 size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
