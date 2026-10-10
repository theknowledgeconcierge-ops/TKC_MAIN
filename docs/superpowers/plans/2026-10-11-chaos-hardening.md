# Mobile and commerce resilience implementation plan

**Goal:** Keep the complete mobile purchase journey deterministic under retries,
reloads, multiple tabs and uncertain provider responses, in one local commit.

**Architecture:** Retain the existing Next route/service/Postgres RPC boundaries.
Use durable database claims and provider keys for correctness, and immediate
client refs for feedback. Preserve hash-only purchase sessions and authoritative
payment/pricing/entitlement checks. Production investigation is read-only.

**Tech stack:** Next 16.4, React 19, PostgreSQL 16, Vitest, Playwright/Chrome.

- [x] Match production Resend history to `email_deliveries` using message IDs;
  report only anonymous aliases and aggregate counts.
- [x] Add red real-Postgres regressions to `tests/database/lifecycle.test.ts`
  for unknown-outcome address changes, expired provider deduplication, 10 sends,
  5 simultaneous sends, fallback races, lost finish response and repeat verify.
  Run `npm run test:db` before changing production code.
- [x] Add an additive SQL migration to fence unknown email outcomes and stop
  sends before Resend's 24-hour key expiry. Update delivery types, repository
  error mapping, service view and correction controls. Keep same keys on retries.
- [x] Audit all state-changing routes and state machines. Reuse an existing
  valid purchase cookie on verification. Fix only proven rate-limit weaknesses;
  test 429/Retry-After and concurrent limits with real SQL.
- [x] Add browser regressions for 10 taps, immediate email/download/resume guards,
  multi-tab checkout, reload states, Back/Forward and offline recovery. Serialize
  same-browser checkout-attempt storage with Web Locks where supported; retain
  the stable durable checkout key through lost responses.
- [x] Run typecheck, lint, all unit/API and database tests, production build and
  complete desktop/mobile browser suites. Review the final server diff. Extend
  `docs/MOBILE_RESPONSIVENESS_AUDIT.md` with the idempotency matrix, anonymous
  production investigation, failures, exact results and physical-phone checks.
- [x] Amend the existing local mobile commit to contain the combined work;
  verify one commit above `993d9b2` and a clean tree. Do not push or deploy.
