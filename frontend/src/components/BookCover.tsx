import type { Book } from "@/lib/catalogue";

export default function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  return (
    <div className={`book-cover-frame ${compact ? "book-cover-compact" : ""} flex flex-col justify-between bg-[#302821] p-4 text-[#f7f4ee] sm:p-5`} data-testid={`book-cover-${book.slug}`}>
      <div className="flex items-center justify-between border-b border-[#c5a880]/40 pb-3 text-[9px] uppercase tracking-[0.18em] text-[#c5a880]"><span>The Knowledge Concierge</span><span>PDF</span></div>
      <div className="py-5"><p className="text-[10px] uppercase tracking-[0.22em] text-[#c5a880]">Restaurant business handbook</p><h3 className="mt-4 font-serif text-[clamp(1.05rem,3vw,1.7rem)] leading-tight text-[#f7f4ee]">{book.title}</h3><p className="mt-3 text-xs leading-relaxed text-[#d2c3b3]">{book.subtitle}</p></div>
      <div className="border-t border-[#c5a880]/40 pt-3"><p className="text-[10px] uppercase tracking-[0.18em] text-[#c5a880]">Rakesh Chauhan</p><p className="mt-2 text-[10px] leading-relaxed text-[#d2c3b3]">Original supplied PDF · {book.pages} pages</p></div>
    </div>
  );
}
