# The Knowledge Concierge

One Next.js 16 App Router / TypeScript application on Vercel. Supabase supplies PostgreSQL and private PDF Storage; Razorpay supplies payments. No separate backend, customer accounts, email provider, CMS, queues or Redis.

The existing editorial design, fonts, covers, responsive pages, motion, bag and checkout review are retained. The repository contained five titles; the requested four-book storefront currently activates **The First Table, The Full Table, Behind the Kitchen Door, and The Math Behind the Menu**. “Empty Tables to Full House” remains inactive metadata. Original prices are retained: **1 / 2 / 3 / 4 books = ₹249 / ₹399 / ₹549 / ₹699**. The old five-book First50 promotion does not apply to four books.

The visual source of truth is `src/app/globals.css`: warm paper/brown/gold colors, Playfair Display headings, DM Sans body text and JetBrains Mono labels. Shared controls live in `src/components/ui/`; page compositions live in `src/views/`.

## Local development

Use Node **24** (`nvm use`) and npm:

```sh
npm ci
cp .env.example .env.local
# Fill the six values described below when connecting external services.
npm run check:env
npm run dev
```

Open http://localhost:3000. The storefront and build work without credentials; payment/order/download APIs fail safely with configuration errors until configured. Next.js loads `.env.local`; operator scripts load it too. Restart after changing environment values.

| Variable | Value | Exposure |
| --- | --- | --- |
| `APP_URL` | Exact origin, e.g. `http://localhost:3000` or your HTTPS production domain; no path | Server configuration |
| `SUPABASE_URL` | Supabase project URL | Used only on server |
| `SUPABASE_SERVICE_ROLE_KEY` | Project service-role key | Secret, server only |
| `RAZORPAY_KEY_ID` | Matching test/live key ID | Server configuration; returned to authorized checkout because Razorpay requires it in the browser |
| `RAZORPAY_KEY_SECRET` | Secret paired with key ID | Secret, server only |
| `RAZORPAY_WEBHOOK_SECRET` | Strong secret you choose when registering the webhook (at least 20 characters) | Secret, server only |

No Supabase anonymous key, `NEXT_PUBLIC_*` variables or duplicate Razorpay keys are needed. Never put secrets in public variables. Environment validation is lazy at the server boundary so builds do not need production credentials; `check:env` checks everything explicitly without printing values.

## Supabase setup: one migration path

Create a **fresh Supabase project**. In its SQL Editor, run the entire contents of [`supabase/migrations/202610090001_storefront.sql`](supabase/migrations/202610090001_storefront.sql) once. This is one transaction that creates all tables, constraints, indexes, functions, permissions and the private `handbooks` bucket. No table design or dashboard policy editing is needed.

For repeatable CLI deployment, the same migration is compatible with:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Use either SQL Editor or CLI for initial setup, not both on the same project. Subsequent changes should be new versioned migrations. Local PostgreSQL tests use a minimal Storage schema stub; only a real Supabase project can verify its Storage API and platform policies. Prefer separate Supabase projects and Razorpay keys for staging and production. Purchase payment mode is snapshotted; switching keys never relabels old test purchases as live purchases.

### Private PDFs

`public/` contains covers and favicons only. All PDF files and local staging inputs are Git-ignored and excluded from Vercel CLI uploads. `npm run build` checks `public/` before compilation and `.next/static/` afterward, rejecting PDFs (including renamed PDF headers), credential files, symlinks, backups and browser source maps. Run `npm run check:assets` for the standalone public-file check.

The SQL migration creates bucket **`handbooks`**, `public=false`, MIME type `application/pdf`, maximum file size 50 MiB. Upload the following **object paths inside that bucket**:

| Local filename | Bucket object path |
| --- | --- |
| `the-first-table.pdf` | `handbooks/the-first-table.pdf` |
| `the-full-table.pdf` | `handbooks/the-full-table.pdf` |
| `behind-the-kitchen-door.pdf` | `handbooks/behind-the-kitchen-door.pdf` |
| `the-math-behind-the-menu.pdf` | `handbooks/the-math-behind-the-menu.pdf` |

Use Storage dashboard upload or the idempotent uploader:

```sh
npm run storage:upload -- /absolute/path/to/pdfs
npm run check:integrations
```

The uploader checks the private bucket, PDF header, size and existing file checksum; it refuses to replace different contents. Version object paths deliberately when replacing purchased files because orders snapshot them. `check:integrations` performs read-only database, private-file and Razorpay API checks. It does not simulate a payment.

Three original PDFs were downloaded into the ignored local `private-pdfs/` directory during migration. They are **not committed or deployed**. The First Table's original source returned HTTP 403; supply that PDF with the exact filename above. Files staged in this workstation will not exist in a fresh clone.

**Revoke/delete the old publicly hosted Emergent PDFs before launch.** The application no longer references them, but changing this repository cannot disable copies on external hosting.

## Database and server boundaries

