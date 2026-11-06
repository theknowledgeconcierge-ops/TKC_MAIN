# Expansion verification

| Feature | Implementation and verification |
| --- | --- |
| Catalog | Nine active books: five restaurant books and four online-selling books. Existing restaurant IDs and URLs retained. |
| Prices | ₹199 per PDF; ₹499 per complete series; ₹998 for both. Unit checks cover all 511 nonempty selections, repeated IDs and legacy First50 inputs. |
| Product pages | All nine pages use the same Product template and established preview, cover, review, price and purchase components. Desktop and mobile gallery checks cover all nine books. |
| New assets | Four supplied covers and twelve genuine snapshots. The launch guide uses PDF pages 5/28/58; the other three use 5/25/53. Private PDF copies match the original manuscripts' SHA-256 checksums. |
| Discovery | Broader publisher homepage, equally styled series cards and bundle offers, library filters, responsive navigation and two series landing pages. |
| Bag | Existing persistence, per-series progress, mixed selections, deduplication, removal and both bundles in one order. Mobile checks cover 320, 360, 375, 390, 412 and 430px. |
| Upsell | Existing popup and checkout controls. One relevant incomplete series is offered; unrelated books stay selected and the difference uses server quotes. Cross-tab completion closes an obsolete offer. |
| Checkout | Existing guest form, Razorpay preflight, verification and recovery. Fixture tests check amounts, retries, duplicate submissions and preserved details. No real payments made. |
| Historical purchases | Service regressions preserve paid historical ₹999 orders and reconcile captured payments before replacing stale unpaid checkouts. |
| Delivery | Existing thank-you page, signed downloads, entitlements and email attachments. Service tests cover online books, mixed orders and all nine files, including repeated verification. Production storage paths and new-PDF sizes/type were verified on 2026-10-26; live email-provider sending remains unverified. |
| Reviews | Existing feedback retained against its original products. New books and the new bundle use the honest empty state. |
| Tracking | Existing Meta integration and event deduplication retained. IDs and quote values come from the expanded catalog. No live purchase event introduced during tests. |
| Search | Unique book and series metadata, publisher attribution, correct structured prices and expanded sitemap. Browser checks validate public pages, links, images, canonicals and private-route indexing. |

The final application source passes TypeScript, lint, 245 unit tests and the
production build. Public-asset checks pass for `public/` and `.next/static/`;
neither contains private PDFs or credential files. Browser checks use Microsoft
Edge with Meta requests blocked and payment providers mocked.

The real PostgreSQL/Supabase integration suite and a live Razorpay test were not
run: this workspace has no database runtime, test database URL or provider
credentials. The production dashboard checks below do not replace those tests.

## Production Supabase follow-up: 2026-10-26

Applied `202610260001_multi_series.sql` through the existing TKC production
project's SQL editor. Read-only follow-up checks confirmed the expanded book-ID
constraint and nine-item order capacity. The user uploaded the new PDFs; their
four storage names were corrected to match the delivery configuration.

| Private object in the `handbooks` bucket | Verified bytes |
| --- | ---: |
| `handbooks/from-someday-to-sold.pdf` | 809740 |
| `handbooks/stop-scrolling-start-selling.pdf` | 796462 |
| `handbooks/sold-out-still-broke.pdf` | 761446 |
| `handbooks/nobody-told-me-this.pdf` | 736756 |

All four objects report `application/pdf` and match the prepared local file
sizes. There are nine stored PDFs in total; the bucket remains private and the
five original files retain their paths. No real payment was made. This follow-up
did not test live email sending, audit Netlify environment settings, or perform
a production customer checkout.

The installed Next.js version reported a security upgrade recommendation during
the build. That dependency update is separate from this catalog expansion.

## Ad-to-basket links

The collection pages support `?bag=1` to merge their complete series into the
saved bag and open it after hydration. The one-time parameter is then removed,
preserving ad-attribution parameters and the hash. Twelve desktop/mobile checks
cover all three collection URLs, returning bags, deduplication, closing, removal,
reload, ordinary visits and attribution. Ten existing multi-series checks also
passed, including simulated checkout. TypeScript, lint, the production build and
generated-public-asset checks passed. This local feature still requires publishing
before its URL can be used in production ads.
