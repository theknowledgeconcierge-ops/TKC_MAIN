import { activeBooks } from "@/lib/catalog";
import type { PricingQuote } from "./types";

const tierPrices: Readonly<Record<number, number>> = {
  1: 249,
  2: 399,
  3: 549,
  4: 699,
  5: 999,
};
// Every customer pays this for all five books; the ₹999 tier is only the reference price.
const collectionPromotionalPrice = 499;
export function quoteFor(ids: readonly string[], coupon?: string): PricingQuote {
  const unique = [...new Set(ids)];
  const products = unique.map((id) =>
    activeBooks.find((book) => book.id === id),
  );
  if (!unique.length || products.some((book) => !book))
    throw new Error("Invalid product selection");
  const count = unique.length;
  const code = coupon?.trim().toUpperCase();
  if (code && (count !== 5 || code !== "FIRST50"))
    throw new Error(
      "First50 applies only to the complete five-book collection.",
    );
  const regular =
    products.reduce((sum, book) => sum + book!.price_paise, 0) / 100;
  const automatic = tierPrices[count];
  const discount = count === 5 ? automatic - collectionPromotionalPrice : 0;
  return {
    book_count: count,
    regular_total_inr: regular,
    automatic_discount_inr: regular - automatic,
    automatic_price_inr: automatic,
    coupon_code: discount ? "FIRST50" : null,
    coupon_discount_inr: discount,
    total_inr: automatic - discount,
    total_savings_inr: regular - automatic + discount,
    message: discount
      ? "Promotional collection price applied."
      : "Your collection price is ready.",
  };
}
