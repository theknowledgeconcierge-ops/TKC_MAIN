import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BookCover from "./BookCover";
import { series, booksForSeries } from "@/lib/catalog/series";

export default function SeriesExplorer() {
  return <section id="collection" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-14 sm:px-6 sm:py-20 lg:px-8" data-testid="series-explorer">
    <p className="overline">Explore our series</p>
    <h2 className="section-title mt-4">Choose your next business chapter.</h2>
    <div className="mt-9 grid gap-6 md:grid-cols-2">{series.map(info => {
      const books = booksForSeries(info.id);
      return <Link href={info.path} key={info.id} className="editorial-card group">
        <div className="grid items-center gap-3" style={{ gridTemplateColumns: `repeat(${books.length}, minmax(0, 1fr))` }}>{books.map(book => <BookCover key={book.id} book={book} compact />)}</div>
        <p className="overline mt-7">{books.length} books · ₹199 each · Bundle ₹499</p>
        <h3 className="mt-3 font-serif text-3xl">{info.name}</h3>
        <p className="mt-4 text-sm leading-7 text-[#6e655e]">{info.description}</p>
        <span className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-[#795c35]">Explore {info.name} <ArrowRight className="ml-2 size-4" /></span>
      </Link>;
    })}</div>
  </section>;
}
