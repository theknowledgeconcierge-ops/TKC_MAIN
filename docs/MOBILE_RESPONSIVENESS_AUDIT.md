# Mobile responsiveness and commerce resilience audit

Combined audit completed 11 October 2026 (Asia/Kolkata). Baseline: `993d9b2`. Work is isolated on
`codex/mobile-interaction-audit`; this task does not push or deploy.

## 1. Mobile root causes and evidence

The local cart handler was already quick when a tap reached it. The principal
reproduced problems were hit testing, reversible Add behavior, moving controls,
and feedback that users could not see. Network latency was not on the Add/Remove
path.

| Source / function | Reproduced finding | Effect |
| --- | --- | --- |
| `src/components/ConciergeChatbot.tsx`, `ConciergeChatbot` | With the assistant closed, the large fixed parent still intercepted a lower-screen Add target. `elementFromPoint` did not resolve to that button. | A legitimate tap never reached Add. |
| `src/components/BookCard.tsx`, `handleAdd` | Add toggled selection. Five further taps on an already selected book produced counts `0, 1, 0, 1, 0`. | Repeated taps undid the first successful Add. |
| `src/components/SmartBag.tsx`, selected and recommendation rows | Removing a row moved the next Remove button under the same finger. A recommendation likewise moved after Add; the regression reproduced an unintended third book instead of the intended two. | Rapid taps changed other books. |
| `src/lib/store.tsx`, `StoreProvider` | The shared changing context invalidated action-only Home and CollectionOffer consumers once each on Add. | Avoidable work extended beyond components displaying cart state. |
| `src/components/Storefront.tsx`, `Shell` | A pathname-keyed `AnimatePresence` used `mode="wait"` with a configured 240 ms exit and remounted route content. | Navigation waited on decoration. The 240 ms is source configuration, not a measured end-to-end navigation delay. |
| `src/components/CheckoutModal.tsx`, form submission | Three synchronous submissions produced three order requests before React's pending state disabled the button. | Duplicate client work and ambiguous progress. |
| `src/components/CheckoutModal.tsx`, mutation errors / Razorpay callbacks | Toasts were mounted in the document below a native dialog's top layer. | Errors and retry guidance could be visually hidden. |
| `src/lib/browser-storage.ts`, `writeStorage`; `src/lib/store.tsx`, persistence effect | Storage write exceptions were swallowed while the visible cart changed. | UI and the last saved bag diverged without explanation. |
| `src/components/SmartBag.tsx`, progress summary | At 320 × 568, a sticky summary covered Remove even after scrolling the control into view; center-point hit testing failed. | A visible-looking control could not be tapped. |
| `src/components/ConciergeChatbot.tsx`, conversation panel | At 320 × 568, a longer conversation put Close at y = −24.3 px. | The assistant could become difficult to dismiss. |

The interrupted handoff also contained a 400 ms modal pointer suppression guard
and a clock-based Add suppression window. These blocked immediate Close and a
deliberate Remove → Add. Both were removed before final verification; the generic
`Modal.tsx` has no change from baseline.

## 2. UX and performance fixes

- **Add and badge:** `BookCard.handleAdd` adds idempotently, immediately shows
  “Added,” then “In bag.” Repeated taps during acknowledgement retain selection.
  A later In bag tap opens the bag. A deliberate re-add after removal always works.
  The count updates with state and a polite live region announces cart changes.
- **Remove and recommendation stability:** `SmartBag` removes the active product
  immediately, retaining a stable status/Undo space during the open session.
  Undo is away from the previous Remove coordinates. An added recommendation
  remains acknowledged and disabled for the session, preventing another product
  from shifting under a repeated tap.
- **Store subscriptions:** `StoreProvider` now exposes cart data, drawer state,
  and stable actions through separate contexts. Home, CollectionOffer, and other
  action-only consumers do not subscribe to cart data. No state library was added.
  Closed drawer content is not rendered.
- **Persistence:** `writeStorage` reports success. Cart mutations update local
  state first; failed writes restore the last saved selection and show a readable
  notice in both the page and open bag. A one-off successful restoration keeps
  the notice visible; the next successful mutation clears it. Cross-tab updates
  replace the rollback baseline. If storage is unavailable from the outset,
  shopping remains available for that visit with an explicit persistence notice.
