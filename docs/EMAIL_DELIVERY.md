# Post-purchase email delivery (V1)

After a verified payment the buyer can download immediately in the purchasing browser and, independently, have the PDFs of that paid order emailed as attachments. Email is V1 cross-device delivery and recovery. There are no accounts, passwords, OTPs, magic links, customer library or bearer purchase URLs.

## Authorization boundary

The thank-you URL (`/thank-you?order=<uuid>`) is never a credential. Every protected operation requires the existing `__Host-`/Secure/HttpOnly/SameSite=Strict purchase-session cookie for that order:

| Operation | Endpoint | Server checks |
| --- | --- | --- |
| View delivery email/state, entitlements | `GET /api/orders/{id}`, `POST /api/orders/reconcile` | Session exists, belongs to the order, unexpired, matches the paid payment; delivery state is returned only for `paid` + session |
| Confirm, correct, send, retry | `POST /api/orders/delivery` `{ order_id, email? }` | Same-origin, rate limit (10/min per client+order), session checked before any lookup, fresh Razorpay evidence (refund/contradiction blocks), then the session is rechecked inside the locked SQL transition |
| Download | `POST /api/downloads` | Unchanged: session + paid + fresh provider evidence + entitlement, 60-second signed URL |
| Close-tab fallback | `POST /api/internal/email-deliveries` | `Authorization: Bearer EMAIL_DELIVERY_CRON_SECRET` (constant-time compare; 404 otherwise, 503 when unset). No browser access |

A copied URL in Incognito, another browser or device receives a 404 and the page shows only "This purchase is not available in this browser…" with **Return to store** — no name, email, mobile, entitlements, signed URLs or delivery controls. The client only names its order and an optional corrected address; it can never choose files.

## Data model (`202610100002_email_delivery.sql`)

- `orders.customer_email` remains the immutable **checkout email** (still nullable for historical orders; not altered).
- `email_deliveries`, one row per paid order (`unique(order_id)`): `delivery_email`, `email_version`, `delivery_email_confirmed_at` (buyer confirmed/corrected), `delivery_email_locked_at` (set only on SENT), `status`, `provider`, `provider_message_id`, `attempt_count`, `idempotency_key` (unique), `claim_token`, `lease_expires_at`, `last_error` (payload-free code), `created_at`, `updated_at`, `sent_at`, `failed_at`.
- Constraints enforce the state invariants: SENDING ⇔ claim token + lease; SENT ⇔ locked, with `sent_at` and provider message ID; FAILED requires `failed_at` and an error code; lowercase address; at most 5 attempts and 5 address versions.
- RLS enabled, no browser policies; table and RPCs are service-role only (anonymous/authenticated access is tested to fail).

## State machine

```
(no row) ──confirm/correct (session) or fallback──▶ PENDING ──claim──▶ SENDING ──provider accepted──▶ SENT (locked, terminal)
                                                       ▲                 │
                                                       │                 └─provider error/timeout──▶ FAILED
                                                       └──── retry (session; or fallback if never confirmed) ◀──┘
SENDING with an expired lease (crashed/timed-out worker) is reclaimable with the same idempotency key.
```

- Claims run in `tkc_claim_email_delivery` / `tkc_claim_fallback_deliveries` under row locks (`for update`, `skip locked` for the batch); only one caller can move a row to SENDING. Concurrent requests or double clicks receive `in_progress`/`sent` and never a second send. A request after SENT returns the locked state; a different address after SENT is `409 DELIVERY_LOCKED`.
- Only the current claim holder may record the outcome (`tkc_finish_email_delivery` matches `claim_token`); a stale worker's result is ignored.
- The idempotency key is stable per address (`pnp-delivery-<delivery-id>-v<email_version>`). A retry after a timeout or lost response reuses it, so if Resend already accepted the first request it returns that email instead of sending again (Resend keeps keys for 24 hours). Correcting the address increments the version, producing a new key.
- Email failure never changes the order, payment or entitlements. Order stays PAID; downloads continue.
- Bounds: 5 attempts per delivery (buyer retries), 3 automatic attempts for the fallback, 15 minutes between automatic retries, 120-second lease, 5 address changes. No recursive retries.

