# Connectivity, reload and payment reconciliation audit

11 October 2026. Base inspected before changes: `855711618c66c9b99c09b080e07da80614951dcb`, [prior audit](PAYMENT_RECOVERY_AUDIT.md), [prior plan](superpowers/plans/2026-10-11-payment-recovery.md), actual browser/server implementation, SQL and tests. Implementation is on `codex/connectivity-payment-recovery`. No production write, real payment/email, push or deployment. All customer examples in tests are synthetic; this report contains no customer PII.

## 1. Existing state machine discovered

The existing state machine was retained. Lifecycle labels below describe stages, not new database enums:

```text
CART → CUSTOMER_DETAILS → INTERNAL_ORDER_CREATED → GATEWAY_ORDER_CREATED
  → PAYMENT_ATTEMPT_STARTED → PAYMENT_STATUS_UNCERTAIN / VERIFYING
  → PAID → ENTITLED → DELIVERY_PENDING → DELIVERED

Provider-confirmed failure → FAILED → fresh retry decision → same gateway
Refund evidence → REFUNDED → entitlement/session revocation
Old quote → STALE_PRICE → reconcile before explicit current-price replacement
Missing/expired browser capability → UNAUTHORIZED_BROWSER → email/verified support
```

`orders.status` remains `created`, `payment_pending`, `paid`, `failed`, `refunded`. `payment_retry_allowed` is a fresh server decision, absent means unknown. Provider payment state (`created`, `authorized`, `captured`, `failed`, refund evidence) is independently validated. Captured/paid cannot regress to pending/failed; refund cannot regress to paid. Unique active entitlements are created by the locked payment RPC. Browser sessions are created only by secure callback verification; webhook/reconcile/fallback create none.

Email retains `pending → sending → sent` or `sending → failed`; a safely retryable failed delivery reuses its address/version/key. SENT is terminal. An unknown provider outcome remains fenced; address changes and retries cannot escape that fence. Download authorization is repeatable and revocable.

## 2. Durable state ownership map

