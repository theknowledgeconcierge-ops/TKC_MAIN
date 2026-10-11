import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { catalogue } from "../../src/lib/catalog";
import { quoteFor } from "../../src/lib/commerce/pricing";

const id = "bbf0142d-4ded-4709-b74c-c627156d633c";
const ids = catalogue.map(book => book.id);
const pricing = quoteFor(ids);
const checkout = { internal_order_id: id, order_number: "TKC-recovery", razorpay_order_id: "order_recovery", amount_paise: 49900, currency: "INR", key_id: "rzp_test_fixture", payment_mode: "test", customer_name: "Fixture Buyer", customer_email: "fixture@example.com", customer_mobile: "9876543210", pricing, description: "Five books" };
const support = "theknowledgeconcierge@gmail.com";
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function fixture(context: BrowserContext) {
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
async function begin(page: Page) {
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
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await page.getByTestId("razorpay-open-btn").click();
  await expect(page.getByTestId("razorpay-open-btn")).toHaveText("Verifying payment…");
}

for (const width of [320, 360, 375, 390, 412, 430]) test(`verification close confirmation fits ${width}px including short viewport and cannot silently dismiss`, async ({ page, context }) => {
  const state = await fixture(context);
  await page.setViewportSize({ width, height: 568 });
  await begin(page);
  await page.getByTestId("razorpay-checkout-close-btn").click();
  const panel = page.getByTestId("verification-recovery");
  await expect(panel).toContainText("Payment verification is still in progress");
  await expect(panel).toContainText(support);
  await expect(panel).toContainText("once confirmed");
  if (width === 320) await page.screenshot({ path: `/tmp/tkc-payment-confirmation-320-${test.info().project.name}.png` });
  await page.setViewportSize({ width, height: 360 });
  for (const name of ["verification-continue", "verification-leave"]) {
    const box = await page.getByTestId(name).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(360);
  }
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  if (width === 320) await page.screenshot({ path: `/tmp/tkc-payment-confirmation-short-${test.info().project.name}.png` });
  await page.getByTestId("verification-continue").click();
  await expect(page.getByTestId("razorpay-open-btn")).toHaveText("Verifying payment…");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("verification-leave")).toBeVisible();
  await page.getByTestId("verification-leave").click();
  await expect(page.getByTestId("razorpay-checkout-modal")).toHaveCount(0);
  await expect(page.getByTestId("thank-you-copy")).toContainText("Do not pay again");
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  expect(state.verifies).toBe(1);
  state.release();
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
});