## Attachments

The server derives attachments from: purchase session → paid order → `order_items` → active `download_entitlements` for the order's payment → canonical `pdfPaths` mapping (mismatch fails) → private Supabase Storage read with the service role (`GET /storage/v1/object/handbooks/...`). Every purchased item must have its entitlement or the send fails; books are never silently omitted. Each file must start with `%PDF-`. No signed or public URL is created for email, and the bucket stays private.

Resend's documented limit is **40 MB per email including Base64-encoded attachments** ([attachments](https://resend.com/docs/dashboard/emails/attachments)). The implementation caps encoded attachments at 38 MB for headroom. The five current PDFs total about 6.5 MB raw (about 8.6 MB encoded). An order exceeding the cap fails as `attachments_too_large` while downloads remain available.

## Resend integration

`src/lib/server/email.ts` is the only Resend caller (`EmailProvider` interface). It posts to `https://api.resend.com/emails` with `Authorization`, `Idempotency-Key` and an explicit `User-Agent` (required by Resend). Errors map to codes only: `provider_timeout` (unknown outcome), `provider_unavailable` (5xx), `provider_rate_limited` (429), `provider_busy`/`provider_conflict` (409 idempotency responses), `provider_rejected` (other 4xx, e.g. unverified domain). Addresses and payloads are never logged. Subject: "Your Pixel n Palm books are here 📚"; body lists the titles, a short order reference (`TKC-XXXXXXXX`, not the internal UUID), the amount paid and the Razorpay payment reference. Customer text is HTML-escaped.

Without `RESEND_API_KEY`, delivery requests return `503 EMAIL_UNAVAILABLE` without changing state, the fallback endpoint returns 503, and checkout/downloads are unaffected. Tests use an injected provider or a Resend HTTP fixture; automated tests never send real email.

**Resend webhooks: deferred.** API acceptance (an email ID) is recorded as SENT. Delivery webhooks would mainly add bounce visibility; they need a second public endpoint, Svix signature verification and another secret, and would not change authorization. V1 already confirms the address twice (checkout review and post-purchase confirmation), and browser downloads remain available. Revisit after launch if bounces are observed.

## Close-tab / callback-loss fallback

Problem: payment captured → webhook fulfils → buyer closes the tab before confirming the delivery email.

Mechanism (no new infrastructure): `netlify/functions/email-delivery-fallback.ts` is a **Netlify Scheduled Function** (`export const config = { schedule: "*/5 * * * *" }`). Netlify runs scheduled functions only on the **published production deploy** (not previews or local builds). Every 5 minutes it POSTs to `${APP_URL}/api/internal/email-deliveries` with the bearer secret and a 25-second timeout. The route claims up to 3 deliveries per run where:

- order is PAID, same payment mode as the current Razorpay keys, captured/unrefunded and fully entitled;
- paid at least 5 minutes ago (grace) and at most 24 hours ago (so historical orders are never mass-emailed after deployment);
- `orders.customer_email` is present and no delivery exists, or the delivery was **never confirmed/corrected** by the buyer, is not SENT, and is pending, failed more than 15 minutes ago, or has an expired lease;
- fewer than 3 automatic attempts.

Before attaching PDFs it re-fetches the Razorpay payment (recording refunds), then sends to the checkout email using the same claim/finish/idempotency path. SENT locks the address. Effective delay is 5–10 minutes after payment. Buyer-confirmed deliveries are never auto-retried; the buyer retries from the purchasing browser. The function and route log status codes and counts only.

## Refunds

