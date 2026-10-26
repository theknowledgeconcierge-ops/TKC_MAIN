# Customer purchase and delivery audit — 10 October 2026

The current catalogue contains **nine active handbooks across two series**. Every individual book costs ₹199. A complete restaurant series (five books) or online-selling series (four books) costs ₹499; both together cost ₹998. Each series is calculated independently and no coupon or purchase-history eligibility is required. Historical orders keep their recorded amounts. This audit follows the existing frontend, handlers, server service, provider adapters and PostgreSQL functions; the multi-series release extends valid IDs and order capacity without changing the payment or delivery design.

## Authorization boundary

Previously the browser's pre-payment checkout token also authorized downloads once a webhook paid the order. The UI exported that credential in a saveable URL fragment; an exchange endpoint and operator recovery script made possession sufficient. Checking `paid` at download time did not prevent this premature disclosure of a future credential.

Checkout continuation and purchase authorization are now independent:

- Checkout key/hash/cookie: creation idempotency, resume and limited status only; expires after seven days. It cannot download, even after paid fulfillment.
- Purchase session: new server-generated 256-bit random value, issued only after callback HMAC and independently fetched **captured** provider evidence match the exact order/payment/amount/currency. Its hash is stored in `purchase_sessions` after SQL rechecks complete fulfillment. Its raw value appears only in an HttpOnly/SameSite=Strict/Secure cookie on HTTPS (`__Host-`, no Domain); HTTP localhost has a development exception. Sessions expire after 30 days.
- Order UUID, thank-you URL, local purchase history, entitlement ID and legacy fragments never authorize. URL exchange/export endpoints and the recovery script are removed. Webhooks and reconciliation never mint sessions.
- Downloads require session/order/payment/entitlement checks on the server and in one SQL authorization statement. Private Storage signing still expires after 60 seconds.

## Lifecycle matrix

All code evidence below uses production handlers/service/adapters and actual PostgreSQL with external HTTP fixtures. Browser tests use provider/API fixtures; no real payment certification is implied.

| Step | Actual code path | Database change | Failure behavior | Verified scope |
| --- | --- | --- | --- | --- |
| Land/browse/product | `src/app` → Storefront/views → canonical `lib/catalog` | None | Invalid slug gives 404; retained responsive navigation/design | Production browser tests |
| Select one/multiple books | `lib/store.tsx`, SmartBag, CheckoutModal | None | Local storage failure preserves usable in-memory shopping; unknown/duplicate IDs cannot control price | Domain/browser tests |
| Enter details | CheckoutModal → `createOrderSchema` | None until validation passes | Name, mobile and a well-formed email required; submitted totals/status/quantity/eligibility claims ignored | Domain/API/DB/browser tests |
| Authoritative price | `/api/orders` → `CommerceService.create` → `quoteFor` (no customer or purchase-history input) | None during calculation | Unknown books/coupons fail; the five-book price is ₹499 for new and repeat customers alike | All 31 non-empty selections; repeat email/mobile and multi-order real DB history |
| Create internal order | Repository → `tkc_create_order` | `orders`, snapshot `order_items` atomically | Unique checkout hash/fingerprint deduplicates; mismatched retry conflicts; bad snapshot rolls back | Concurrent API/SQL tests |
| Create Razorpay order | `ensureGateway` → `claimGateway`, provider adapter, `tkc_bind_gateway` | Creation claim/provider order binding | Stable receipt recovers lost response/bind; same provider/internal order reused | Adapter and DB-backed API tests |
| Review/open Checkout | CheckoutModal → `razorpay-checkout.ts` | None | Only checkout cookie issued; no purchase session/link/entitlements. Dismissal remains pending/resumable; native dialog releases provider iframe | Browser tests and API cookie assertions |
| Provider success callback | `/payments/verify` → `CommerceService.verify` | None until independent evidence passes | Stored-order HMAC plus fetched payment/order IDs, amount, INR, mode, receipt/internal notes required; authorized/failed/fabricated/different attempt cannot unlock | Cryptography/service/DB-backed API tests; real provider is external gate |
| Atomic fulfillment | `tkc_apply_payment` | Payment + event + order paid + one entitlement per item in one transaction | Row locks/idempotency; forced failure rolls everything back; repeated callbacks/webhooks do not duplicate fulfillment | Real PostgreSQL rollback/concurrency tests |
| Issue purchase session | Verification route → `issuePurchaseSession` → `tkc_create_purchase_session` | Only session hash/order/exact-payment/expiry | SQL refuses unpaid, revoked, mismatched or incomplete fulfillment. Failure after fulfillment returns no cookie; same callback proof retries safely | HTTP cookie and DB fault-injection tests |
| Provider webhook | `/webhooks/razorpay` → raw-body HMAC → fetched provider evidence → same fulfillment RPC | Payment/event/state/entitlements | Spoofed/unknown input rejected; body-derived idempotency; refund evidence lag retries. **No session is issued** | Handler/service/DB-backed API tests; delivery is external gate |
| Callback retry/closed browser | `verifyCheckoutPayment`; `/orders/reconcile`; webhook | Repair durable payment state as appropriate | Up to four callback attempts, proof only in memory. Lost callback/browser closure can fulfill but cannot upgrade checkout credentials; separate recovery needed if no session reached browser | Unit retries + real DB failure/closed-browser tests |
| Confirmation/refresh/revisit | `/thank-you?order=UUID` → GET order + reconcile | Reconciliation may add idempotent event | Valid session shows books; checkout-only status returns zero entitlements; clean browser/legacy link denies. Paid without session says do not pay again | DB isolation + desktop/mobile browser tests |
| Download authorization | `/downloads` → session validation/reconcile → `tkc_authorize_download` | May reconcile current payment; no new session | Session must belong to order, unexpired; current provider evidence must be the exact captured/unrefunded payment (contradictory reads fail closed without erasing paid history); order paid; matching payment captured/unrefunded; matching active entitlement/customer/item/path. Foreign IDs and failure deny URL | Real SQL and DB-backed API tests |
| Sign/download PDF | Repository `signDownload(path, 60)` → ThankYou download navigation | None | Signing failure preserves purchase, allows retry; signing origin restricted. PDF bytes come directly from private Supabase | All selection/title DB mappings and browser fixture downloads; connected private-storage check separately |
| Refund | Webhook/reconcile → `tkc_apply_payment` | Refunded payment/order; revoke all purchase entitlements | Late captured event cannot resurrect; even a partial refund prevents new downloads | Real SQL/API tests; actual provider refund external gate |

