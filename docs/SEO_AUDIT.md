# Pixel n Palm production SEO audit

Audited and implemented on 10 October 2026. Changes are in the local workspace; this task did not deploy them or change hosting accounts, DNS, payment behavior, prices, or authorization. Existing workspace changes were preserved.

## Problems found

Live HTTP inspection of `https://pixelnpalm.com` and every public route found:

- `robots.txt` and `sitemap.xml` returned **404**.
- Public pages had no canonical links or structured data. Landing pages reused a generic description. Social metadata lacked a page URL and, in the deployed version, an image.
- The layout derived `metadataBase` from the commerce `APP_URL`, with a localhost fallback. Preview/deployment origins could therefore enter SEO output.
- The legacy `stately-praline-26f65f.netlify.app` hostname returned the same public site with **200**, creating an alternate accessible origin.
- The purchase page already had HTML noindex/nofollow, but there was no uniform response-header policy for API and transactional routes.
- FAQ answers and book contents were conditionally absent from initial HTML. The storefront's initial animation hid the entire main area until hydration; product animations also initially hid primary content.
- All covers used raw, lazy-loaded images, including the main product image and homepage hero images. Existing aspect-ratio containers already reserved space.
- Library book headings skipped directly from H1 to H3; FAQ questions and the contents toggle were not headings.

Existing correct behavior was retained: one H1 per public page, meaningful product descriptions/topics and cover alt text, real catalogue author/page/price information, server-rendered routes, private PDF storage, API authorization, nonce CSP, no-store customer responses, and local fonts with `font-display: swap`.

## Files changed for this implementation

| Files | Purpose |
| --- | --- |
| `src/lib/seo.ts` | Fixed production origin, public-page metadata, private-route policy, canonical normalization, factual schema and safe JSON serialization |
| `src/components/JsonLd.tsx` | Server-rendered JSON-LD using the existing CSP nonce |
| `src/app/robots.ts`, `src/app/sitemap.ts` | App Router crawler endpoints |
| `src/app/layout.tsx` | Production metadata base, site branding and inherited icons/social fallbacks |
| `src/app/page.tsx`, `src/app/books/page.tsx`, `src/app/books/[slug]/page.tsx`, `src/app/about/page.tsx`, `src/app/faq/page.tsx`, `src/app/restaurant-business-collection/page.tsx` | Unique public metadata and route-appropriate schema |
| `src/app/thank-you/page.tsx`, `src/app/not-found.tsx` | Private/not-found metadata |
| `next.config.ts`, `src/proxy.ts` | Noindex response headers, legacy alias redirect, trailing-slash policy, cached crawler endpoints |
| `src/lib/catalog/index.ts` | Descriptive SEO titles for the five existing books; commerce values unchanged |
| `src/components/BookCover.tsx`, `src/views/Home.tsx` | Responsive optimized images and appropriate above-the-fold loading |
| `src/components/Storefront.tsx`, `src/views/Product.tsx`, `src/views/Faq.tsx`, `src/views/Library.tsx` | Visible server content, native expandable contents/FAQ sections, heading hierarchy and visible catalogue author attribution |
| `tests/seo.test.ts`, `tests/seo-content.test.ts`, `tests/deployment.test.ts`, `tests/e2e/seo.spec.ts` | SEO, preview, deployment and browser regression checks |
| `docs/SEO_IMPLEMENTATION_PLAN.md`, `docs/SEO_AUDIT.md` | Implementation checklist and this handoff |

The existing favicon, Apple icon and social image files were reused. `netlify.toml` was inspected and retained: the automatic Next.js/OpenNext adapter publishes `.next`. No new application dependencies were added.

## Indexable routes and sitemap

The production sitemap contains these **10** canonical URLs, without query strings:

1. `https://pixelnpalm.com`
2. `https://pixelnpalm.com/books`
3. `https://pixelnpalm.com/restaurant-business-collection`
4. `https://pixelnpalm.com/about`
5. `https://pixelnpalm.com/faq`
6. `https://pixelnpalm.com/books/the-first-table`
7. `https://pixelnpalm.com/books/the-full-table`
8. `https://pixelnpalm.com/books/behind-the-kitchen-door`
9. `https://pixelnpalm.com/books/the-math-behind-the-menu`
10. `https://pixelnpalm.com/books/empty-tables-to-full-house`