Refunds keep revoking website downloads as before, and also block new deliveries (manual and fallback). Already-emailed attachments cannot be recalled; there is no DRM or recall system.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | For email delivery (production) | Resend API key (`re_...`), sending access is sufficient. Unset ⇒ delivery fails safely |
| `EMAIL_FROM` | Optional | Defaults to `Pixel n Palm <books@pixelnpalm.com>`. Before DNS verification, testing can use `Pixel n Palm <onboarding@resend.dev>`, which Resend delivers only to the Resend account owner's address |
| `EMAIL_DELIVERY_CRON_SECRET` | For the fallback (production) | ≥32 random characters, e.g. `openssl rand -base64 48`. Set with **Functions** scope; the same value authorizes the scheduled function |
| `APP_URL` | Existing | The scheduled function calls this origin (`https://pixelnpalm.com`); falls back to Netlify's `URL` |

Set them in Netlify with **Builds and Functions** scope and redeploy. `npm run check:integrations` now also verifies `email_deliveries` exists and, when the key can list domains, reports the sender domain's Resend verification status (read-only).

## Deployment order

1. Apply `supabase/migrations/202610100002_email_delivery.sql` to the target project (additive: one table, indexes, functions; no existing column changes).
2. Set `RESEND_API_KEY`, `EMAIL_FROM` (optional) and `EMAIL_DELIVERY_CRON_SECRET`; verify `pixelnpalm.com` in Resend (SPF/DKIM DNS records) before sending from `books@pixelnpalm.com`.
3. Deploy. If the migration is missing, paid buyers still see downloads (delivery state degrades to hidden) but delivery and the fallback fail until it is applied.
4. In Netlify → Functions, confirm `email-delivery-fallback` is listed as scheduled and its logs show `email_fallback_run` with status 200.

## Manual production certification checklist

Use Razorpay **test mode** first, then one small live purchase. Use mailboxes you control.

1. **Successful ₹499 purchase:** add all five books; Screen 1 and Screen 2 show ₹499; Razorpay shows ₹499; complete payment.
2. **Payment return:** the thank-you page shows "✓ Payment successful / Your 5 books are ready." with Send your books and Download now panels; status `paid`.
3. **Immediate downloads:** click each Download and Download all; every PDF opens and matches its title.
4. **Email confirmation:** the panel shows the checkout email; click **Confirm & send books**; the panel changes to "✓ Books sent" and Change email disappears.
5. **Actual PDF delivery and attachment correctness:** the email arrives from Pixel n Palm <books@pixelnpalm.com> with subject "Your Pixel n Palm books are here 📚", correct first name, short order reference, amount ₹499 and payment reference; exactly the purchased PDFs are attached and open. Repeat with a one-book order: exactly one attachment.
6. **Email correction:** on a new purchase, click **Change email**, enter another address you control, **Update & send books**; only the new address receives the email. In Supabase, `orders.customer_email` is unchanged and `email_deliveries.delivery_email` is the new address.
7. **Duplicate send attempts:** double-click Confirm, refresh and click again, and open two tabs and confirm in both; exactly one email arrives and the Resend dashboard shows one message per order.
8. **Shared URL in Incognito / another browser:** paste the thank-you URL; it shows only "This purchase is not available in this browser…" with Return to store, no email, name, mobile, books or buttons.
9. **Shared URL on another device:** same result on a phone using mobile data.
10. **Failed email / retry:** in a test deploy, set an invalid `RESEND_API_KEY` (or unverified `EMAIL_FROM`), confirm delivery; the page shows "We couldn't send the email right now." with Try sending again and Download books now, order stays `paid`, downloads work. Restore the key, click Try sending again; exactly one email arrives.
11. **Close-tab fallback:** complete a payment and close the tab immediately after Razorpay success (before confirming). Within 5–10 minutes the checkout email receives the books once; the row shows `status=sent`, `delivery_email_confirmed_at` null. Confirm the scheduled function log entry.
12. **Refund behavior:** refund a test purchase in Razorpay; after the refund webhook, the purchasing browser shows the refunded state, downloads fail and Confirm/Send is refused; no fallback email is sent for refunded orders. Attachments already emailed remain in the inbox (expected).
13. **Missing configuration:** with `RESEND_API_KEY` unset in a test deploy, confirming shows the failure message without changing state and downloads still work.
