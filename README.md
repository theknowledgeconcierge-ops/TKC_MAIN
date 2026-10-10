# The Knowledge Concierge

One Next.js 16 App Router / TypeScript application on Netlify using its automatically managed OpenNext adapter. Supabase supplies PostgreSQL and private PDF Storage; Razorpay supplies payments. No separate backend, customer accounts, email provider, CMS, queues or Redis.

The existing editorial design, fonts, covers, responsive pages, motion, bag and checkout review are retained. All five titles are active: **The First Table, The Full Table, Behind the Kitchen Door, The Math Behind the Menu, and Empty Tables to Full House**. Original prices are retained: **1 / 2 / 3 / 4 / 5 books = ₹249 / ₹399 / ₹549 / ₹699 / ₹999**. Eligible first-time buyers receive the **₹499 First50** price for all five books; the server checks purchase history and confirms the payable amount before payment.

The visual source of truth is `src/app/globals.css`: warm paper/brown/gold colors, Playfair Display headings, DM Sans body text and JetBrains Mono labels. Shared controls live in `src/components/ui/`; page compositions live in `src/views/`.

## Local development

Use Node **24** (`nvm use`) and npm:

```sh
npm ci
cp .env.example .env.local
# Fill the values described below when connecting external services.
npm run check:env
npm run dev
```

Open http://localhost:3000. The storefront and build work without credentials; payment/order/download APIs fail safely with configuration errors until configured. Next.js loads `.env.local`; operator scripts load it too. Restart after changing environment values.

| Variable | Value | Exposure |
| --- | --- | --- |
| `APP_URL` | Local: `http://localhost:3000`; production: exact canonical HTTPS origin, no path. Netlify previews automatically use their primary deployment URL | Server configuration; preview origin is non-secret build metadata |
| `SUPABASE_URL` | Supabase project URL | Used only on server |
| `SUPABASE_SERVICE_ROLE_KEY` | Project secret API key (`sb_secret_...`) or legacy service-role key | Secret, server only |
| `RAZORPAY_KEY_ID` | Matching test/live key ID | Server configuration; returned to authorized checkout because Razorpay requires it in the browser |
| `RAZORPAY_KEY_SECRET` | Secret paired with key ID | Secret, server only |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook secret (at least 20 characters); required for production deployments or live Razorpay keys, optional for test checkout in local development/Netlify Deploy Previews and branch deploys | Secret, server only |

No Supabase anonymous key, `NEXT_PUBLIC_*` variables or duplicate Razorpay keys are needed. Never put secrets in public variables. Environment validation is lazy at the server boundary so builds do not need production credentials; `check:env` checks everything explicitly without printing values.

### Netlify preview checkout

Test checkout needs the first five variables above and matched `rzp_test_...` credentials. `RAZORPAY_WEBHOOK_SECRET` can remain unset: callback HMAC verification uses the Razorpay key secret, and the server fetches provider evidence before fulfillment. Confirmation/download requests also reconcile provider state. Webhook requests return 503 until their separate signing secret is configured; they never fall back to the API key secret or an empty key.

Configure Deploy Preview/branch context variables in Netlify with **Builds and Functions** scope (or all scopes). Use isolated Supabase test data and Razorpay test keys; keep production secrets out of untrusted previews. Netlify supplies `CONTEXT` and `DEPLOY_PRIME_URL` during the build. The application embeds only the non-secret context and preview origin, so checkout and secure cookies use the preview's own primary URL even when these platform variables are absent at function runtime. Do not override platform metadata or set `NODE_ENV`. Open the primary preview URL; other deployment aliases deliberately fail the exact-origin check. Production deployments and any use of live keys still require the webhook secret.

Upload all five PDFs before accepting live purchases. A preview with incomplete storage can test checkout/downloads for the uploaded titles; `check:integrations` intentionally continues to fail until all five files exist. Configure and exercise webhook delivery separately before launch.

## Supabase setup: one migration path

For a **fresh Supabase project**, run every file in `supabase/migrations/` once in filename order: `202610090001_storefront.sql`, then `202610100001_purchase_sessions.sql`. Each file is transactional; together they create the tables, constraints, indexes, functions, permissions and private `handbooks` bucket. No dashboard policy editing is needed.

