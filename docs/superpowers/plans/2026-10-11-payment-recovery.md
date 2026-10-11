# Payment recovery and support hardening

**Goal:** Captured payments survive browser loss; uncertain customers can check or leave safely without being invited to pay twice.

**Architecture:** Keep the signed callback/session boundary and the independent signed webhook → locked fulfillment → internal email fallback. Reconcile provider evidence before offering payment again. Keep callback proof only in memory; reload without proof uses existing cookies, reconciliation and conditional email/support recovery. No schema, pricing or authorization changes.

**Stack:** Next 16.4, React, TanStack Query, Razorpay, PostgreSQL, Vitest and Playwright.

- [x] Add real-Postgres red regressions for authorized/unknown attempts, repeated create/resume, delayed/duplicate order-only and payment webhooks, interrupted/lost verification, session absence, fallback and refund/failure boundaries.
- [x] Make `reconcile` expose a conservative `payment_retry_allowed` decision from fresh provider reads; require it in create/resume and immediately before opening Checkout. Preserve stale-price refusals and captured/refunded terminal behavior.
- [x] Bound browser verification to 30 seconds including retries; deduplicate in-flight proof checks and retain failed proof only in module memory for Check again/same-document navigation. Never persist proof or exchange query parameters for a session.
- [x] Add verification leave confirmation, delayed/error guidance and Check again. Add static support copy to uncertain/unauthorized, failed/delayed email and failed download states plus relevant FAQ entries. Prevent late callback navigation after an explicit leave.
- [x] Add browser regressions for closing/reloading/Back/Forward/offline/lost responses, no premature Pay, support privacy, and confirmation layout at 320/360/375/390/412/430px and reduced height. Gate older purchase/reconcile responses so they cannot hide a newly verified browser session.
- [x] Run typecheck, lint, unit/API, real-Postgres, production build and full browser suite. Review payment/session/provider and email boundaries. Write the 13-section report with exact copy and remaining live-mode certification limits.
- [x] Commit all focused work on `codex/payment-recovery-hardening`. Do not push or deploy.
