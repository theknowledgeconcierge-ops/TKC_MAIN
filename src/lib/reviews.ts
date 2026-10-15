import { suppliedReaderReviews } from "./review-data";

export interface BookReview {
  id: string;
  productId: string;
  name?: string;
  rating: number;
  text: string;
  date?: string;
  status: "draft" | "published";
  provenance: "reader-feedback" | "illustrative";
}

// The owner confirmed the newly supplied Book reviews.pdf contains real feedback.
export const readerReviews: readonly BookReview[] = suppliedReaderReviews;

export const reviewContext = (productId: string) => productId === "complete-collection"
  ? "Feedback on the original four-book collection. The current bundle also includes Empty Tables to Full House."
  : null;

export function publishedReviews(productId: string, source = readerReviews) {
  return source.filter((review) => review.productId === productId &&
    review.status === "published" && review.provenance === "reader-feedback" &&
    Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5);
}

export function reviewStats(reviews: readonly BookReview[]) {
  const count = reviews.length;
  return {
    count,
    average: count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : null,
    distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: reviews.filter((review) => review.rating === rating).length })),
  };
}
