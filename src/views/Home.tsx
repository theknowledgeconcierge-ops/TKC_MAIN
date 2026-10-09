"use client";
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Check,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/BookCard";
import BookCover from "@/components/BookCover";
import { useCatalogue, formatInr } from "@/lib/catalogue";
import { useStore } from "@/lib/store";

const trustItems = [
  { icon: BookOpen, label: "4 practical handbooks" },
  { icon: ArrowDownRight, label: "Indian business context" },
  { icon: Timer, label: "Instant digital access" },
  { icon: ShieldCheck, label: "Secure checkout-ready flow" },
];

export default function Home() {
  const { books } = useCatalogue();
  const { addBooks, setBagOpen } = useStore();
  return (
    <div data-testid="home-page">
      <section
        className="relative overflow-hidden bg-[#f7f4ee]"
        data-testid="hero-section"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[1.05fr_.95fr] md:py-24 lg:px-8">
          <div className="relative z-10">
            <p className="overline" data-testid="hero-eyebrow">
              The restaurant business collection
            </p>
            <h1
              className="mt-5 max-w-3xl font-serif text-[2.65rem] leading-[1.02] tracking-tight text-[#29231f] sm:mt-6 sm:text-6xl"
              data-testid="hero-heading"
            >
              From your first table to a full house.
            </h1>
            <p
              className="mt-6 max-w-xl text-base leading-relaxed text-[#6e655e] sm:mt-7 sm:text-lg"
              data-testid="hero-subheadline"
            >
              Four carefully curated handbooks covering the journey of starting,
              marketing, managing, and financing a restaurant.
            </p>
            <p
              className="mt-4 max-w-lg text-sm leading-relaxed text-[#6e655e]"
              data-testid="hero-supporting-copy"
            >
              Practical knowledge for aspiring restaurateurs, established
              operators, and businesses looking for a stronger direction. No
              filler. No unnecessary theory.
            </p>
            <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row sm:mt-8">
              <Button
                size="lg"
                className="w-full min-[420px]:w-auto"
                onClick={() => {
                  setBagOpen(false);
                  document
                    .getElementById("collection")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                data-testid="hero-primary-cta"
              >
                Explore the collection <ArrowRight className="ml-2 size-4" />
              </Button>
              <Link
                href="/books"
                className="inline-flex h-10 w-full items-center justify-center border border-[#2e241f]/20 px-5 text-sm font-medium text-[#29231f] transition-colors hover:bg-[#2e241f]/5 min-[420px]:w-auto"
                data-testid="hero-secondary-cta"
              >
                Browse individual books
              </Link>
            </div>
            <div
              className="mt-8 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-[#8c6d46] sm:mt-10"
              data-testid="hero-note"
            >
              <Sparkles className="size-4" />
              Knowledge, curated.
            </div>
          </div>
          <div
            className="relative mx-auto grid w-full max-w-md grid-cols-3 items-end gap-2 px-4 pb-8 sm:gap-4 md:max-w-none md:px-2"
            data-testid="hero-book-arrangement"
          >
            <div className="book-stack-offset pt-8 sm:pt-12">
              <BookCover book={books[2]} />
            </div>
            <div className="z-10">
              <BookCover book={books[0]} />
            </div>
            <div className="book-stack-offset pb-6 sm:pb-10">
              <BookCover book={books[3]} />
            </div>
            <div className="absolute bottom-0 left-1/2 z-20 w-[82%] -translate-x-1/2 border border-[#b49a6a]/50 bg-[#fbf9f5]/95 p-3 text-center shadow-xl backdrop-blur-sm sm:w-[68%] sm:p-4">
              <p className="overline">Four books · one journey</p>
              <p className="mt-1 font-serif text-base text-[#29231f] sm:mt-2 sm:text-xl">
                The complete collection
              </p>
            </div>
          </div>
        </div>
      </section>
      <section
        className="border-b border-[#2e241f]/10 bg-[#fffeFB]"
        data-testid="trust-strip"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 px-4 py-7 sm:px-6 md:grid-cols-4 lg:px-8">
          {trustItems.map(({ icon: Icon, label }) => (
            <div
              className="flex items-center gap-3"
              key={label}
              data-testid={`trust-${label.replaceAll(" ", "-")}`}
            >
              <Icon className="size-5 text-[#b49a6a]" />
              <span className="text-sm text-[#6e655e]">{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-[#ede7dd]" data-testid="books-section">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="overline">The library</p>
              <h2 className="section-title mt-4">Four practical handbooks.</h2>
            </div>
            <Link
              href="/books"
              className="inline-flex items-center text-sm font-medium uppercase tracking-[0.12em] text-[#8c6d46]"
              data-testid="books-view-all-link"
            >
              View all books <ArrowRight className="ml-2 size-4" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:mt-12 sm:gap-x-6 lg:grid-cols-4">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </div>
      </section>
      <section
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
        data-testid="audience-section"
      >
        <div className="max-w-2xl">
          <p className="overline">Choose your next decision</p>
          <h2 className="section-title mt-4">
            Every restaurant has a different challenge.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:mt-12 md:grid-cols-3">
          {[
            [
              "Starting a restaurant?",
              "Understand the decisions before opening your doors.",
              "/books/the-first-table",
              "Start here",
            ],
            [
              "Already running one?",
              "Improve marketing, operations, and financial understanding.",
              "/books/behind-the-kitchen-door",
              "Explore the guides",
            ],
            [
              "Struggling with sales?",
              "Learn to diagnose weak demand and plan practical improvements.",
              "/books/the-full-table",
              "Find your next step",
            ],
          ].map(([title, copy, href, cta]) => (
            <Link
              href={href}
              key={title}
              className="editorial-card group"
              data-testid={`audience-card-${(title as string).toLowerCase().replace(/[^a-z]+/g, "-")}`}
            >
              <div>
                <p className="overline">For your next chapter</p>
                <h3 className="mt-6 font-serif text-3xl text-[#29231f]">
                  {title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-[#6e655e]">
                  {copy}
                </p>
              </div>
              <span className="mt-8 inline-flex items-center text-sm font-medium uppercase tracking-[0.12em] text-[#8c6d46]">
                {cta}
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
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
              Four books. One complete restaurant business journey.
            </h2>
            <p
              className="mt-6 max-w-xl text-base leading-relaxed text-[#d2c3b3]"
              data-testid="collection-copy"
            >
              From the first restaurant idea to attracting customers, managing
              operations, understanding numbers, and rebuilding demand—one
              connected learning experience.
            </p>
            <div className="mt-8 flex flex-wrap items-end gap-5">
              <div>
                <p className="text-sm text-[#c5b7a8] line-through">
                  {formatInr(996)} individual total
                </p>
                <p className="mt-1 font-serif text-4xl text-[#e9dfcf]">₹699</p>
              </div>
              <div className="border-l border-[#c5a880]/40 pl-5 text-sm text-[#d2c3b3]">
                four handbooks
                <br />
                <span className="font-mono text-[#c5a880]">SAVE ₹297</span>
              </div>
            </div>
            <Button
              className="mt-8 bg-[#c5a880] text-[#181412] hover:bg-[#b38f56]"
              size="lg"
              onClick={() => {
                addBooks(books.map((book) => book.id));
                setBagOpen(true);
              }}
              data-testid="collection-primary-cta"
            >
              Get all 4 books <ArrowRight className="ml-2 size-4" />
            </Button>
            <p className="mt-3 text-xs text-[#b8a99a]">
              Razorpay secure checkout · instant PDF access after confirmed
              payment
            </p>
          </div>
          <div
            className="grid grid-cols-4 gap-2 sm:gap-4"
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
      <section
        className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-[.8fr_1.2fr] lg:px-8"
        data-testid="silent-partner-section"
      >
        <div className="max-w-md">
          <p className="overline">The quiet advantage</p>
          <h2 className="section-title mt-4">
            Every restaurant owner deserves a silent partner.
          </h2>
        </div>
        <div className="border-l border-[#b49a6a]/60 pl-6 md:pl-12">
          <h3 className="font-serif text-3xl text-[#29231f]">
            One that helps you think, plan, and make better decisions.
          </h3>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#6e655e]">
            Running a restaurant means making decisions every day. These
            handbooks are designed to be there when those decisions arrive—not
            as books you read once and forget, but as practical companions you
            return to for clarity, structure, and a fresh perspective.
          </p>
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.14em] text-[#8c6d46]">
            Not just something to read. Something to return to.
          </p>
        </div>
      </section>
      <section
        className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
        data-testid="brand-philosophy-section"
      >
        <div className="grid gap-12 border-y border-[#2e241f]/10 py-16 md:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="overline">Why these books exist</p>
            <h2 className="section-title mt-4">
              Because business knowledge shouldn’t be complicated.
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <Check className="size-5 text-[#b49a6a]" />
              <p className="mt-4 font-serif text-xl text-[#29231f]">
                Curated for clarity
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#6e655e]">
                Focused reading, useful frameworks, and real-world restaurant
                decisions.
              </p>
            </div>
            <div>
              <Check className="size-5 text-[#b49a6a]" />
              <p className="mt-4 font-serif text-xl text-[#29231f]">
                Designed to be used
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#6e655e]">
                Worked examples, worksheets, and checklists you can revisit.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
