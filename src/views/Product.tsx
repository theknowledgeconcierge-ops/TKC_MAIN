"use client";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Download, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/BookCard";
import BookPreview from "@/components/BookPreview";
import BookReviews, { RatingSummary } from "@/components/BookReviews";
import CollectionOffer from "@/components/CollectionOffer";
import PurchasePrice from "@/components/PurchasePrice";
import WhatsAppPurchase from "@/components/WhatsAppPurchase";
import { activeBooks as books, formatInr, type ProductId } from "@/lib/catalog";
import { productContent } from "@/lib/product-content";
import { useCartActions } from "@/lib/store";

export default function Product({ slug }: { slug: string }) {
  const book = books.find((item) => item.slug === slug)!;
  const content = productContent[book.id as ProductId];
  const { addBook, setBagOpen, setCheckoutOpen } = useCartActions();
  const purchase = () => { addBook(book.id); setBagOpen(false); setCheckoutOpen(true); };
  const addToBag = () => { addBook(book.id); setBagOpen(true); };
  return <div data-testid="product-page">
    <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6 sm:pb-20 sm:pt-8">
      <nav aria-label="Breadcrumb" className="mb-7 text-xs leading-6 text-[#6e655e]"><Link href="/">Home</Link><span aria-hidden="true"> / </span><Link href="/books">Books</Link><span aria-hidden="true"> / </span><span aria-current="page">{book.title}</span></nav>
      <section className="grid min-w-0 gap-x-14 gap-y-6 md:grid-cols-[.85fr_1fr] md:gap-y-0">
        <header className="md:col-start-2 md:row-start-1">
          <p className="overline">{content.focus}</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl" data-testid="product-title">{book.title}</h1>
          <p className="mt-3 text-sm leading-6 text-[#6e655e]">By {book.author} · {book.pages} pages · Digital PDF</p>
          <div className="mt-2"><RatingSummary productId={book.id} /></div>
        </header>
        <div className="md:col-start-1 md:row-span-2 md:row-start-1"><BookPreview book={book} pages={content.previews} /></div>
        <div className="min-w-0 md:col-start-2 md:row-start-2">
          <p className="text-sm leading-6 text-[#6e655e] sm:hidden" data-testid="product-mobile-description">{content.shortDescription}</p>
          <p className="mt-1 hidden font-serif text-lg leading-7 text-[#6e655e] sm:block" data-testid="product-subtitle">{book.subtitle}</p>
          <p className="mt-4 hidden text-sm leading-7 text-[#6e655e] sm:block" data-testid="product-description">{book.description}</p>
          <div className="mt-5 hidden flex-wrap gap-2 sm:flex" data-testid="product-topic-preview">{book.topics.slice(0, 3).map((topic) => <span key={topic} className="border border-[#ddd5c9] px-2.5 py-1.5 text-xs text-[#6e655e]">{topic}</span>)}</div>
          <div className="mt-3 rounded-xl border border-[#d5c3a3] bg-[#f6f0e5] p-4 shadow-[0_8px_30px_rgba(96,72,42,0.05)] sm:mt-6 sm:p-5" data-testid="product-price-panel">
            <p className="mb-3 hidden text-xs font-medium uppercase tracking-[0.12em] text-[#795c35] sm:block">Your next business decision, better informed.</p>
            <PurchasePrice original={book.original_price_inr} price={book.selling_price_inr} sellingTestId="product-selling-price" />
            <p className="mt-2 text-xs leading-5 text-[#6e655e]">PDF edition · Workbook included</p>
            <Button size="lg" className="mt-3 h-12 w-full bg-[#29231f] text-base font-semibold shadow-[0_5px_14px_rgba(41,35,31,0.16)] hover:bg-[#503d2a] sm:mt-4" onClick={purchase} data-testid="book-detail-buy-btn">Buy now · {formatInr(book.selling_price_inr)} <ArrowRight className="ml-2 size-4" /></Button>
            <div className="mt-3"><WhatsAppPurchase title={book.title} /></div>
            <Button type="button" size="lg" variant="outline" className="mt-3 h-12 w-full border-[#c5b69d] bg-transparent text-sm" onClick={addToBag} data-testid="book-detail-add-btn">Add to bag</Button>
          </div>
          <div className="mt-4 space-y-2 text-xs leading-5 text-[#6e655e]">
            <p className="flex gap-2"><Download className="mt-0.5 size-4 shrink-0 text-[#8c6d46]" />PDF downloads become available after payment confirmation.</p>
            <p className="flex gap-2"><BookOpen className="mt-0.5 size-4 shrink-0 text-[#8c6d46]" />Digital edition only. No physical book is shipped.</p>
          </div>
          <a href="#book-preview" className="mt-3 inline-flex min-h-11 items-center text-sm text-[#795c35] underline underline-offset-4">Preview three real pages</a>
        </div>
      </section>
    </div>
    <nav aria-label="About this book" className="border-y border-[#ddd5c9] bg-[#f5f0e6]"><div className="mx-auto flex max-w-6xl flex-wrap gap-x-7 px-4 text-sm sm:px-6">{[["#about-book", "About the book"], ["#book-preview", "Look inside"], ["#reader-reviews", "Reader reviews"], ["#book-questions", "Questions"]].map(([href, label]) => <a className="inline-flex min-h-12 items-center underline-offset-4 hover:underline" href={href} key={href}>{label}</a>)}</div></nav>
    <section id="about-book" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-14 sm:px-6 sm:py-20" data-testid="product-content-section">
      <div className="grid gap-10 md:grid-cols-[.8fr_1fr] md:gap-16">
        <div><p className="overline">A closer look</p><h2 className="mt-3 font-serif text-3xl sm:text-4xl">A book for the decisions in front of you.</h2><p className="mt-5 text-sm leading-7 text-[#6e655e]">{content.introduction}</p>
          <h3 className="mt-8 font-serif text-xl">Is this a familiar challenge?</h3><ul className="mt-3 space-y-3">{content.problems.map((problem) => <li key={problem} className="flex gap-3 text-sm leading-6 text-[#6e655e]"><Check className="mt-1 size-4 shrink-0 text-[#8c6d46]" />{problem}</li>)}</ul>
        </div>
        <div><p className="overline">What you’ll learn</p><div className="mt-3 divide-y divide-[#ddd5c9]">{content.outcomes.map((outcome, i) => <article className="flex gap-4 py-5 first:pt-0" key={outcome.title}><span className="pt-1 font-mono text-xs text-[#8c6d46]">0{i + 1}</span><div><h3 className="font-serif text-2xl">{outcome.title}</h3><p className="mt-2 text-sm leading-7 text-[#6e655e]">{outcome.text}</p></div></article>)}</div></div>
      </div>
      <div className="mt-12 grid gap-8 border-y border-[#ddd5c9] py-8 md:grid-cols-2"><div><h3 className="font-serif text-2xl">Who it’s for</h3><p className="mt-3 text-sm leading-7 text-[#6e655e]">{content.audience}</p></div><div><h3 className="font-serif text-2xl">Put it to work</h3><p className="mt-3 text-sm leading-7 text-[#6e655e]">{content.application}</p></div></div>
      <details className="group mt-6"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 border-b border-[#ddd5c9] font-serif text-2xl [&::-webkit-details-marker]:hidden" data-testid="product-toc-toggle">Inside the book: contents<ChevronDown className="size-5 transition-transform group-open:rotate-180" /></summary><div className="grid gap-x-8 sm:grid-cols-2" data-testid="product-toc-list">{book.toc.map((item, i) => <p className="border-b border-[#ddd5c9] py-4 text-sm text-[#6e655e]" key={item}><span className="mr-3 font-mono text-xs text-[#8c6d46]">{String(i + 1).padStart(2, "0")}</span>{item}</p>)}</div></details>
      <p className="mt-5 max-w-3xl text-xs leading-6 text-[#6e655e]">Examples and worksheet figures are teaching illustrations. Adapt the material to your own business records and circumstances; reading a book does not guarantee a business result.</p>
    </section>
    <BookReviews key={book.id} productId={book.id} />
    <section id="book-questions" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-14 sm:px-6 sm:py-20">
      <p className="overline">Before you choose</p><h2 className="mt-3 font-serif text-3xl sm:text-4xl">A few useful answers.</h2>
      <div className="mt-7 divide-y divide-[#ddd5c9] border-y border-[#ddd5c9]">{[
        ["What do I receive?", `The complete ${book.pages}-page PDF edition of ${book.title}, including its workbook pages. This is a digital book, not a physical delivery.`],
        ["Can I look inside before buying?", "Yes. The gallery above includes the cover and three original interior pages from this book. Use the arrows or thumbnails, and enlarge any page to read it."],
        ["How do I get the book after payment?", "Once your payment is confirmed, your order page provides the PDF download. If confirmation is pending, that page checks the payment status before making downloads available."],
        ["Should I choose one book or the collection?", "Choose an individual book for one specific subject. The complete five-book collection covers starting, marketing, operations, finance and diagnosing weak demand. Its current total is shown below and confirmed at checkout."],
      ].map(([question, answer]) => <details className="group" key={question}><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="size-4 shrink-0 group-open:rotate-180" /></summary><p className="max-w-3xl pb-5 text-sm leading-7 text-[#6e655e]">{answer}</p></details>)}</div>
      <p className="mt-5 text-sm text-[#6e655e]">More questions? <Link href="/faq" className="underline underline-offset-4">Visit the FAQs</Link> or <Link href="/contact-us" className="underline underline-offset-4">contact us</Link>.</p>
    </section>
    <CollectionOffer />
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" data-testid="product-related-section"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="overline">Keep exploring</p><h2 className="mt-3 font-serif text-3xl sm:text-4xl">A different part of the business.</h2></div><Link href="/books" className="inline-flex min-h-11 items-center text-sm text-[#795c35] underline underline-offset-4" data-testid="product-library-link">Browse all books <ArrowRight className="ml-2 size-4" /></Link></div><div className="mt-9 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-8 lg:grid-cols-4">{books.filter((item) => item.id !== book.id).map((item) => <BookCard key={item.id} book={item} />)}</div></section>
  </div>;
}
