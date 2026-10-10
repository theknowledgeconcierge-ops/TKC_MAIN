# Production audit — 10 October 2026

Scope: current Next.js application, HTTP boundaries, browser state, Supabase adapter and SQL transaction logic, Razorpay integration, private Storage delivery and deployment configuration. Includes an independent read-only security review of payment/download code and regression tests for its finding. The initial review used no external credentials or customer records; subsequent owner-authorized integration checks are recorded below. The cleanup additionally inspected every repository path, all 12 reachable pre-cleanup commits and their 222 unique tracked file versions, plus commit messages. No history was rewritten.

## Certification

- **CODE-CERTIFIED:** implementation, pricing, input validation, cryptography, authorization, idempotency and state transitions tested locally; actual PostgreSQL migration and transaction invariants tested on PostgreSQL 16; production build/browser flows tested with external API fixtures. This label is scoped evidence, not a guarantee against every vulnerability.
- **CREDENTIAL-BLOCKED:** Razorpay rejects the locally configured test key pair with 401 Unauthorized, and the webhook secret is not yet configured. Real capture, refunds and webhook delivery/retry remain unverified. `npm run check:integrations` passes its database/private Storage checks, then fails Razorpay authentication.
- **PRODUCTION-VERIFICATION:** owner revocation of old public artifact files; vendor security patch applicability and upgrade; canonical domain/Vercel environment configuration; deployed paid Supabase commerce flow, real provider checkout/CSP behavior and production smoke test. Direct private Storage signing/retrieval/expiry has been checked with the configured project; the complete real-payment flow remains gated.

### Subsequent deployment preparation

Read-only checks with owner-supplied credentials confirmed the six tables and expected RPCs are available, the `handbooks` bucket is private, and anonymous table access is denied. All five expected PDFs are now present. Two uploaded filenames were normalized to the existing canonical paths, with SHA-256 checks confirming unchanged PDF contents. Private Storage and anonymous-public-access checks passed for all five objects. These checks do not certify real payment, webhook, refund or entitlement-authorized signed-download behavior.

Test credentials may now omit the webhook secret in local development and Vercel Preview only. Production deployments and live keys still require it. Callback verification and provider reconciliation retain all payment/amount/currency checks. An unconfigured webhook rejects requests with 503 before provider/database access, including signatures made with an empty key or the API key secret. Environment-policy and commerce regression tests cover these boundaries.

Follow-up verification: TypeScript, lint, all **104** unit/API/adapter/domain tests, **57** PostgreSQL tests, production build and **28** desktop/mobile browser tests passed. Coverage now includes all 31 non-empty title combinations through real route handlers, commerce service, both HTTP adapters and PostgreSQL with external HTTP fixtures; returning-buyer pricing from actual database history; concurrent callbacks/webhooks; lost provider/bind/commit responses; and per-title delivery with storage failure/retry. Browser assets were checked against configured privileged credentials with no matches. `npm audit --json` reported zero advisories. A read-only Razorpay Orders API authentication check returned **401 Unauthorized** for the supplied test key pair; replace/recheck the matching Test Mode credentials before external checkout testing. No real payment was attempted. See the [customer lifecycle matrix and evidence](LIFECYCLE_AUDIT.md).

## Findings fixed in code

| Severity | Finding | Resolution and evidence |
| --- | --- | --- |
| CRITICAL | Legacy public paid-PDF paths bypass purchase authorization | Removed from all production source and public assets. Private bucket, server-only object paths, order capability plus entitlement, provider payment check and 60-second signed URLs. External copies require owner action below. |
| HIGH | Browser/session success could be treated as a completed purchase | Session-order state removed. Cookie-authorized order reads and server reconciliation; forged browser-state browser regression grants no downloads. |
| HIGH | Client-side totals/status could be manipulated | Server catalogue/tier pricing only; runtime schemas discard untrusted price/status fields. Provider order and payment amount/currency/relationship are checked before fulfillment. |
| HIGH | Recording webhook receipt before fulfillment could swallow a failed delivery | Event, payment, state and entitlements now commit in one row-locked PostgreSQL transaction. Real SQL test forces a failure after event/payment writes and proves rollback and successful retry. |
| HIGH | UUID alone is inadequate download authorization | 256-bit purchase capability, hash-only DB storage, expiry/rotation, HttpOnly cookie and per-order entitlement checks. Wrong owner/order/entitlement tests deny access. |
| MEDIUM | Provider order creation can succeed while its response/bind fails | Stable unique receipt lookup, persistent internal order, bounded API timeout and atomic creation claim. Lost response and failed bind tests reuse one provider order. |
| MEDIUM | Delayed provider refund reads could acknowledge a refund webhook without revocation | Independent reviewer finding reproduced and fixed: return retryable error until fetched refund evidence exists; a later retry revokes entitlements. Every new download also fetches current provider state. |
| MEDIUM | Switching test/live credentials could relabel existing purchases | Persist payment mode with each order; original mode remains visible and cross-environment payment operations fail safely. Regression test passes. |
| MEDIUM | Native checkout dialog could block the body-mounted Razorpay iframe | Close native review synchronously before opening the gateway; restore on dismissal/open failure, keep it suppressed during provider retries. Browser fixture covers thrown open, payment failure, dismissal, reopen and success. |
| LOW | Invalid product slugs could stream a not-found view with HTTP 200 | Limit dynamic catalogue parameters and remove the root loading boundary that flushed headers before validation. Browser regression asserts the actual 404 response. |
| LOW | Browser storage exceptions, inaccessible overlays and stale placeholder promises | Failure-safe cart storage, native modal focus/escape handling, meaningful confirmation/loading/errors; no fake email delivery or mocked-payment promises. |

