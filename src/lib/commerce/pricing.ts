import { activeBooks } from "@/lib/catalog";
import { series, booksForSeries } from "@/lib/catalog/series";
import type { PricingQuote } from "./types";

export function quoteFor(ids: readonly string[], coupon?: string): PricingQuote {
  const unique = [...new Set(ids)];
  const products = unique.map(id => activeBooks.find(book => book.id === id));
  if (!unique.length || products.some(book => !book)) throw new Error("Invalid product selection");
  const code = coupon?.trim().toUpperCase();
  // Legacy saved First50 inputs never add a discount to today's final bundle price.
  const restaurantComplete = booksForSeries("restaurant-playbooks").every(book => unique.includes(book.id));
  if (code && (code !== "FIRST50" || !restaurantComplete))
    throw new Error("This coupon is not applicable. Bundle prices apply automatically.");
  const regular = products.reduce((sum, book) => sum + book!.price_paise, 0) / 100;
  let total = 0;
  for (const item of series) {
    const books = booksForSeries(item.id);
    const selected = books.filter(book => unique.includes(book.id));
    total += selected.length === books.length ? item.bundlePrice : selected.reduce((sum, book) => sum + book.price_paise / 100, 0);
  }
  return {
    book_count: unique.length, regular_total_inr: regular,
    automatic_discount_inr: regular - total, automatic_price_inr: total,
    coupon_code: null, coupon_discount_inr: 0, total_inr: total,
    total_savings_inr: regular - total,
    message: regular > total ? "Complete series bundle price applied automatically." : "Your collection price is ready.",
  };
}
