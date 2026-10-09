# Storefront migration — 9 October 2026

## Audit completed before implementation

Read all seven page modules, the shell/router, six storefront components, UI primitives, CSS/fonts, browser store and payment client, all Python models/routes/database helpers, existing pytest and Playwright scaffolding, reports, and deployment/template configuration. No `.codegraph/` exists, so CodeGraph was not used.

The repository actually has five books. The requested four-book scope and the existing five-book First50 offer were raised with the owner. Preserve existing pricing (owner confirmed): 1/2/3/4 = ₹249/399/549/699; five-book standard ₹999, eligible first-time ₹499. The first four titles are active under the requested four-book scope. The fifth title, “Empty Tables to Full House”, remains inactive metadata. The five-book First50 logic is dormant and cannot be selected through the active catalogue. No new commercial terms are invented; the four-title choice is an explicit assumption pending any owner correction.

## Migration map

| Existing | Decision | Next.js equivalent |
| --- | --- | --- |
| App shell, seven routes, React Router | Rewrite routing; keep design | `src/app`, `src/components/Storefront.tsx`, `src/views` |
| Home/library/collection/product/about/FAQ | Retain layout, classes, typography, motion | App Router pages and interactive view components |
| Product fallback for invalid slug | Fix | Server `notFound()` |
| BookCover/Card, BackToTop, local concierge | Retain | Local covers; static FAQ assistant, no AI service |
| Custom bag/checkout overlays | Retain styling, fix keyboard/focus | Accessible dialog boundary |
| localStorage bag | Retain; validate shape and IDs | Browser cart only; failure-safe storage |
| sessionStorage full order/success | Delete | Cookie-authorized order API; server status polling/reconciliation |
| Python and TS duplicate catalogues | Replace | One typed catalogue; private object mapping in server-only module |
| Python tier pricing and First50 lookup | Rewrite | Server pricing and purchase-time snapshots |
| `/catalogue`, `/pricing/quote` | Replace | Local canonical metadata and server quote route |
| `/payments/razorpay/order`, `/verify` | Replace | `/api/orders`, `/api/payments/verify` |
| `/payments/razorpay/webhook` | Replace | `/api/webhooks/razorpay`; atomic event/payment/entitlement transaction |
| Public `/status` writes/reads and Hello World | Delete | Read-only health endpoint |
| Mongo orders and webhook collection | Replace | SQL migrations; constraints, row locks, RLS and service-only RPCs |
| Public paid-PDF URLs | Delete | Private bucket, entitlements, 60-second signed downloads |
| Emergent covers | Replace | Same cover artwork, served locally |
| Future email/auth placeholders | Delete | Guest private cookie and saveable per-order recovery link |
| Vite/proxy/overlays, Python/Uvicorn/Motor/PyMongo | Delete after parity | One root Next.js production application |
| Old scaffold/docs/test reports | Replace | Current README, security audit, TypeScript/API/SQL/browser tests |

## Completed implementation sequence

1. Establish one root Next.js/TypeScript/Tailwind project; keep existing storefront components.
2. Write tests for pricing, runtime validation, signatures, authorization and payment evidence before their implementation.
3. Add SQL orders/items/payments/events/entitlements and atomic creation/fulfillment RPCs; test against temporary PostgreSQL.
4. Implement bounded HTTP APIs, Supabase adapter, Razorpay adapter, idempotent checkout, callback/webhook verification and recovery.
5. Wire checkout/confirmation/downloads to authoritative APIs; preserve styling and native Next.js links.
6. Remove legacy services and dead code once replacement tests work.
7. Run typecheck, lint, unit/API/SQL/browser tests and production build; independently audit payment and download loopholes.
8. Document exact setup, private PDF paths, credentials, smoke tests and credential-blocked checks.

## Deliberate boundaries

No accounts, CMS, email provider, queue, worker, Redis or additional deployment. PostgreSQL transactions fulfill payments synchronously and durably; Razorpay retries webhooks after transient failures. Confirmation can reconcile provider state when callbacks are lost. Recovery links are bearer secrets in URL fragments, exchanged for HttpOnly cookies; UUID/order number alone never authorizes access. Download entitlements persist; signed file URLs expire after 60 seconds. Recovery tokens expire after one year and can be rotated by a server-only operator script after ownership verification.
