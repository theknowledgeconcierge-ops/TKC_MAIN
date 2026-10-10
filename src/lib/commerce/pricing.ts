import { activeBooks } from "@/lib/catalog";
import type { PricingQuote } from "./types";

const tierPrices: Readonly<Record<number, number>> = {
  1: 249,
  2: 399,
  3: 549,
  4: 699,
  5: 999,
};
export function quoteFor(
  ids: readonly string[],
  firstTime: boolean | null = null,
  coupon?: string,
): PricingQuote {
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
  const discount = count === 5 && firstTime === true ? 500 : 0;
  return {
    book_count: count,
    regular_total_inr: regular,
    automatic_discount_inr: regular - automatic,
    automatic_price_inr: automatic,
    coupon_code: discount ? "FIRST50" : null,
    coupon_discount_inr: discount,
    total_inr: automatic - discount,
    total_savings_inr: regular - automatic + discount,
    eligible_first_time: count === 5 ? firstTime : null,
    eligibility_status:
      count !== 5
        ? "not_applicable"
        : firstTime === null
          ? "needs_verification"
          : firstTime
            ? "eligible"
            : "returning_customer",
    message:
      count !== 5
        ? "Your collection price is ready."
        : firstTime === null
          ? "First50 eligibility is confirmed at checkout."
          : firstTime
            ? "First50 applied for a first-time buyer."
            : "The standard collection price applies to returning customers.",
  };
}
