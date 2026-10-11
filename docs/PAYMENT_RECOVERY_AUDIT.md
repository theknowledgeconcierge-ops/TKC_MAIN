# Payment recovery and customer support hardening

Date: 11 October 2026. Scope: local implementation and certification against synthetic payment/email fixtures and real PostgreSQL. No production payment, email, database write, push or deployment was performed. No customer PII is included.

## 1. Existing payment lifecycle before changes

The durable architecture already supported browser-independent fulfillment:

1. Checkout creates a server-priced internal order and a Razorpay order. The five-book collection remains ₹499 / 49,900 paise, INR.
2. Browser verification requires the checkout cookie, exact Razorpay order/payment/signature proof, and fresh provider evidence. The locked payment RPC records capture and creates entitlements. Only the verification route issues the secure purchase-session cookie.
3. The raw-body HMAC-verified webhook independently fetches Razorpay evidence and invokes the same locked payment RPC. It neither issues browser sessions nor sends email directly.
4. The secret-authenticated scheduled fallback claims eligible paid orders after the existing five-minute grace period and sends the entitled PDFs to the original checkout email. Browser cooperation and a purchase session are unnecessary for this internal path.

Webhook coverage audited:

| Event | Authoritative behavior |
| --- | --- |
| `payment.captured` | Fetch payment and order; validate payment mode, references, amount, currency, receipt and internal order binding; apply captured state and entitlements atomically. |
| `order.paid` | Same convergence. If the notification contains only the order reference, fetch its payments to locate captured/refunded evidence. Payload status or amount cannot establish payment. |
| `payment.failed` | Fetch current evidence. A stale failure notification cannot downgrade a captured payment or revoke paid entitlements. A genuinely failed attempt grants nothing. |
| `refund.processed` | Require provider refund evidence; revoke access through the existing transaction. Refund remains terminal even if stale capture evidence arrives later. |