Book entries derive from `activeBooks`; each includes its canonical cover-image URL. Deactivating a book and rebuilding removes its detail URL from the sitemap and public route resolution. New public landing routes should be deliberately added to the `publicPages` inventory and tests. No invented last-modified dates, priorities, or update-frequency claims are emitted.

Intentionally excluded: `/thank-you` and all its query variants; all `/api/**` routes (orders, resume/reconcile, payment verification, webhook, downloads, health); checkout/payment/order/success/download/purchase/account/internal path families; nonexistent or inactive books; duplicate hostnames; tracking/query variants; robots, sitemap, and assets as page entries. There are no standalone checkout/payment/download pages in the current route tree: checkout is a modal and purchase capabilities are server APIs. Reserved transactional paths additionally receive noindex headers if requested or implemented later.

## Robots and private surfaces

Production `https://pixelnpalm.com/robots.txt` permits public crawling and references `https://pixelnpalm.com/sitemap.xml`. It disallows `/api/`, the exact `/api` path, and `/internal/`. It does not block CSS, JavaScript, covers or optimized image endpoints.

HTML purchase pages deliberately remain crawlable so crawlers can read **noindex**. Blocking a URL in robots alone can prevent crawlers from seeing its noindex instruction and can leave a URL-only search result. See [Google's robots guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

`next.config.ts` sends `X-Robots-Tag: noindex, nofollow, noarchive` on API and transactional path families, including error and method-not-allowed responses. `/thank-you` also retains HTML `noindex, nofollow`, with no canonical or product JSON-LD. Unknown URLs/books return 404 with noindex and no inherited homepage canonical.

Deploy previews and branch deploys receive global noindex headers/metadata, `Disallow: /`, and an empty sitemap. Their SEO URLs still use the production origin. Commerce preview origin validation, cookie behavior, CSRF checks, download permissions, signed URLs and payment verification are unchanged.

## Metadata and canonicalization

Every public route has a distinct title and description, explicit canonical, index/follow policy, Open Graph title/description/image/URL/type, and Twitter large-image card/title/description/image. Product titles identify the book's actual subject and PDF format; product metadata uses that book's description and cover. Open Graph type is `book` for individual books and `website` for other pages.

The fixed production origin is independent of `APP_URL`, which retains its existing commerce/security responsibilities. `metadataBase` is `https://pixelnpalm.com`. Production sitemap, canonical, social and JSON-LD output cannot inherit localhost or a deployment hostname through environment configuration. The root URL matches Next.js normalization without a final slash; other canonical paths also have no trailing slash. Query parameters canonicalize to the same clean page URL.

The visible storefront brand remains **The Knowledge Concierge**. Search metadata identifies the **Pixel n Palm** website and retains that storefront identity in descriptions/schema. Existing favicon and Apple touch icons are inherited by all pages.

Live redirect checks before deployment confirmed:

- `http://pixelnpalm.com/books` → `https://pixelnpalm.com/books`: **301**.
- `https://www.pixelnpalm.com/books` → `https://pixelnpalm.com/books`: **301**.
- `https://pixelnpalm.com/books/` → `/books`: **308**.

A new host-specific **308** in Next.js redirects the legacy Netlify site alias to the same production path and preserves query parameters. Arbitrary preview hostnames are not redirected, preserving preview checkout behavior. The legacy-host rule was verified against the local production server with a Host header; its behavior through Netlify must be checked after deployment.

## Structured data

- Home: `Organization` for The Knowledge Concierge and `WebSite` for Pixel n Palm, with the existing storefront name as an alternate name.
- Public pages below home: `BreadcrumbList` using real navigation URLs.
- Books/library and collection: `CollectionPage` with an `ItemList` of active books. No unconditional promotion/First50 price is represented as a bundle offer.
- Individual books: combined `Product`/`Book`, title, subtitle, description, cover, catalogue ID, actual author Rakesh Chauhan, actual page count, English/PDF/e-book format, and individual INR `Offer` price from the same catalogue used by the application.

There are no fabricated reviews, ratings, stock/availability claims, ISBNs, credentials, awards, sales numbers, shipping terms, or price-expiration dates. JSON is safely escaped and scripts use the request CSP nonce. Tests parse all rendered JSON-LD and verify catalogue facts and canonical URLs. This is local JSON/semantic verification; Google Rich Results Test and Schema.org's hosted validator were not run against a deployed update. Rich-result eligibility/display remains a search-engine decision. References: [Google product data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet), [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [Schema.org Book](https://schema.org/Book).

## Technical SEO and content

FAQ questions now use H2 headings and native single-open details/summary controls; answers are present in server HTML. Book contents also use native details/summary with an H2, and all chapters are in HTML before interaction. Existing styling and expandable behavior are retained. The library has a visually hidden H2 before its H3 book titles. Product author attribution comes directly from the catalogue.

Primary content remains visible with JavaScript disabled, including the product H1, description, topics and cover. Public navigation remains descriptive and links directly to canonical paths. All public internal links and referenced cover/social/icon images passed HTTP checks in the production browser audit.

Covers use Next Image with `fill` and responsive `sizes` within the existing aspect-ratio frames, preserving crops and layout space while enabling optimized variants. The main product cover and central hero cover are preloaded; other hero covers load eagerly; offscreen covers retain lazy loading. Existing self-hosted swap fonts are retained. No broad JavaScript, animation, caching, payment, or design rewrite was performed.

Robots and sitemap bypass the HTML nonce/no-store proxy and are statically generated/cacheable. HTML remains dynamically server-rendered with the existing request nonce and private/no-store policy. Changing that caching design would require a separate security/performance review. Real-user Core Web Vitals and live Lighthouse scores were not measured in this task.

## Verification results

Validation used **Node 24**, matching `.nvmrc` and the deployment engine requirement.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, warnings denied |
| `npm test` | 145 tests passed across 10 files |
| `npm run test:db` | 71 tests passed against an isolated temporary PostgreSQL cluster; cluster stopped and removed |
| `npm run build` | Passed; Next.js 16.4.0 production build and public/static asset safety checks |
| SEO unit/content/deployment subset | 27 tests passed, included in the 145 unit tests |
| Production crawler output | Actual `.next/server/app/robots.txt.body` and `sitemap.xml.body` inspected; only production URLs and intended entries |
| SEO Playwright tests | 8 passed on desktop and mobile, including JavaScript-disabled rendering of all 10 pages |
| Full Playwright regression run | 38 tests passed on desktop and mobile, including the 8 SEO tests and existing purchase-flow scenarios |

The default Playwright Chromium executable was missing on this machine. Browser validation used the existing supported channel: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. Checkout/payment/download browser scenarios use provider fixtures; no live purchase was made. Browser checks used the local **production build**, not a deployed update.

## Required deployment and search-engine setup

1. Deploy the reviewed changes through the existing Netlify workflow, including the workspace's existing untracked `public/favicon.png` and `public/og-image.png` assets. Keep `pixelnpalm.com` as the primary domain, HTTPS enabled, and production `APP_URL=https://pixelnpalm.com` with no path. Keep runtime credentials private. Recheck the legacy Netlify alias redirect through the platform; existing HTTP/www redirects should remain enabled.
2. Inspect **[https://pixelnpalm.com/robots.txt](https://pixelnpalm.com/robots.txt)** after deployment: expect 200/plain text, public crawling allowed, API restrictions and the production sitemap reference. Inspect **[https://pixelnpalm.com/sitemap.xml](https://pixelnpalm.com/sitemap.xml)**: expect 200/XML and the 10 URLs above.
3. In Google Search Console, add the **Domain property `pixelnpalm.com`** (enter the domain without protocol/path). Verify using the exact DNS record Google supplies, normally a TXT record. Keep it in DNS. An optional URL-prefix property is `https://pixelnpalm.com/`. No verification token was invented or committed. See [Google ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en).
4. Submit **`https://pixelnpalm.com/sitemap.xml`** in Search Console's Sitemaps screen. Use URL Inspection on the homepage, library and representative book pages to confirm rendered content, selected canonical, indexing availability and structured data.
5. Add **`https://pixelnpalm.com/`** to Bing Webmaster Tools. Import the verified Search Console site or complete Bing's offered verification method using its actual record/file/token. Submit the same sitemap URL. See [Bing site verification](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b).
6. After deployment, run Google's Rich Results Test for an individual book and review Search Console/Bing indexing reports. Monitor field Core Web Vitals once traffic provides data. No indexing or ranking guarantee is implied.
