import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { activeBooks, type ProductId } from "../src/lib/catalog";
import { productContent } from "../src/lib/product-content";
import { publishedReviews, reviewStats, type BookReview } from "../src/lib/reviews";
import { StarRating } from "../src/components/BookReviews";

describe("authentic product content", () => {
  it("has three separate real sample images and tailored content for every active book", () => {
    const sources = new Set<string>();
    for (const book of activeBooks) {
      const content = productContent[book.id as ProductId];
      expect(content.previews).toHaveLength(3);
      expect(content.problems).toHaveLength(3);
      expect(content.outcomes).toHaveLength(3);
      for (const preview of content.previews) {
        expect(preview.src).toContain(`/previews/${book.id}/`);
        expect(preview.page).toBeGreaterThan(1);
        expect(preview.page).toBeLessThanOrEqual(book.pages);
        expect(existsSync(`public${preview.src}`)).toBe(true);
        expect(sources.has(preview.src)).toBe(false);
        sources.add(preview.src);
      }
    }
  });
  it("publishes the owner-confirmed reviews only against their supplied products", () => {
    expect(publishedReviews("the-first-table")).toHaveLength(10);
    expect(publishedReviews("the-full-table")).toHaveLength(12);
    expect(publishedReviews("behind-the-kitchen-door")).toHaveLength(8);
    expect(publishedReviews("the-math-behind-the-menu")).toHaveLength(14);
    expect(publishedReviews("complete-collection")).toHaveLength(15);
    expect(publishedReviews("empty-tables-to-full-house")).toHaveLength(20);
    expect(reviewStats(publishedReviews("empty-tables-to-full-house"))).toMatchObject({ count: 20, average: 4.3 });
    expect(publishedReviews("empty-tables-to-full-house")[18]).toMatchObject({ name: "Gaurav Pandey", rating: 4, text: "A useful starting point for thinking about restaurant growth. I appreciated the focus on customer attraction and the business decisions that support a more consistent flow of diners." });
    expect(reviewStats(publishedReviews("the-first-table"))).toMatchObject({ count: 10, average: 4.2 });
    expect(publishedReviews("the-first-table")[0]).toMatchObject({ name: "Aarav Sharma", rating: 5, text: "I liked that this focuses on the early decisions behind opening a restaurant. It reminded me to think through the business model and the customer I want to serve before spending on the setup." });
    expect(reviewStats([])).toMatchObject({ count: 0, average: null });
  });
  const fixture = (id: string, rating: number, extra: Partial<BookReview> = {}): BookReview => ({ id, productId: "test-book", rating, text: "Test-only review fixture.", status: "published", provenance: "reader-feedback", ...extra });
  it("filters per product and excludes drafts, illustrative material and invalid ratings", () => {
    const source = [fixture("1", 5), fixture("2", 4), fixture("3", 3, { status: "draft" }), fixture("4", 5, { provenance: "illustrative" }), fixture("5", 5, { productId: "other" }), fixture("6", 8), fixture("7", 2.5)];
    const result = publishedReviews("test-book", source);
    expect(result.map((review) => review.id)).toEqual(["1", "2"]);
    expect(reviewStats(result)).toMatchObject({ count: 2, average: 4.5, distribution: [{ rating: 5, count: 1 }, { rating: 4, count: 1 }, { rating: 3, count: 0 }, { rating: 2, count: 0 }, { rating: 1, count: 0 }] });
  });
  it("renders different partial stars for 4.2 and 4.8 with accessible numeric text", () => {
    const low = renderToStaticMarkup(createElement(StarRating, { value: 4.2 }));
    const high = renderToStaticMarkup(createElement(StarRating, { value: 4.8 }));
    expect(low).toContain("4.2 out of 5 stars");
    expect(high).toContain("4.8 out of 5 stars");
    expect(low).not.toEqual(high);
    expect(low).toMatch(/width:20\.?\d*%/);
    expect(high).toMatch(/width:79\.?\d*%|width:80%/);
  });
});
