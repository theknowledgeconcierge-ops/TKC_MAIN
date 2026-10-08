import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import type { Book } from "@/lib/catalogue";
import { formatInr } from "@/lib/catalogue";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export default function BookCard({ book }: { book: Book }) {
  const { selectedIds, addBook, removeBook } = useStore();
  const selected = selectedIds.includes(book.id);
  const handleAdd = () => {
    if (selected) removeBook(book.id);
    else {
      addBook(book.id);
      toast.success("Added to your library bag", { description: "Keep exploring—the bag stays with you." });
    }
  };
  return (
    <article className="group" data-testid={`book-card-item-${book.slug}`}>
      <Link to={`/books/${book.slug}`} className="block" data-testid={`book-card-details-link-${book.slug}`}>
        <BookCover book={book} />
      </Link>
      <div className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="overline" data-testid={`book-card-label-${book.slug}`}>Handbook {String(Number(book.id.split("-").at(-1)) || "")}</p>
            <Link to={`/books/${book.slug}`} data-testid={`book-card-title-link-${book.slug}`}>
              <h3 className="mt-2 font-serif text-2xl leading-tight text-[#29231f] transition-colors group-hover:text-[#8d6d43]">{book.title}</h3>
            </Link>
          </div>
          <span className="font-mono text-xs tracking-wide text-[#6e655e]" data-testid={`book-card-pages-${book.slug}`}>{book.pages} pp.</span>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[#6e655e]" data-testid={`book-card-description-${book.slug}`}>{book.description}</p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#2e241f]/10 pt-4">
          <div data-testid={`book-card-price-${book.slug}`}><span className="mr-2 text-sm text-[#a39281] line-through">{formatInr(book.original_price_inr)}</span><span className="font-mono text-sm text-[#29231f]">{formatInr(book.selling_price_inr)}</span></div>
          <Button size="sm" variant={selected ? "secondary" : "default"} onClick={handleAdd} data-testid={`book-card-add-btn-${book.slug}`}>
            {selected ? <Check className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}{selected ? "In your bag" : "Add to bag"}
          </Button>
        </div>
      </div>
    </article>
  );
}
