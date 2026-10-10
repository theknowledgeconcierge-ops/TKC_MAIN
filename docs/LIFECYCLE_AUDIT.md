# Customer purchase and delivery audit

Reviewed 10 October 2026 against the current working tree. No payment behavior, pricing, UI, database contract or dependencies were changed for this audit. Missing cross-layer regression coverage was added; the database runner now serializes files because fault-injection tests install temporary database triggers.

**Verdict: the application-controlled lifecycle is implemented end to end. No missing application-code step or confirmed application-code Critical/High defect was found in the traced paths. This is not a successful real-payment certification or permission to launch with failing credentials.**

The current catalogue has **five active books**, including the four named in the original brief. All five were audited. Pricing remains ₹249 / ₹399 / ₹549 / ₹699 / ₹999 for one through five unique titles, with ₹499 for eligible first-time five-book purchases.

## What the evidence proves

- **CODE-CERTIFIED:** inspected frontend, route handlers, validation, commerce service, both HTTP adapters, authorization, SQL/RLS and Storage mapping. Tests execute all 31 non-empty book selections through real Next route handlers, the commerce service, Supabase SDK, Razorpay HTTP adapter and an actual PostgreSQL database initialized from the production migration. Only external HTTP transport is replaced: the Supabase REST fixture forwards queries/RPCs into PostgreSQL, and Razorpay/Storage responses are controlled fixtures. No production mock or test bypass was added.
- **Connected Supabase verification:** the configured project's six tables are accessible, all five production object paths exist in the private bucket, and anonymous public object requests fail. The actual application `createRepository().signDownload(path, 60)` adapter retrieved each PDF's header using HTTP Range (206, `%PDF-`, attachment response), then streamed all five complete files (HTTP 200, byte counts matching Storage metadata, PDF header and end marker present). A signed URL was rejected with HTTP 400 after its 60-second validity window. No URL, capability, credential, PDF body or customer information was logged or committed. These checks do not create production orders/payments.
- **CREDENTIAL-BLOCKED:** real Razorpay API authentication rejects the configured test key pair (401/authentication failed). `npm run check:integrations` passes the database/Storage portion and exits 1 at Razorpay authentication. The webhook secret is not configured locally. Real order creation, provider capture and signed provider webhook delivery remain untested against Razorpay.
- **PRODUCTION-VERIFICATION:** a deployed transaction must verify the actual hosted Razorpay UI/CSP, payment capture, callback, webhook delivery/retries, clean-browser recovery and complete PDF contents/downloads. Local browser fixtures test our UI wiring; they do not certify Razorpay's hosted payment UI, bank processing or Vercel routing.

## Lifecycle matrix

Paths are relative to the repository root. “Code” means CODE-CERTIFIED; “external gate” is separate from passing application tests.

