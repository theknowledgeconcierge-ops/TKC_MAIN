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
| Delivery | Existing thank-you page, signed downloads, entitlements and email attachments. Service tests cover online books, mixed orders and all nine files, including repeated verification. Production file availability is pending private uploads. |
| Reviews | Existing feedback retained against its original products. New books and the new bundle use the honest empty state. |
| Tracking | Existing Meta integration and event deduplication retained. IDs and quote values come from the expanded catalog. No live purchase event introduced during tests. |
| Search | Unique book and series metadata, publisher attribution, correct structured prices and expanded sitemap. Browser checks validate public pages, links, images, canonicals and private-route indexing. |

The final application source passes TypeScript, lint, 245 unit tests and the
production build. Public-asset checks pass for `public/` and `.next/static/`;
neither contains private PDFs or credential files. Browser checks use Microsoft
Edge with Meta requests blocked and payment providers mocked.

The real PostgreSQL/Supabase integration suite and a live Razorpay test were not
run: this workspace has no database runtime, test database URL or provider
credentials. The migration is prepared but has not been applied to production.
Netlify has not been deployed. Follow [the release order](multi-series-release.md)
to finish production setup.

The installed Next.js version reported a security upgrade recommendation during
the build. That dependency update is separate from this catalog expansion.
