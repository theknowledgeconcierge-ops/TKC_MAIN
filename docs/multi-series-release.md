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

Partial series cost ₹199 per selected book. A complete restaurant series costs
₹499 for five books; a complete online series costs ₹499 for four books. Each
series is calculated independently, including in mixed orders. Adding a bundle
deduplicates titles already selected. First50 remains accepted for a complete
restaurant series as a legacy input and never grants an additional discount.

Paid historical orders retain their stored prices and entitlements. Unpaid old
checkouts still reconcile payment evidence before being replaced at current prices.
The existing signed-download, thank-you page and email-attachment delivery remain
in use. There was no ZIP delivery mechanism to extend.

## Verification limits

Local payment tests use mocked Razorpay and repository/provider fixtures. They do
not confirm live provider credentials, production SQL installation or production
PDF presence. Those require the dashboard/storage steps above. Browser automation
was stopped because it could not reliably identify the current Chrome URL; no
production database, storage or deployment changes were made in that session.

The installed Next.js build emitted a security upgrade recommendation. Review that
framework update separately from this catalog release; it is not included here.

See [the feature verification record](multi-series-verification.md) for local
coverage and the distinction between fixture checks and production verification.
