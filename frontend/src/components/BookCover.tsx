import type { Book } from "@/lib/catalogue";

export default function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  return (
    <div className={`book-cover-frame ${compact ? "book-cover-compact" : ""}`} data-testid={`book-cover-${book.slug}`}>
      <img
        src={book.cover_image_url}
        alt={`${book.title} by ${book.author} cover`}
        loading="lazy"
        className="h-full w-full object-cover"
        data-testid={`book-cover-image-${book.slug}`}
      />
    </div>
  );
}