**Existing deployments:** apply only the new `202610100001_purchase_sessions.sql` migration. It renames the old authorization columns to checkout-only names, adds hash-only purchase sessions and permits purchases without email. Coordinate this migration with the new application deployment while checkout is paused: the older application expects the old column names. Existing orders, payments and entitlements remain; old purchase links/cookies no longer authorize downloads. Never rerun the initial migration against an initialized project.

For repeatable CLI deployment, the same migration is compatible with:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Use either SQL Editor or CLI for initial setup, not both on the same project. Subsequent changes should be new versioned migrations. Local PostgreSQL tests use a minimal Storage schema stub; only a real Supabase project can verify its Storage API and platform policies. Prefer separate Supabase projects and Razorpay keys for staging and production. Purchase payment mode is snapshotted; switching keys never relabels old test purchases as live purchases.

### Private PDFs

`public/` contains covers and favicons only. All PDF files and local staging inputs are Git-ignored. `npm run build` checks `public/` before compilation and `.next/static/` afterward, rejecting PDFs (including renamed PDF headers), credential files, symlinks, backups and browser source maps. Netlify's adapter publishes generated public assets, not the repository root or server files. Keep the configured publish directory `.next`; never change it to `.` or copy staging PDFs into public assets. Run `npm run check:assets` for the standalone public-file check.

The SQL migration creates bucket **`handbooks`**, `public=false`, MIME type `application/pdf`, maximum file size 50 MiB. Upload the following **object paths inside that bucket**:

| Local filename | Bucket object path |
| --- | --- |
| `the-first-table.pdf` | `handbooks/the-first-table.pdf` |
| `the-full-table.pdf` | `handbooks/the-full-table.pdf` |
| `behind-the-kitchen-door.pdf` | `handbooks/behind-the-kitchen-door.pdf` |
| `the-math-behind-the-menu.pdf` | `handbooks/the-math-behind-the-menu.pdf` |
| `empty-tables-to-full-house.pdf` | `handbooks/empty-tables-to-full-house.pdf` |

Use Storage dashboard upload or the idempotent uploader:

```sh
npm run storage:upload -- /absolute/path/to/pdfs
npm run check:integrations
```

The uploader checks the private bucket, PDF header, size and existing file checksum; it refuses to replace different contents. Version object paths deliberately when replacing purchased files because orders snapshot them. `check:integrations` performs read-only database, private-file and Razorpay API checks. It does not simulate a payment.

Three original PDFs remain in the ignored local `private-pdfs/` staging directory. They are **not committed or deployed** and will not exist in a fresh clone. The owner subsequently uploaded all five production PDFs to the private bucket; the two filenames with spaces/capitalization were normalized to the exact paths above, with matching content checksums.

**Revoke/delete the old publicly hosted Emergent PDFs before launch.** The application no longer references them, but changing this repository cannot disable copies on external hosting.

## Database and server boundaries

| Table | Purpose and important constraints |
| --- | --- |
| `orders` | Random UUID and unique public reference; unique hashed checkout-only continuation key (7 days), request fingerprint, explicit status/payment mode, INR integer-paise totals, unique provider order/payment IDs, paid timestamp and composite payment relationship |
| `order_items` | Composite `(order_id, product_id)` key; snapshots title, unit price, quantity=1 and private storage path; subtotal checked on creation |
| `payments` | Provider payment ID primary key; order FK; amount/currency, captured/failed/refunded status and bounded refund amount |
| `payment_events` | Unique idempotency key, provider event reference, event type and order/payment FKs; no raw customer/card payload |
| `download_entitlements` | Random UUID; unique `(order_id, product_id)`; item and payment/order FKs; customer, path and revocation timestamp |
| `purchase_sessions` | SHA-256 session hash primary key; order/payment foreign keys, 30-day expiry; issued only after verified fulfillment |
| `rate_limits` | Expiring hashed counters shared by serverless instances; no extra infrastructure |

Provider IDs, token hashes, order items and entitlements have unique indexes. Additional indexes cover paid customer lookup, order/event dates, order payment/event lookup and counter expiry. All seven tables have RLS enabled, no browser policies, and privileges revoked from anonymous/authenticated roles. Only the service role can use commerce tables/RPCs. Storage grants no customer object policies. All privileged code imports `server-only`; the browser never initializes Supabase.

Atomic PostgreSQL RPCs create orders/items, claim gateway creation, bind provider orders and apply payments/events/entitlements. Row locks serialize callbacks and webhooks. Failure rolls back the entire fulfillment transaction, including event insertion, so a webhook retry can fulfill it. Only server-computed prices reach these RPCs.

