"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { publishedReviews, reviewStats, reviewContext } from "@/lib/reviews";

export function StarRating({ value }: { value: number }) {
  return <span className="inline-flex gap-0.5"><span className="sr-only">{value.toFixed(1)} out of 5 stars</span>
    {[0, 1, 2, 3, 4].map((index) => <span key={index} className="relative inline-block size-4" aria-hidden="true">
      <Star className="absolute size-4 text-[#b8afa3]" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}>
        <Star className="size-4 max-w-none fill-[#a87932] text-[#a87932]" />
      </span>
    </span>)}
  </span>;
}

export function RatingSummary({ productId }: { productId: string }) {
  const { count, average } = reviewStats(publishedReviews(productId));
  return <a href="#reader-reviews" aria-label={average === null ? "No reader reviews yet. Read more." : `${average.toFixed(1)} out of 5, based on ${count} reviews${productId === "complete-collection" ? " of the original four-book collection" : ""}. Read reviews.`} className="inline-flex min-h-11 flex-wrap items-center gap-2 text-sm text-[#6e655e] underline-offset-4 hover:underline" data-testid="rating-summary">
    {average === null ? "No reader reviews yet · Read more" : <><StarRating value={average} /><span>{average.toFixed(1)}/5 · {count} {count === 1 ? "review" : "reviews"}{productId === "complete-collection" ? " · Original collection" : ""}</span></>}
  </a>;
}

export default function BookReviews({ productId }: { productId: string }) {
  const reviews = publishedReviews(productId);
  const stats = reviewStats(reviews);
  const [visible, setVisible] = useState(6);
  return <section id="reader-reviews" className="scroll-mt-28 border-y border-[#ddd5c9] bg-[#f5f0e6]" data-testid="book-reviews">
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="overline">Reader feedback</p>
      <h2 className="mt-3 font-serif text-3xl sm:text-4xl">Customer reviews</h2>
      {reviewContext(productId) && <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6e655e]">{reviewContext(productId)}</p>}
      {stats.average === null ? <div className="mt-7 max-w-2xl border border-[#ddd5c9] bg-[#fbf9f5] p-6">
        <p className="font-serif text-xl">No reader reviews yet.</p>
        <p className="mt-2 text-sm leading-6 text-[#6e655e]">There are no published customer reviews for this title yet. Explore the actual sample pages and contents to see whether it fits your needs.</p>
        <a href="#book-preview" className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Explore the book preview</a>
      </div> : <>
        <div className="mt-7 flex flex-wrap gap-8">
          <div><p className="font-serif text-4xl">{stats.average.toFixed(1)}<span className="text-lg text-[#6e655e]"> / 5</span></p><StarRating value={stats.average} /><p className="mt-2 text-sm">Based on {stats.count} reviews</p></div>
          {stats.count >= 10 && <div className="w-64 max-w-full space-y-1" aria-label="Rating distribution">{stats.distribution.map(({ rating, count }) => <div key={rating} className="flex items-center gap-3 text-xs"><span>{rating} stars</span><div className="h-2 flex-1 bg-[#ddd5c9]"><div className="h-full bg-[#a87932]" style={{ width: `${count / stats.count * 100}%` }} /></div><span>{count}</span></div>)}</div>}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">{reviews.slice(0, visible).map((review) => <article key={review.id} className="border border-[#ddd5c9] bg-[#fbf9f5] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">{review.name || "Anonymous reader"}</h3><StarRating value={review.rating} /></div>
          {review.date && <time dateTime={review.date} className="mt-2 block text-xs text-[#6e655e]">{review.date}</time>}
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#6e655e]">{review.text}</p>
        </article>)}</div>
        {visible < reviews.length && <button className="mt-6 min-h-11 border border-[#b49a6a] px-5 text-sm" onClick={() => setVisible((value) => value + 6)}>Load more reviews</button>}
      </>}
    </div>
  </section>;
}
