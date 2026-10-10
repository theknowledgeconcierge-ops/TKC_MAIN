# Pixel n Palm SEO implementation

Production origin: `https://pixelnpalm.com`. Preserve existing checkout security, prices, visual styles, and workspace changes.

- [x] Add regression tests for production URLs, metadata, crawler policy, factual structured data, and production HTML.
- [x] Centralize production SEO URLs independently of the commerce `APP_URL`; keep preview deployments out of search.
- [x] Generate App Router robots and sitemap routes. Include only five public landing pages and active book details.
- [x] Give each public route unique metadata, self-canonicals, social previews, and appropriate JSON-LD.
- [x] Add noindex response headers to API and transactional paths; preserve purchase authorization and no-store caching.
- [x] Permanently redirect the legacy Netlify alias; retain working HTTPS, www, and trailing-slash normalization.
- [x] Make FAQ answers and book contents available in server HTML; improve heading structure and responsive cover loading.
- [x] Run typecheck, lint, unit/database tests, production build, SEO checks, and existing browser tests.
- [x] Record verified findings, exact indexed/excluded routes, changed files, limitations, and search-engine setup in `docs/SEO_AUDIT.md`.

Validation must inspect every sitemap page's actual HTML, canonical, description, social metadata, H1, images, internal links, and JSON-LD. Query parameters must canonicalize to clean URLs. Unknown books and routes must remain 404/noindex. Robots must allow crawlers to see HTML noindex directives; API crawling can be disallowed separately. JSON-LD must use catalogue facts and individual prices, without ratings, ISBNs, stock claims, or conditional bundle prices.