```text
src/app/                 App Router pages and Node API handlers
  api/orders/            creation, checkout/session reads, resume and reconciliation
  api/payments/verify/   callback signature plus provider verification
  api/webhooks/razorpay/ raw-body webhook verification
  api/downloads/         authorized short-lived PDF access
src/components/          retained storefront, accessible bag/checkout and UI primitives
src/views/               existing customer page layouts
src/lib/catalog/         typed canonical catalogue and server-only PDF mapping
src/lib/commerce/        pricing, schemas and shared types
src/lib/server/          commerce service, Supabase/Razorpay adapters, authorization, HTTP errors
supabase/migrations/     deterministic PostgreSQL and Storage setup
scripts/                 asset guard, environment, upload, integration and SQL test tools
tests/                   domain, service, HTTP, adapters, PostgreSQL and browser coverage
public/                  local covers, favicons; no paid PDFs
docs/                    migration decisions and security/verification evidence
```

## Payment and download lifecycle

1. Browser submits active product IDs, name/mobile, optional email and a random checkout idempotency key. Runtime validation rejects invalid input and ignores browser prices/status. Products are unique, quantity one. This key/cookie can only continue checkout and read limited order status; it never authorizes downloads, even after a webhook marks the order paid.
2. Server calculates canonical pricing and saves purchase snapshots before creating the Razorpay order. Duplicate requests reuse the same internal/provider order. A row-locked creation claim and stable receipt recover lost provider responses.
3. The review receives safe Razorpay checkout information and a checkout-only HttpOnly cookie. Closing checkout leaves it resumable. No purchase link, download session or entitlement is returned before verification.
4. Callback verification checks HMAC-SHA256 using the **stored** provider order ID, then fetches payment/order evidence and verifies IDs, internal association, amount, currency and captured status. One PostgreSQL transaction writes payment/event/order-paid/entitlements. The callback must prove the exact captured payment associated with this purchase; an authorized or failed attempt cannot borrow another attempt's paid status.
5. Only the successful verification route issues a **new independent 256-bit purchase session**. PostgreSQL rechecks paid/captured/unrefunded payment and complete fulfillment before storing its hash. Its value is returned solely in a 30-day HttpOnly, SameSite=Strict cookie with Secure and `__Host-` on HTTPS (localhost HTTP uses a development cookie). It never enters JSON, URLs, localStorage, HTML or client JavaScript state. Transient callback failures retry the same provider proof in memory, at most four attempts.
6. Webhooks verify the unmodified raw body and independently fetch provider evidence; they use the same atomic fulfillment transaction. Reconciliation can also repair payment state. Neither path issues a purchase session or upgrades checkout credentials. Duplicate/out-of-order events cannot duplicate fulfillment or resurrect refunded access.
7. Confirmation URLs contain only an order UUID. Checkout-only reads can show status, but return no entitlements. Only a valid purchase session reveals purchased download controls. Every download validates that session/order, reconciles provider state, then uses one SQL authorization statement to recheck session expiry, paid status, captured/unrefunded payment, entitlement, customer and snapshotted storage path. Only then is a **60-second** Supabase signed URL generated. DB/provider/storage failure fails closed and permits retry.

States: `created → payment_pending → paid`; failed attempts can produce `failed → paid`; any processed partial/full refund produces `paid → refunded` and revokes entitlements. A dismissed popup stays pending because dismissal is not payment evidence.

No accounts or email provider are required; **email is optional**. My purchases stores only non-authorizing order UUIDs and works in the browser that received the verified purchase session. Clearing cookies, changing devices or losing the callback before session issuance requires separately verified recovery. The application deliberately has no URL-token exchange, exported purchase link or token-minting recovery script. A webhook still fulfills a closed-browser payment durably, but its checkout cookie cannot unlock those PDFs. Keep the Razorpay payment reference and contact the seller; do not pay again. Automated cross-device recovery is outside this change and is not claimed implemented.

Already-issued signed URLs remain usable for their 60-second lifetime; downloaded PDFs can be copied. Access control protects private hosting, not DRM.

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

Browser tests start the production build on port 3100, cover desktop/mobile routes, storage, checkout, session isolation and confirmation, and use provider/API fixtures. To use installed Google Chrome instead of bundled Chromium: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. Tests do not certify live Supabase/Razorpay behavior. See [verification and production audit](docs/SECURITY_AUDIT.md).

## Production: exact setup sequence

