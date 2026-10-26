"use client";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import BookReviews, { RatingSummary } from "@/components/BookReviews";
import { formatInr, type ProductId } from "@/lib/catalog";
import { productContent } from "@/lib/product-content";
import { useCartActions } from "@/lib/store";
import { quoteFor } from "@/lib/commerce/pricing";
import PurchasePrice from "@/components/PurchasePrice";
import WhatsAppPurchase from "@/components/WhatsAppPurchase";
import { series, booksForSeries, type SeriesId } from "@/lib/catalog/series";
export default function Collection({ seriesId = "restaurant-playbooks" }: { seriesId?: SeriesId }) {
  const info = series.find(item => item.id === seriesId)!;
  const books = booksForSeries(seriesId);
  const collection = quoteFor(books.map(book => book.id));
  const individualTotal = books.reduce((sum, book) => sum + book.selling_price_inr, 0);
  const { addBooks, setBagOpen, setCheckoutOpen } = useCartActions();
  return <div data-testid="collection-page">
    <section className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-xs text-[#6e655e]"><Link href="/">Home</Link> / <Link href="/books">Books</Link> / <span aria-current="page">Complete collection</span></nav>
      <div className="mt-8 grid items-start gap-6 md:grid-cols-2 md:gap-x-14 md:gap-y-0">
        <div className="md:col-start-2 md:row-start-1"><p className="overline">{info.name}</p><h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl" data-testid="collection-page-heading">{info.heading}</h1><p className="mt-3 text-sm text-[#6e655e]">All {books.length} books by {info.author} · Digital PDF editions</p><RatingSummary productId={info.reviewId} />
          <p className="mt-3 text-sm leading-7 text-[#6e655e]" data-testid="collection-page-copy">{seriesId === "restaurant-playbooks" ? "From your first restaurant idea to attracting customers, managing people, understanding numbers and rebuilding demand. Each book has a distinct focus, so you can begin with the decision that matters today." : info.description}</p>
        </div>
        <div id="book-preview" data-testid="collection-preview" className="border border-[#ddd5c9] bg-[#efeae1] px-4 py-8 sm:px-6 sm:py-12 md:col-start-1 md:row-span-2 md:row-start-1"><div className="grid items-center gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${books.length}, minmax(0, 1fr))` }} data-testid="collection-page-covers">{books.map((book) => <Link href={`/books/${book.slug}`} key={book.id} data-testid={`collection-page-cover-${book.slug}`}><BookCover book={book} compact /></Link>)}</div><p className="mt-8 text-center text-xs text-[#6e655e]">{books.length} complete PDF books · {books.reduce((sum, book) => sum + book.pages, 0)} pages in total</p></div>
        <div className="md:col-start-2 md:row-start-2 md:pt-5">
          <div data-testid="collection-price-panel" className="rounded-xl border border-[#d5c3a3] bg-[#f6f0e5] p-5 shadow-[0_8px_30px_rgba(96,72,42,0.05)]">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-[#795c35]">{info.bundleName}</p>
            <PurchasePrice original={individualTotal} price={collection.total_inr} />
            <p className="mt-3 text-xs leading-6 text-[#6e655e]">All {books.length} complete PDFs. Save {formatInr(individualTotal - collection.total_inr)} compared with {books.length} individual purchases at {formatInr(books[0].selling_price_inr)} each.</p>
            <Button size="lg" className="mt-4 h-12 w-full bg-[#29231f] text-base font-semibold shadow-[0_5px_14px_rgba(41,35,31,0.16)] hover:bg-[#503d2a]" onClick={() => { addBooks(books.map((book) => book.id)); setBagOpen(false); setCheckoutOpen(true); }} data-testid="collection-page-add-all-btn">Buy all {books.length} books · {formatInr(collection.total_inr)} <ArrowRight className="ml-2 size-4" /></Button>
            <p className="my-3 text-center text-[11px] text-[#6e655e]">Or prefer to speak with us first?</p>
            <WhatsAppPurchase title={`${info.bundleName} (all ${books.length} books)`} />
            <Button size="lg" variant="outline" className="mt-3 h-12 w-full border-[#c5b69d] bg-transparent" onClick={() => { addBooks(books.map((book) => book.id)); setBagOpen(true); }} data-testid="collection-page-add-to-bag-btn">Add to bag</Button>
          </div>
          <p className="mt-4 text-xs leading-6 text-[#6e655e]">PDF downloads after confirmed payment. No physical delivery. Your payable total is confirmed at checkout.</p>
        </div>
      </div>
    </section>
    <section className="border-y border-[#ddd5c9] bg-[#f5f0e6]"><div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20"><p className="overline">{books.length} complementary subjects</p><h2 className="mt-3 font-serif text-3xl sm:text-4xl">What’s on your bookshelf.</h2><div className="mt-9 divide-y divide-[#ddd5c9]">{books.map((book, index) => <article key={book.id} className="grid gap-5 py-7 sm:grid-cols-[100px_1fr] md:grid-cols-[110px_.7fr_1fr]" data-testid={`collection-book-${book.id}`}><Link href={`/books/${book.slug}`} className="w-20 sm:w-24"><BookCover book={book} compact /></Link><div><p className="overline">0{index + 1} · {productContent[book.id as ProductId].focus}</p><h3 className="mt-2 font-serif text-2xl"><Link href={`/books/${book.slug}`}>{book.title}</Link></h3><p className="mt-2 text-xs text-[#6e655e]">{book.pages} pages · Complete PDF · {formatInr(book.selling_price_inr)}</p></div><div><p className="text-sm leading-7 text-[#6e655e]">{book.description}</p><Link href={`/books/${book.slug}#book-preview`} className="mt-2 inline-flex min-h-11 items-center text-sm text-[#795c35] underline underline-offset-4">Read about the book & preview pages <ArrowRight className="ml-2 size-4" /></Link></div></article>)}</div></div></section>
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2"><div><p className="overline">Choose the right fit</p><h2 className="mt-3 font-serif text-3xl">A single subject or a wider view.</h2></div><div className="space-y-5 text-sm leading-7 text-[#6e655e]"><p><strong className="text-[#29231f]">One book, {formatInr(books[0].selling_price_inr)}.</strong> A focused starting point when you are working on a specific challenge, within your chosen series.</p><p><strong className="text-[#29231f]">Complete collection, {formatInr(collection.total_inr)}.</strong> For readers who want to connect the subjects across the whole series. Each PDF can be read independently.</p><p>The worked figures and examples are teaching illustrations. Apply them using your own records and circumstances.</p></div></section>
    <BookReviews productId={info.reviewId} />
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20"><p className="overline">Collection questions</p><h2 className="mt-3 font-serif text-3xl">Before you buy.</h2><div className="mt-7 divide-y divide-[#ddd5c9] border-y border-[#ddd5c9]">{[
      ["What is included?", `All ${books.length} complete PDF books: ${books.map((book) => book.title).join(', ')}. Each includes its own working pages.`],
      ["Can I preview each book?", "Yes. Follow any title above to its product page, where you can browse the cover and three genuine interior pages."],
      ["How is the collection delivered?", "After payment confirmation, your order page provides the purchased PDF downloads. No physical books are shipped."],
    ].map(([question, answer]) => <details key={question} className="group"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="size-4 shrink-0 group-open:rotate-180" /></summary><p className="max-w-3xl pb-5 text-sm leading-7 text-[#6e655e]">{answer}</p></details>)}</div><Link href="/contact-us" className="mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Contact us about the collection</Link></section>
  </div>;
}
