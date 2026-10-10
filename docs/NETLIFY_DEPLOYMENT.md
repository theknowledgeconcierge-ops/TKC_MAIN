# Netlify deployment — 10 October 2026

README is the setup entry point. This records the provider-specific checks and deployment gates. The application remains Next.js 16.4.0 / TypeScript, Supabase PostgreSQL/private Storage and Razorpay. There are **five active titles**; this deployment migration changes no catalogue, pricing, UI, payment, entitlement or SQL behavior.

## Compatibility and minimal migration

[Netlify's supported Next.js deployment path](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) automatically uses the OpenNext adapter for Next.js >=13.5. No documented 16.4.0 blocker was found. The exact locked application also passes an offline Netlify build using adapter 5.16.2. That verifies compilation/packaging, not execution on a hosted Netlify deployment. The public linked upstream E2E report is older than this Next.js version and is not treated as exact-version certification.

| Existing dependency/feature | Actual use | Netlify treatment |
| --- | --- | --- |
| Deployment JSON and CLI exclusion file | Build/framework selection; legacy upload exclusions | Removed; minimal `netlify.toml` selects build/publish, asset guard protects public outputs |
| Provider-specific preview environment | Optional webhook secret for local/test preview only | Non-secret `CONTEXT` becomes compiled `DEPLOY_CONTEXT`; production and live keys still require the secret |
| `APP_URL` | CSRF origin, secure cookie and recovery-link origin | Production/local use operator value. Deploy Preview/branch builds validate and embed `DEPLOY_PRIME_URL`; never trust an arbitrary request Host |
| App Router, RSC, dynamic pages and dynamic product route | Used, including nonce-bearing server rendering | Supported by adapter; no SPA fallback or extra routing rules |
| Route Handlers, cookies, Web Request/Response and Node crypto | All payment/download APIs explicitly Node; private responses no-store | Netlify Node server function; no API moved to Edge |
| `proxy.ts` | CSP nonce and security headers; no FS/native-addon imports | Adapter packages it as Edge middleware with Node shims; only global crypto/Buffer/Headers are used |
| `next/image` | Not used; cover assets use ordinary images | Supported by adapter, no image configuration change needed |
| Redirects/rewrites | No custom framework redirects/rewrites | No deployment rules or SPA fallback needed; configure canonical-domain redirect in Netlify |
| Headers | Next security headers plus proxy CSP | Keep existing framework configuration; verify actual hosted responses during preview smoke test |
| Database/storage adapters | Supabase HTTPS SDK, no persistent local state | Unchanged, Node server-only modules; no direct browser Supabase client |
| Next.js upstream packages | Normal framework dependencies | Retained; an upstream optional telemetry package is not a deployment dependency |

`netlify.toml` contains only `command = "npm run build"` and `publish = ".next"`. `.nvmrc` and package engines already select Node 24. No new application dependency, plugin pin, function wrapper, backend or database migration is required. Netlify transforms the Next build into its server function, Edge middleware and static assets. Do not publish the repository root or `.next/server` separately.

## Environment and preview policy

Exactly six operator variables remain: `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. See `.env.example` and README for formats. Configure them using Netlify's UI/CLI/API with **Builds and Functions** scope, or all scopes. Secret values are never placed in TOML, Next.js `env`, or `NEXT_PUBLIC_*` variables.

[Netlify context and primary deployment URLs are build-time metadata](https://docs.netlify.com/build/configure-builds/environment-variables/); they are not both present in the [function runtime environment](https://docs.netlify.com/build/functions/environment-variables/). `next.config.ts` therefore embeds only `DEPLOY_CONTEXT` and, for previews, the validated HTTPS preview `APP_URL`. Explicit reads in the server environment validator preserve those build substitutions. These two non-secret metadata values are not additional operator settings. Credentials remain runtime server values. Do not override `CONTEXT`, `DEPLOY_CONTEXT`, `DEPLOY_PRIME_URL` or `NODE_ENV`.

Use context-specific test Supabase credentials and matched `rzp_test_...` keys for Deploy Previews/branch deploys. Do not let production credentials reach untrusted PR builds. Test previews may omit the webhook secret; the webhook then fails closed with 503, while signed callbacks and provider reconciliation still verify payments. Production-context builds and all live keys require the webhook secret. To test real webhook delivery on a preview, configure its separate test webhook secret and ensure deployment protection allows Razorpay to reach that endpoint.

Use the connected Git build for deployment. The adapter deliberately copies local `.env*` files into its **private server function** when they exist during a local CLI build. These files are not static/browser assets, but uploading local build artifacts can unnecessarily upload local credentials too. Git ignores those inputs; a fresh Netlify Git build receives secrets through dashboard environment variables. Do not upload the local `.netlify/` directory or reuse offline artifacts for production. A separate credential-free adapter build was checked without `.env.local`, then the original local file was restored.

Open the primary preview URL, not a different immutable deploy permalink: exact-origin CSRF checks deliberately reject other origins. Production uses the canonical `APP_URL`, never a preview URL. Redeploy after environment or primary-domain changes so both generated middleware and server functions use the same configuration.

## Runtime and security checks

- Create order: browser → Node Route Handler → server price/snapshots → Supabase RPC → Razorpay Orders HTTPS API → bind provider order. No runtime-specific SDK is involved.
- Verify callback: stored Razorpay order ID plus payment ID → Node `createHmac`/`timingSafeEqual` → fetched order/payment validation → atomic fulfillment RPC. Client success alone grants nothing.
- Webhook: bounded **raw bytes** from `request.body.getReader()` → HMAC verification → JSON parsing → provider evidence → same fulfillment RPC. The body is never reconstructed before signature verification. Duplicate events remain idempotent.
- Confirmation/recovery: authorized cookies, real server state and provider reconciliation; no local success flag. Pending orders survive callback loss/browser closure.
- Download: valid purchase capability → captured payment → matching entitlement/customer/payment → private Storage signing, **60 seconds**. PDF bytes transfer directly from Supabase, outside Netlify functions. RLS, private bucket and service-only RPCs are unchanged.
- Existing CSP permits the Razorpay checkout origins; nonce handling, HSTS, nosniff, frame protection and no-referrer headers are retained. Browser source maps are disabled. Public asset guards run before/after every application build. Secrets and paid PDFs are not public assets.

[Netlify synchronous functions have a 60-second limit and 6 MB buffered payload limit](https://docs.netlify.com/build/functions/configuration/); streamed responses allow 20 MB. Our JSON body caps are 16 KiB and 64 KiB for webhooks. APIs return small JSON; PDFs never pass through a function. Existing `maxDuration = 60` declarations do not increase Netlify's limit. Build/function Node selection follows the existing [Node configuration](https://docs.netlify.com/build/configure-builds/manage-dependencies/).

Razorpay requests time out after 12 seconds each; Supabase requests after 10 seconds each. Several sequential operations, or reconciliation of multiple failed payment attempts, can exceed 60 seconds during sustained downstream slowness. A host timeout may return its generic error instead of application JSON. This is an availability limit, not a grant of paid access: persisted internal orders, receipt recovery, transactional fulfillment and idempotent retries remain the recovery path. Exercise slow/lost-response retries on the hosted preview, monitor function errors, and replay webhook deliveries after an outage. No queue or worker is justified by normal short requests.

## Deployment sequence

1. Complete README's Supabase migration/private uploads and read-only integration checks. Use test services first; never point database tests at the production project.
2. In Netlify, import the existing Git repository. Base directory `.`, build `npm run build`, publish `.next`; Node 24 comes from `.nvmrc`. Leave the automatically managed Next.js adapter enabled. Do not add `_redirects` SPA rules or a legacy plugin pin.
3. Before triggering a build, configure the six variables with Builds and Functions scope and context-specific credentials. If initially creating a main-branch deployment, keep test credentials and a fresh webhook secret until verification is complete. For preview testing use a PR Deploy Preview/branch deploy with isolated test credentials. The application obtains its preview origin automatically.
4. Trigger a **Deploy Preview** from a trusted PR after the owner publishes the local commit, or use an authorized test branch. This task does not push or publish production. Keep preview access protected as appropriate; provider webhooks must be allowed to reach their endpoint when exercising delivery.
5. In the build log, confirm Next.js 16.4.0, Node 24, current OpenNext runtime, server function and middleware packaging. Check `GET /api/health`, direct refreshed storefront/product routes, one/multiple-book bag and checkout. Confirm invalid-origin/order requests and unauthenticated downloads fail safely; a missing/invalid webhook signature must never fulfill.
6. Run README's test payment, callback-loss/refresh, webhook replay, private-link recovery, every-title download, expiry and refund smoke tests. Check Function logs and Razorpay delivery status; do not log capabilities, signed URLs, webhook bodies or secrets. Inspect public browser assets for credential leakage.
7. Add the production custom domain in Netlify Domain management, configure the displayed DNS records and obtain HTTPS. Make it the primary domain, redirect alternate domains, set production `APP_URL=https://YOUR_CANONICAL_DOMAIN` with no path, and redeploy. Keep canonical checkout/confirmation/recovery requests on that origin.
8. In the matching Razorpay dashboard enable automatic capture. Create `https://YOUR_CANONICAL_DOMAIN/api/webhooks/razorpay` with a fresh >=20-character signing secret matching production `RAZORPAY_WEBHOOK_SECRET`; subscribe to `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`. Configure test/live separately and never reuse the compromised historical webhook secret.
9. Configure matched live Razorpay keys only after test verification and the documented security launch gates. Perform a genuine production purchase → captured payment → provider webhook → paid DB state → one entitlement per item → all purchased PDF downloads, then a controlled refund. This is the evidence required for **PRODUCTION-VERIFIED**.

## Verification scope

Local compilation, regression tests and offline Netlify adapter packaging are **CODE-CERTIFIED** evidence. Read-only integration checks prove connectivity, private object presence and API authentication only. Without Netlify authentication no hosted preview was deployed; **DEPLOYMENT-VERIFIED** is not claimed. Real webhook signing/delivery and captured payment/refund remain external gates; **PRODUCTION-VERIFIED** is not claimed. See the security and lifecycle audits for historical external risks and the full unchanged purchase path.

| Local command/check | Result |
| --- | --- |
| `npm ci` | Passed; committed dependency versions/lockfile unchanged |
| `npm run typecheck` / `npm run lint` | Both passed; warnings denied |
| `npm test` | 118 passed, seven files; 14 new Netlify environment/config regressions |
| `npm run test:db` | 57 passed, two files; temporary PostgreSQL 16, actual unchanged migration |
| `npm run build` | Passed, Next.js 16.4.0, all pages/APIs and asset guards |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 28 passed; production Next server, desktop/mobile, external fixtures |
| `npm audit --json` | Zero advisories, all severities |
| `npm run check:env` / `npm run check:integrations` | Both passed; latter is read-only with configured services |
| `npx --yes netlify-cli@27.12.0 build --offline --context production` | Passed; automatically selected OpenNext 5.16.2, Node 24 server function, Edge middleware |
| `npx --yes netlify-cli@27.12.0 build --offline --context deploy-preview` | Passed; CLI supplies a placeholder primary preview URL offline |
| Compiled preview runtime probe | 10 checks passed without runtime platform metadata: preview/prod-origin separation, three API validation paths, raw-body signature/tamper checks, security headers and missing webhook-secret rejection; no external writes |
| Public output and credential sweep | 8 public, 37 compiled static and 45 adapter-published files checked: zero configured privileged credential matches. Asset guard rejects PDFs/private files/maps; no paid PDFs or environment files in the credential-free function package |
| Current credential history comparison | 458 Git objects checked against configured privileged credentials, no matches; the separately documented historical webhook-secret incident still requires rotation |

The previous certified repository actually had 104 unit/integration, 57 PostgreSQL and 28 browser tests; the older 64/8/14 baseline in the brief was superseded before this migration. No tests were removed or disabled. An optional `netlify serve --offline` attempt selected the CLI's generic static server without automatically loading the unlinked site's Next adapter; it was stopped and is not counted as runtime verification. Use the successful offline adapter build for packaging checks and a linked hosted preview for deployment verification.