- **Hit testing and navigation:** the assistant wrapper does not receive pointer
  events; its visible controls do. The closed panel is invisible and inert.
  Hidden Back to top is also invisible. Route content no longer waits on the
  keyed exit animation. Next's documented smooth-scroll attribute allows normal
  route scroll restoration.
- **Drawer and forms:** mobile controls have approximately 44 px targets. The
  bag summary scrolls normally on small screens, its header fits at 320 px, and
  the checkout footer remains reachable. The assistant has a dynamic viewport
  height limit and a sticky close header. Checkout uses `94dvh` and contained
  scrolling. Native dialogs lock page scrolling. The viewport requests content
  resizing for keyboards in browsers that support `interactive-widget`.
- **Checkout:** a synchronous submission ref rejects duplicate submissions before
  a pending-state render. Busy controls explicitly say “Preparing secure
  checkout…”, “Opening Razorpay…”, or “Verifying payment…”. Errors and stale-price
  guidance render inside the dialog. Close/Escape are guarded during active work.
  Razorpay is prefetched during review; the native dialog closes for its
  body-mounted iframe and reopens for verification or errors. Provider retries
  remain available after `payment.failed`. Completing a purchase clears the old
  review so a second purchase starts with customer details.
- **Accessibility:** retained real buttons, added icon labels, menu expansion
  semantics, cart announcements, and busy states for checkout, payment checking,
  downloads, and email operations. Dialog focus return is regression-tested.
  Enlarged footer links, product titles, home links, error actions, and purchase
  controls without changing the brand design.

### Mobile journey audit

Automated Chrome touch emulation covered widths **320, 360, 375, 390, 412, 430 px**.
The 320 px viewport used 568 px height; other normal viewports used 844 px.
Checkout was also exercised at 360 px height to approximate reduced available
space. This is a viewport resize test, not an operating-system keyboard test.

| Area | Findings and final coverage |
| --- | --- |
| Home, books, product detail, collection, About, FAQ | No horizontal overflow beyond a 1 px rounding tolerance at all six widths. Existing layouts and branding retained. Product Add and title controls enlarged. |
| Header, announcement, menu, footer | Brand, banner, bag, menu and footer hit areas enlarged; menu expansion and close work. Footer link heights measured at least 44 px. |
| Product selection / collection purchase | Local state remains independent of networking. Rapid Add/Remove and Remove → Add are deterministic; count changes immediately. Existing complete-collection behavior remains covered. |
| Bag / recommendations | Immediate Remove, stable repeated-tap coordinates, operable next-frame Close, focus return, usable 320 × 568 scrolling, 44 px important controls, no internal horizontal overflow. |
| Assistant / Back to top | Hidden elements cannot intercept taps. Assistant Close stays on screen after conversation growth. |
| Customer form / coupon / review | 44 px controls, contained scrolling, CTA reachable in the reduced-height viewport. Validation remains native/server-backed. Slow order creation, failure, retry and duplicate submission are covered. Coupon acceptance is never fabricated locally. |
| Razorpay / payment return | Explicit launch and verification states; no success screen before verification. Existing dismiss, provider failure, payment retry and stale-order tests pass. A second purchase starts a fresh form. |
| Downloads / email | A paid five-book fixture fits all six widths, including a long email address. Download and email controls measure at least 44 px. Existing individual/all download, failure, email change, lock and refresh tests pass. |
| Desktop | Existing storefront and SEO browser regressions pass. Desktop breakpoint sizing and existing brand design retained. |

Representative 320 px bag and checkout screenshots were visually inspected in
addition to the automated geometry and interaction checks. The fixed/sticky
occlusion and offscreen assistant Close issues were corrected. This audit does
not certify every possible browser font, device inset, or operating-system
keyboard combination.

### Performance measurements

The final touch tests start from a hydrated page, capture `pointerup`, observe the
expected cart DOM change, and mark the next `requestAnimationFrame`. They run
offline and fail if an API request occurs. These are tap-to-next-frame samples,
not hardware paint measurements, field INP percentiles, or cold-hydration timings.

