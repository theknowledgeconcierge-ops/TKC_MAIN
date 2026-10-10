"use client";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import { activeBooks as books, formatInr } from "@/lib/catalog";
import { useCartActions } from "@/lib/store";
import { quoteFor } from "@/lib/commerce/pricing";

const collection = quoteFor(books.map((book) => book.id));

export default function Collection() {
  const { addBooks, setBagOpen } = useCartActions();
  return (
    <div data-testid="collection-page">
      <section className="bg-[#302821] text-[#f7f4ee]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <p className="overline text-[#c5a880]">Flagship collection</p>
          <h1
            className="mt-5 max-w-4xl font-serif text-5xl leading-tight sm:text-6xl"
            data-testid="collection-page-heading"
          >
            Five books. One complete restaurant business journey.
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg leading-relaxed text-[#d2c3b3]"
            data-testid="collection-page-copy"
          >
            From your first restaurant idea to attracting customers, managing
            people, understanding numbers, and rebuilding demand.
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
            onClick={() => {
              addBooks(books.map((book) => book.id));
              setBagOpen(true);
            }}
            className="mt-8 bg-[#c5a880] text-[#181412] hover:bg-[#b38f56]"
            size="lg"
            data-testid="collection-page-add-all-btn"
          >
            Get all {books.length} books <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div
          className="grid grid-cols-5 gap-2 sm:gap-5"
          data-testid="collection-page-covers"
        >
          {books.map((book) => (
            <Link
              href={`/books/${book.slug}`}
              key={book.id}
              data-testid={`collection-page-cover-${book.slug}`}
            >
              <BookCover book={book} compact />
            </Link>
          ))}
        </div>
        <div className="mt-16 grid gap-8 border-y border-[#2e241f]/10 py-12 md:grid-cols-2">
          <div>
            <p className="overline">What’s inside</p>
            <h2 className="mt-4 font-serif text-4xl text-[#29231f]">
              A practical companion for every stage.
            </h2>
          </div>
          <div className="grid gap-3 text-sm text-[#6e655e]">
            {[
              "The idea and the first customer",
              "Local discovery and repeat demand",
              "People, systems, and daily service",
              "Pricing, costs, cash, and profit",
              "Rebuilding demand and planning growth",
            ].map((item) => (
              <p className="flex gap-3" key={item}>
                <Check className="size-4 shrink-0 text-[#b49a6a]" />
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
