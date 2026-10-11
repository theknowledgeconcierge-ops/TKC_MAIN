import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
const book = "the-first-table";
const entitlement = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f613";
const pricing = { book_count: 1, regular_total_inr: 249, automatic_discount_inr: 0, automatic_price_inr: 249, coupon_discount_inr: 0, total_inr: 249, total_savings_inr: 0, message: "Confirmed" };
const checkout = { key_id: "rzp_test_fixture", payment_mode: "test", internal_order_id: id, order_number: "TKC-chaos", razorpay_order_id: "order_chaos", amount_paise: 24900, currency: "INR", pricing, customer_name: "Test Buyer", customer_email: "buyer@example.com", customer_mobile: "9876543210", description: "One handbook" };
function purchase(status = "paid", deliveryStatus = "pending") {
  return { id, order_number: "TKC-chaos", status, books: [book], pricing, payment_mode: "test", payment_retry_allowed: status === "failed", download_authorized: status === "paid", entitlements: status === "paid" ? [{ id: entitlement, product_id: book }] : [], delivery: status === "paid" ? { email: "buyer@example.com", status: deliveryStatus, locked: deliveryStatus === "sent", can_retry: deliveryStatus !== "sent", can_change_email: true, sent_at: deliveryStatus === "sent" ? "2026-10-10T18:00:00Z" : null, error: deliveryStatus === "failed" ? "provider_timeout" : null } : null };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function burst(page: Page, testId: string) {
  await page.getByTestId(testId).evaluate(node => { for (let i = 0; i < 10; i++) (node as HTMLButtonElement).click(); });
}
async function routePurchase(context: BrowserContext, current: () => ReturnType<typeof purchase>) {
  for (const path of [`**/api/orders/${id}`, "**/api/orders/reconcile"])
    await context.route(path, route => route.fulfill({ json: current() }));
}
async function openCheckout(page: Page) {
  await page.goto("/books");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.keyboard.press("Escape");
  if (await page.getByTestId(`book-card-add-btn-${book}`).getAttribute("data-state") === "idle")
    await page.getByTestId(`book-card-add-btn-${book}`).click();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
}

test("a delayed reconciliation response cannot regress already observed Paid or Sent", async ({ page, context }) => {
  const pending = gate();
  let started = false;
  await context.route(`**/api/orders/${id}`, route => route.fulfill({ json: purchase("paid", "sent") }));
  await context.route("**/api/orders/reconcile", async route => { started = true; await pending.promise; await route.fulfill({ json: purchase("payment_pending") }); });
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("delivery-sent")).toBeVisible();
  await expect.poll(() => started).toBe(true);
  const response = page.waitForResponse("**/api/orders/reconcile");
  pending.release();
  await response;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.getByTestId("thank-you-payment-status").textContent()).toBe("paid");
});
async function details(page: Page) {
  await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
}

test("ten same-turn Confirm taps start one request and show Sending immediately", async ({ page, context }) => {
  await routePurchase(context, () => purchase());
  const pending = gate();
  let requests = 0;
  await context.route("**/api/orders/delivery", async route => { requests++; await pending.promise; await route.fulfill({ json: purchase("paid", "sent") }); });
  await page.goto(`/thank-you?order=${id}`);
  await burst(page, "delivery-confirm-btn");
  try {
    await expect(page.getByTestId("delivery-sending")).toContainText("Sending");
    await expect.poll(() => requests, { timeout: 1000 }).toBe(1);
  } finally { pending.release(); }
  await expect(page.getByTestId("delivery-sent")).toBeVisible();
});