| Final production browser test | Add | Remove | Cart API requests |
| --- | ---: | ---: | ---: |
| Normal CPU, offline | 16.2 ms | 14.7 ms | 0 |
| 4× CPU slowdown, offline | 14.3 ms | 18.2 ms | 0 |

Both operations passed the <100 ms assertion. Slow checkout was tested using
held order, Razorpay script, and verification responses; progress stayed visible
while those responses were pending. A forced order 503 displayed an in-dialog
error and allowed retry.

| Before / after probe | Baseline | Final |
| --- | --- | --- |
| Programmatic Add click → next frame | 11.0 ms | 10.9 ms |
| Further rapid Add taps on a selected book | Counts `0,1,0,1,0` | Counts `1,1,1,1,1` |
| Home / CollectionOffer direct context invalidations on Add | 1 / 1 | 0 / 0 |
| Synchronous triple checkout submission | 3 requests | 1 request |
| Lower-screen Add hit test with closed assistant | Failed | Passed |
| Short-screen bag Remove hit test after scroll | Failed | Passed |
| Assistant Close after conversation growth | Above viewport | Reachable |

The baseline was built from a separate archive of `993d9b2`; the working checkout
was not reset. Baseline used a webpack production build and final used the
normal Turbopack production build. The click timings are single diagnostic
samples with different build modes, so they do **not** establish a raw latency
speedup. The repeatable improvement is correct first-tap delivery and stable
state. The context probe counted direct dependency-value changes observed through
React's production DevTools hook, not full render counts or commit durations.

Cart tracing found no awaited network/server pricing, analytics request,
`router.refresh`, or deferred transition on Add/Remove. Serialization is a small
sanitized ID array; the sampled `localStorage.setItem` calls rounded to 0 ms.
Persistence therefore was not a demonstrated main-thread bottleneck in this
environment. No speculative memoization, image pipeline change, bundle rewrite,
or extra client state infrastructure was introduced. Critical handlers remain
client-side; Razorpay loading is moved earlier into review. Cold-load hydration,
bundle-size reduction, and field performance are not claimed as measured wins.

### Preserved authoritative behavior

Pricing, captured-payment verification, purchase authorization, entitlement/refund,
private PDF delivery and SEO architecture remain intact. This second workstream
strengthens email idempotency, reuses valid purchase sessions, and hardens rate
limits without changing those authorization boundaries. The existing server remains authoritative for five-book ₹499
pricing, stale-order refresh, coupons, payment success, download authorization,
and email outcomes. Client optimistic state applies only to bag composition.

`browser-storage.ts` adds a write success return value; purchase-storage callers
retain their existing behavior. No dependencies or deployment settings were changed. The additive migration
`supabase/migrations/202610110001_delivery_retry_safety.sql` must be applied before
releasing this code. It has been tested locally and has **not** been applied to
production during this task.

## 3. Chaos and abuse findings

The additional investigation reproduced these defects before their fixes:

| Finding | Before | Final change / evidence |
| --- | --- | --- |
| Unknown Resend outcome could change address/key | An accepted send with a lost response followed by correction returned 200 and allowed a second logical send. | The locked SQL claim returns `409 DELIVERY_OUTCOME_UNKNOWN`; it retains address, version and key. Same-address retry resolves to the original provider message. |
| Retry outlived provider deduplication | After simulating 25 hours and provider key eviction, retry made a second send request. | Uncertain sends are fenced at 23 hours, including scheduled fallback. The page offers downloads/help and disables resend; it never invents SENT. |
| A later rejection erased an earlier ambiguity | After an accepted/lost response and a subsequent rejected request, correction could still create a new key. | A sticky previous-uncertainty flag survives definite failures on later attempts. |
| React pending state was not a synchronous guard | Ten same-turn Confirm, Download and Resume clicks each generated ten requests. | Refs claim the action before starting async work; ten clicks now generate one request. Razorpay failure retains the active-window guard until dismissal/success. |
| Shared checkout storage was racy | Five identical tabs generated four distinct checkout tokens in the reproduced run. | `CheckoutModal.orderMutation` holds a Web Lock across read/request/successful snapshot write. Five tabs produce one create and four resumes of the same order. |
| Old responses could regress Paid in the UI | A held pending reconciliation response arriving after a Paid/Sent GET displayed `payment_pending`. | `mergePurchaseState` preserves server-observed Paid, Refunded and Sent terminal states for the same order. It allows actual refund/access changes and never fabricates authorization. |
| Verification minted a session on every retry | Repeating callback verification with an already valid purchase cookie minted new rows/tokens. | The route still verifies captured-payment proof, then reuses a valid same-order cookie. DB failures fail closed; only an invalid/expired session can lead to a new issuance. |
| Client identity was spoofable for rate limits | Rotating the first `X-Forwarded-For` value bypassed the same-IP counter. | Deployed traffic uses validated Netlify connecting IP; untrusted/missing values share a stable bucket. XFF fallback is limited to configured loopback development. |
| Per-order limits had no aggregate bound | Rotating order IDs avoided a client's total expensive-operation cap. | Existing per-order caps plus a shared 180/min client bucket bound provider work and counter growth. |

