import type { Book } from "@/lib/catalog";
import Image from "next/image";

export default function BookCover({
  book,
  compact = false,
  preload = false,
  loading = "lazy",
  sizes = "(max-width: 639px) 46vw, (max-width: 1023px) 30vw, 230px",
}: {
  book: Book;
  compact?: boolean;
  preload?: boolean;
  loading?: "lazy" | "eager";
  sizes?: string;
}) {
  return (
    <div
      className={`book-cover-frame ${compact ? "book-cover-compact" : ""}`}
      data-testid={`book-cover-${book.slug}`}
    >
      <Image
        src={book.cover_image_url}
        alt={`${book.title} by ${book.author} cover`}
        fill
        sizes={sizes}
        preload={preload}
        loading={preload ? undefined : loading}
        className="object-cover"
        data-testid={`book-cover-image-${book.slug}`}
      />
    </div>
  );
}