## Production title mappings

Order items snapshot the server-only path; fulfillment copies it to entitlements. Signing uses the validated snapshot, never a browser path.

| Catalogue / checkout / order item / entitlement product ID | Bucket | Object path inside bucket |
| --- | --- | --- |
| `the-first-table` | `handbooks` | `handbooks/the-first-table.pdf` |
| `the-full-table` | `handbooks` | `handbooks/the-full-table.pdf` |
| `behind-the-kitchen-door` | `handbooks` | `handbooks/behind-the-kitchen-door.pdf` |
| `the-math-behind-the-menu` | `handbooks` | `handbooks/the-math-behind-the-menu.pdf` |
| `empty-tables-to-full-house` | `handbooks` | `handbooks/empty-tables-to-full-house.pdf` |

## Regression evidence and external gates

See SECURITY_AUDIT.md for current commands/results. Security regressions deny pending/failed/cancelled-popup orders, checkout credentials after webhook payment, fabricated callbacks, uncaptured/different callback attempts on an already-paid order, clean-browser/copied URLs, legacy tokens, foreign orders/entitlements, refunded payments and invalid/expired sessions. SQL tests also deny anonymous/authenticated table/RPC/object access and reject mismatched payment/customer/path/revocation state. Session failures before or after commit safely retry without duplicate fulfillment; browser tests check session absence from document.cookie, storage, HTML and URLs.

**CODE-CERTIFIED** applies to the implemented same-browser verified-payment lifecycle. Deploy the new code **and** apply `202610100001_purchase_sessions.sql` together with checkout paused; the old app expects the previous column names. Existing paid records/entitlements remain, but legacy access credentials are intentionally invalidated.

**EXTERNAL VERIFICATION REQUIRED:** apply the new migration to the target Supabase project, deploy, exercise real Razorpay capture/callback/webhook/refund and download the actual purchased files. Local fixtures cannot certify hosted provider behavior. Keep the historical credential, public-artifact revocation and upstream vendor launch gates in SECURITY_AUDIT.md.

**Recovery:** email is the V1 cross-device delivery and recovery path. After verified payment the purchasing browser downloads immediately and can confirm or correct the delivery email; the server emails only that order's entitled PDFs and locks the address once sent. If the browser closes before confirmation (including callback loss after webhook fulfillment), a scheduled job emails the checkout address after 5–10 minutes. A pre-payment checkout key, thank-you URL or order UUID still grants nothing in another browser. See [email delivery](EMAIL_DELIVERY.md).