| Step | Actual code path | Database change | Failure behavior | Verified? |
| --- | --- | --- | --- | --- |
| Land and browse | `src/app/page.tsx` → `src/views/Home.tsx`; `app/books/page.tsx` → `Library`; `app/books/[slug]/page.tsx` → `Product`; shared `BookCard` | None | Unknown slug returns HTTP 404; covers are public marketing assets | Code: desktop/mobile routes and all five products |
| Select titles and bag | `src/lib/store.tsx` → `sanitizeBag`, `addBook/addBooks`, `summaryFor`; `SmartBag.tsx` | None; localStorage stores the bag | Unknown IDs removed, titles deduplicated; unavailable browser storage does not crash UI; displayed estimate cannot authorize price/payment | Code: browser and domain tests |
| Enter required details | `CheckoutModal.tsx` → `orderMutation`; `src/lib/commerce/validation.ts` → `createOrderSchema` | None until valid request | Name/email/mobile/IDs/token are runtime-validated; unknown price/quantity/status/eligibility fields are discarded | Code: real HTTP and domain tests |
| Calculate trusted total | `POST /api/orders` → `CommerceService.create` → `quoteFor` and `repo.hasPreviousPurchase` | None during calculation | Invalid selection/coupon fails; first-time eligibility comes from paid/refunded purchase history, never a client flag | Code: all 31 selections and actual returning-buyer DB lookup |
| Create internal order | `createRepository.createOrder` → `tkc_create_order` | `orders` + purchase-time `order_items` snapshots atomically | Unique hashed checkout capability and request fingerprint reuse the same order; different details conflict; invalid snapshots/subtotal roll back | Code: concurrent API and SQL tests |
| Create Razorpay order | `ensureGateway` → `tkc_claim_gateway` → `createPaymentProvider.createOrder` → `tkc_bind_gateway` | Persistent gateway claim, provider ID, `created → payment_pending` | 12-second HTTP timeout; retry searches stable receipt, validates mapping, and reuses the provider order after lost response/bind failure; claim limits overlapping attempts | Code: actual HTTP adapter + DB; external gate: valid Razorpay credentials |
| Review and open Checkout | `CheckoutModal.tsx` → verified total → `loadRazorpayCheckout` → `window.Razorpay` | None | Review precedes payment; double open guarded; script/open failure can retry; native review dialog closes before hosted iframe; dismissal preserves order | Code: desktop/mobile fixtures; external gate: real hosted UI/CSP |
| Payment callback | Checkout handler → `POST /api/payments/verify` → `CommerceService.verify` | No paid write until independent provider evidence passes | Requires purchase capability and HMAC-SHA256 of **stored provider order ID** + `|` + payment ID; fetches payment/order and checks payment ID, order, amount, INR currency, receipt/internal notes and payment mode. Authorized-only payments grant nothing | Code: cryptography, HTTP, adapter, service and SQL integration; external gate: real capture |
| Webhook | `POST /api/webhooks/razorpay` → bounded raw body → `CommerceService.webhook` | Same fulfillment RPC as callback | Separate raw-body HMAC; fetches current provider records; unknown references/spoofed events grant nothing. Missing secret returns 503. Failure/lag returns non-2xx so provider can retry. A webhook can recover an unbound order through validated internal notes | Code: real handler/service/SQL; external gate: dashboard delivery |
| Commit payment and fulfill | `CommerceService.apply` → `tkc_apply_payment` | `payment_events`, `payments`, paid/refunded `orders` state and one `download_entitlements` row per item commit together | Row lock + event primary key + unique `(order_id, product_id)` prevent duplicate fulfillment. Failed-after-paid cannot downgrade; refunded cannot resurrect. Transaction failure rolls back everything; lost commit response retries safely | Code: concurrent callbacks/webhooks, forced rollback and lost-response tests |
| Confirmation/refresh | `/thank-you?order=UUID` → `ThankYou.tsx` → cookie-authorized `GET /api/orders/[id]`, `POST /orders/reconcile` | Reconciliation may apply trusted captured/refunded evidence through the same atomic RPC | Database state drives processing/paid/failed/refunded UI. Mount checks, bounded automatic reconciliation and manual check recover a lost callback/delayed webhook. Session/localStorage success cannot unlock downloads | Code: DB-backed APIs and desktop/mobile refresh/processing tests |
| Resume or recover | `/orders/resume`; `/orders/recovery-link`; `/orders/access`; `rememberOrder`; `scripts/recover-order.ts` | Resume reconciles existing payment; cookie exchange changes no DB rows; operator recovery rotates hash/expiry | Same provider/internal order reused; completed purchases refuse another checkout. Saved fragment capability exchanges into HttpOnly cookie and is removed from URL. UUID alone, wrong/expired capability deny access | Code: DB-backed API and browser recovery tests |
| Authorize each download | `POST /api/downloads` → `CommerceService.download` → reconciliation + order/entitlement/payment/customer checks | Reconciliation may add an event; no new entitlement duplication | Unpaid/failed/refunded orders, foreign/unpurchased entitlement, missing/wrong/expired token and provider/DB failure return no URL | Code: actual routes + PostgreSQL, all titles/combinations |
| Sign and retrieve PDF | `createRepository.signDownload` → private bucket `handbooks`, snapshotted `storage_path`, TTL 60; `ThankYou.download` navigates to attachment | No payment/order mutation when signing fails | Storage failure leaves paid purchase/entitlements intact and retry can sign again. Private origin enforced; no permanent public PDF URL is issued | Code + connected Supabase complete-transfer/expiry checks; browser downloads each fixture; external gate: deployed content review |

## Book mapping

`Book.id` is submitted in `book_ids`, copied to `order_items.product_id`, then copied by SQL to `download_entitlements.product_id`. The title, unit price, quantity one and `pdfPaths[id]` are snapshotted in the order item. Fulfillment copies that stored path; downloading signs the entitlement path rather than reconstructing an order from current prices.

All objects below are inside bucket **`handbooks`**, with a **`handbooks/` folder inside the bucket**. None belong under `public/`.

| Title | Catalogue ID = checkout ID = item ID = entitlement product ID | Private bucket object path | Evidence |
| --- | --- | --- | --- |
| The First Table | `the-first-table` | `handbooks/the-first-table.pdf` | Individual/combination tests; real signed download HTTP 200, 1,298,425 bytes |
| The Full Table | `the-full-table` | `handbooks/the-full-table.pdf` | Individual/combination tests; real signed download HTTP 200, 1,346,169 bytes |
| Behind the Kitchen Door | `behind-the-kitchen-door` | `handbooks/behind-the-kitchen-door.pdf` | Individual/combination tests; real signed download HTTP 200, 1,253,237 bytes |
| The Math Behind the Menu | `the-math-behind-the-menu` | `handbooks/the-math-behind-the-menu.pdf` | Individual/combination tests; real signed download HTTP 200, 1,497,072 bytes |
| Empty Tables to Full House | `empty-tables-to-full-house` | `handbooks/empty-tables-to-full-house.pdf` | Individual/combination tests; real signed download HTTP 200, 1,055,352 bytes |

