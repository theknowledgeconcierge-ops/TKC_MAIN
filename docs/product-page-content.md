# Product page sources and maintenance

The existing catalog has **five distinct books**. The brief's references to four books and "First Table, Full Table" do not match the catalog or the five supplied manuscripts. Product IDs, official catalog titles, URLs, the five-book collection, and the pricing engine are preserved. Individual PDFs cost INR 249; the current five-book quote is INR 499.

## Source material

Copy in `src/lib/product-content.ts` is grounded in the supplied India-edition manuscripts: their introductions, contents, chapters and working pages. Existing catalog descriptions and metadata remain consistent. The Aangan Table case and its figures are teaching illustrations, not reported customer results.

Only these sample pages are publicly served. Page numbers below refer to the physical PDF page index, starting at 1:

| Product ID | Source filename | Public PDF pages |
| --- | --- | --- |
| the-first-table | The First Table .pdf | 5, 15, 41 |
| the-full-table | The Full Table.pdf | 5, 27, 48 |
| behind-the-kitchen-door | Behind The Kitchen Door.pdf | 5, 17, 45 |
| the-math-behind-the-menu | The Math Behind The Menu.pdf | 5, 9, 46 |
| empty-tables-to-full-house | Empty Tables To Full House .pdf | 5, 25, 39 |

`scripts/render-book-previews.py` uses Poppler and Pillow to reproduce the sample assets. Run it with a private source directory and, if necessary, the full path to `pdftoppm`:

```text
python scripts/render-book-previews.py "PATH_TO_PRIVATE_MANUSCRIPTS" --pdftoppm "PATH_TO_PDFTOPPM"
```

Assets are 1600 pixels on their longest edge, WebP quality 88, approximately 67-251 KiB each. These are processing tools only; the site has no new dependency or PDF reader. Full PDFs remain private and must never be copied into `public/`.

## Reviews

The owner supplied a new `Book reviews.pdf` and explicitly confirmed its reviews are real. `src/lib/review-data.ts` imports all 59 reviews: The First Table (10), The Full Table (12), Behind the Kitchen Door (8), The Math Behind the Menu (14), and the original four-book collection (15). Source names, wording and ratings are preserved; PDF line wraps are joined with spaces. No dates or purchase-verification badges were supplied, so none are displayed. The separately supplied `Empty tables to full house reviews.pdf` adds 20 reviews for that title (4.3/5), bringing the total to 79. Its nineteenth review continues onto page 3; the complete text is preserved.

The collection reviews refer to the original four-book edition. The collection page and rating summary identify that context and explain that the current five-book bundle additionally includes Empty Tables to Full House. Reviews are not reassigned to this fifth book.

To add future feedback, assign the correct product ID (or `complete-collection`), preserve original text, name and rating, and set `provenance: "reader-feedback"` and `status: "published"`. Draft and illustrative entries remain excluded.

The components compute averages, counts and distribution from the same eligible reviews, render partial stars, show six reviews initially, and load more on demand. Existing JSON-LD remains factual and does not add review markup for the changed bundle edition.

## Purchase design and WhatsApp

Individual product pages show INR 499 struck through and INR 249 payable, sourced from the catalog. Collection pricing shows INR 1,245 (five individual purchases) struck through and INR 499 payable from the shared pricing engine. The purchase panel uses a larger primary CTA, a clear savings label, and a green secondary WhatsApp action. Existing online payment, verification and delivery logic are unchanged.

On mobile, a single short description replaces the subtitle, longer description and topic chips above the price; the full product details remain available below and on desktop. Buy Now adds the chosen book to the existing selection and opens the shared checkout directly. Buy All does the same for the collection. The separate, always-labelled Add to Bag button adds the item without duplicates and opens the bag. Checkout open state is shared through the store; InitiateCheckout is emitted once per opening for either entry path. Existing upsell, recovery, server pricing and payment verification are preserved.

The collection hero presents its five real covers and PDF/page-count summary before the price panel in mobile reading order. On desktop the preview sits at the top of the left column, above the purchase panel's vertical position, while the title and description lead the right column.

Shared book cards on the home page, library and related-book sections are toggles: Add to Bag adds the book and opens the drawer; In Bag removes that book without affecting other selections. The button exposes its selected state with `aria-pressed` and an explicit remove action label. Product-detail Add to Bag remains an additive action, as requested.

`WhatsAppPurchase` opens `https://wa.me/919557156634` in a new tab with a URL-encoded `I want to buy ...` message naming the chosen book or complete five-book collection. Opening the link does not automatically send a message. The phone number is the owner's public sales contact, not a secret. No new environment variables, packages or database migrations are required.
