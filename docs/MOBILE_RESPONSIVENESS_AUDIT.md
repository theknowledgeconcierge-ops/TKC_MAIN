# Mobile responsiveness and interaction audit

Completed 10 October 2026. Baseline: `993d9b2`. Work is isolated on
`codex/mobile-interaction-audit`; this task does not push or deploy.

## Root causes and evidence

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

## Fixes

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

## Mobile journey audit

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

## Performance measurements

The final touch tests start from a hydrated page, capture `pointerup`, observe the
expected cart DOM change, and mark the next `requestAnimationFrame`. They run
offline and fail if an API request occurs. These are tap-to-next-frame samples,
not hardware paint measurements, field INP percentiles, or cold-hydration timings.

| Final production browser test | Add | Remove | Cart API requests |
| --- | ---: | ---: | ---: |
| Normal CPU, offline | 14.3 ms | 16.0 ms | 0 |
| 4× CPU slowdown, offline | 16.4 ms | 17.6 ms | 0 |

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

## Preserved authoritative behavior

No pricing, payment verification, purchase-session, entitlement/refund, private
PDF delivery, Resend lifecycle, email idempotency, or SEO metadata implementation
was changed. The existing server remains authoritative for five-book ₹499
pricing, stale-order refresh, coupons, payment success, download authorization,
and email outcomes. Client optimistic state applies only to bag composition.

`browser-storage.ts` adds a write success return value; purchase-storage callers
retain their existing behavior. No dependencies, migrations, deployment settings,
or server commerce handlers were changed.

## Final verification

All commands used Node **24.21.0**, matching the project's Node 24 requirement.
Browser tests used installed Chrome through `PLAYWRIGHT_CHANNEL=chrome`.

| Command | Final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm test` | 11 files, 204 tests passed |
| `npm run test:db` | 2 files, 89 tests passed against an ephemeral real PostgreSQL 16 cluster; migrations, transaction and failure paths included |
| `npm run build` | Passed, Next 16.4 Turbopack; 14 static generation targets; public and built-static asset checks passed |
| `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/tkc-final-e2e.json npm run test:e2e -- --reporter=list,json` | 66 passed, 14 intentionally skipped, 0 failed, 0 flaky; 52.7 seconds |
| `git diff --check` | Passed |

The 14 skips omit mobile-only cases from the desktop project; those cases ran in
the mobile project. Browser coverage includes the new
`tests/e2e/mobile-interaction.spec.ts` and the existing storefront/SEO suites.
Existing regressions cover 1–5 book checkout, ₹499 totals, stale pricing,
verification retry, provider failures, downloads, email lifecycle, and shared
purchase URL/session protection. Database tests use disposable local state.

The browser suite uses provider/API fixtures. No physical-phone verification,
live Razorpay charge, or actual Resend delivery was performed. Emulation cannot
certify Safari top-layer/provider behavior or real mobile keyboard handling.

## Physical-phone certification after deployment

1. Open Home on a fresh mobile load. Tap Add once: see Added and badge +1. Tap
   five times rapidly: exactly one selected book. Check the product page too.
2. Add a second book. Open the bag; tap the first Remove once: it disappears and
   badge −1. Repeat five rapid taps at that location: the second book stays.
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