| Table | Purpose and important constraints |
| --- | --- |
| `orders` | Random UUID and unique public reference; unique hashed access token, request fingerprint, explicit status/payment mode, INR integer-paise totals, unique provider order/payment IDs, paid timestamp and composite payment relationship |
| `order_items` | Composite `(order_id, product_id)` key; snapshots title, unit price, quantity=1 and private storage path; subtotal checked on creation |
| `payments` | Provider payment ID primary key; order FK; amount/currency, captured/failed/refunded status and bounded refund amount |
| `payment_events` | Unique idempotency key, provider event reference, event type and order/payment FKs; no raw customer/card payload |
| `download_entitlements` | Random UUID; unique `(order_id, product_id)`; item and payment/order FKs; customer, path and revocation timestamp |
| `rate_limits` | Expiring hashed counters shared by serverless instances; no extra infrastructure |

Provider IDs, token hashes, order items and entitlements have unique indexes. Additional indexes cover paid customer lookup, order/event dates, order payment/event lookup and counter expiry. All six tables have RLS enabled, no browser policies, and privileges revoked from anonymous/authenticated roles. Only the service role can use commerce tables/RPCs. Storage grants no customer object policies. All privileged code imports `server-only`; the browser never initializes Supabase.

Atomic PostgreSQL RPCs create orders/items, claim gateway creation, bind provider orders and apply payments/events/entitlements. Row locks serialize callbacks and webhooks. Failure rolls back the entire fulfillment transaction, including event insertion, so a webhook retry can fulfill it. Only server-computed prices reach these RPCs.

```text
src/app/                 App Router pages and Node API handlers
  api/orders/            creation, private reads, access, resume, reconciliation, recovery link
  api/payments/verify/   callback signature plus provider verification
  api/webhooks/razorpay/ raw-body webhook verification
  api/downloads/         authorized short-lived PDF access
src/components/          retained storefront, accessible bag/checkout and UI primitives
src/views/               existing customer page layouts
src/lib/catalog/         typed canonical catalogue and server-only PDF mapping
src/lib/commerce/        pricing, schemas and shared types
src/lib/server/          commerce service, Supabase/Razorpay adapters, authorization, HTTP errors
supabase/migrations/     deterministic PostgreSQL and Storage setup
scripts/                 asset guard, environment, upload, recovery, integration and SQL test tools
tests/                   domain, service, HTTP, adapters, PostgreSQL and browser coverage
public/                  local covers, favicons; no paid PDFs
docs/                    migration decisions and security/verification evidence
```

## Payment and download lifecycle

1. Browser submits active product IDs, contact details and a random 256-bit checkout capability. Unknown products/invalid input are rejected; browser amounts/status fields are ignored. Digital products are unique, quantity one.
2. Server calculates canonical tier pricing, saves purchase snapshots and an internal order before contacting Razorpay. Repeated submissions reuse the same order. An atomic creation claim prevents parallel provider calls; the stable receipt recovers provider orders after a lost response or failed database bind.
3. Authorized browser receives only the public key ID, locked provider order and safe checkout information. Pay opens Razorpay's hosted checkout. Closing checkout leaves the order resumable.
4. Callback verification uses HMAC-SHA256 over the **stored** Razorpay order ID plus payment ID. Server then fetches Razorpay payment and order, validates IDs/relationship, internal notes/receipt, amount and currency. `authorized` alone grants nothing; only a captured payment can fulfill.
5. Webhook verification uses HMAC-SHA256 over the unmodified raw body. Signed payload identifies provider records; fetched provider evidence is checked again. Body-derived event keys prevent an unsigned event header controlling idempotency. Duplicate and out-of-order events converge through one SQL transaction.
6. Confirmation reads cookie-authorized server state. On mount, periodic checks and explicit “Check payment status” reconcile against Razorpay when a browser callback/webhook was lost. Failed attempts may later become paid; failed events cannot downgrade paid; any processed partial/full refund revokes the whole purchase. Refunded orders never resurrect on late capture events.
7. Downloads recheck authorization, current provider payment, server status, entitlement, customer and payment relationship. Only then does Supabase create a **60-second** signed URL. Provider/DB failure denies a new download and permits a later retry.

States: `created → payment_pending → paid`; failed attempts can produce `failed → paid`; captured payments can produce `paid → refunded`. A closed popup stays pending because it does not prove failure. No client redirect, session flag, order number or guessed entitlement grants access.

Purchase capability tokens are stored only as SHA-256 hashes in PostgreSQL. HttpOnly, SameSite=Lax cookies last 30 days and are Secure on HTTPS. The checkout retry token may temporarily live in browser storage until creation is confirmed; cart state and purchase UUIDs are never authorization. Recovery links put the token in a **URL fragment**, exchanged for a cookie and removed before order queries. No token is included in server access-log URLs; pages/API use no-store and no-referrer policies. A purchase link is deliberately a bearer secret; customers must keep it private.

