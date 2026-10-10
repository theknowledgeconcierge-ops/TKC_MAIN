"use client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/BookCard";
import BookCover from "@/components/BookCover";
import CollectionOffer from "@/components/CollectionOffer";
import { activeBooks as books, formatInr } from "@/lib/catalog";
import { useStore, summaryFor } from "@/lib/store";

const partnerCopy: Record<string, string> = {
  "the-first-table":
    "Before you sign a lease, invest in interiors, or build your menu, have a practical guide by your side. The First Table is your silent planning partner—helping you ask better questions and prepare for the journey from idea to first customer.",
  "the-full-table":
    "Great food deserves to be discovered. The Full Table acts as your silent marketing partner, helping you understand customer acquisition, local visibility, repeat visits, and the decisions behind sustainable restaurant demand.",
  "behind-the-kitchen-door":
    "A restaurant runs on people, processes, and consistency. Behind the Kitchen Door is your silent operations partner, offering practical frameworks for staffing, coordination, inventory, routines, and everyday management.",
  "the-math-behind-the-menu":
    "Sales tell only part of the story. The Math Behind the Menu is your silent financial partner, helping you understand pricing, costs, margins, cash flow, and the numbers behind restaurant decisions.",
  "empty-tables-to-full-house":
    "When tables remain empty, the answer isn’t always another discount. Empty Tables to Full House is your silent growth partner, helping you examine demand, improve visibility, evaluate offers, and build a more deliberate plan for attracting customers.",
};