test("ten same-turn Download taps start one signing request", async ({ page, context }) => {
  await routePurchase(context, () => purchase("paid", "sent"));
  const pending = gate();
  let requests = 0;
  await context.route("**/api/downloads", async route => { requests++; await pending.promise; await route.fulfill({ json: { url: "https://files.example.com/book.pdf" } }); });
  await context.route("https://files.example.com/book.pdf", route => route.fulfill({ body: "%PDF-1.7 fixture", headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=book.pdf" } }));
  await page.goto(`/thank-you?order=${id}`);
  await burst(page, `download-${book}`);
  const downloaded = page.waitForEvent("download");
  try { await expect.poll(() => requests, { timeout: 1000 }).toBe(1); }
  finally { pending.release(); }
  await downloaded;
  await page.reload();
  await expect(page.getByTestId(`download-${book}`)).toBeEnabled();
  expect(requests).toBe(1);
});

test("ten same-turn Resume taps open one provider window and provider failure keeps it in flight", async ({ page, context }) => {
  await routePurchase(context, () => purchase("failed"));
  const pending = gate();
  let requests = 0;
  await context.route("**/api/orders/resume", async route => { requests++; await pending.promise; await route.fulfill({ json: checkout }); });
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {on(e,f){this.failure=f} open(){const b=document.createElement('button');b.textContent='Fixture payment failure';b.onclick=()=>this.failure({});document.body.appendChild(b)}}" }));
  await page.goto(`/thank-you?order=${id}`);
  await burst(page, "resume-payment");
  try { await expect.poll(() => requests, { timeout: 1000 }).toBe(1); }
  finally { pending.release(); }
  await page.getByRole("button", { name: "Fixture payment failure" }).click();
  await expect(page.getByTestId("resume-payment")).toBeDisabled();
});

test("five tabs, reload during Sending, Sent revisit, failed reload and Back/Forward never automatically send", async ({ page, context }) => {
  let current = purchase();
  let requests = 0;
  const pending = gate();
  await routePurchase(context, () => current);
  await context.route("**/api/orders/delivery", async route => {
    requests++;
    if (current.delivery?.status === "pending") { current = purchase("paid", "sending"); await pending.promise; current = purchase("paid", "sent"); }
    await route.fulfill({ json: current }).catch(() => {});
  });
  const pages = [page, ...await Promise.all(Array.from({ length: 4 }, () => context.newPage()))];
  await Promise.all(pages.map(p => p.goto(`/thank-you?order=${id}`)));
  await Promise.all(pages.map(p => p.getByTestId("delivery-confirm-btn").click()));
  await expect.poll(() => requests).toBe(5);
  await page.reload();
  await expect(page.getByTestId("delivery-sending")).toBeVisible();
  expect(requests).toBe(5);
  pending.release();
  await Promise.all(pages.map(p => p.reload()));
  for (const p of pages) await expect(p.getByTestId("delivery-sent")).toBeVisible();
  await page.goto("/books");
  await page.goBack();
  await expect(page.getByTestId("delivery-sent")).toBeVisible();
  await page.goForward();
  await page.goBack();
  await expect(page.getByTestId("delivery-sent")).toBeVisible();
  expect(requests).toBe(5);
  current = purchase("paid", "failed");
  await page.reload();
  await expect(page.getByTestId("delivery-retry-btn")).toBeVisible();
  expect(requests).toBe(5);
});

test("five tabs reviewing the same selection converge on one remembered checkout", async ({ page, context }) => {
  let creates = 0;
  let resumes = 0;
  const tokens = new Set<string>();
  const pending = gate();
  await context.route("**/api/orders", async route => { creates++; tokens.add(route.request().postDataJSON().checkout_token); await pending.promise; await route.fulfill({ json: checkout }); });
  await context.route("**/api/orders/resume", route => { resumes++; return route.fulfill({ json: checkout }); });
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {on(){} open(){}}" }));
  const pages = [page, ...await Promise.all(Array.from({ length: 4 }, () => context.newPage()))];
  for (const p of pages) { await openCheckout(p); await details(p); }
  await Promise.all(pages.map(p => burst(p, "razorpay-create-order-btn")));
  await expect.poll(() => creates).toBeGreaterThan(0);
  pending.release();
  for (const p of pages) await expect(p.getByTestId("razorpay-confirmed-total")).toHaveText("₹249");
  expect(tokens.size).toBe(1);
  expect(creates + resumes).toBe(5);
  // Web Locks serialize the read/write/response interval across same-origin tabs.
  expect(creates).toBe(1);
  expect(resumes).toBe(4);
});

test("reloads in customer form, review and Razorpay opening reuse the checkout without charging", async ({ page, context }) => {
  let creates = 0;
  let resumes = 0;
  const pending = gate();
  await context.route("**/api/orders", route => { creates++; return route.fulfill({ json: checkout }); });
  await context.route("**/api/orders/resume", route => { resumes++; return route.fulfill({ json: checkout }); });
  await context.route("https://checkout.razorpay.com/v1/checkout.js", async route => { await pending.promise; await route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {on(){} open(){}}" }).catch(() => {}); });
  await openCheckout(page);
  await details(page);
  await page.reload();
  expect(creates).toBe(0);
  await openCheckout(page);
  await details(page);
  await burst(page, "razorpay-create-order-btn");
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹249");
  await page.reload();
  await openCheckout(page);
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await page.getByTestId("razorpay-open-btn").click();
  await expect(page.getByTestId("razorpay-open-btn")).toContainText("Opening Razorpay");
  await expect.poll(() => resumes).toBe(2);
  await page.reload();
  pending.release();
  expect(creates).toBe(1);
  expect(resumes).toBe(2);
});

test("lost create response and network recovery reuse the original checkout key", async ({ page, context }) => {
  const tokens: string[] = [];
  await context.route("**/api/orders", route => {
    tokens.push(route.request().postDataJSON().checkout_token);
    return tokens.length === 1 ? route.abort("failed") : route.fulfill({ json: checkout });
  });
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {on(){} open(){}}" }));
  await openCheckout(page);
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("checkout-notice")).toBeVisible();
  await context.setOffline(true);
  await context.setOffline(false);
  await page.reload();
  await openCheckout(page);
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹249");
  expect(tokens).toHaveLength(2);
  expect(tokens[1]).toBe(tokens[0]);
});

test("reload after callback and during verification preserves Paid without upgrading URL authorization", async ({ page, context }) => {
  let current = purchase("payment_pending");
  const pending = gate();
  let verifications = 0;
  await routePurchase(context, () => current);
  await context.route("**/api/orders", route => route.fulfill({ json: checkout }));
  await context.route("**/api/orders/resume", route => route.fulfill({ json: checkout }));
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {constructor(o){this.o=o} on(){} open(){this.o.handler({razorpay_order_id:'order_chaos',razorpay_payment_id:'pay_chaos',razorpay_signature:'fixture'})}}" }));
  await context.route("**/api/payments/verify", async route => {
    verifications++;
    // Commit happened, but this browser has not received a purchase cookie.
    current = { ...purchase(), download_authorized: false, entitlements: [], delivery: null };
    await pending.promise;
    await route.fulfill({ json: current }).catch(() => {});
  });
  await openCheckout(page);
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await page.getByTestId("razorpay-open-btn").click();
  await expect(page.getByTestId("razorpay-open-btn")).toContainText("Verifying payment");
  await page.reload();
  pending.release();
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("thank-you-payment-status")).toHaveText("paid");
  await expect(page.getByTestId("resume-payment")).toHaveCount(0);
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  expect(verifications).toBe(1);
  expect(new URL(page.url()).hash).toBe("");
});
