"use client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import { useCatalogue } from "@/lib/catalogue";
import { useStore } from "@/lib/store";

export default function Collection() {
  const { books } = useCatalogue();
  const { addBooks, setBagOpen } = useStore();
  return (
    <div data-testid="collection-page">
      <section className="bg-[#302821] text-[#f7f4ee]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <p className="overline text-[#c5a880]">Flagship collection</p>
          <h1
            className="mt-5 max-w-4xl font-serif text-5xl leading-tight sm:text-6xl"
            data-testid="collection-page-heading"
          >
            Four books. One complete restaurant business journey.
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg leading-relaxed text-[#d2c3b3]"
            data-testid="collection-page-copy"
          >
            From your first restaurant idea to attracting customers, managing
            people, understanding numbers.
          </p>
          <div className="mt-8 flex flex-wrap items-end gap-6">
            <div>
              <span className="text-sm text-[#c5b7a8] line-through">
                ₹996 individual total
              </span>
              <p className="mt-1 font-serif text-4xl text-[#e9dfcf]">
                ₹699{" "}
                <span className="font-sans text-sm text-[#c5b7a8]">
                  standard
                </span>
              </p>
            </div>
            <div className="border-l border-[#c5a880]/40 pl-6">
              <p className="font-serif text-3xl text-[#c5a880]">Save ₹297</p>
              <p className="text-sm text-[#d2c3b3]">complete collection</p>
            </div>
          </div>
          <Button
            onClick={() => {
              addBooks(books.map((book) => book.id));
              setBagOpen(true);
            }}
            className="mt-8 bg-[#c5a880] text-[#181412] hover:bg-[#b38f56]"
            size="lg"
            data-testid="collection-page-add-all-btn"
          >
            Get all 4 books <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div
          className="grid grid-cols-4 gap-2 sm:gap-5"
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
