# Connectivity and payment reconciliation hardening

Base reviewed: `855711618c66c9b99c09b080e07da80614951dcb`, its payment recovery audit and plan. Preserve that implementation, including retry eligibility and session boundaries. No schema expansion is currently justified.

## State/ownership model (recorded before implementation)

| Lifecycle state | Authority / durable representation | Safe browser state | Reload / reconnect action | Offline behavior | Pay / download / email |
| --- | --- | --- | --- | --- | --- |
| CART | Browser product IDs; server prices on submission | Existing sanitized cart IDs | Hydrate IDs; obtain fresh quote on checkout | Local add/remove continue | No / no / no |
| CUSTOMER_DETAILS | React memory until accepted by server | Name/email/mobile/coupon in memory only | Re-enter before acceptance; browser autofill optional | Keep current form; block server submission | No / no / no |
| INTERNAL_ORDER_CREATED | Postgres order + unique checkout token hash | Existing checkout identity, never contact data | Retry same token and payload; authorized checkout cookie permits resume | Preserve in-memory form and identity; explain ambiguity | Only after fresh resume / no / no |
| GATEWAY_ORDER_CREATED | Postgres gateway binding, stable receipt and creation lease; Razorpay order | Non-authorizing internal order reference | Resume/reconcile; recover receipt before creation | No provider opening | Only fresh retry permission / no / no |
| PAYMENT_ATTEMPT_STARTED | Provider attempts; app gateway binding | Minimal order reference + attempt timestamp, never success/proof | Reconcile existing order before payment | State explicitly uncertain | No until fresh retry permission / no / no |
| PAYMENT_STATUS_UNCERTAIN | Fresh provider evidence unavailable/inconclusive; existing PAYMENT_PROCESSING decision | Pending recovery UI; no cached permission | Bounded reconciliation, Check again, support | Wait for connection; never infer failure | No / no / no |
| VERIFYING | Signed callback + authoritative provider checks, locked payment RPC | Proof only in module memory; existing 30-second deadline | Existing cookie/reconcile; lost proof cannot create access | Recovery UI; backend/webhook independent | No / no / only after durable PAID |
| PAID | Postgres paid payment/order, provider captured and unrefunded | Server-confirmed state; never persisted as local proof | Read/reconcile with existing cookies | Display previously confirmed state; no new authorization | No / only session+entitlement / eligible internal fallback |
| ENTITLED | Unique active Postgres entitlements, purchase session for browser access | Authorized response in query memory | Reauthorize; no session means safe paid/email recovery | No new signed URL | No / online authorized request / paid server checks |
| DELIVERY_PENDING | Postgres delivery version, lease, grace, attempts | Durable status from authorized response | Read delivery state, no automatic send | Disable send; unknown outcome remains unknown | No / authorized / durable claim + provider checks |
| DELIVERED | SENT row + provider ID/stable Resend key (acceptance, not inbox receipt) | Server-reported SENT | Read; never resend on reload/reconnect | Show known SENT | No / authorized / no ordinary repeat |
| FAILED | Provider-confirmed failed attempts; retry decision from reconciliation | Failed only after authoritative decision | Fresh pre-open resume remains mandatory | No retry while offline | Only payment_retry_allowed / no / no |
| REFUNDED | Locked DB refund + revoked entitlements; provider refund evidence | Server-reported terminal state | Fresh reads preserve refund; stale capture cannot undo it | No new financial/fulfillment action | No / no / no |
| STALE_PRICE | Server quote conflict, existing price-change refusal | Review refreshed server price | Reconcile old order before replacement | No cached quote authority | Only new confirmed server quote / no / no |
| UNAUTHORIZED_BROWSER | Missing/invalid checkout/session cookies | Generic support; ID alone reveals no customer data | Existing secure verification or email/support; never ID-to-session | Safe generic state | No / no / no browser send |

Provider payment evidence belongs to Razorpay. Postgres owns application truth. HttpOnly purchase-session cookies authorize browser access; checkout cookies permit limited reconciliation. Browser storage is convenience only. Contact details must never enter localStorage/sessionStorage (explicit user clarification). A lost pre-order form after browser termination is acceptable.

## Implementation/checklist

- [x] Add red tests for validated minimal recovery metadata, storage failures and same-document checkout identity recovery.
- [x] Add shared connectivity UX and coalesced reconnect/history checks; prevent offline server mutations and automatic payment/email retries.
- [x] Record a non-authorizing possible-attempt reference before opening Razorpay; restore existing checkout via secure resume/reconcile after reload. Keep contact data only in React/server memory.
- [x] Preserve fresh pre-open checks, 30-second proof deadline, response-order guard, durable email claims and refund/download boundaries.
- [x] Add fixture browser chaos at six widths, two/five tabs, response loss, reload/history, storage corruption/absence, download/email recovery and offline flapping.
- [x] Extend real-Postgres failure injection only where existing regressions do not cover committed-but-lost outcomes and reordered webhook evidence.
- [x] Assess webhook retries and discovery gap using official documentation; document risk and decision before considering a worker.
- [x] Run all requested checks, review the connected code, complete the certification report and make one local commit. No push/deploy/live charges.

## Discovery-gap decision

Razorpay documents exponential retries for 24 hours, at-least-once delivery, five-second acknowledgment timeout and no ordering guarantee. Persistent failure disables the webhook and alerts the operator. Support can replay individual eligible events up to 15 days old. Existing browser reconciliation plus independent webhook retries cover ordinary transient outages. At the current pre-live scale there is no measured loss/backlog justifying a new polling worker: keep the gap explicit and require webhook health/disablement monitoring and operational reconciliation. No numerical failure probability can be certified without production telemetry. A worker would add provider traffic and outage amplification while still requiring operational recovery after its bounded window. Reassess if actual unmatched captures, prolonged outages or volume make manual reconciliation inadequate.

Sources: [Razorpay webhook best practices](https://razorpay.com/docs/webhooks/best-practices/), [webhook FAQ](https://razorpay.com/docs/webhooks/faqs/).
