# Storefront migration — 9 October 2026

> Historical migration record. The pricing and catalog descriptions below document earlier releases. Current pricing is ₹199 per book and ₹499 per series bundle; see [the multi-series release](multi-series-release.md) for the October 26 expansion.
## Audit completed before implementation

Read all seven page modules, the shell/router, six storefront components, UI primitives, CSS/fonts, browser store and payment client, all Python models/routes/database helpers, existing pytest and Playwright scaffolding, reports, and deployment/template configuration. No `.codegraph/` exists, so CodeGraph was not used.

The original brief described four books; the owner subsequently confirmed that all five are sold and uploaded to Supabase Storage. All five titles, including “Empty Tables to Full House”, are now active. Original pricing is preserved: 1/2/3/4 = ₹249/399/549/699; five-book standard ₹999, eligible first-time ₹499. The existing schema, storage mapping and server eligibility/payment logic already supported five titles; no database migration or additional storage provider was needed.

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
| `/catalogue`, `/pricing/quote` | Replace | Local canonical metadata; authoritative quote computed inside order creation |
| `/payments/razorpay/order`, `/verify` | Replace | `/api/orders`, `/api/payments/verify` |
| `/payments/razorpay/webhook` | Replace | `/api/webhooks/razorpay`; atomic event/payment/entitlement transaction |
| Public `/status` writes/reads and Hello World | Delete | Read-only health endpoint |
| Mongo orders and webhook collection | Replace | SQL migrations; constraints, row locks, RLS and service-only RPCs |
| Public paid-PDF URLs | Delete | Private bucket, entitlements, 60-second signed downloads |
| Emergent covers | Replace | Same cover artwork, served locally |
| Future email/auth placeholders | Delete | Guest checkout and post-payment HttpOnly purchase session; email required for delivery records, never for authorization |
| Vite/proxy/overlays, Python/Uvicorn/Motor/PyMongo | Delete after parity | One root Next.js production application |
| Old scaffold/docs/test reports | Replace | Current README, security audit, TypeScript/API/SQL/browser tests |

## Repository cleanup — 10 October 2026

The conventional `src/` layout is retained. The recursive inventory classified application, development, test and operational documentation separately from generated artifacts and ignored private staging inputs. Imports, asset URLs and API callers were traced before deletion.

Removed the unreferenced Emergent Git identity, conflicting mock design brief, unused SVG sprite and standalone 16/32px PNG favicons (the SVG/ICO/Apple icons remain). Removed unused catalogue/pricing HTTP routes and their quote-only schema. Views now import the canonical catalogue directly instead of a static hook facade. The browser gateway loader is explicitly named `razorpay-checkout.ts`; privileged operations remain under `lib/server/`.

Removed unused `tw-animate-css` and chart/sidebar CSS tokens. Motion and Tailwind's used spinner animation remain. Unused exports became private; no payment algorithm, price, migration or database contract changed. The fifth title/cover and original five-book pricing rules were retained and activated after the owner's catalogue correction.

The build now rejects unsafe public assets before/after compilation. Ignore files protect local secrets, all PDFs, test/build output, archives and tooling caches. Environment/setup/upload scripts remain necessary and documented; the URL-token recovery script was removed in the access-control fix below. Vite exists only as Vitest's development dependency, with no SPA build or deployment role.

## Deliberate boundaries

No accounts, CMS, email provider, queue, worker, Redis or additional deployment. PostgreSQL transactions fulfill payments synchronously and durably; Razorpay retries webhooks after transient failures. Confirmation can reconcile provider state, but checkout-only credentials never authorize downloads. Entitlements persist; signed file URLs expire after 60 seconds. Purchase sessions expire after 30 days. Cross-device/lost-session recovery requires a separately designed ownership verification flow; no bearer URL provides it.

## Purchase authorization fix — 10 October 2026

The former checkout token was also a future download capability, exposed through saveable purchase links before payment. Removed both URL exchange/export endpoints and the operator link-rotation script. Checkout continuation remains separate (7-day expiry). Only a fully verified captured callback can issue an independent 256-bit purchase session in an HttpOnly/Secure/SameSite cookie. Hash-only sessions and authorization RPCs recheck payment/order/entitlement relationships; webhook/status reconciliation never issues a session. Old links/cookies cannot authorize downloads, including purchases fulfilled later by webhook.

Apply `202610100001_purchase_sessions.sql` with the new application while checkout is paused. Existing commerce data is retained, but older deployments are incompatible with the renamed checkout columns. The email column is nullable at the database level; the application requires name, mobile and email at checkout. Original pricing and the payment-fulfillment transaction are unchanged.

## Collection pricing correction — 10 October 2026

The five-book collection sells at ₹499 for every customer. The earlier first-time/returning-buyer rule, which charged ₹999 when an email (or mobile number) matched a previous paid or refunded order, was removed together with its purchase-history lookup. ₹999 remains only the regular reference collection price; the server still computes the payable amount and the Razorpay order amount (49,900 paise). Checkout again requires a valid email address as the delivery and receipt address; it is not an authorization factor.

## Post-purchase email delivery — 10 October 2026

Added `202610100002_email_delivery.sql` (additive). After verified payment the purchase session can confirm or correct a delivery address; the server emails only that order's entitled PDFs through Resend, idempotently, and locks the address once sent. `orders.customer_email` stays the immutable, nullable checkout email. A Netlify Scheduled Function delivers to the checkout email when the buyer closes the tab before confirming. See [email delivery](EMAIL_DELIVERY.md).

## Deployment provider change — 10 October 2026

Netlify now hosts the same application through its automatically managed OpenNext adapter. Removed the former provider's deployment JSON and CLI ignore file; added minimal `netlify.toml` and ignored local `.netlify/` output. No dependencies, catalogue/UI, SQL or commerce contract changed.

The only application-specific change replaces the old preview environment policy with Netlify build metadata. Deploy Previews/branch deploys use their validated primary HTTPS origin; production keeps the configured canonical `APP_URL`. Only non-secret context/preview origin is embedded, since Netlify does not supply that build metadata at function runtime. Credentials remain server-only. See [deployment compatibility and operations](NETLIFY_DEPLOYMENT.md).
