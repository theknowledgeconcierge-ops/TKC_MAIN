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
- Checkout submits name, email, mobile, and selected book IDs to `/api/orders`. Order creation and payment/delivery are MOCKED; no money is charged and no private download delivery is active.
- Thank-you page reads the last mocked order from session storage and presents a MOCKED delivery state.
- The assistant is a MOCKED local recommendation widget with no external AI provider.

## Backend
- FastAPI routes are mounted under `/api` from `backend/server.py`.
- `/api/catalogue` returns the five catalogue models.
- `/api/pricing/quote` is the centralized pricing engine.
- `/api/orders` validates pricing and creates a `mocked_paid` order in MongoDB.
- No auth roles or admin credentials exist yet; legal/contact/social configuration is intentionally shown as a configuration state.

## Frontend routes
`/`, `/books`, `/books/:slug`, `/restaurant-business-collection`, `/about`, `/faq`, `/thank-you`.

## Assets
The original PDFs are referenced from the five supplied public artifact URLs. The UI displays page 1 of each supplied PDF in a cover preview iframe. Separate cover image files and interior preview raster assets were not supplied in the artifact list.