export default function Product({ slug }: { slug: string }) {
  const book = books.find((item) => item.slug === slug)!;
  const { addBook, selectedIds, setBagOpen } = useStore();
  const selected = selectedIds.includes(book.id);
  const progress = summaryFor(
    selectedIds.includes(book.id) ? selectedIds : [...selectedIds, book.id],
  );
  return (
    <div data-testid="product-page">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 top-10 size-72 rounded-full bg-[#c5a880]/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[.7fr_1.3fr] md:gap-12 md:py-24 lg:px-8">
          <motion.div
            initial={{ opacity: 1, x: -18, rotate: -1 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[250px] sm:max-w-[300px]"
          >
            <BookCover
              book={book}
              preload
              sizes="(max-width: 639px) 250px, 300px"
            />
            <p
              className="mt-3 text-center text-[10px] uppercase tracking-[0.14em] text-[#8c6d46] sm:mt-4 sm:text-xs"
              data-testid="product-cover-note"
            >
              Original supplied cover
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 1, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative max-w-2xl"
          >
            <p className="overline">
              Restaurant business handbook · {book.pages} pages · By{" "}
              {book.author}
            </p>
            <h1
              className="mt-5 font-serif text-4xl leading-tight text-[#29231f] sm:text-5xl"
              data-testid="product-title"
            >
              {book.title}
            </h1>
            <p
              className="mt-4 font-serif text-xl leading-relaxed text-[#6e655e] sm:text-2xl"
              data-testid="product-subtitle"
            >
              {book.subtitle}
            </p>
            <p
              className="mt-6 text-base leading-relaxed text-[#6e655e]"
              data-testid="product-description"
            >
              {book.description}
            </p>
            <div
              className="mt-7 flex flex-wrap gap-2"
              data-testid="product-topic-preview"
            >
              {book.topics.slice(0, 3).map((topic) => (
                <span
                  key={topic}
                  className="border border-[#b49a6a]/30 bg-[#f5f0e6] px-3 py-1.5 text-xs text-[#6e655e] transition-transform duration-200 hover:-translate-y-0.5 hover:border-[#b49a6a]"
                >
                  {topic}
                </span>
              ))}
            </div>
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
              className="mt-8 flex items-center justify-between gap-5 border border-[#b49a6a]/45 bg-[#eadfcd] p-5 shadow-[0_10px_30px_rgba(96,72,42,0.08)] sm:max-w-md"
              data-testid="product-price-panel"
            >
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#7a5c32]">
                  Launch price
                </p>
                <div className="mt-2 flex items-end gap-3">
                  <span
                    className="font-serif text-4xl font-semibold leading-none text-[#7a5c32]"
                    data-testid="product-selling-price"
                  >
                    {formatInr(book.selling_price_inr)}
                  </span>
                  <span
                    className="pb-1 text-sm text-[#8d8176] line-through"
                    data-testid="product-original-price"
                  >
                    {formatInr(book.original_price_inr)}
                  </span>
                </div>
              </div>
              <div className="border-l border-[#b49a6a]/50 pl-5 text-right">
                <p className="font-mono text-sm font-medium text-[#29231f]">
                  SAVE ₹250
                </p>
                <p className="mt-1 text-xs text-[#6e655e]">Digital PDF</p>
              </div>
            </motion.div>
            <div className="mt-8 grid gap-3 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!selected) addBook(book.id);
                  setBagOpen(true);
                }}
                data-testid="book-detail-add-btn"
              >
                {selected ? "View your bag" : "Add to your bag"}
                <ArrowRight className="ml-2 size-4" />
              </Button>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => {
                  if (!selected) addBook(book.id);
                  setBagOpen(true);
                }}
                data-testid="book-detail-buy-btn"
              >
                Buy now
              </Button>
            </div>
            <div className="mt-8 grid gap-3 border-t border-[#2e241f]/10 pt-5 text-sm text-[#6e655e] sm:grid-cols-3">
              <motion.span
                whileHover={{ x: 3 }}
                className="flex items-center gap-2"
              >
                <Download className="size-4 text-[#b49a6a]" />
                Instant digital access
              </motion.span>
              <motion.span
                whileHover={{ x: 3 }}
                className="flex items-center gap-2"
              >
                <ShieldCheck className="size-4 text-[#b49a6a]" />
                Secure checkout flow
              </motion.span>
              <motion.span
                whileHover={{ x: 3 }}
                className="flex items-center gap-2"
              >
                <Check className="size-4 text-[#b49a6a]" />
                PDF format
              </motion.span>
            </div>
          </motion.div>
        </div>
      </section>
      <CollectionOffer />
      <motion.section
        initial={{ opacity: 0.65 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.45 }}
        className="bg-[#ede7dd]"
        data-testid="product-smart-collection"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-8 md:grid-cols-[1fr_1.2fr] md:gap-10">
            <div>
              <p className="overline">Collection-aware shopping</p>
              <h2 className="mt-4 font-serif text-3xl text-[#29231f] sm:text-4xl">
                One book is a start. The complete collection goes further.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#6e655e]">
                Your next book unlocks the next price automatically. No hunting
                for codes.
              </p>
            </div>
            <motion.div
              whileHover={{ y: -3 }}
              className="border border-[#b49a6a]/40 bg-[#fbf9f5] p-5 shadow-[0_8px_26px_rgba(24,20,18,0.05)] sm:p-6"
              data-testid="product-progress-meter"
            >
              <div className="flex justify-between text-[10px] font-mono uppercase tracking-[0.12em] text-[#8c6d46] sm:text-xs sm:tracking-[0.15em]">
                <span>
                  {progress.count} of {books.length} selected
                </span>
                <span>{formatInr(progress.total)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden bg-[#e9dfcf]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(progress.count / books.length) * 100}%`,
                  }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full bg-[#b49a6a]"
                />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs text-[#6e655e] sm:grid-cols-4">
                <span>2 · ₹399</span>
                <span>3 · ₹549</span>
                <span>4 · ₹699</span>
                <span>5 · ₹999</span>
              </div>
              <p className="mt-5 text-xs leading-relaxed text-[#8c6d46]">
                First50: ₹499 for eligible first-time buyers of all five books.
                Your payable total is confirmed securely at checkout.
              </p>
              <Button
                className="mt-5 w-full sm:w-auto"
                variant="outline"
                onClick={() => setBagOpen(true)}
                data-testid="product-progress-bag-btn"
              >
                View your collection bag
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.section>
      <section
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        data-testid="product-content-section"
      >
        <div className="grid gap-12 md:grid-cols-[1fr_1fr] md:gap-14">
          <motion.div
            initial={{ opacity: 1, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.4 }}
          >
            <p className="overline">What you’ll work through</p>
            <h2 className="mt-4 font-serif text-3xl text-[#29231f] sm:text-4xl">
              Useful knowledge, without the noise.
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {book.topics.map((topic, index) => (
                <motion.div
                  initial={{ opacity: 1, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  key={topic}
                  className="flex gap-3 border-b border-[#2e241f]/10 py-3 text-sm text-[#6e655e]"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-[#b49a6a]" />
                  {topic}
                </motion.div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 1, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <p className="overline">Inside the book</p>
            <details className="group">
              <summary
                className="mt-4 flex w-full cursor-pointer list-none items-center justify-between border-b border-[#2e241f]/10 py-4 text-left font-serif text-2xl text-[#29231f] hover:border-[#b49a6a] hover:text-[#8c6d46] [&::-webkit-details-marker]:hidden"
                data-testid="product-toc-toggle"
              >
                <h2>Contents</h2>
                <ChevronDown className="size-5 text-[#8c6d46] transition-transform group-open:rotate-180" />
              </summary>
              <div
                className="divide-y divide-[#2e241f]/10"
                data-testid="product-toc-list"
              >
                {book.toc.map((item) => (
                  <p className="py-3 text-sm text-[#6e655e]" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            </details>
            <div className="mt-10 border-l border-[#b49a6a] pl-5">
              <p className="overline">More than a book</p>
              <h3 className="mt-3 font-serif text-3xl text-[#29231f]">
                A silent business partner.
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-[#6e655e]">
                {partnerCopy[book.slug]}
              </p>
            </div>
          </motion.div>
        </div>
      </section>
      <section className="bg-[#f5f0e6]" data-testid="product-related-section">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex items-end justify-between gap-5">
            <div>
              <p className="overline">Continue exploring</p>
              <h2 className="mt-4 font-serif text-3xl text-[#29231f] sm:text-4xl">
                Other useful perspectives.
              </h2>
            </div>
            <Link
              href="/books"
              className="hidden items-center text-sm uppercase tracking-[0.12em] text-[#8c6d46] sm:flex"
              data-testid="product-library-link"
            >
              All books <ArrowRight className="ml-2 size-4" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-8 lg:grid-cols-3">
            {books
              .filter((item) => item.id !== book.id)
              .slice(0, 3)
              .map((item) => (
                <BookCard key={item.id} book={item} />
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