The full transition table was recorded **before implementation** in [the connectivity plan](superpowers/plans/2026-10-11-connectivity-recovery.md#stateownership-model-recorded-before-implementation). It identifies authority, durable fields, browser representation, reload/reconnect action, offline behavior and Pay/download/email permission for every stage and recovery state.

| Owner | Representation and permitted responsibility |
| --- | --- |
| Razorpay | Authoritative fetched order/payment/refund evidence, validated against internal binding, receipt, amount, currency and mode. |
| Postgres | Orders, unique checkout token hash/request hash, gateway binding/start/lease, payments, paid timestamp, entitlements, sessions, delivery claims/version/provider ID and rate-limit buckets. |
| HttpOnly purchase cookie | Existing secure browser capability after verified payment; never exposed to JS storage or reconstructed from an ID. |
| Checkout cookie | Existing limited, seven-day checkout/reconciliation capability; no download authority. Expiry is preserved. |
| React/module memory | Typed contact fields/coupon; callback proof; query state; failed-storage checkout identity. Lost on process termination. |
| Browser storage | Existing sanitized cart IDs, purchase references and checkout fingerprint/token/order reference. Added only book IDs for matching review restoration and `{order_id, started_at}` for a possible payment attempt. No contact details, payment-success proof, session tokens, signatures, secrets or PDF URLs. |

The existing checkout token can continue its matching checkout; it cannot authorize entitlements or downloads. The new attempt marker only selects a recovery screen. It expires after 30 days and is validated before use. A forged marker leads to a cookie-authorized request or generic unavailable state, never access.

## 3. Connectivity gaps found

1. No consistent connectivity notice or immediate offline guard on server-dependent controls. Default mutation pausing could defer work until reconnection instead of providing a clear failure state.
2. Blocked storage discarded the stable checkout identity between same-document retries, risking another internal order after a lost response. Readable old values combined with failed writes were a second form of this bug.
3. Before callback, no explicit non-authorizing marker identified an interrupted Razorpay attempt after browser restart. A known review was not automatically restored through secure resume.
4. Reconnect/focus/history signals did not explicitly trigger bounded fresh recovery after the initial reconciliation window.
5. Thank-you durable GET polling could continue indefinitely. Hidden-tab reconciliation intervals could amplify provider reads.
6. Cached retry permission remained visible immediately after returning online, before the new reconciliation completed.
7. A lost email response showed a request error without a direct durable-status check. Downloads lacked explicit connection-loss retry guidance.
8. Automatic restore initially overwrote customer edits on reconnect/focus, and stale-price restore initially bypassed the normal explicit refresh path. Review reproduced both; fixed before completion.
9. An expired saved checkout could repeatedly redirect to the unavailable purchase. It now has an explicit support/recovery panel and suppresses automatic restore while that panel is shown. Expiry grants no permission to pay again.
10. A new delivery-status action initially allowed ten same-turn requests because it relied on mutation render state. Review reproduced it; a synchronous reconciliation ref and burst regression now protect all callers.
11. Some mutation cache writes depended on an active query observer to prevent backward responses. They now explicitly use the existing monotonic merge function, including refund preservation.

No missing durable payment/entitlement/email idempotency mechanism was discovered. No server state machine, schema or pricing change was necessary.

## 4. Exact fixes

- Added shared connectivity signals and one reusable notice. Local cart Add/Remove remain immediate and work offline. Typed contact/coupon data stays in the current React form; no persistent contact draft was added.
- API calls fail immediately with `CLIENT_OFFLINE` when the browser reports offline. Explicit mutations use `networkMode: always` and synchronous offline checks, so they fail visibly instead of silently queuing new payment/email work. Online signals remain UX hints, never payment evidence.
- Validated minimal stored metadata; retained checkout identity and attempt uncertainty in module memory if writes fail. Unsaved memory wins over the exact stale durable snapshot; a later changed value from another tab is honored. Failed removal leaves a memory tombstone rather than resurrecting a stale attempt in that document.
- Restored a matching known review via secure `/orders/resume`, including server-returned contact/quote state. No customer fields are read from storage. Explicit edits own the form and prevent automatic restore; controls are locked during accepted submission/restore to avoid response-versus-edit races.
- Wrote the possible-attempt marker immediately before each provider `open()`. Reopening checkout checks that existing purchase. Synchronous `open()` errors reconcile before restoring Pay; only fresh retry permission permits it. Dismissal retains the prior independent reconciliation.
- Coalesced online/focus/pageshow/visibility/recovery-storage signals over 750 ms, with a five-second automatic cooldown and synchronous in-flight reconciliation deduplication. No reconnect handler opens Razorpay, creates an order or sends email.
- Kept the existing eight-check/15-second reconciliation bound; skipped hidden/offline interval requests. Capped automatic durable-state polling at two minutes per mounted order. A later reconnect/focus or explicit Check again still reads fresh state.
- Invalidated displayed retry permission while offline and when opening a retry. Resume reappears only after a fresh `payment_retry_allowed` response; every Pay action still performs fresh server preflight.
- Added Check delivery status for sending/ambiguous email outcomes; reconnect reads durable delivery status. No automatic resend. Added fresh-link retry guidance for interrupted downloads and offline-disabled fulfillment controls with 44px targets.
- Preserved proof deduplication, the 30-second verification deadline, callback URL replacement, pre-session response guard and secure paid/no-session recovery. Explicit cache merges also retain terminal refund/SENT state without inventing authorization.

## 5. Before/after lifecycle diagram

```text
BEFORE (durable safety already existed)
Review → Razorpay → callback → bounded verification → session + downloads
             └→ browser disappears → webhook → PAID + entitlements → fallback
Browser reload before callback: remembered checkout existed, recovery intent unclear
Offline return after checks stopped: mostly explicit refresh/manual retry

AFTER (same durable paths, connected browser recovery)
Safe cart + in-memory form → stable checkout identity → secure review restore
  → fresh resume → mark possible attempt → Razorpay
       ├→ callback → SAME bounded verification → session + downloads
       ├→ loss/reload/reopen → non-authorizing reference + existing cookie
       │    → coalesced authoritative reconciliation
       │         ├ captured → PAID / authorized purchase or safe no-session
       │         ├ refunded → revoked
       │         ├ definitely failed → fresh retry permission
       │         └ unknown/unavailable → check/support; no Pay permission
       └→ signed webhook → SAME locked PAID + entitlements → SAME email fallback
```

## 6. Offline/reconnect behavior

Before payment, the exact notice is: **“You're offline. Your checkout details stay in this tab. Your bag is saved when browser storage is available.”** This deliberately does not promise contact persistence across restart. Server submission/opening is disabled; local cart interactions remain available.

When payment may have started: **“You're offline. We'll check your payment when your connection returns. Please don't make another payment yet.”** Network loss, timeout, dismissal and HTTP errors do not establish failure.

For a previously server-confirmed paid order: **“You're offline. Reconnect to check delivery or retry a download. Your confirmed payment is preserved.”** Offline downloads/send controls are disabled; there is no local entitlement authorization.

Reconnect checks the same checkout after coalescing; it never starts another payment or sends books. Unknown provider evidence remains pending. Same-document callback proof remains available for the prior Check again verification path. Existing support copy is reused, with static `theknowledgeconcierge@gmail.com`; no customer data is interpolated into contact links.

## 7. Refresh/browser-restart behavior

| Stage at interruption | Safe resulting behavior / automated evidence |
| --- | --- |
| 1. Cart | Sanitize/hydrate known product IDs; rapid add/remove and cross-tab tests unchanged. |
| 2. Customer details | Current tab retains fields offline. Refresh intentionally loses unsubmitted contact fields; cart survives. New browser regression asserts empty name/email/mobile. |
| 3. Internal order creation | Persist token before request; repeat matching submission finds the committed order. Real-Postgres commit-response-loss and browser reload/token tests. |
| 4. Gateway creation | Unique internal checkout, stable provider receipt, creation lease and bind recovery. Existing real-DB lost provider response/bind and rejected-before-acceptance lease tests. |
| 5. Review | Matching book IDs select secure resume; server restores review and contact data. One creation across reload. |
| 6. Razorpay opening | Existing opening/reload fixture plus fresh preflight; no payment from refresh. Marker written before actual provider open. |
| 7. Razorpay visible | Marker selects existing purchase on reopen. Offline/close/reopen regression grants no session or new Pay while uncertain. |
| 8–9. Authorized/captured before callback | Fresh provider reconciliation or signed webhook establishes truth. Authorized remains pending; delayed capture becomes paid without callback. |
| 10. Callback verification | Existing callback route replacement, bounded deadline, safe leave/refresh/Back/Forward tests. Proof is not restored from storage. |
| 11. Payment DB commit before HTTP response | Committed PAID/entitlements survive; repeated verification/webhooks converge. Existing real-Postgres lost-commit tests. |
| 12. Session commit before Set-Cookie receipt | PAID and entitlements survive, but an unreceived cookie grants no browser access. Existing lost-session-commit test and safe no-session browser recovery. |
| 13. Paid/no-session | Server-confirmed payment, original-checkout email and support; no downloads or new Pay. |
| 14. Thank-you | Existing valid session restores normal access; copied URL alone remains generic/unavailable. |
| 15. Download | Repeat authorization and issue a fresh short-lived link. No financial mutation or URL persistence. |
| 16–17. Send / provider accepted but response lost | Read durable delivery state; SENT displayed without resend. Unknown provider outcome retains original fenced key/version. DB and browser tests. |
| 18. Email SENT | Refresh/revisit/history/reconnect never invokes send. Existing/new multi-tab tests. |
| 19. Refund | Locked refund remains terminal; stale responses/capture cannot restore access. Future download/send authorization fails. |

Page close/reopen and navigation are automated in Chrome. Actual OS process termination, real persistent-profile recovery and physical radio switching remain manual certification items; they are not claimed as executed here. With all browser metadata cleared/unavailable **and** the initial order response lost before receiving a cookie/reference, the browser cannot reconstruct that identity after process death. Same-document memory and ordinary persisted-token reload are covered; no privacy/authentication bypass is used for the irreducible case. A later captured payment remains recoverable through webhook/email/support.

## 8. Response-loss behavior

The browser cannot distinguish rejection before acceptance from committed work whose response was lost. It does not guess:

| Operation | Convergence mechanism |
| --- | --- |
| Create internal order | Stable checkout token + request hash + DB uniqueness. Before-acceptance rejection can retry same identity; committed-lost response discovers existing row. |
| Create/bind gateway | Stable receipt lookup, exact provider/internal binding, one creation lease; recover accepted order before new creation. A rejection before acceptance can recover after lease expiry. |
| Resume/reconcile | Existing cookie/session authorization, fresh provider reads, locked/monotonic application state; no new gateway payment from reconciliation. |
| Verify | Exact callback signature/proof, checkout capability, authoritative provider evidence, locked paid/entitlement transition. Same-proof deduplication is UX; DB correctness is independent. |
| Issue session | Session may exist durably without a received cookie. No reconstruction from order/payment ID, URL or storage. Existing valid cookie can be reused; otherwise email/support. |
| Email | Durable claim, address/version lock, stable Resend key and unknown-outcome fence. Lost browser response triggers status checking, not automatic resend. |
| Download link | Intentionally repeatable authorization. A lost response simply requires a new authorized request; prior URL is never stored. |

## 9. Multi-tab behavior

Existing Web Locks serialize same-origin checkout identity reads/writes where supported; server uniqueness/leases remain the correctness boundary when unavailable. Two- and five-tab fixtures cover offline recovery against captured, refunded and provider-unknown state. A stale review calls fresh resume and cannot open the fixture gateway when that check fails or reports payment complete. Another tab cannot grant download authority by writing browser storage.

The previous pre-session response-order fix remains: verified query writes cancel old reads, and an old no-session reconciliation cannot overwrite newly verified access. New explicit merges prevent pending/failed responses from replacing PAID and prevent any paid response from replacing REFUNDED. Later genuine revocation remains allowed. Five-tab Confirm/send races and real-Postgres locked fulfillment/email tests remain green.

## 10. Double-payment analysis

No Pay permission comes from storage, a remembered marker, network status, expired credentials, HTTP failure, timeout or modal dismissal. A created gateway without any provider payment attempts can continue only after fresh server reconciliation. `authorized`, `created` payment attempts, contradictory/unknown evidence and unavailable provider remain processing. Captured/refunded state blocks repeat creation/resume. Definite failure permits the existing same-gateway retry rules.

Displayed retry permission is discarded offline and refreshed after reconnect. A historical Pay button still cannot bypass pre-open resume. The explicit expired-checkout panel says: **“Expiry does not mean a payment failed. Please check your saved purchase and checkout email before making another payment.”** Actions are **Check saved purchase** and **Return to store**. No new token or Pay permission is inferred from expiry.

The application does not create charges on reload/reconnect. Razorpay SDK's existing in-window retry remains provider-controlled; its failed event is not treated as proof that every attempt failed.

## 11. Browser authorization analysis

- No new authorization mechanism, schema, account, OTP, magic link, service worker, IndexedDB or offline PDF cache.
- Purchase cookie randomness/hash/HttpOnly/Secure/SameSite/expiry/payment binding unchanged. Checkout capability expiry unchanged.
- Callback proof exists only in module memory. No “PAID” marker, entitlement proof, signed URL, contact draft or purchase-session token is persisted.
- Secure resume restores contact information only after the existing cookie check. An order ID, copied URL, query payment ID, synthetic screenshot/reference or forged local metadata grants zero access.
- No weakening of signature/HMAC/provider checks, private PDF storage, entitlement ownership, refund revocation, delivery-email locking or cron-secret protection.
- Support screenshots/references remain investigative evidence. Human support must verify authoritative captured amount/currency/mode, matching order, refund state and delivery history before manual delivery. No screenshot-based automatic fulfillment.

## 12. Webhook-delay/loss analysis

Razorpay documents at-least-once webhook delivery and exponential retries for 24 hours after event creation. Non-2xx responses and acknowledgments taking over five seconds cause retry; event ordering is not guaranteed. Persistent failure disables the webhook and triggers operator notification. [Razorpay webhook best practices](https://razorpay.com/docs/webhooks/best-practices/).

Its FAQ describes individual event replay through support, subject to eligibility and a 15-day window, and Dashboard webhook delivery inspection. Secret rotation requires attention to the secret applicable to older events. [Razorpay webhook FAQ](https://razorpay.com/docs/webhooks/faqs/).

Existing handlers retain raw-body HMAC and authoritative provider reads for `payment.captured`, `order.paid`, `payment.failed` and `refund.processed`. Real-Postgres fixtures cover browser absence, delayed events, first-handler/DB failure followed by redelivery, both capture event types concurrently, duplicates, stale failure after capture and stale capture after refund. Webhooks never issue purchase sessions. A failing first delivery must return non-2xx so provider redelivery remains possible.

## 13. Is a bounded reconciliation worker needed?

**Decision: not justified for this pass at the current pre-live scale. No worker added.**

Risk: a capture can remain undiscovered if browser verification/reconciliation is unavailable **and** every webhook attempt fails or the webhook is misconfigured/disabled. The email scheduler starts from durable PAID and cannot discover that capture. Neither local storage nor email scheduling closes this gap.

Probability: no production outage/loss telemetry was collected here, so no numerical probability is claimed. Independent browser/provider paths and 24-hour redelivery cover ordinary transient outages. Misconfiguration or a prolonged outage is a correlated risk that requires operating procedures, not optimistic independence assumptions.

Cost/operational assessment: a worker adds provider lookups, cron invocations, failure/retry budget and monitoring, may amplify an ongoing provider outage, and still misses captures outside its bounded window. No measured unmatched-capture backlog or support load demonstrates the need now. Existing checkout reconciliation and webhook redelivery are sufficient for temporary connectivity loss **conditional on healthy live webhook configuration and monitored delivery**, not an unconditional guarantee under total prolonged failure.

Reassess after any unmatched capture, disabled webhook incident, prolonged outage or backlog beyond manual support capacity. Smallest future design: reuse the existing secret-authenticated schedule to inspect only recent gateway-bound `payment_pending` orders, a small fixed batch and age window, strict per-run read/time budget and backoff. Fetch authoritative provider evidence, use existing locked transitions, create no browser sessions, and make no email eligible until durable PAID. Never indefinite scans or unbounded retries. This is a documented option, not implemented infrastructure.

## 14. Email/download recovery

The fallback remains five-minute grace, five-minute schedule, PAID-only, original checkout email, batch/age/attempt bounded, protected by `EMAIL_DELIVERY_CRON_SECRET` and fresh provider/entitlement/refund checks. Browser session is unnecessary for the internal path. Both capture events converge to one payment and entitlement set; fallback/manual send share the same delivery claim and stable key. No change to Resend fencing or provider acceptance-versus-inbox semantics.

New browser tests lose the email request response after synthetic durable SENT, disconnect/reconnect, observe SENT and reload without another send. Existing real-Postgres tests cover accepted-but-timeout, commit-response loss, lease recovery, two schedules/manual races and unsafe old-key retry refusal. A failed/sending request exposes **Check delivery status**; ten simultaneous taps start one read/reconciliation. A genuine retry remains server fenced/idempotent.

Downloads remain intentionally repeatable. Offline blocks a new request; connection loss shows the existing paid support state. Exact guidance: **“If a transfer is interrupted, reconnect and tap Download again for a fresh link.”** Retry authorizes again and generates another short-lived URL. The tests assert two authorization requests, one eventual synthetic download and no URL in storage. Refund tests block later authorization. Actual mobile OS download-manager interruption/resume is a manual check.

## 15. Mobile results

Chrome production-build desktop/mobile touch projects cover 320, 360, 375, 390, 412 and 430px. New width cases cover offline form, review, paid/no-session, known-paid offline notice, download failure, failed email, disabled recovery controls and document overflow. Existing width cases cover verification/leave/return, authorized downloads, delivery forms, navigation and cart. Reduced 360px height checks retain scrollable content and reachable actions. New recovery/send/download buttons have at least 44px height; local bag controls retain their existing touch sizing.

Automated geometry asserts no horizontal overflow. 320px screenshots were inspected locally. Emulation does not certify real keyboard/browser-bar/radio/OS behavior; physical-device checks remain below.

## 16. Chaos/concurrency test matrix and results

Providers and storage are fixtures; DB tests run the actual migrations/RPCs on isolated PostgreSQL. No live charges or emails. The original payment-recovery suites remain included rather than replaced.

| Requested case | Automated evidence |
| --- | --- |
| Offline before order / before Razorpay | New offline width tests + API guard unit test; zero offline fetch; buttons disabled. |
| Order commit + response lost | New real-DB fault after create RPC commits: one order, one recovered gateway. Browser retry/reload retains token. |
| Gateway commit + response lost | Existing lost-provider-response, bind failure and receipt/lease DB regressions. |
| Offline while gateway open | New marker + close/reopen + delayed capture fixture; zero browser verify and no premature Pay. |
| Capture + connectivity/callback loss | New browser reopen fixture + prior never-called/delayed-webhook DB cases. |
| Verify cancellation / committed response loss | Prior real-DB cancellation, payment commit loss and session commit response loss tests. |
| Lost Set-Cookie | Session DB commit preserved; no browser authorization, no second payment, fallback eligible. |
| Reload major checkout stages | Original/new form, create, review, opening, callback, verify, paid/no-session, thank-you, delivery and refund tests; section 7 maps every stage. |
| Browser reopen | Page close/new page in same context; metadata survives and no proof/session invented. OS kill remains manual. |
| Offline → online / flapping | New fake-clock test: 20 bursts of offline/online/focus/pageshow coalesce to one reconciliation; no payment/email mutations. |
| Back/Forward | Prior checkout/thank-you/verification/delivery history cases + fresh pre-open server check. |
| 2 tabs / 5 tabs / stale Pay | New outcome matrix for paid/refunded/unknown; old five-tab order/send cases and real-DB concurrency retained. |
| Provider temporarily unavailable | New real-DB provider-read failure, followed by mixed duplicate capture/order-paid/stale-failure redelivery. New browser unknown preflight hides payment. |
| Authorized, not captured | Existing real-DB authorized/created/unknown matrix denies create/resume/session/email. |
| Definite failure | Existing same-gateway real-DB retry + browser fresh failure/Resume regression. |
| Refund with stale tab | New stale-review refund preflight; existing DB download/email/session revocation and stale capture tests. |
| Download loss | New lost authorization response + successful fresh-link retry; existing DB storage failure/refund checks. |
| Email response loss / manual-fallback race | New reconnect-to-SENT browser test; existing real-DB provider/DB response loss, races and fence tests. |
| Copied URL / forged proof / screenshot | Existing real routes + new corrupted metadata/cleared cookie browser regression. No customer data or access. |
| Stale/corrupt storage | New strict-parser tests, old stale-price DB/browser tests, forged/expired marker cases. |
| Storage throws / partially fails | New same-document token regression, readable-old-storage failed-write/removal unit test; original cart rollback tests. |
| Storage cleared | New clean-cookie unauthorized regression. Complete identity loss after process death remains explicitly limited in section 7. |
| Duplicate/out-of-order webhooks | Existing SQL/route concurrency plus new five-event mixed redelivery case; one payment/five entitlements/zero sessions. |
| Customer edit during reconnect | New explicit-edit ownership regression; no old address overwrite. |
| Ten delivery status taps | New gated browser regression: one reconciliation. |
| Expired saved checkout | New unavailable panel regression; no redirect storm, key rotation, Pay or authorization. |

Final results with Node 24.21.0, local PostgreSQL 16 and installed Chrome:

| Requested command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, no warnings |
| `npm test` | PASS, 219 unit/API tests across 13 files |
| `npm run test:db` | PASS, 117 real-Postgres tests across two files |
| `npm run build` | PASS; private asset checks also pass |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | PASS, 162 tests; 14 expected desktop skips of mobile-only tests, zero failures |
| `git diff --check` | PASS |

New unit regressions were first run red before implementation. Review reproduced and helped fix partial storage failure, overwritten edits, stale/expired restore and status-request bursts. Earlier browser failures exposed the stale-price path and duplicate notice; both were repaired and the full suite rerun. One run was invalidated by an overlapping local rebuild; it was stopped and excluded. The final build and full browser run were sequential, exited zero, and took approximately 1.8 minutes for the browser suite. Independent connected-code review reported no remaining concrete blocker.

## 17. Remaining risks

- Complete loss of every client identity before receiving the initial response cannot be reconstructed safely. No contact persistence or order-ID authorization is introduced to disguise this limit.
- Both browser and all webhook paths failing for a prolonged period still need operational reconciliation; no global captured-payment discovery was added. Existing email age/batch/attempt bounds and unknown-outcome fences can also require support.
- Expired/missing checkout and purchase capabilities cannot be replaced with browser access from an ID, screenshot or local marker. Original-checkout email and verified support are intentional recovery paths. Expiry alone cannot authorize another payment.
- Browser onLine is advisory; apparent online can still fail DNS/TLS/provider requests. Errors remain uncertain and server preflight is mandatory. Network recovery requires an actual event/focus/manual check; no aggressive infinite polling.
- Browser abort does not guarantee server execution stops. DB/server idempotency and independent webhook fulfillment, not cancellation, protect correctness.
- Resend SENT means API acceptance, not guaranteed inbox delivery. Already emailed PDFs cannot be revoked; future authorization is revoked on refund.
- Mobile emulation, synthetic provider callbacks and local PostgreSQL do not certify live subscriptions, hosting process termination, real provider timing, OS download managers or radio switching.

## 18. Production/manual certification checklist

No items below authorize deployment or real charges in this task.

- [ ] On physical iPhone Safari and Android Chrome, test six relevant viewport sizes/zoom, dynamic browser bars and keyboard with form/recovery actions visible. Verify no trapped modal or horizontal scrolling.
- [ ] Toggle airplane mode and Wi-Fi/mobile data before Review, during request, gateway opening/visible, callback/verification, email sending and PDF transfer. Check pending language and no automatic new payment/send.
- [ ] Terminate the browser process at those stages; reopen the remembered checkout/purchase. Contact fields before submission may be lost. Saved references must grant no access without valid cookies.
- [ ] Use Razorpay test mode to capture with callback suppressed, webhook delayed and first webhook delivery rejected; inspect authoritative state and exactly-once entitlements/delivery. Do not infer success from a screenshot.
- [ ] Confirm live-mode key/secret/webhook HMAC configuration and capture/failure/refund subscriptions through approved operating procedures. Monitor webhook delivery failures, retries, disablement alerts and secret rotation; arrange independent settlement-versus-DB checks after any outage.
- [ ] Verify the deployed cron secret/schedule, original-email fallback after grace, batch/backlog/age limits, provider IDs/history, Spam/Promotions and bounces without exposing customer data in reports.
- [ ] Two/five real tabs: stale Pay after another tab captures/refunds; late old reconciliation after session verification; no duplicate charge/entitlement/logical email.
- [ ] Download interruption after signed URL issue: Back/return/retry requests fresh authorization; no URL persisted; refund blocks the next request.
- [ ] Expired/cleared credentials and copied URL show safe recovery/support, never new authorization. Support independently verifies Razorpay/database/refund/delivery evidence before any manual fulfillment.

## 19. Files changed

| File | Purpose |
| --- | --- |
| `src/lib/checkout-recovery.ts` | Minimal validated metadata, failed-storage memory identity, attempt uncertainty and matching cleanup. |
| `src/lib/connectivity.ts` | Connectivity UX signals; bounded/coalesced reconnect/history/focus/storage events. |
| `src/lib/api.ts` | Immediate explicit offline failure. |
| `src/components/ConnectivityNotice.tsx` | Shared conditional offline vocabulary. |
| `src/components/CheckoutModal.tsx` | Secure review restore, edit ownership, attempt markers, pre-open/error recovery and unavailable panel. |
| `src/components/SmartBag.tsx` | Single visible pre-payment notice; local cart behavior retained. |
| `src/components/PaymentRecovery.tsx` | Offline verification guidance and disabled network retry. |
| `src/views/ThankYou.tsx` | Reconnect checks, bounded polling, fresh retry display, synchronous reconciliation dedup, monotonic mutations, email/download recovery. |
| `tests/checkout-recovery.test.ts` | Storage privacy/validation/partial failure and offline guard regressions. |
| `tests/database/lifecycle.test.ts` | Lost internal commit response and provider outage/mixed webhook recovery against real PostgreSQL. |
| `tests/e2e/fixtures/payment-recovery.ts` | Shared synthetic provider/session gates extracted from the prior suite. |
| `tests/e2e/connectivity-recovery.spec.ts` | New connectivity/storage/reload/multi-tab/mobile/response-loss/expiry regressions. |
| `tests/e2e/payment-recovery.spec.ts` | Same prior cases using the shared fixture. |
| `tests/e2e/chaos.spec.ts` | Existing review reload now expects secure automatic restore. |
| `tests/e2e/storefront.spec.ts` | Stale-price restore plus explicit fresh submission both perform server checks. |
| `docs/superpowers/plans/2026-10-11-connectivity-recovery.md` | Pre-implementation ownership map and bounded-worker assessment. |
| `docs/CONNECTIVITY_PAYMENT_RECOVERY_AUDIT.md` | This certification report. |

## 20. Commit hash

One isolated local commit on `codex/connectivity-payment-recovery`, based on `855711618c66c9b99c09b080e07da80614951dcb`. Its exact resulting hash is included in the final handoff. Resolve the commit containing this report with `git log -1 --format=%H -- docs/CONNECTIVITY_PAYMENT_RECOVERY_AUDIT.md`; the file cannot embed its own resulting Git object hash. No push or deployment.
