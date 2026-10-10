"use client";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import { activeBooks as books, formatInr } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { quoteFor } from "@/lib/commerce/pricing";

const collection = quoteFor(books.map((book) => book.id));

export default function CollectionOffer() {
  const { addBooks, setBagOpen } = useStore();
  return (
    <section
      id="collection"
      className="bg-[#302821] text-[#f7f4ee]"
      data-testid="featured-collection-section"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[.9fr_1.1fr] lg:px-8">
        <div>
          <p className="overline text-[#c5a880]">The flagship offer</p>
          <h2
            className="mt-5 font-serif text-4xl leading-tight sm:text-5xl"
            data-testid="collection-heading"
          >
            Five books. One complete restaurant business journey.
          </h2>
          <p
            className="mt-6 max-w-xl text-base leading-relaxed text-[#d2c3b3]"
            data-testid="collection-copy"
          >
            From the first restaurant idea to attracting customers, managing
            operations, understanding numbers, and rebuilding demand—one
            connected learning experience.
          </p>
          <div className="mt-8 w-fit max-w-full border border-[#c5a880] bg-[#e9d5ad] px-5 py-5 text-[#302821] sm:px-6">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]">
              <Sparkles className="size-4" aria-hidden="true" />
              First50 offer
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
              <div>
                <p className="text-sm text-[#5e4938]">
                  Bundle price{" "}
                  <del className="text-lg">
                    {formatInr(collection.automatic_price_inr)}
                  </del>
                </p>
                <p className="mt-1 font-serif text-6xl leading-none tracking-tight">
                  <span className="sr-only">Offer price </span>
                  {formatInr(collection.total_inr)}
                </p>
              </div>
              <div className="border-l border-[#302821]/25 pl-5 text-sm">
                All five handbooks
                <p className="mt-1 font-semibold">
                  Save{" "}
                  {formatInr(collection.coupon_discount_inr)}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-[#d2c3b3]">
            Promotional collection price. Your total is verified securely
            before payment.
          </p>
          <Button
            className="mt-8 bg-[#c5a880] text-[#181412] hover:bg-[#b38f56]"
            size="lg"
            onClick={() => {
              addBooks(books.map((book) => book.id));
              setBagOpen(true);
            }}
            data-testid="collection-primary-cta"
          >
            Get all {books.length} books{" "}
            <ArrowRight className="ml-2 size-4" />
          </Button>
          <p className="mt-3 text-xs text-[#b8a99a]">
            Razorpay secure checkout · instant PDF access after confirmed
            payment
          </p>
        </div>
        <div
          className="grid grid-cols-5 gap-2 sm:gap-4"
          data-testid="collection-cover-grid"
        >
          {books.map((book) => (
            <Link
              href={`/books/${book.slug}`}
              key={book.id}
              className="transition-transform duration-300 hover:-translate-y-2"
              data-testid={`collection-cover-link-${book.slug}`}
            >
              <BookCover book={book} compact />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
