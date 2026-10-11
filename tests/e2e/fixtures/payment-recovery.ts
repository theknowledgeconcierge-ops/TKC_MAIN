import { expect, type BrowserContext, type Page } from "@playwright/test";
import { catalogue } from "../../../src/lib/catalog";
import { quoteFor } from "../../../src/lib/commerce/pricing";

export const id = "bbf0142d-4ded-4709-b74c-c627156d633c";
export const ids = catalogue.map(book => book.id);
export const pricing = quoteFor(ids);
export const checkout = { internal_order_id: id, order_number: "TKC-recovery", razorpay_order_id: "order_recovery", amount_paise: 49900, currency: "INR", key_id: "rzp_test_fixture", payment_mode: "test", customer_name: "Fixture Buyer", customer_email: "fixture@example.com", customer_mobile: "9876543210", pricing, description: "Five books" };
export const support = "theknowledgeconcierge@gmail.com";
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
export async function fixture(context: BrowserContext) {
  const response = gate();
  const readResponse = gate();
  const reconcileResponse = gate();
  let status = "payment_pending";
  let delivery = "pending";
  let retryAllowed = false;
  let verifies = 0;
  let failVerify = false;
  let downloads = 0;
  let paidAt = new Date().toISOString();
  let holdRead = false;
  let holdReconcile = false;
  let heldReads = 0;
  let heldReconciles = 0;
  const purchase = (authorized: boolean) => ({ id, order_number: "TKC-recovery", status, books: ids, pricing, payment_mode: "test", paid_at: paidAt, download_authorized: authorized && status === "paid", payment_retry_allowed: retryAllowed,
    entitlements: authorized && status === "paid" ? ids.map((product_id, i) => ({ id: `bbf0142d-4ded-4709-b74c-c627156d633${i}`, product_id })) : [],
    delivery: authorized && status === "paid" ? { email: "fixture@example.com", status: delivery, locked: delivery === "sent", can_retry: delivery !== "sent", sent_at: null, error: delivery === "failed" ? "provider_timeout" : null } : null });
  await context.route("**/api/orders", route => route.fulfill({ json: checkout, headers: { "set-cookie": "fixture_checkout=yes; Path=/; HttpOnly; SameSite=Strict" } }));
  await context.route("**/api/orders/resume", route => status === "paid" ? route.fulfill({ status: 409, json: { error: { code: "ORDER_COMPLETED", message: "Check your purchase before paying again." } } }) : route.fulfill({ json: checkout }));
  for (const path of [`**/api/orders/${id}`, "**/api/orders/reconcile"]) {
    await context.route(path, async route => {
      const cookie = route.request().headers().cookie ?? "";
      if (!cookie.includes("fixture_checkout=yes") && !cookie.includes("fixture_session=yes")) return route.fulfill({ status: 404, json: { error: { code: "PURCHASE_SESSION_REQUIRED", message: "Unavailable" } } });
      const snapshot = purchase(cookie.includes("fixture_session=yes"));
      if (route.request().method() === "GET" && holdRead) { heldReads++; await readResponse.promise; }
      if (route.request().method() === "POST" && holdReconcile) { heldReconciles++; await reconcileResponse.promise; }
      return route.fulfill({ json: snapshot }).catch(() => {});
    });
  }
  await context.route("**/api/payments/verify", async route => {
    verifies++;
    status = "paid"; // Model independent durable capture; sessions require a received verify response.
    await response.promise;
    await route.fulfill(failVerify ? { status: 502, json: { error: { code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Still checking" } } } : { json: purchase(true), headers: { "set-cookie": "fixture_session=yes; Path=/; HttpOnly; SameSite=Strict" } }).catch(() => {});
  });
  await context.route("**/api/downloads", route => { downloads++; return route.fulfill({ status: 503, json: { error: { code: "STORAGE_UNAVAILABLE", message: "Download temporarily unavailable" } } }); });
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {constructor(o){this.o=o} on(){} open(){this.o.handler({razorpay_order_id:'order_recovery',razorpay_payment_id:'pay_recovery',razorpay_signature:'fixture'})}}" }));
  return { release: response.release, releaseRead: readResponse.release, releaseReconcile: reconcileResponse.release, purchase, get verifies() { return verifies; }, get downloads() { return downloads; }, get heldReads() { return heldReads; }, get heldReconciles() { return heldReconciles; }, set status(value: string) { status = value; }, set delivery(value: string) { delivery = value; }, set retryAllowed(value: boolean) { retryAllowed = value; }, set failVerify(value: boolean) { failVerify = value; }, set paidAt(value: string) { paidAt = value; }, set holdRead(value: boolean) { holdRead = value; }, set holdReconcile(value: boolean) { holdReconcile = value; } };
}
export async function details(page: Page) {
  await page.goto("/books");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.keyboard.press("Escape");
  for (const book of ids) {
    if (await page.getByTestId(`book-card-add-btn-${book}`).getAttribute("data-state") === "idle") await page.getByTestId(`book-card-add-btn-${book}`).click();
  }
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await page.getByTestId("razorpay-checkout-name-input").fill("Fixture Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("fixture@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
}
export async function begin(page: Page, openGateway = true) {
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  if (!openGateway) return;
  await page.getByTestId("razorpay-open-btn").click();
  await expect(page.getByTestId("razorpay-open-btn")).toHaveText("Verifying payment…");
}
