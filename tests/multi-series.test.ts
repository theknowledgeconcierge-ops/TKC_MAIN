import { describe, expect, it } from "vitest";
import { activeBooks } from "@/lib/catalog";
import { booksForSeries, incompleteSeries } from "@/lib/catalog/series";
import { quoteFor } from "@/lib/commerce/pricing";
import { createOrderSchema } from "@/lib/commerce/validation";
import { pdfPaths } from "@/lib/catalog/storage";
import { publishedReviews } from "@/lib/reviews";

const restaurant = booksForSeries("restaurant-playbooks").map(book => book.id);
const online = booksForSeries("start-selling-online").map(book => book.id);
describe("independent series pricing and catalog", () => {
  it("has nine active books with private delivery mappings and exact individual prices", () => {
    expect(activeBooks).toHaveLength(9);
    for (const book of activeBooks) {
      expect(quoteFor([book.id]).total_inr).toBe(199);
      expect(book.price_paise).toBe(19900);
      expect(pdfPaths[book.id as keyof typeof pdfPaths]).toBe(`handbooks/${book.id}.pdf`);
    }
    for (const book of online) expect(publishedReviews(book)).toEqual([]);
  });
  it("checks all 511 nonempty selections for independent totals and duplicate protection", () => {
    for (let mask = 1; mask < 1 << activeBooks.length; mask++) {
      const ids = activeBooks.filter((_, i) => mask & (1 << i)).map(book => book.id);
      const restaurantCount = restaurant.filter(id => ids.includes(id)).length;
      const onlineCount = online.filter(id => ids.includes(id)).length;
      const expected = (restaurantCount === 5 ? 499 : restaurantCount * 199) + (onlineCount === 4 ? 499 : onlineCount * 199);
      const quote = quoteFor([...ids, ...ids]);
      expect(quote.total_inr).toBe(expected);
      expect(quote.book_count).toBe(ids.length);
      expect(quote.coupon_discount_inr).toBe(0);
      expect(quote.total_savings_inr).toBe(ids.length * 199 - expected);
    }
  });
  it("accepts both bundles in one checkout and gives no extra First50 discount", () => {
    const ids = [...restaurant, ...online];
    expect(quoteFor(ids, "First50").total_inr).toBe(998);
    expect(createOrderSchema.shape.book_ids.parse(ids)).toEqual(ids);
    expect(() => createOrderSchema.shape.book_ids.parse([...ids, ids[0]])).toThrow();
    expect(() => quoteFor(online, "First50")).toThrow();
  });
  it("offers only a relevant incomplete series and preserves unrelated selection", () => {
    expect(incompleteSeries([online[0]])?.id).toBe("start-selling-online");
    expect(incompleteSeries([...restaurant, online[0]])?.id).toBe("start-selling-online");
    expect(incompleteSeries([...restaurant, ...online])).toBeUndefined();
    const ids = [restaurant[0], ...online.slice(0, 3)];
    expect(incompleteSeries(ids)?.id).toBe("start-selling-online");
    const upgraded = [...new Set([...ids, ...online])];
    expect(quoteFor(upgraded).total_inr).toBe(698);
    expect(upgraded).toContain(restaurant[0]);
  });
});