1. Create a fresh Supabase project; keep staging/test purchases separate.
2. Set the six environment values above in `.env.local` for setup tools. Keep actual secrets out of Git.
3. Apply all unapplied versioned SQL migrations in filename order using the chosen setup path; coordinate the purchase-session migration with deployment as described above.
4. Confirm the migration-created `handbooks` bucket is private; do not add public policies.
5. Supply/upload all five PDFs with the exact paths above. Run `npm run check:integrations` after Razorpay credentials are ready. Revoke old public artifact files.
6. Create matching Razorpay credentials and enable **automatic capture** in Razorpay payment settings. This application deliberately never fulfills merely authorized payments.
7. Choose a **new** webhook secret; never reuse the legacy secret exposed in commit `da62819` (see the [security incident](docs/SECURITY_AUDIT.md#historical-credential-incident)). Register `https://YOUR_DOMAIN/api/webhooks/razorpay` with the configured webhook secret. Subscribe to **`payment.captured`, `order.paid`, `payment.failed`, `refund.processed`**. Test and live dashboards need their own webhook configuration. Keep the secret stable while older deliveries are retrying.
8. Import the repository into Netlify, base directory **`.`**, build **`npm run build`**, publish **`.next`**. `netlify.toml` supplies the build/publish settings; `.nvmrc` selects Node **24**. Allow Netlify to manage the current Next.js/OpenNext adapter automatically; do not install or pin a legacy plugin. Add all six values to Production with **Builds and Functions** scope. Set `APP_URL` to the exact canonical HTTPS origin used by checkout and secure cookies. Initial hosted testing must use test credentials; use context-specific test credentials for Deploy Previews as described above.
9. Review vendor security advisories, then deploy a test-context preview first. No backend process, SPA fallback, persistent disk or worker is required. Sensitive routes use Node, bounded provider timeouts and no-store responses. Public assets are local. Configure Netlify's primary custom domain and HTTPS, update production `APP_URL`, and redeploy after environment changes. See [Netlify deployment and compatibility](docs/NETLIFY_DEPLOYMENT.md) for the preview, runtime limits and domain sequence.
10. Complete the smoke test below in Razorpay test mode, then a small live transaction/refund after configuring live credentials. Verify webhook delivery/retry status in the dashboard. Only then accept customer payments.

**Vendor launch gate (reviewed 10 October 2026):** Next.js announced an upstream security update for 14 October, covering two Critical and one High vulnerability. The announcement does not yet give affected ranges or patches. This repository pins the currently stable Next.js 16.4.0 and has a clean dependency audit, but that does not establish immunity. Check the [official announcement](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026), install the applicable stable patches, rerun this test/build suite and redeploy before taking live payments. Do not infer a fixed version from the absence of npm advisories.

### External smoke test

- `GET /api/health` returns 200/`status: ready`; `npm run check:integrations` passes with actual credentials/files.
- Purchase one book, four books and all five; confirm Razorpay receives 24900, 69900 and either 49900 (eligible first-time buyer) or 99900 (returning buyer) paise regardless of edited browser fields.
- Close/reopen checkout and refresh; confirm the same internal/provider order is reused. Temporarily lose a verification response and verify callback retry. Close the browser before verification: webhook/reconciliation must still mark paid, but must not turn the checkout cookie into download access; separate recovery is required.
- Replay a signed event using Razorpay dashboard replay; verify one entitlement per item and no duplicate payment/fulfillment. Failed delivery must retry after the underlying issue is restored.
- Complete verified payment and download in that browser, then refresh and repeat. Copy its thank-you URL into a clean browser: no purchase/session/download access. Checkout cookies, legacy fragments, wrong/expired sessions, another purchase's entitlement, forged callbacks and spoofed webhooks must fail.
- Download each real PDF; verify correct contents. A copied signed URL expires after 60 seconds, anonymous public bucket paths fail, and no service key appears in browser scripts/network responses.
- Refund a test purchase; confirmation must show refunded and new download requests must fail. Check failure/loading messages and real Razorpay iframe/CSP behavior on mobile and desktop (browser fixtures cannot verify the provider's live assets).

[Migration map](docs/MIGRATION.md) · [Production audit and certification limits](docs/SECURITY_AUDIT.md) · [Customer lifecycle audit and verification matrix](docs/LIFECYCLE_AUDIT.md) · [Netlify deployment](docs/NETLIFY_DEPLOYMENT.md)
