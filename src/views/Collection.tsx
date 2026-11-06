"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ArrowRight, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/BookCover";
import BookReviews, { RatingSummary } from "@/components/BookReviews";
import { formatInr, type ProductId } from "@/lib/catalog";
import { productContent } from "@/lib/product-content";
import { useCart, useCartActions } from "@/lib/store";
import { quoteFor } from "@/lib/commerce/pricing";
import WhatsAppPurchase from "@/components/WhatsAppPurchase";
import { series, booksForSeries, type SeriesId } from "@/lib/catalog/series";
import { publishedReviews } from "@/lib/reviews";

function BagFromAdLink({ seriesId }: { seriesId: SeriesId }) {
  const searchParams = useSearchParams();
  const openBag = searchParams.get("bag") === "1";
  const { hydrated } = useCart();
  const { addBooks, setBagOpen, setCheckoutOpen } = useCartActions();
  useEffect(() => {
    // Wait for the saved bag before merging a bundle. Consume only this intent
    // so refreshes respect later removals and ad-attribution parameters survive.
    if (!hydrated || !openBag) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("bag") !== "1") return;
    url.searchParams.delete("bag");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    addBooks(booksForSeries(seriesId).map(book => book.id));
    setCheckoutOpen(false);
    setBagOpen(true);
  }, [hydrated, openBag, seriesId, addBooks, setBagOpen, setCheckoutOpen]);
  return null;
}