No transactional email implementation existed, so none was added. Customers can save a private link **before payment** and on confirmation, and return through My purchases. Entitlements do not expire automatically; purchase access tokens expire after one year. For a lost/expired link, an operator must verify ownership against Razorpay records, then rotate it:

```sh
npm run order:recover -- ORDER_UUID --ownership-verified
```

This invalidates all old links/cookies and prints one replacement secret link for secure handoff. Email knowledge alone is insufficient. Do not paste private links into public tickets/logs. A signed URL can be shared during its short validity, and a buyer can copy a downloaded PDF; the system protects access, not DRM.

## Tests and build

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

`test:db` creates, migrates, tests and destroys a temporary PostgreSQL 16 cluster. On macOS/Homebrew it defaults to `/opt/homebrew/opt/postgresql@16/bin`; set `PG_BIN` to your PostgreSQL binaries elsewhere. Do not run it as root. Alternatively set `TEST_DATABASE_URL` to a **fresh isolated database with Supabase roles and Storage schema already installed**, with `psql` on PATH. **Never point tests at production.** Tests create deliberate failure triggers and sample payments.

Browser tests start the production build on port 3100, cover desktop/mobile routes, storage, checkout, recovery and confirmation, and use provider/API fixtures. To use installed Google Chrome instead of bundled Chromium: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. Tests do not certify live Supabase/Razorpay behavior. See [verification and production audit](docs/SECURITY_AUDIT.md).

## Production: exact setup sequence

1. Create a fresh Supabase project; keep staging/test purchases separate.
2. Set the six environment values above in `.env.local` for setup tools. Keep actual secrets out of Git.
3. Apply the versioned SQL migration using the chosen setup path.
4. Confirm the migration-created `handbooks` bucket is private; do not add public policies.
5. Supply/upload all four PDFs with the exact paths above. Run `npm run check:integrations` after Razorpay credentials are ready. Revoke old public artifact files.
6. Create matching Razorpay credentials and enable **automatic capture** in Razorpay payment settings. This application deliberately never fulfills merely authorized payments.
7. Choose a **new** webhook secret; never reuse the legacy secret exposed in commit `da62819` (see the [security incident](docs/SECURITY_AUDIT.md#historical-credential-incident)). Register `https://YOUR_DOMAIN/api/webhooks/razorpay` with the configured webhook secret. Subscribe to **`payment.captured`, `order.paid`, `payment.failed`, `refund.processed`**. Test and live dashboards need their own webhook configuration. Keep the secret stable while older deliveries are retrying.
8. Import the repository into Vercel with **root directory `.`**, Next.js preset, Node **24.x**. Add all six values to the appropriate environments. Set `APP_URL` to the exact canonical HTTPS domain used by checkout and recovery links. Preview aliases require their own matching `APP_URL` and test credentials; production secrets should not reach untrusted previews.
9. Review vendor security advisories, then deploy. `vercel.json` sets npm ci/build; no backend process, redirects to a backend, persistent disk or worker is required. Sensitive routes use Node, bounded provider timeouts and no-store responses. Public assets are local. Vercel handles HTTP→HTTPS; use one canonical domain matching `APP_URL`.
10. Complete the smoke test below in Razorpay test mode, then a small live transaction/refund after configuring live credentials. Verify webhook delivery/retry status in the dashboard. Only then accept customer payments.

**Vendor launch gate (reviewed 10 October 2026):** Next.js announced an upstream security update for 14 October, covering two Critical and one High vulnerability. The announcement does not yet give affected ranges or patches. This repository pins the currently stable Next.js 16.4.0 and has a clean dependency audit, but that does not establish immunity. Check the [official announcement](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026), install the applicable stable patches, rerun this test/build suite and redeploy before taking live payments. Do not infer a fixed version from the absence of npm advisories.

### External smoke test

- `GET /api/health` returns 200/`status: ready`; `npm run check:integrations` passes with actual credentials/files.
- Purchase one book and then four; confirm Razorpay receives 24900 and 69900 paise regardless of edited browser fields.
- Close/reopen checkout and refresh; confirm the same internal/provider order is reused. Temporarily lose the callback or close the browser after paying; webhook/reconciliation must still mark paid.
- Replay a signed event using Razorpay dashboard replay; verify one entitlement per item and no duplicate payment/fulfillment. Failed delivery must retry after the underlying issue is restored.
- Open a saved private link in a clean browser; verify access. UUID alone, wrong token, another purchase's entitlement, forged callback and spoofed webhook must fail.
- Download each real PDF; verify correct contents. A copied signed URL expires after 60 seconds, anonymous public bucket paths fail, and no service key appears in browser scripts/network responses.
- Refund a test purchase; confirmation must show refunded and new download requests must fail. Check failure/loading messages and real Razorpay iframe/CSP behavior on mobile and desktop (browser fixtures cannot verify the provider's live assets).

[Migration map](docs/MIGRATION.md) · [Production audit and certification limits](docs/SECURITY_AUDIT.md)
