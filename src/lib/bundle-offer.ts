import { formatInr } from "./catalog";
import type { PricingQuote } from "./commerce/types";
export function bundleOffer(current: PricingQuote, bundle: PricingQuote, seriesCount = 5, seriesPrice = bundle.total_inr) {
  const remaining = bundle.book_count - current.book_count;
  if (current.book_count < 1 || remaining < 1) return null;
  const difference = Math.round((bundle.total_inr - current.total_inr) * 100) / 100;
  const amount = formatInr(Math.abs(difference));
  const headline = difference < 0 ? `All ${seriesCount} books. Save ${amount}.`
    : difference === 0 ? `All ${seriesCount} books. The same price.`
    : `Just ${amount} more. Complete your series.`;
  return { difference, remaining, headline,
    supporting: "Connect the subjects with the complete series. Other books in your bag stay selected.",
    highlight: difference < 0 ? `SAVE ${amount}` : difference === 0 ? "NO EXTRA COST" : `ADD JUST ${amount}`,
    perBook: `₹${(seriesPrice / seriesCount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
}
