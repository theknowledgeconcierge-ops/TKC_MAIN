# The Knowledge Concierge — Living Spec

## Product
Premium editorial digital bookstore for Rakesh Chauhan's five restaurant business PDF handbooks. The flagship offer is the five-book collection.

## Catalogue
- The First Table — 47 pages, ₹249 individual
- The Full Table — 53 pages, ₹249 individual
- Behind the Kitchen Door — 64 pages, ₹249 individual
- The Math Behind the Menu — 65 pages, ₹249 individual
- Empty Tables to Full House — 43 pages, ₹249 individual
- Individual list price is ₹499; standard five-book collection is ₹999; eligible first-time First50 price is ₹499

## Key flows
- Homepage → library/product pages → persistent localStorage bag → smart savings tiers: 1 ₹249, 2 ₹399, 3 ₹549, 4 ₹699, 5 ₹999 base collection
- Five books use First50 for eligible first-time customers: ₹999 minus ₹500 = ₹499. Eligibility is checked server-side against prior orders by email.
- Checkout submits name, email, mobile, and selected book IDs to `/api/payments/razorpay/order`. The backend recalculates pricing and first-time eligibility, creates an exact INR Razorpay test order in paise, and returns only checkout-safe public data.
- The Razorpay test modal opens only after the customer reviews the server-confirmed amount. `/api/payments/razorpay/verify` verifies the callback signature, fetches payment status, checks amount/order identity, and only marks captured payments paid.
- `/api/payments/razorpay/webhook` verifies the raw request signature and idempotently handles `order.paid`, `payment.captured`, and `payment.failed`.
- Thank-you reads only the verified paid order returned by the backend. Secure file storage, download links, and delivery email remain MOCKED/not active, so the download control is disabled.
- The assistant is a MOCKED local recommendation widget with no external AI provider.

## Backend
- FastAPI routes are mounted under `/api` from `backend/server.py`.
- `/api/catalogue` returns the five catalogue models.
- `/api/pricing/quote` is the centralized pricing engine.
- `/api/payments/razorpay/order` creates the internal pending order and matching Razorpay order.
- `/api/payments/razorpay/verify` verifies captured browser-callback payments.
- `/api/payments/razorpay/webhook` processes signed asynchronous payment events idempotently.
- No auth roles or admin credentials exist yet; legal/contact/social configuration is intentionally shown as a configuration state.

## Frontend routes
`/`, `/books`, `/books/:slug`, `/restaurant-business-collection`, `/about`, `/faq`, `/thank-you`.

## Assets
The original PDFs and five named cover JPGs are referenced from the supplied public artifact URLs. The cover JPGs are mapped by title and displayed throughout the homepage, catalogue, product, collection, bag, and confirmation views.

## Responsive interaction details
- The homepage library appears before the audience decision cards.
- Cover previews are intentionally compact, including the product hero and mobile two-column library.
- The bag progress meter remains sticky while the recommendations and selected products scroll.
- A left-bottom back-to-top control appears after the reader scrolls 480px; the assistant remains on the right.
- Every route change resets the document to the top unless an explicit URL hash targets an in-page section.
- Public pages use short fade/slide route transitions. Product pages add an animated hero, highlighted champagne price panel, scroll reveals, tactile hover feedback, and an animated contents accordion.