## Attempted loopholes

| Attempt | Enforced result |
| --- | --- |
| Change ₹249 to ₹1 in DevTools/request | HTTP schema strips submitted totals; server sends 24900 paise from catalogue/pricing |
| Supply inactive/unknown book or malformed IDs | Runtime validation rejects before order creation |
| Forge callback/redirect/session paid flag | HMAC and current provider evidence required; session state is ignored |
| Use another purchase UUID without its token | Uniform private-purchase 404; no customer details or signed URL |
| Combine valid purchase cookie with another entitlement | Order-specific entitlement/customer/payment association rejects it |
| Replay webhook, change unsigned event header, send repeated paid event | Signed-body-derived idempotency plus unique item entitlement and row-locked state machine; no duplicate fulfillment |
| Concurrent callback and webhook with different keys | Real SQL test stores all eight event records and one entitlement |
| Fail DB after inserting event/payment | Entire transaction rolls back; retry succeeds |
| Send failed event after paid, or captured event after refund | Paid cannot downgrade to failed; refunded access stays revoked |
| Obtain a permanent public PDF URL | No paid PDFs under `public/`; bucket is private; new signed URL expires after 60 seconds |
| Expose service-role/payment secrets through browser bundle | Server-only import boundaries, no public secret variables; compiled browser assets scanned; no secret environment names or legacy artifact hosts found |
| Cross-origin POST, unsafe redirect, oversized/malformed input | Exact-origin enforcement, no arbitrary redirect target, streaming byte caps and runtime schemas |
| Refresh/close checkout or lose callback | Persisted internal order, creation recovery, My purchases and server reconciliation; browser is never payment authority |

## Historical credential incident

**HIGH — Razorpay webhook secret committed in history.** Commit `da62819` contains a literal webhook secret in its message. Treat it as compromised: rotate it in the relevant Razorpay dashboard and matching deployment environment, verify webhook delivery with the replacement, and never reuse it for this deployment. The value is deliberately omitted here. History remains unchanged; removing current files cannot revoke a credential. Rotation and provider verification require the account owner. Any later coordinated history sanitation is a separate explicit operation, after rotation.

Gitleaks 8.30.1 (official binary, checksum verified) scanned all reachable Git diffs and a separate snapshot of current files; commit messages and historical blobs were also inspected with redacted, credential-focused checks. Its file-content findings were the public shopping-bag storage key, a non-secret constant. Historical `Emergent-Commit-Key` message trailers were also flagged; their authorization significance is unknown. Have the former platform owner confirm/revoke any associated automation access. No additional Supabase/service-role, Razorpay API credential, database password, private purchase token or actual customer export was found. Only `.env.example` is tracked in history. These scans cannot establish that credentials were never shared elsewhere.

## Repository safeguards

- One root npm lockfile and Next.js deployment; no legacy runtime configuration or duplicate catalogue API.
- PDFs are ignored globally; staging PDFs remain outside public paths and are excluded from Vercel CLI uploads. Build checks inspect both `public/` and generated browser assets and reject renamed PDFs, environment/credential files, root/nested symlinks, dumps/archives and source maps. Regression tests exercise the guard and every privileged module's `server-only` marker.
- Production browser source maps are explicitly disabled. Service-role/Razorpay secret operations remain in guarded server modules; Vitest's `server-only` stub is confined to test configuration. No production test bypass or debug route exists.
- Environment schema, template and operator instructions use the same six server variables; no anonymous client or `NEXT_PUBLIC_*` secret configuration exists. Operator recovery output intentionally contains a private link for secure handoff; application logs contain only error codes, request IDs or invalid configuration field names.
- Public artwork and icons were traced before removing unused assets. Database migrations, transactional RPCs, entitlement checks and payment calculations retain the certified contract.