test("verification timeout offers Check again and support, never another Pay button", async ({ page, context }) => {
  const state = await fixture(context);
  await page.clock.install();
  await begin(page);
  await page.clock.fastForward(10001);
  await expect(page.getByTestId("verification-recovery")).toContainText(support);
  await page.clock.fastForward(20001);
  await expect(page.getByTestId("verification-check-again")).toBeVisible();
  await expect(page.getByTestId("verification-recovery")).toContainText("don't make another payment yet");
  await expect(page.getByTestId("resume-payment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pay ₹499/ })).toHaveCount(0);
  await page.getByTestId("verification-check-again").evaluate(el => { for (let n = 0; n < 10; n++) (el as HTMLButtonElement).click(); });
  state.release();
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  expect(state.verifies).toBe(2);
});

test("refresh and Back/Forward during verification recover paid state without granting URL access", async ({ page, context }) => {
  const state = await fixture(context);
  await begin(page);
  await expect(page).toHaveURL(new RegExp(`/thank-you\\?order=${id}`));
  await page.reload();
  await expect(page.getByTestId("thank-you-payment-status")).toHaveText("paid");
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  await page.getByTestId("thank-you-explore-btn").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goBack();
  await expect(page.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("no verified purchase session");
  await page.goForward();
  await expect(page).toHaveURL(/\/books$/);
  await page.goBack();
  await expect(page.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("no verified purchase session");
  await expect(page.getByTestId("resume-payment")).toHaveCount(0);
  state.release();
  expect(state.verifies).toBe(1);
});

test("closing the browser page during verification and reopening the saved order shows safe recovery", async ({ page, context }) => {
  const state = await fixture(context);
  await begin(page);
  await page.close();
  state.release();
  const reopened = await context.newPage();
  await reopened.goto(`/thank-you?order=${id}`);
  await expect(reopened.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("no verified purchase session");
  await expect(reopened.getByTestId("payment-support").filter({ visible: true })).toContainText(support);
  await expect(reopened.getByTestId("downloads-panel")).toHaveCount(0);
  expect(state.verifies).toBe(1);
});

test("uncertain payment hides Resume until fresh reconciliation proves failure; copied URL and screenshot query grant nothing", async ({ page, context }) => {
  const state = await fixture(context);
  await context.addCookies([{ name: "fixture_checkout", value: "yes", url: "http://localhost:3100" }]);
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("payment-support").filter({ visible: true })).toContainText("If you've completed a payment");
  await expect(page.getByTestId("resume-payment")).toHaveCount(0);
  state.status = "failed";
  state.retryAllowed = true;
  await page.getByTestId("check-payment-status").click();
  await expect(page.getByTestId("resume-payment")).toBeEnabled();
  await expect(page.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("You can safely retry");
  await context.clearCookies();
  await page.goto(`/thank-you?order=${id}&razorpay_payment_id=pay_recovery&screenshot=proof.png`);
  await expect(page.getByTestId("thank-you-heading").filter({ visible: true })).toHaveText("This purchase is not available in this browser.");
  await expect(page.getByTestId("payment-support").filter({ visible: true })).toContainText(support);
  await expect(page.getByTestId("thank-you-page").filter({ visible: true })).not.toContainText("fixture@example.com");
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  expect(state.verifies).toBe(0);
});

test("offline verification reaches a bounded recovery state and checks the same payment after reconnecting", async ({ page, context }) => {
  const state = await fixture(context);
  await page.clock.install();
  await begin(page);
  await context.setOffline(true);
  await page.clock.fastForward(30001);
  await expect(page.getByTestId("verification-check-again")).toBeVisible();
  await expect(page.getByTestId("verification-recovery")).toContainText("don't make another payment yet");
  await expect(page.getByTestId("resume-payment")).toHaveCount(0);
  const priorVerifies = state.verifies; // Offline may exhaust one of the bounded same-proof retries.
  await context.setOffline(false);
  await page.getByTestId("verification-check-again").click();
  state.release();
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  expect(state.verifies).toBe(priorVerifies + 1);
});

test("browser verification error with independent paid state offers recovery without another payment", async ({ page, context }) => {
  const state = await fixture(context);
  state.failVerify = true;
  await begin(page);
  state.release();
  await expect(page.getByTestId("verification-check-again")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("verification-recovery")).toContainText(support);
  await expect(page.getByRole("button", { name: /Pay ₹499/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Leave this page", exact: true }).click();
  await expect(page.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("no verified purchase session");
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  expect(state.verifies).toBe(4);
});

test("delayed confirmed email shows support without automatically sending from the browser", async ({ page, context }) => {
  const state = await fixture(context);
  state.status = "paid";
  state.paidAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  let sends = 0;
  await context.route("**/api/orders/delivery", route => { sends++; return route.abort(); });
  await context.addCookies([{ name: "fixture_session", value: "yes", url: "http://localhost:3100" }]);
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("delivery-pending")).toBeVisible();
  await expect(page.getByTestId("payment-support").filter({ visible: true })).toContainText("Paid but can't access your books?");
  expect(sends).toBe(0);
});

test("known paid email/download failures show support while normal paid state stays quiet", async ({ page, context }) => {
  const state = await fixture(context);
  state.status = "paid";
  await context.addCookies([{ name: "fixture_session", value: "yes", url: "http://localhost:3100" }]);
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("delivery-pending")).toBeVisible();
  await expect(page.getByTestId("payment-support")).toHaveCount(0);
  state.delivery = "failed";
  await page.reload();
  await expect(page.getByTestId("delivery-failed")).toContainText("Your payment is safe");
  await page.getByTestId(`download-${ids[0]}`).click();
  await expect(page.getByTestId("downloads-panel")).toContainText("Paid but can't access your books?");
  expect(state.downloads).toBe(1);
});

test("a pre-session purchase read cannot overwrite successful browser verification", async ({ page, context }) => {
  const state = await fixture(context);
  state.holdRead = true;
  await begin(page);
  await expect.poll(() => state.heldReads).toBeGreaterThan(0);
  state.release();
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.request().method() === "GET" && response.url().endsWith(`/api/orders/${id}`));
  state.releaseRead();
  await (await oldResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  await expect(page.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("Download your books below now");
});

test("a pre-session reconciliation cannot overwrite a successful resumed verification", async ({ page, context }) => {
  const state = await fixture(context);
  state.status = "failed";
  state.retryAllowed = true;
  await context.addCookies([{ name: "fixture_checkout", value: "yes", url: "http://localhost:3100" }]);
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {constructor(o){this.o=o} on(e,f){this.failure=f} open(){const check=document.createElement('button');check.textContent='Start fixture reconciliation';check.onclick=()=>this.failure({});const finish=document.createElement('button');finish.textContent='Complete fixture payment';finish.onclick=()=>this.o.handler({razorpay_order_id:'order_recovery',razorpay_payment_id:'pay_recovery',razorpay_signature:'fixture'});document.body.append(check,finish)}}" }));
  await page.goto(`/thank-you?order=${id}`);
  await page.getByTestId("resume-payment").click();
  state.status = "paid";
  state.holdReconcile = true;
  await page.getByRole("button", { name: "Start fixture reconciliation", exact: true }).click();
  await expect.poll(() => state.heldReconciles).toBe(1);
  await page.getByRole("button", { name: "Complete fixture payment", exact: true }).click();
  state.release();
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  const oldResponse = page.waitForResponse("**/api/orders/reconcile");
  state.releaseReconcile();
  await (await oldResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  await expect(page.getByTestId("thank-you-copy").filter({ visible: true })).toContainText("Download your books below now");
});
