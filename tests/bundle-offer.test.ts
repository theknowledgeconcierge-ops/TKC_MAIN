import { describe, expect, it } from "vitest";
import { activeBooks } from "@/lib/catalog";
import { quoteFor } from "@/lib/commerce/pricing";
import { bundleOffer } from "@/lib/bundle-offer";

const ids = activeBooks.filter(book => book.seriesId === "restaurant-playbooks").map(book => book.id);
const bundle = quoteFor(ids);
describe("truthful collection upgrade pricing", () => {
  it.each([[1, 300, 4], [2, 101, 3], [3, -98, 2], [4, -297, 1]])("compares %i selected books with the actual discounted bundle", (count, difference, remaining) => {
    const offer = bundleOffer(quoteFor(ids.slice(0, count)), bundle)!;
    expect(offer).toMatchObject({ difference, remaining, perBook: "₹99.80" });
    expect(offer.highlight).toBe(difference > 0 ? `ADD JUST ₹${difference}` : `SAVE ₹${-difference}`);
    if (difference < 0) expect(offer.headline).not.toContain("more.");
  });
  it("handles equal prices without claiming an additional cost", () => {
    expect(bundleOffer({ ...quoteFor(ids.slice(0, 4)), total_inr: bundle.total_inr }, bundle)).toMatchObject({ difference: 0, highlight: "NO EXTRA COST" });
  });
  it("uses changed pricing rather than hardcoded three-book totals or bundle prices", () => {
    const offer = bundleOffer({ ...quoteFor(ids.slice(0, 3)), total_inr: 400 }, { ...bundle, total_inr: 600 });
    expect(offer).toMatchObject({ difference: 200, perBook: "₹120.00", headline: "Just ₹200 more. Complete your series." });
  });
  it("skips complete collections and empty selections", () => {
    expect(bundleOffer(bundle, bundle)).toBeNull();
    expect(bundleOffer({ ...bundle, book_count: 0 }, bundle)).toBeNull();
  });
  it("counts repeated product IDs only once through the existing pricing engine", () => {
    expect(bundleOffer(quoteFor([ids[0], ids[0]]), bundle)).toMatchObject({ difference: 300, remaining: 4 });
  });
});