export default function Collection({ seriesId = "restaurant-playbooks" }: { seriesId?: SeriesId }) {
  const info = series.find(item => item.id === seriesId)!;
  const isOnline = seriesId === "start-selling-online";
  const featuredReview = isOnline ? publishedReviews(info.reviewId).find(review => review.id === "online-bundle-4") : undefined;
  // Owner-confirmed October 2026 bundle sales; keep the period explicit.
  const salesCount = isOnline ? "220+" : "300+";
  const books = booksForSeries(seriesId);
  const collection = quoteFor(books.map(book => book.id));
  const individualTotal = books.reduce((sum, book) => sum + book.selling_price_inr, 0);
  const pageCount = books.reduce((sum, book) => sum + book.pages, 0);
  const savings = individualTotal - collection.total_inr;
  const { addBooks, setBagOpen, setCheckoutOpen } = useCartActions();
  return <div data-testid="collection-page">
    <Suspense fallback={null}><BagFromAdLink seriesId={seriesId} /></Suspense>
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6 md:pb-12 md:pt-7">
      <nav aria-label="Breadcrumb" className="mb-4 hidden text-xs text-[#6e655e] md:block"><Link href="/">Home</Link> / <Link href="/books">Books</Link> / <span aria-current="page">Complete collection</span></nav>
      <div className="grid gap-3 md:grid-cols-2 md:items-start md:gap-x-8 md:gap-y-4 lg:gap-x-12">
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#795c35] sm:text-xs">Complete digital collection</p>
          <h1 className="mt-1.5 font-serif text-[clamp(1.65rem,6vw,2rem)] leading-[1.12] tracking-tight md:text-4xl lg:text-5xl" data-testid="collection-page-heading">{info.bundleName}</h1>
          <p className="mt-2 hidden text-sm text-[#6e655e] md:block">By {isOnline ? "The Knowledge Concierge" : info.author}</p>
        </div>
        <div id="book-preview" data-testid="collection-preview" className={`min-w-0 scroll-mt-28 rounded-xl border px-3 py-2.5 md:col-start-1 md:row-span-2 md:row-start-1 md:self-stretch md:px-6 md:py-7 lg:px-8 ${isOnline ? "border-[#cbd5c7] bg-[#e8ede3]" : "border-[#ded0bc] bg-[#efe6d9]"}`}>
          <div className="flex h-full flex-col justify-center">
            <p className="mb-4 hidden text-center text-xs font-semibold uppercase tracking-[0.17em] text-[#665445] md:block">Inside the bundle</p>
            <div className="mx-auto grid w-full max-w-48 items-center gap-1.5 min-[360px]:max-w-[13.5rem] md:max-w-none md:gap-3" style={{ gridTemplateColumns: `repeat(${books.length}, minmax(0, 1fr))` }} data-testid="collection-page-covers">
              {books.map((book) => <Link className="min-w-0" href={`/books/${book.slug}`} key={book.id} data-testid={`collection-page-cover-${book.slug}`}><BookCover book={book} compact loading="eager" sizes="(max-width: 767px) 54px, 125px" /></Link>)}
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-[#625449] md:mt-5 md:text-sm">{books.length} complete PDF books · {pageCount} pages in total</p>
          </div>
        </div>
        <div className="min-w-0 md:col-start-2 md:row-start-2">
          <div data-testid="collection-price-panel" className="rounded-xl border border-[#ddcbaa] bg-[#f6efe2] p-3.5 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4" data-testid="purchase-price">
              <span aria-label={`Current price ${formatInr(collection.total_inr)}`} className="font-serif text-5xl font-semibold leading-none tracking-tight text-[#29231f] md:text-6xl" data-testid="collection-current-price">{formatInr(collection.total_inr)}</span>
              <div className="space-y-1 text-xs text-[#685b4d]">
                <p><del data-testid="purchase-original-price">{formatInr(individualTotal)}</del> separately</p>
                {savings > 0 && <p className="font-semibold text-[#604521]">Save {formatInr(savings)}</p>}
              </div>
            </div>
            <Button size="lg" className="mt-3 h-12 w-full bg-[#29231f] text-base font-semibold hover:bg-[#503d2a]" onClick={() => { addBooks(books.map((book) => book.id)); setBagOpen(false); setCheckoutOpen(true); }} data-testid="collection-page-add-all-btn">Buy all {books.length} books <ArrowRight aria-hidden="true" className="ml-2 size-4" /></Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-[#625449]"><Download aria-hidden="true" className="size-3.5 shrink-0" /> Instant PDF download after payment</p>
            <p className="mt-3 rounded-lg border border-[#c3d2bc] bg-[#e6efe1] px-3 py-2 text-sm leading-5 text-[#304731]">
              <strong className="font-bold text-[#223b28]">{salesCount} bundles sold</strong>{" "}
              <span className="text-xs">in October 2026</span>
            </p>
            <RatingSummary productId={info.reviewId} />
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <WhatsAppPurchase title={`${info.bundleName} (all ${books.length} books)`} />
            <Button size="lg" variant="outline" className="h-12 border-[#c5b69d] bg-transparent px-3 sm:px-5" onClick={() => { addBooks(books.map((book) => book.id)); setBagOpen(true); }} data-testid="collection-page-add-to-bag-btn">Add to bag</Button>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 border-t border-[#ddd5c9] pt-5 md:grid-cols-2 md:gap-8 lg:gap-12">
        <div>
          <p className="mb-1 text-xs text-[#6e655e] md:hidden">By {isOnline ? "The Knowledge Concierge" : info.author}</p>
          <h2 className="font-serif text-xl sm:text-2xl">{info.heading}</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[#6e655e]" data-testid="collection-page-copy">{info.description}</p>
        </div>
        {featuredReview && <figure className="rounded-xl border border-[#d3ddcd] bg-[#edf2e9] p-4 text-[#304731]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">What our customers say</p>
            <blockquote className="mt-3 font-serif text-lg leading-relaxed">“{featuredReview.text}”</blockquote>
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">{featuredReview.name}</span>
              <a href="#reader-reviews" className="inline-flex min-h-11 items-center underline underline-offset-4">Read customer reviews <ArrowRight aria-hidden="true" className="ml-2 size-4" /></a>
            </figcaption>
          </figure>}
      </div>
    </section>
    <section className="border-y border-[#ddd5c9] bg-[#f5f0e6]"><div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20"><p className="overline">{books.length} complementary subjects</p><h2 className="mt-3 font-serif text-3xl sm:text-4xl">What’s on your bookshelf.</h2><div className="mt-9 divide-y divide-[#ddd5c9]">{books.map((book, index) => <article key={book.id} className="grid gap-5 py-7 sm:grid-cols-[100px_1fr] md:grid-cols-[110px_.7fr_1fr]" data-testid={`collection-book-${book.id}`}><Link href={`/books/${book.slug}`} className="w-20 sm:w-24"><BookCover book={book} compact /></Link><div><p className="overline">0{index + 1} · {productContent[book.id as ProductId].focus}</p><h3 className="mt-2 font-serif text-2xl"><Link href={`/books/${book.slug}`}>{book.title}</Link></h3><p className="mt-2 text-xs text-[#6e655e]">{book.pages} pages · Complete PDF · {formatInr(book.selling_price_inr)}</p></div><div><p className="text-sm leading-7 text-[#6e655e]">{book.description}</p><Link href={`/books/${book.slug}#book-preview`} className="mt-2 inline-flex min-h-11 items-center text-sm text-[#795c35] underline underline-offset-4">Read about the book & preview pages <ArrowRight className="ml-2 size-4" /></Link></div></article>)}</div></div></section>
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2"><div><p className="overline">Choose the right fit</p><h2 className="mt-3 font-serif text-3xl">A single subject or a wider view.</h2></div><div className="space-y-5 text-sm leading-7 text-[#6e655e]"><p><strong className="text-[#29231f]">One book, {formatInr(books[0].selling_price_inr)}.</strong> A focused starting point when you are working on a specific challenge, within your chosen series.</p><p><strong className="text-[#29231f]">Complete collection, {formatInr(collection.total_inr)}.</strong> For readers who want to connect the subjects across the whole series. Each PDF can be read independently.</p><p>The worked figures and examples are teaching illustrations. Apply them using your own records and circumstances.</p></div></section>
    <BookReviews productId={info.reviewId} heading="What our customers say" />
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20"><p className="overline">Collection questions</p><h2 className="mt-3 font-serif text-3xl">Before you buy.</h2><div className="mt-7 divide-y divide-[#ddd5c9] border-y border-[#ddd5c9]">{[
      ["What is included?", `All ${books.length} complete PDF books: ${books.map((book) => book.title).join(', ')}. Each includes its own working pages.`],
      ["Can I preview each book?", "Yes. Follow any title above to its product page, where you can browse the cover and three genuine interior pages."],
      ["How is the collection delivered?", "After payment confirmation, your order page provides the purchased PDF downloads. No physical books are shipped."],
    ].map(([question, answer]) => <details key={question} className="group"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="size-4 shrink-0 group-open:rotate-180" /></summary><p className="max-w-3xl pb-5 text-sm leading-7 text-[#6e655e]">{answer}</p></details>)}</div><Link href="/contact-us" className="mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Contact us about the collection</Link></section>
  </div>;
}