## Remaining findings / launch gates

**CRITICAL — external legacy PDFs remain publicly retrievable.** Three original PDF sources were accessible during the 9 October migration audit and were staged in ignored local files; the first source returned 403. The new app has no links to the old paid objects, but cannot revoke their hosting. The owner must delete/restrict all previously published paid PDF artifacts and verify their old URLs no longer serve the files before launch. Repository history may still contain those URLs; changing current source is not revocation.

**CRITICAL/HIGH — upstream advisory requires release review, applicability not yet published.** On 8 October Next.js announced a planned 14 October update for two Critical and one High vulnerability in upstream dependencies. The current stable pin is Next.js 16.4.0. No affected range or fix is published in the announcement, so we cannot establish whether this application is affected or claim it is patched. Check the [official announcement](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026), apply the applicable stable fixes and repeat validation before live payments. `npm audit` reporting zero vulnerabilities is not evidence that these unpublished issues are resolved.

**MEDIUM — legacy automation metadata.** Historical `Emergent-Commit-Key` trailers require former-platform owner review as described above; no such configuration is used by the application.

**MEDIUM — operational availability and purchase recovery.** Downloads deliberately fail closed when Razorpay or Supabase cannot confirm access. Customers retry when service returns. There are no accounts or email recovery; loss of both browser cookie and saved private link requires an operator to verify ownership and rotate a link. This is documented in checkout/confirmation and the README. A webhook delivery outage requires dashboard retry/replay; no queue is needed for transaction durability, but provider retries are finite. Use Vercel error logs and Razorpay delivery status for failed integration requests. No sensitive payloads are logged.

**LOW — expected bearer-access limitations.** A customer who deliberately shares their private purchase link shares access; a signed URL remains usable for up to 60 seconds even if a refund/rotation happens meanwhile. Downloaded PDFs can be copied. These are explicit digital-download boundaries, not permanent public hosting or an authorization bypass.

No unresolved application-code Critical/High issue was confirmed by the final review. Live launch is still gated on the external actions above and credential-backed verification; do not represent this audit as a real-payment certification.

## Verification evidence

Run from the repository root using Node 24.21.0 and the committed lockfile:

| Command | Result |
| --- | --- |
| `npm ci` | Passed from the committed lockfile; no package upgrades |
| `npm run check:assets` | Passed; no unsafe public assets |
| `npm run typecheck` | Passed; no TypeScript errors |
| `npm run lint` | Passed; warnings denied |
| `npm test` | 104 passed across six domain/service/HTTP/adapter/repository/environment suites |
| `npm run test:db` | 57 passed; actual versioned migration applied to fresh temporary PostgreSQL 16, then cluster destroyed; includes database-backed route/SDK/adapter lifecycle tests |
| `npm run build` | Passed; Next.js 16.4.0 production build, all app/API routes compiled |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 28 passed across desktop/mobile projects, including one-through-five-book purchase, lost callback, refresh and every purchased PDF download with external fixtures |
| `npm audit --json` | 0 critical / high / moderate / low / info advisories |
| `npx --yes --package=knip@6.41.0 knip --reporter json` | Passed; no unused dependencies, files, exports or unresolved imports |
| `git diff --check` | Passed |

Unit/API/provider fixtures use mocks. The added database lifecycle suite runs the real handlers, service and adapters, forwarding its Supabase HTTP fixture into actual PostgreSQL with the actual migration and a small test-only Supabase roles/Storage schema stub. Browser fixtures test the app's payment/download wiring and recovery, not Razorpay's hosted UI or a real card transaction. Direct application-adapter signing on the configured Supabase project retrieved all five complete PDFs (HTTP 200, byte counts matching Storage metadata, PDF header/end marker present), plus Range/attachment responses; anonymous public paths were denied, and a 60-second signed URL was rejected after expiry (HTTP 400). No capability URLs or secrets were logged. A deployed paid transaction, provider webhooks and customer-side PDF content review remain outstanding.

## Primary implementation references

- [Razorpay Standard Checkout verification and capture](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay raw webhook signatures, duplicate delivery and ordering](https://razorpay.com/docs/webhooks/validate-test/)
- [Razorpay receipt-filtered order lookup](https://razorpay.com/docs/api/orders/fetch-all/)
- [Supabase private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase expiring signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