This use of fresh provider evidence is deliberate: Razorpay describes webhook payloads as event-time snapshots and documents both capture events as reflecting capture. See [Razorpay payment webhooks](https://razorpay.com/docs/webhooks/payments/). Order/payment inspection uses the documented [Orders API](https://razorpay.com/docs/api/orders/).

## 2. Exact interrupted-verification gap found

There was no missing browser-independent webhook fulfillment path. The gaps were in recovery, retry eligibility and customer guidance:

- Callback verification could take approximately 226 seconds across four 55-second requests and retry waits. Its X button was disabled, and errors used a toast/redirect without a useful persistent recovery state.
- The callback proof existed only in memory, but the browser stayed on its original route until verification completed. Refresh could return to checkout rather than the saved purchase recovery page.
- Resume reconciled the payment but could return a payable checkout while an attempt was still `authorized`, `created`, or otherwise uncertain. Repeated creation of an existing current-price checkout also needed reconciliation before returning its gateway order.
- A retry that succeeded after a verification timeout could navigate to the same thank-you URL while leaving an earlier paid/no-session result cached. Immediate downloads did not appear until another read.
- An older purchase read or reconciliation started without a purchase session could arrive after successful verification and replace the authorized result with paid/no-session. Two gated browser regressions reproduced this. Verification now cancels older purchase queries before publishing its result; reconciliation ignores a pre-session paid/no-access result only when a verified session has since been published. Genuinely later authorization changes and refunds remain authoritative.
- Existing failure/unauthorized states lacked the requested payment support contact.

Review also caught a regression during implementation: denying all retries when `gateway_started_at` existed stranded a checkout after gateway creation failed before provider acceptance. A failing real-Postgres test reproduced it. The fix preserves receipt lookup and the existing gateway claim lease, allowing the same checkout to recover after lease expiry. Active leases still block duplicate creation.

## 3. Changes implemented

- Fresh reconciliation now produces `payment_retry_allowed`; an absent value means unknown. Create/resume refuse uncertain attempts with `409 PAYMENT_PROCESSING`. The review screen calls resume again immediately before opening Razorpay to catch payments completed in another tab.
- Razorpay dismissal reconciles before exposing another payment opportunity. Uncertain or failed reconciliation returns the customer to safe purchase recovery.
- Browser verification has a 30-second total UX deadline including retries, with an aborted client fetch on expiry. After ten seconds it shows delayed-payment guidance and support. Expiry/error provides Check again and Leave this page.
- Identical in-flight callback proofs share one verification promise. Failed proof is retained only in module memory for same-document retry/navigation; no proof is stored in URLs, localStorage or sessionStorage.
- Immediately after the Razorpay callback, the URL becomes the non-authorizing saved purchase URL. Refresh can recover through existing cookies and server reconciliation. Successful verification updates the purchase query cache before navigation, including after retry or explicit leave.
- X and Escape show the requested leave confirmation. Explicit leave does not cancel webhook reconciliation or trigger a new payment. A late successful verification response does not force navigation after that leave.
- Thank-you resume is shown only after fresh reconciliation explicitly allows payment. Paid/no-session, uncertain and unauthorized states explain email recovery. No order URL is exchanged for authorization.
- Added support to delayed/error verification, leave confirmation, uncertain/unauthorized recovery, paid/no-session or missing fulfillment, delayed/failed email, failed downloads and relevant FAQ entries. Normal confirmed purchase/download/email states stay quiet.
- Added an explicit webhook check that a fetched payment ID matches the requested payment reference.
- No migration, pricing change, new dependency, new authorization mechanism or email/refund state-machine change.

## 4. Browser vs webhook responsibility after change

```text
Razorpay captured payment
  ├─ signed browser callback → provider-verified /payments/verify
  │    └─ locked PAID + entitlements → secure browser session → immediate downloads
  └─ HMAC-verified webhook → authoritative provider reads
       └─ same locked PAID + entitlements → eligible internal email fallback
```

The browser supplies the existing secure session-creation proof. The webhook establishes durable fulfillment independently and creates **zero** purchase sessions. Reconciliation using only a checkout cookie may confirm paid status but returns no entitlements, delivery controls or download authorization. Closing, refreshing, cancelling a request or losing its response cannot undo a committed payment.

## 5. Double-payment protections

| Fresh evidence | Behavior |
| --- | --- |
| Captured/unrefunded | Converge to existing PAID; no Pay or resume checkout. |
| Refunded | Preserve refund/revocation; no payment retry on this order. |
| Authorized, created payment attempt, unknown payment state | Pending/check/support; create and resume return `PAYMENT_PROCESSING`. |
| Provider order says paid, payment evidence not yet available | Pending; no new payment opportunity. |
| Provider unavailable or contradictory evidence | Fail closed; no retry permission from stale cached state. |
| Every observed attempt definitely failed | Reuse the same gateway order after fresh checks; retry remains available. |
| Created gateway with no payment attempts | Same-order continuation is allowed. |
| Gateway creation not bound | Stable receipt recovery and existing creation lease govern recovery; lease expiry permits a rejected creation to recover. |

UI in-flight refs give immediate response and suppress same-turn repeated taps. Correctness remains on the server: checkout key uniqueness, gateway claim lease, provider evidence and the locked payment/entitlement transaction. Stale-price replacement remains protected; a possible captured payment is checked before offering a replacement.

## 6. Email-fallback behavior

The existing fallback was preserved and tested specifically for interrupted verification:

`captured → signed webhook → PAID + five entitlements → no browser session → grace → original checkout email → one logical email`

The grace is five minutes from durable payment confirmation; the published scheduled function runs every five minutes, so normal eligibility-to-run timing is approximately 5–10 minutes after confirmation. Delayed webhooks start this timing later. The internal route still requires `EMAIL_DELIVERY_CRON_SECRET`, constant-time secret comparison, provider confirmation, paid/unrefunded state and complete entitlements. It returns counts only.

Manual confirmation and fallback share durable claims, locking and the stable Resend key. Two concurrent schedules and manual/fallback races produced one provider acceptance, one delivery row and one SENT transition in real-Postgres tests. SENT is terminal; page reload/revisit never sends automatically. Unknown provider outcomes preserve the same key and the existing 23-hour safe retry ceiling. Email acceptance is recorded as SENT; this does not certify inbox delivery or eliminate bounces. Existing batch, age and attempt limits are unchanged; see [email delivery design](EMAIL_DELIVERY.md).

## 7. Support/recovery locations and exact copy

The static support address is **theknowledgeconcierge@gmail.com**. Components never interpolate customer details into support copy or mailto links.

**Leave confirmation, both checkout and resumed verification:**

> Payment verification is still in progress
>
> If you've completed your payment, don't worry. You will not need to pay again. We'll continue checking your payment and, once confirmed, send your books to the email used at checkout.

Actions: **Continue verification**, **Leave this page**. X and Escape enter this state; they do not silently dismiss. Conditional wording does not declare payment successful.

**Prolonged/error verification and uncertain payment recovery:**

> We're still checking your payment.
>
> If your account was charged, please don't make another payment yet. We'll continue processing the payment confirmation.

After the bounded deadline/error: **Check again**, **Leave this page**. During active verification the progress action is **Verifying payment…**.

After fresh reconciliation establishes that an attempt definitely failed:

> Razorpay confirmed that this payment attempt failed. You can safely retry this order below.

This state can offer same-order Resume. Unknown/authorized payments cannot use this copy or action.

**Uncertain/unauthorized recovery, leave confirmation and slow/error verification support:**

> Payment issue?
>
> If you've completed a payment but can't access your books, contact theknowledgeconcierge@gmail.com with your payment screenshot/reference and the email or mobile number used at checkout. We'll verify your payment and help deliver your books.

**Known paid/no-session, delayed email, missing fulfillment or failed download:**

> Paid but can't access your books?
>
> Email theknowledgeconcierge@gmail.com with your payment screenshot/reference and the email or mobile number used at checkout. We'll verify your payment and help deliver your books.

Paid/no-session detail:

> Payment is confirmed, but this browser has no verified purchase session. Books are also delivered to the email used at checkout, usually within about 10 minutes after confirmation. If delivery has not arrived, contact us below. Do not pay again.

Unauthorized detail:

> Once payment is confirmed, books are also delivered to the email used at checkout. If that email has not arrived, we can help investigate.

**Email failure, rendered only inside a paid, session-authorized purchase:**

> Your payment is safe and your books remain available for download in this browser.
>
> If delivery continues to fail, email theknowledgeconcierge@gmail.com and we'll help.

**Download failure:**

> We couldn't prepare your download. Please check again.

This is followed by the known-paid support copy above. Delayed email support appears after ten minutes in pending/sending state, rather than on a normal fresh purchase.

**FAQ — “I paid but verification stopped. Should I pay again?”**

> Please don't make another payment yet. We check captured payments independently of your browser. Once confirmed, your books are also delivered to the email used at checkout. If you've completed a payment but can't access your books, email theknowledgeconcierge@gmail.com with your payment screenshot/reference and the email or mobile number used at checkout. We'll verify your payment and help deliver your books.

**FAQ — “What if my books haven't arrived by email?”**

> Check Spam/Promotions and try the purchase page in the browser used to pay. Confirmed purchases usually receive email within about 10 minutes. If delivery or downloads are unavailable, email theknowledgeconcierge@gmail.com. A screenshot/reference helps us investigate; we verify payment in Razorpay before arranging delivery.

The receipt FAQ also explains automatic delivery to the original checkout address if the customer leaves before confirming delivery.

## 8. Security review

- Server-priced ₹499 collection and stale-order safeguards remain intact; arbitrary client prices still fail to influence pricing.
- Callback signature, provider amount/currency/capture/refund evidence, webhook HMAC, receipt/internal-order binding and payment-mode checks remain mandatory.
- Webhook/reconcile never issue browser sessions. Cookie flags, randomness, hashes, expiration and session/payment binding are unchanged. First-time simultaneous verified browsers can retain separate sessions; repeated verification with an existing valid cookie reuses it.
- Copied thank-you URLs, order IDs, payment IDs, query strings, screenshot references and legacy fragments authorize nothing. Unauthorized pages disclose no customer/order data. Support mailto is static and carries no automatic customer data.
- Downloads remain session-authorized, entitlement-derived, private and provider-checked. Refunds revoke access and block new email deliveries. No private PDFs enter public assets.
- Resend idempotency, delivery address/version locking, uncertain-outcome fencing and fallback secret protection remain unchanged. No automatic resend on page mount.
- Existing durable rate limits and clean 429/Retry-After handling remain: create 30/hour; resume/reconcile 20/minute per client/order; verify 30/minute; delivery 10/minute; downloads 30/minute. Client-wide aggregate protections remain. This pass adds no aggressive new limits.
- **Support procedure:** a screenshot/reference is investigation evidence, never authorization. Before any manual delivery, support must independently verify the correct order, captured amount/currency/payment mode, current refund state and existing delivery history in Razorpay and the database. Resolve uncertain delivery outcomes before any resend; use only the matching purchase's entitled files. No customer screenshot uploads, admin endpoints or automatic support fulfillment were added.
- Independent code review identified the rejected-gateway recovery problem described above; its fix was reviewed with active/expired lease cases. No remaining concrete financial/security blocker was reported.

## 9. Chaos/concurrency test results

The database suite runs actual migrations and RPCs against ephemeral PostgreSQL. Razorpay, Resend and private storage HTTP are controlled fixtures; no live payments or email were sent. The browser suite exercises a production build in desktop Chrome and mobile touch emulation.

| Required scenario | Evidence and observed result |
| --- | --- |
| Captured, verify never called | Webhooks produce one payment, PAID, five entitlements, zero sessions; fallback sends once. |
| Verify cancelled | Abort request while provider read is paused; independent order-only webhook and fallback finish before that handler resumes. |
| Verify response/session commit lost | Inject committed session RPC response loss; no cookie received; durable PAID/entitlements survive and fallback sends once. |
| Browser closes during verification | Close page with response held; reopen saved order safely without a session or downloads. |
| Refresh during verification | Callback URL already identifies recovery; refresh shows paid/no-session without Pay or URL-authorized downloads. |
| Back/Forward | Recovery remains safe; no automatic payment or email operation. |
| Webhook before verify | Same payment and entitlements; browser proof can subsequently create its session. |
| Verify before webhook | Duplicate later webhooks preserve paid state and original entitlement set. |
| Both capture event types | Concurrent `payment.captured` and order-only `order.paid` converge on the same payment. |
| Each webhook repeated | Five/ten concurrent repeated deliveries deduplicate durable side effects. |
| Webhook delayed several minutes | No fallback before durable capture; grace starts when paid is established; then one send. |
| Browser verification fails, webhook succeeds | Inject failed payment RPC on callback; subsequent signed webhook completes independent fulfillment. |
| Webhook succeeds, browser disappears | No session needed for PAID, entitlements or internal fallback. |
| PAID exactly once | One durable payment; paid timestamp preserved after duplicate/stale notifications. |
| Entitlements exactly once | Five unique active entitlements for the five-book purchase under concurrent calls. |
| Fallback exactly once | Two concurrent schedules produce one delivery/provider acceptance. |
| Manual send/fallback race | One shared claim, one provider send and terminal SENT. |
| Uncertain status cannot Pay | Authorized/created/unknown payment or paid gateway without evidence blocks create/resume; recovery UI hides Resume. |
| Definitely failed retry | Fresh provider evidence permits same-gateway continuation; no replacement charge/order is created by a reload. |
| Copied thank-you URL | Real route returns 404 without a session/checkout credential; browser shows safe generic recovery, no downloads. |
| Support copy privacy | Static copy/mailto; unauthorized UI contains no fixture customer email. No real PII used. |
| Screenshot is not authorization | Fabricated signature plus screenshot/reference is rejected; no session, entitlements or email. |
| Refund | Existing duplicate/refund/stale-capture regressions pass; access stays revoked and no new fulfillment is sent. |
| Failed payment cannot email | `payment.failed` produces no entitlements/session/fallback delivery. |
| Offline/online, slow response | Bounded recovery with no Pay; reconnect checks the same proof; successful retry updates downloads immediately. |
| Ten Check again taps | One in-flight same-proof verification request after timeout; successful paid result updates the visible purchase. |
| Older purchase/reconcile response | Hold a pre-session response, verify successfully, then release it; downloads stay available. Later authorization changes are still accepted. |
| Provider rejects gateway creation | Before-acceptance failure recovers same internal order after lease expiry; one provider order. |
| Provider mismatches payment ID | Webhook returns `PAYMENT_MISMATCH`; zero payment/entitlement mutations. |

Final verification used Node **24.21.0** and the installed Chrome channel:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed, warnings denied. |
| `npm test` | **213 passed** across 12 files. |
| `npm run test:db` | **115 passed** across two files, real PostgreSQL and actual migrations/RPCs. |
| `npm run build` | Passed; public/build assets contain no PDFs, private files, symlinks or source maps. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | **116 passed, 14 intentionally skipped**, zero failures or flaky tests; 130 cases across both projects. The skips are mobile-only tests excluded from desktop. |
| `git diff --check` | Passed. |

The full browser run includes both gated response-order regressions. Streaming-DOM selectors inspect visible content, and cross-tab storage injection waits for sibling hydration. Initial failures were investigated and corrected; final counts above come from the complete final runs, with Playwright retries disabled.

## 10. Mobile verification results

Automated confirmation tests cover **320, 360, 375, 390, 412 and 430px**, both desktop-size emulation and mobile touch mode. At every width, the confirmation has no horizontal overflow, primary/secondary actions are at least 44px high and remain inside a **360px-high viewport**. The message area scrolls independently while actions remain reachable. X, Continue, Escape and Leave were exercised. The existing mobile storefront, bag, checkout, persistence and rapid-tap regressions remain in the full suite.

Screenshots of the 320px confirmation at 568px and 360px height were visually inspected locally. The compact header and scrollable copy preserve the two visible actions. These tests emulate reduced space; they do not physically certify Safari browser bars or a real keyboard.

Manual real-phone checks still required before live release:

1. On iOS Safari and Android Chrome, verify all six widths where available, portrait/landscape, large text, browser bars, safe areas and keyboard dismissal. Scroll confirmation copy and reach both actions without trapping focus.
2. With Razorpay test-mode payment captured, close/refresh/kill the browser during verification. Confirm payment and entitlements from the authenticated server side and receive exactly one fallback email after grace.
3. Switch Wi-Fi/mobile data/offline during verification, restore network, check again and confirm no second payment invitation while uncertain.
4. Exercise two/five tabs, callbacks/webhooks in either order, manual send vs fallback, original checkout address, spam folders and actual PDF attachments.
5. Copy the purchase URL into a clean browser; confirm no customer data or downloads. Verify refund revocation using the approved test process.

## 11. Remaining edge cases and operational certification

- No Razorpay Live payment, production webhook subscription/capture setting, Netlify scheduler execution, real inbox delivery or physical browser-process crash was performed or certified by this local pass. Before live use, confirm the correct live-mode secrets and subscriptions for both capture events, failure and refund notifications, successful webhook delivery/retries, and the existing cron secret/function configuration. No configuration was changed here.
- If both the webhook and the browser are unavailable, a captured payment cannot be discovered by the email scheduler alone: it operates on durable PAID orders. Razorpay webhook redelivery or a subsequent authorized reconciliation is required. There is no unrequested global payment polling worker.
- Refresh deliberately loses in-memory callback proof. If the verified session cookie was never received, server-paid state alone cannot grant browser downloads; original-checkout email and verified human support are the recovery paths. Existing valid session cookies restore normal purchase state.
- The fallback retains its 24-hour paid-order age window, batch-of-three limit and three automatic attempts. Large backlog, long provider outage, invalid/missing historical checkout email or a bounce can need support. Grace timing assumes a healthy schedule and configured email provider.
- Resend API acceptance is not an inbox receipt. Attachments already sent cannot be revoked after a refund. Existing unknown-outcome safety can intentionally stop retries for operator investigation.
- Cancelling a browser fetch does not guarantee a running server handler stops. Tests prove the independent webhook path completes even while verification is stalled; actual platform process termination is a deployment/real-device check.

## 12. Files changed

| File | Purpose |
| --- | --- |
| `src/lib/server/commerce.ts` | Fresh retry eligibility, create/resume protection, gateway recovery preservation, paid timestamp and webhook payment-reference check. |
| `src/lib/commerce/types.ts` | Optional retry decision and paid timestamp on authorized public order data. |
| `src/lib/api.ts` | Optional caller AbortSignal for the bounded verification request. |
| `src/lib/razorpay-checkout.ts` | 30-second deadline, same-proof in-flight deduplication and module-memory recovery. |
| `src/lib/payment-support.ts` | Static support address and conditional recovery copy. |
| `src/components/PaymentRecovery.tsx` | Shared leave/timeout/support UI with scrollable copy and visible touch actions. |
| `src/components/CheckoutModal.tsx` | Pre-open reconciliation, dismissal recovery, callback route/cache update, confirmation and retry. |
| `src/views/ThankYou.tsx` | Safe retry gating, same-document proof recovery, recovery modal and contextual support. |
| `src/views/Faq.tsx` | Interrupted-payment/email recovery and verified-support explanation. |
| `tests/checkout-verification.test.ts` | Hanging request deadline and identical-proof deduplication. |
| `tests/database/lifecycle.test.ts` | Real-Postgres interrupted verification, webhook, retry, delivery and reference-validation regressions. |
| `tests/e2e/payment-recovery.spec.ts` | Mobile confirmation, timeout/retry, offline, reload/return/close, uncertainty, privacy and paid fulfillment failures. |
| `tests/e2e/storefront.spec.ts` | Existing checkout fixtures honor fresh pre-open reconciliation. |
| `tests/e2e/chaos.spec.ts` | Existing reload/opening fixtures and navigation synchronization. |
| `tests/e2e/mobile-interaction.spec.ts` | Pre-open fixture and hydration synchronization before cross-tab storage injection. |
| `docs/superpowers/plans/2026-10-11-payment-recovery.md` | Implementation and verification checklist. |
| `docs/PAYMENT_RECOVERY_AUDIT.md` | This report. |

## 13. Commit

One isolated local implementation commit on `codex/payment-recovery-hardening`, based on `f7c210a`. The exact resulting hash is supplied in the handoff; locally retrieve it with `git log -1 --format=%H -- docs/PAYMENT_RECOVERY_AUDIT.md`. The branch is not pushed and nothing is deployed.