Source: `src/views/ThankYou.tsx`, `src/components/CheckoutModal.tsx`,
`src/lib/commerce/purchase-state.ts`, `src/app/api/payments/verify/route.ts`,
`src/lib/server/http.ts`, `src/lib/server/commerce.ts`, and
`supabase/migrations/202610110001_delivery_retry_safety.sql`.

Email uncertainty is persisted **when claiming**, before reading PDFs or calling
Resend. A worker crash is therefore conservative. Only a definite rejection or
pre-provider failure can clear that attempt's uncertainty, and cannot clear an
older uncertain attempt. SENT remains terminal. The 23-hour ceiling leaves
headroom inside [Resend's documented 24-hour idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys).
A timeout outside that window requires read-only provider reconciliation before
any operator recovery; there is no automatic new key or resend escape hatch.

## 4. Idempotency matrix

A = naturally idempotent; B = durable idempotency; C = uniqueness/locking;
D = intentionally repeatable; E = unsafe. No identified E operation remains
unfixed in the audited paths. This classification depends on applying the new
migration and the documented provider contracts.

| Action / endpoint | Class | Correctness boundary |
| --- | --- | --- |
| Add / Remove / clear local bag | A | Set membership, unique sanitized IDs; stable repeated-tap targets and storage rollback. |
| Create checkout, `POST /api/orders` | B + C | Stable checkout key, unique token hash and request fingerprint checked in `tkc_create_order`; item snapshots commit atomically. Different intentional keys may create separate orders. |
| Resume, `POST /api/orders/resume` | A + B + C | Existing order/cookie, authoritative current quote, same bound gateway; paid/refunded cannot resume payment. |
| Refresh stale checkout | B + C | Old order is refused after reconciliation; same-browser serialized replacement saves one fresh key. Fresh requests still use durable create deduplication. |
| Create Razorpay order | B + C | SQL claim, stable receipt, provider receipt uniqueness, binding uniqueness, receipt lookup after unknown outcomes. |
| Open Razorpay | D | Explicit user action, same gateway ID, synchronous busy guard; script preload/reload does not charge. |
| Verify, `POST /api/payments/verify` | B + C | Exact callback HMAC and independently fetched captured evidence; unique event, locked fulfillment, unique entitlement per order/product. Repeated verified callbacks return existing paid state. |
| Razorpay webhook | B + C | Raw-body HMAC, fresh evidence, durable body-derived event key, same payment transaction. No purchase session or email is issued here. |
| Thank-you GET / reconcile / reload | A + B + C | Credential-protected reads; reconciliation is event-idempotent. Reload does not open Razorpay or send email. |
| Purchase-session issuance | C + D | Proof-gated random server token, hash-only SQL storage and fulfillment recheck. Existing valid cookie is reused; independent cookie-less responses may each receive a valid session. |
| Confirm / change delivery email, `POST /api/orders/delivery` | B + C | Session rechecked under order/delivery locks. Unknown outcome forbids recipient/version changes; SENT locks the address permanently. |
| Send / retry books | B + C | One row/order, one current claim, stable address/version key, stale-worker fence, 23-hour unknown-outcome retry ceiling. |
| Scheduled fallback | B + C | Secret-authenticated, same delivery claims/key and retention ceiling, `SKIP LOCKED`, grace/age/retry/attempt bounds; buyer-confirmed and SENT rows excluded. |
| Download, `POST /api/downloads` | D | Repeat signing is allowed; every request rechecks session, fresh captured/unrefunded evidence and entitlement. No new entitlement/session/email is created. |
| Refund processing | B + C | Same locked payment RPC; monotonic refund amount, revoked entitlements, terminal refunded order; delayed capture cannot restore access. No new refund-initiation endpoint exists. |

## 5. Concurrency findings and state machines

Real PostgreSQL tests confirm: eight simultaneous creates with one checkout key
produce one internal/provider order; ten concurrent resumes reuse its gateway;
ten duplicate webhook requests produce one logical payment event and five
entitlements for five books. Concurrent callback/webhook transactions and forced
rollback/lost commits do not duplicate fulfillment. Ten signing requests are
intentionally repeatable and leave one payment, five entitlements and one session.

Five concurrent Confirm requests invoke Resend once. Manual confirm/retry racing
two scheduled fallback runs also invokes it once. A stale claim's finish write is
ignored, and a worker interrupted after provider acceptance reuses its original
key when the lease expires. Ten sequential delivery requests, including a lost
committed finish response, make one provider call; the next request is cleanly
rate-limited.

Five initial cookie-less valid callbacks may create five independent random
sessions. All five cookies remain valid regardless of response ordering. Five
later requests carrying an existing cookie add **zero** sessions. A single
rotating session hash would invalidate late responses; recovering a single raw
token from hash-only storage would require a credential architecture change.
Issuance remains proof-gated and bounded by the verification rate limit.

| State machine | Allowed transitions / rejection |
| --- | --- |
| Order | `created → payment_pending`; uncaptured/failed attempts may yield `failed`; retry uses the same gateway; independently captured evidence yields `paid`; verified refund yields `refunded`. Paid never moves to pending/failed; refunded never moves back. |
| Payment | Provider-authorized attempts grant nothing; durable `failed → captured → refunded` evidence can advance. Captured cannot regress to failed; refund amount cannot decrease; a second paid payment ID for one order is rejected. |
| Purchase session | Absent → issued only after exact verified capture and complete fulfillment → reused while valid → expired/unusable. Session/order/payment mismatch, incomplete fulfillment or refund cannot grant download access. Raw tokens remain cookie-only; URLs never authorize. |
| Email delivery | `pending → sending → sent` or `failed`; safe retry `failed → sending`; expired sending lease can be reclaimed with the same key inside the safe window. `sent` is terminal. Unknown outcome prevents address change; expired unknown outcomes require reconciliation rather than another send. |

### Reload matrix

| Refresh point | Verified behavior / boundary |
| --- | --- |
| Customer details | No submit on reload; form can be re-entered. Unsubmitted PII is not persisted by this change. |
| Review | Re-entering matching details resumes the remembered order and gateway. |
| Razorpay opening | Reload closes the browser UI; no automatic charge or replacement order. Resume remains explicit. |
| Immediately after payment / during verification | Durable capture/fulfillment survives lost responses. Paid cannot regress. If the response containing the HttpOnly purchase cookie was lost, the checkout cookie/URL does not gain download access; email fallback is recovery. |
| Thank-you | Server read/reconciliation recovers durable status, with no email send or provider popup on mount. |
| Email SENDING | Reload reads/polls current state; it does not automatically send. Lease recovery uses the same key. |
| Email SENT | Reload, five tabs and Back/Forward keep Sent; no automatic send. |
| Email FAILED | Reload retains failure/retry UI; manual retry is explicit and subject to safe-window checks. |
| Download | Reload does not automatically sign/download again. Explicit repeats remain authorized and rate-limited. |

Closing the browser is modeled by lost/cancelled responses, interrupted workers,
and callback-loss/webhook fallback tests. No physical browser-process kill or
operating-system restore certification is claimed. Web Locks coordinate current
supported same-origin browsers; environments without that API retain the saved
key and server deduplication, but do not gain an atomic cross-tab storage lock.

## 6. Resend duplicate investigation

Read-only production check on 11 October 2026: the authenticated Resend Sending
history (Last 15 days) showed three Delivered messages. Their exact provider IDs
were matched in memory to `email_deliveries.provider_message_id`; no customer
names, addresses, phone numbers, raw order IDs, or provider IDs are included here.

| Anonymous provider message | Matched order | DB state | Address version | Attempts | Payment environment |
| --- | --- | --- | ---: | ---: | --- |
| M1 | O1 | sent | 1 | 1 | test, paid |
| M2 | O2 | sent | 1 | 1 | test, paid |
| M3 | O3 | sent | 1 | 1 | test, paid |

The current database query returned three delivery rows for three distinct
orders, all SENT, with no duplicate order group. Every visible Delivered message
matched exactly one row. **The observed messages are different orders, not
multiple deliveries of one order.** No duplicate-delivery release blocker was
observed in that available history. This does not reconstruct deleted or
out-of-retention history. The independently reproduced retry defects in section
3 were nevertheless fixed before release. No production email, payment,
configuration or database mutation was made during this investigation.

## 7. Rate-limit review

All limits are durable PostgreSQL counters shared across server instances.
Normal mobile retry allowances are retained; idempotency still determines
correctness. Netlify supplies the [connecting client IP header](https://answers.netlify.com/t/upcoming-change-stripping-exposed-netlify-headers-from-function-and-proxy-requests/52665).
The configured application origin determines whether local-only XFF fallback is
allowed. Production ignores untrusted XFF, validates the connecting address,
and groups missing/invalid platform headers into one stable bucket.

| Operation | Existing per-client allowance retained | Additional protection |
| --- | --- | --- |
| Create order | 30/hour | Trusted client identity; token/hash deduplication |
| Resume | 20/min/order | Shared 180/min client cap |
| Verify | 30/min/order | Shared cap, exact proof and transactional fulfillment |
| Reconcile | 20/min/order | Shared cap and event deduplication |
| Delivery / address changes / retries | 10/min/order | Shared cap; five attempts/address versions; claim/uncertainty fences |
| Download | 30/min/order | Shared cap and authorization per signing request |
| Order read | 120/min/client | Trusted client identity; no per-order bypass |
| Webhook | Provider-signature boundary | Deliberately no consumer IP cap: legitimate provider retries must reach durable event deduplication |
| Scheduled fallback | Secret-authenticated batches of 3 | SQL locks, five-minute grace, 24-hour paid-order age, three automatic attempts and 15-minute retry interval |

Responses use 429 and `Retry-After` for the applicable window (3600 seconds for
order creation, 60 seconds for minute buckets). This is a conservative full
window, not an exact remaining-time calculation. Real SQL concurrency accepted
30/35 requests for one 30-request bucket, and 180/185 requests rotating order IDs
under the aggregate bucket. Denied calls do not proceed to provider work. Trusted
header forwarding must remain present in the hosted Next adapter; this task did
not deploy a change to validate a new hosted runtime.

## 8. Failure-injection results

| Injection | Converged result |
| --- | --- |
| Slow order, script and verify responses | Immediate explicit busy states; one same-turn action; no success before authoritative verification. |
| Lost create response / browser retry | Same saved checkout key on retry; real SQL uniqueness keeps one order/snapshot. |
| Razorpay accepted create, response/bind lost | Stable receipt lookup recovers the same gateway. Razorpay documents [unique receipts and rejection of duplicate receipt creation](https://razorpay.com/docs/api/orders/create/). |
| Duplicate verify/webhook and DB contention | Payment/event locks and unique entitlement keys converge; paid/refunded do not regress. |
| Failure/lost response after fulfillment or session commit | Payment/entitlements remain durable; same callback can retry; no checkout-only authorization upgrade. |
| Resend timeout before acceptance | Same-address/key retry; no fake Sent or payment downgrade. |
| Resend accepted but response lost | Same key returns one logical provider message; changing address is refused. |
| Provider acceptance then worker/finish failure | SENDING is read safely; active lease prevents another send; expired lease reuses key; stale finish is ignored. |
| Sent finish committed but response lost | Repeat reads SENT; no extra provider call. |
| Provider key retention expired | Manual/fallback send is stopped; downloads remain available; reconciliation required. |
| Later definite rejection after earlier timeout | Earlier uncertainty survives; no fresh address/key. |
| Manual/fallback races, duplicate schedules | One claim/provider message; SENT terminal. |
| Storage failure / cross-tab update | Last persisted bag restored with clear notice; current external snapshot becomes rollback baseline. |
| Offline cart / CPU slowdown | Add/Remove still reach the next frame below 100 ms with zero API requests. |
| Refresh / Back / Forward / five tabs | No automatic email, charge, or download; server authorization and durable terminal state retained. |

## 9. Test results

All commands used Node **24.21.0**, matching the project's Node 24 requirement.
Browser tests used installed Chrome through `PLAYWRIGHT_CHANNEL=chrome`.

| Command | Final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm test` | 12 files, 211 tests passed |
| `npm run test:db` | 2 files, 100 tests passed against an ephemeral real PostgreSQL 16 cluster; migrations, transaction and failure paths included |
| `npm run build` | Passed, Next 16.4 Turbopack; 14 static generation targets; public and built-static asset checks passed |
| `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/tkc-chaos-e2e.json npm run test:e2e -- --reporter=list,json` | 84 passed, 14 intentionally skipped, 0 failed, 0 flaky; 64.0 seconds |
| `git diff --check` | Passed |

The 14 skips omit mobile-only cases from the desktop project; those cases ran in
the mobile project. Browser coverage includes the new
`tests/e2e/mobile-interaction.spec.ts`, `tests/e2e/chaos.spec.ts`, and the existing
storefront/SEO suites. New server regressions exercise the real route handlers,
service, adapters and PostgreSQL; only external provider/storage HTTP is replaced.
Existing regressions cover 1–5 book checkout, ₹499 totals, stale pricing,
verification retry, provider failures, downloads, email lifecycle, and shared
purchase URL/session protection. Database tests use disposable local state.

The browser suite uses provider/API fixtures. No physical-phone verification,
live Razorpay charge, or actual Resend delivery was performed. Emulation cannot
certify Safari top-layer/provider behavior or real mobile keyboard handling.

## 10. Manual real-phone checklist after deployment

1. Open Home on a fresh mobile load. Tap Add once: see Added and badge +1. Tap
   ten times rapidly: exactly one selected book. Check the product page too.
2. Add a second book. Open the bag; tap the first Remove once: it disappears and
   badge −1. Repeat ten rapid taps at that location: the second book stays.
   Remove → re-add quickly, including a recommendation. Reload: the saved bag
   remains correct.
3. Scroll Home, books, product, collection and FAQ; expand an FAQ. Open/close the
   menu and bag repeatedly. Reach Close, Remove and checkout on a short screen.
   Confirm no sideways scrolling or invisible assistant overlay blocking Add.
4. Start checkout. Focus every field, open/close the phone keyboard, scroll to
   the CTA and Close. Trigger validation and a rejected coupon. Confirm feedback
   stays visible. Submit once and rapidly: progress appears and only one order
   is created. Review all five books and the server-confirmed ₹499 total without
   an additional coupon.
5. Launch Razorpay: its controls are usable. Cancel, retry and complete an
   appropriate authorized test payment. Observe verification before success;
   check return, refresh and My purchases. Start another purchase and confirm a
   fresh customer form appears.
6. Download one purchased PDF, then all PDFs. Confirm each opens correctly.
   Confirm delivery email, test changing it before locking, and refresh after
   confirmation. Verify the final email state and received message remain
   consistent with server results.
7. In two tabs, then five, review the same checkout and confirm one remembered
   order/provider order. Tap Confirm ten times; refresh while Sending and after
   Sent, then use Back/Forward. Verify one provider message for that order and
   no automatic resend. Use controlled mailboxes and an authorized test payment.
8. Disable/re-enable network during checkout and email; retry the same action.
   Refresh during payment return/verification. Check Paid remains Paid, a missing
   session never unlocks downloads, and the email recovery path works if the
   payment cookie response was lost. Close/reopen an old tab and revisit the
   thank-you URL in a separate browser: the URL alone must grant no access.