Source: `src/lib/catalog/index.ts`, server-only `src/lib/catalog/storage.ts`, `CommerceService.create`, `tkc_apply_payment`, `CommerceService.download`. No broken or missing object mapping was found.

## Failure and recovery evidence

- All 31 non-empty title combinations: trusted totals, one provider order, duplicate submission reuse, no unpaid download, concurrent callback/webhook/repeated-event convergence, every correct entitlement/path and 60-second signing request.
- Actual database purchase history selects ₹999 for a returning five-book customer even when browser payload claims eligibility/₹1.
- Eight simultaneous API creates: one internal order and one gateway order; overlapping requests either succeed with that order or return a retryable conflict.
- Provider accepts creation but response is lost; subsequent bind fails: receipt lookup recovers without creating another provider order.
- Webhook arrives before provider ID binding: validated receipt/internal notes bind and fulfill the correct internal order.
- Browser closes without callback: webhook fulfills without cookies; alternatively an authorized revisit reconciles provider evidence and fulfills. Resume after payment refuses a new payment.
- Database write fails before apply: no paid state/event/payment/entitlement. A response lost after commit leaves one complete paid purchase; callback/webhook retries do not duplicate delivery.
- SQL fault injection raises during entitlement insertion after earlier writes: the whole transaction rolls back, then the same event succeeds on retry.
- Checkout cancelled, payment failed, payment merely authorized, then capture delayed: no access until captured; the same order can recover.
- Invalid signature, wrong amount/currency/order, spoofed webhook, another order's capability/entitlement and expired access: no download/fulfillment.
- Storage unavailable after payment: order stays paid, entitlements remain, UI shows a retryable error, and a later click downloads the correct file.
- Partial refund revokes every entitlement; stale captured evidence cannot revive the refunded order. Previously issued signed URLs may survive for their remaining ≤60-second lifetime; already downloaded PDFs cannot be recalled.

## Commands executed

Node 24 and the existing lockfile/dependency versions were used.

| Command/check | Exact result |
| --- | --- |
| `npm run check:env` | Exit 0 for local test-mode configuration; format/presence validation does not prove provider authentication |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; warnings denied |
| `npm test` | 104 passed, 6 files |
| `npm run test:db` | 57 passed, 2 files; fresh PostgreSQL 16 + actual migration, cluster destroyed afterward |
| `npm run build` | Exit 0; Next.js 16.4.0; all routes compile; public and compiled asset guards pass |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 28 passed; desktop/mobile; real production Next server, external API/gateway/PDF fixtures |
| `npm audit --json` | Exit 0; 0 vulnerabilities at every severity |
| Compiled asset secret comparison | 25 browser assets checked; 0 configured privileged secret matches |
| `npm run check:integrations` | Exit 1 only at Razorpay authentication; six Supabase tables and five private PDFs/public denial checks pass |
| Actual application Storage signing adapter | Five complete HTTP 200 transfers matching metadata byte counts; five 206 PDF Range/attachment responses; public access denied; expired URL HTTP 400 |
| `git diff --check` | Exit 0 |

## Remaining external gates and limits

1. Supply a valid matching Razorpay test key pair, then live credentials after a deployed test transaction. The current pair returns 401. No actual payment or Razorpay order was created during this audit.
2. Configure **automatic capture** in Razorpay (already required by README), and a fresh ≥20-character webhook secret. Subscribe to `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` at `https://YOUR_DOMAIN/api/webhooks/razorpay`. Our code deliberately does not deliver on authorization alone. [Razorpay capture requirements](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
3. Configure the exact canonical `APP_URL`, HTTPS, matching Vercel environment and production credentials. Keep staging/test data and keys isolated from production. Validate the deployed health/integration checks and hosted gateway CSP on desktop/mobile.
4. Complete README's deployed test payment, lost-callback/revisit, webhook replay/retry, clean-browser private-link, complete PDF content and refund smoke tests. Webhook retries are finite; operationally replay failed deliveries if an outage outlasts provider retries. Provider/DB unavailability intentionally prevents new downloads until retry succeeds.
5. Resolve the pre-existing external security gates in `SECURITY_AUDIT.md`: revoke legacy public PDF copies and rotate the historically exposed webhook secret. Their closure was not verified here. Review and apply the announced Next.js upstream security fixes when published before accepting live payments; affected versions are not disclosed yet. [Official 14 October update announcement](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026).
6. Guest purchases have no accounts or email delivery. Cookies last 30 days; saved capabilities expire after one year. Loss of both requires operator ownership verification and link rotation. Sharing a private purchase link deliberately shares access; customers can copy PDFs after downloading. These are documented product boundaries, not authorization by order ID.

**Answer to the launch question:** yes, the landing → selection → checkout → trusted payment verification → atomic fulfillment → confirmation/recovery → private expiring PDF download chain has no missing application-code step in the audited implementation. Supplying credentials/deploying alone does not prove provider capture or delivery: complete the external gates and transaction smoke tests above before accepting real customer payments.
