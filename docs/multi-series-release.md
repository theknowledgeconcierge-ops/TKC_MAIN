# Multi-series release

## Release order

Complete the database and private-storage steps before pushing this commit to
the Netlify production branch. The existing GitHub-connected Netlify workflow
builds the website automatically; no replacement deployment service is needed.

1. In the existing Supabase project's SQL editor, run
   `supabase/migrations/202610260001_multi_series.sql` once, after the existing
   migrations. It expands valid book IDs and the maximum new-order size to nine.
   It does not rewrite historical orders, payments or download entitlements.
2. In Storage, open the existing **private** `handbooks` bucket and its
   `handbooks` folder. Upload the four supplied, unchanged PDFs using these names:

   | Supplied PDF | Object path inside the bucket |
   | --- | --- |
   | From Someday To Sold.pdf | `handbooks/from-someday-to-sold.pdf` |
   | Stop Scrolling Start Selling.pdf | `handbooks/stop-scrolling-start-selling.pdf` |
   | Sold Out Still Broke.pdf | `handbooks/sold-out-still-broke.pdf` |
   | Nobody Told Me This.pdf | `handbooks/nobody-told-me-this.pdf` |

   Do not replace the five existing restaurant PDFs or make the bucket public.
   Renamed copies of the four new PDFs are also prepared in the ignored local
   `private-pdfs/` directory. They are intentionally absent from Git and public assets.
3. Alternatively, with the existing server credentials securely configured in
   `.env.local`, use the existing uploader:

   ```powershell
   npm run storage:upload -- private-pdfs from-someday-to-sold stop-scrolling-start-selling sold-out-still-broke nobody-told-me-this
   npm run check:integrations
   ```

   The uploader checks existing contents and never overwrites an existing PDF
   with different bytes. No new environment-variable names are introduced.
4. Push the commit using the existing production Git workflow. Confirm Netlify
   reports the commit as published before checking the public website.
5. Verify `/books`, all nine product pages, both `/series/` pages and the preserved
   `/restaurant-business-collection` URL. Confirm one book ₹199, each bundle ₹499,
   both bundles ₹998, and the four new files in private storage. Use supported
   test credentials for a provider integration test; do not make a real payment.

## Pricing and delivery

For an ad that should open the bag with the five restaurant books already added,
use `https://pixelnpalm.com/restaurant-business-collection?bag=1` as its destination.
The canonical series links also support `?bag=1`; the online-series link adds its
four books instead. Existing bag contents are retained and deduplicated. The
one-time `bag` parameter is consumed after opening, while UTM, `fbclid` and other
attribution parameters are preserved. Normal collection visits are unchanged.

Partial series cost ₹199 per selected book. A complete restaurant series costs
₹499 for five books; a complete online series costs ₹499 for four books. Each
series is calculated independently, including in mixed orders. Adding a bundle
deduplicates titles already selected. First50 remains accepted for a complete
restaurant series as a legacy input and never grants an additional discount.

The bag shows no progress meter or recommendations until a book is selected.
It then shows one meter and two compact recommendations from that book's series,
with an option to see its other remaining titles. In a deliberately mixed bag,
the most recently added series guides recommendations. Completing that series
stops suggestions; it does not promote the other bundle automatically.

Paid historical orders retain their stored prices and entitlements. Unpaid old
checkouts still reconcile payment evidence before being replaced at current prices.
The existing signed-download, thank-you page and email-attachment delivery remain
in use. There was no ZIP delivery mechanism to extend.

## Verification limits

Local payment tests use mocked Razorpay and repository/provider fixtures. They do
not confirm live provider credentials or email sending. On 2026-10-26 the existing
TKC production dashboard was used to apply the multi-series SQL update and verify
the four new PDFs after the user uploaded them. Their filenames were corrected to
the paths above. Read-only checks confirmed all four PDF sizes/type, nine stored
files, private bucket access, the expanded book IDs and nine-item order capacity.
Netlify email-provider configuration and live delivery remain separate checks;
no real payment was made during this follow-up.

The installed Next.js build emitted a security upgrade recommendation. Review that
framework update separately from this catalog release; it is not included here.

See [the feature verification record](multi-series-verification.md) for local
coverage and the distinction between fixture checks and production verification.
