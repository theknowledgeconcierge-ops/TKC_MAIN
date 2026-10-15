"use client";
import Link from "next/link";
import { startTransition } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import type { Book } from "@/lib/catalog";
import { formatInr } from "@/lib/catalog";
import { useCart, useCartActions } from "@/lib/store";

export default function BookCard({ book }: { book: Book }) {
  const { selectedIds } = useCart();
  const { addBook, removeBook, setBagOpen, announce } = useCartActions();
  const selected = selectedIds.includes(book.id);
  const handleAdd = () => {
    if (selected) {
      removeBook(book.id);
      setBagOpen(false);
      announce(`${book.title} removed from your bag.`);
      return;
    }
    addBook(book.id);
    // Paint the selected state promptly while React prepares the full drawer.
    startTransition(() => setBagOpen(true));
    announce(`${book.title} added to your bag.`);
  };
  return (
    <article
      className="group flex h-full flex-col"
      data-testid={`book-card-item-${book.slug}`}
    >
      <Link
        href={`/books/${book.slug}`}
        className="block"
        data-testid={`book-card-details-link-${book.slug}`}
      >
        <BookCover book={book} />
      </Link>
      <div className="flex flex-1 flex-col pt-4 sm:pt-5 lg:h-[21rem] lg:flex-none">
        <div className="flex items-start justify-between gap-2 sm:gap-4 lg:min-h-[7.5rem]">
          <div className="min-w-0">
            <p
              className="overline"
              data-testid={`book-card-label-${book.slug}`}
            >
              Digital handbook
            </p>
            <Link
              href={`/books/${book.slug}`}
              className="inline-flex min-h-11 items-center sm:min-h-0"
              data-testid={`book-card-title-link-${book.slug}`}
            >
              <h3 className="mt-2 font-serif text-lg leading-tight text-[#29231f] transition-colors group-hover:text-[#8d6d43] sm:text-2xl">
                {book.title}
              </h3>
            </Link>
          </div>
          <span
            className="font-mono text-xs tracking-wide text-[#6e655e]"
            data-testid={`book-card-pages-${book.slug}`}
          >
            {book.pages} pp.
          </span>
        </div>
        <p
          className="mt-3 hidden line-clamp-5 text-sm leading-relaxed text-[#6e655e] sm:block"
          data-testid={`book-card-description-${book.slug}`}
        >
          {book.description}
        </p>
        <div className="mt-auto flex flex-col gap-3 border-t border-[#2e241f]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="whitespace-nowrap"
            data-testid={`book-card-price-${book.slug}`}
          >
            <span className="mr-2 text-xs text-[#a39281] line-through sm:text-sm">
              {formatInr(book.original_price_inr)}
            </span>
            <span className="font-mono text-xs text-[#29231f] sm:text-sm">
              {formatInr(book.selling_price_inr)}
            </span>
          </div>
          <Button
            size="sm"
            className={`h-11 w-full px-2 sm:h-7 sm:w-32 sm:px-3 ${selected ? "border-[#b49a6a]/60 bg-[#eadfcd] text-[#29231f] hover:bg-[#e1d2ba]" : ""}`}
            variant={selected ? "outline" : "default"}
            onClick={handleAdd}
            aria-label={
              selected
                ? `In bag: ${book.title}. Remove from bag`
                : `Add to bag: ${book.title}`
            }
            aria-pressed={selected}
            data-state={selected ? "in-bag" : "idle"}
            data-testid={`book-card-add-btn-${book.slug}`}
          >
            {selected ? (
              <Check className="mr-1 size-3.5 sm:mr-2 sm:size-4" />
            ) : (
              <Plus className="mr-1 size-3.5 sm:mr-2 sm:size-4" />
            )}
            {selected ? "In bag" : "Add to bag"}
          </Button>
        </div>
      </div>
    </article>
  );
}
