import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/BookCard";
import { useCatalogue, formatInr } from "@/lib/catalogue";
import { useStore } from "@/lib/store";

export default function Library() {
  const { books } = useCatalogue();
  const { summary, setBagOpen } = useStore();
  return <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" data-testid="library-page"><div className="max-w-3xl"><p className="overline">The Knowledge Concierge library</p><h1 className="mt-5 font-serif text-5xl leading-tight text-[#29231f]" data-testid="library-heading">Build your restaurant business library.</h1><p className="mt-5 text-lg leading-relaxed text-[#6e655e]" data-testid="library-description">Choose the handbooks that match your challenges. The more you add, the more value you unlock.</p></div><div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-y border-[#2e241f]/10 py-5" data-testid="library-progress-summary"><div><p className="overline">Your collection progress</p><p className="mt-2 font-serif text-2xl text-[#29231f]">{summary.count} of 5 books selected · {formatInr(summary.total)}</p></div><Button onClick={() => setBagOpen(true)} variant="outline" data-testid="library-view-bag-btn">View your bag <ArrowRight className="ml-2 size-4" /></Button></div><div className="mt-14 grid gap-x-6 gap-y-16 sm:grid-cols-2 lg:grid-cols-5">{books.map((book) => <BookCard key={book.id} book={book} />)}</div><section className="mt-24 bg-[#302821] p-8 text-[#f7f4ee] sm:p-12" data-testid="library-build-section"><p className="overline text-[#c5a880]">Make it a complete companion</p><div className="mt-4 flex flex-wrap items-end justify-between gap-6"><div><h2 className="font-serif text-4xl">One book is a start. The collection goes further.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#d2c3b3]">Progressive savings unlock automatically at two, three, and four books. Five books become the complete collection.</p></div><Link to="/restaurant-business-collection" className="inline-flex items-center text-sm font-medium uppercase tracking-[0.12em] text-[#c5a880]" data-testid="library-collection-link">See the collection <ArrowRight className="ml-2 size-4" /></Link></div></section></div>;
}
