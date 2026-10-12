import { formatInr } from "./catalog";
import type { PricingQuote } from "./commerce/types";

export function bundleOffer(current: PricingQuote, bundle: PricingQuote) {
  const remaining = bundle.book_count - current.book_count;
  if (current.book_count < 1 || remaining < 1) return null;
  const difference = Math.round((bundle.total_inr - current.total_inr) * 100) / 100;
  const amount = formatInr(Math.abs(difference));
  const headline = difference < 0 ? `All 5 books. Save ${amount}.`
    : difference === 0 ? "All 5 books. The same price."
    : current.book_count === 1 ? `Just ${amount} more. Get ALL 5 books.`
    : current.book_count === 2 ? `Just ${amount} more. Get ${remaining} extra books.`
    : current.book_count === 4 ? `Just ${amount} more. Get the final book.`
    : `Just ${amount} more for all 5.`;
  const supporting = current.book_count === 1
    ? "Why learn just one part of running a restaurant when you can master the whole picture?"
    : current.book_count === 2 ? "Complete your restaurant toolkit for less than the price of a single book."
    : current.book_count === 3 ? "You're almost there. Complete your collection and learn every side of the restaurant business."
    : "One more book. The complete restaurant playbook.";
  return { difference, remaining, headline, supporting,
    highlight: difference < 0 ? `SAVE ${amount}` : difference === 0 ? "NO EXTRA COST" : `ADD JUST ${amount}`,
    perBook: `₹${(bundle.total_inr / bundle.book_count).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
}
