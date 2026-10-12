import { expect, test, type Page } from "@playwright/test";
import { fixture, begin, cancelPayment, details, id, ids, checkout } from "./fixtures/payment-recovery";

async function openCheckout(page: Page) {
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
}
async function quietGateway(page: Page) {
  await page.context().route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {constructor(o){this.o=o} on(){} open(){if(window.__fixtureCancel){fetch('/fixture/cancel-payment').then(()=>this.o.modal.ondismiss());return;}const b=document.createElement('button');b.textContent='Fixture gateway visible';b.onclick=()=>{b.remove();this.o.modal.ondismiss()};document.body.append(b)}}" }));
}
const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

for (const width of [320, 360, 375, 390, 412, 430]) test(`offline checkout and purchase recovery fit ${width}px without storing contact data`, async ({ page, context }) => {
  const state = await fixture(context);
  await page.setViewportSize({ width, height: 568 });
  await details(page);
  await context.setOffline(true);
  await expect(page.getByTestId("connectivity-notice")).toContainText("details stay in this tab");
  await expect(page.getByTestId("razorpay-create-order-btn")).toBeDisabled();
  await expect(page.getByTestId("razorpay-checkout-email-input")).toHaveValue("fixture@example.com");
  expect(await page.getByTestId("razorpay-checkout-modal").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await context.setOffline(false);
  await cancelPayment(page);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await context.setOffline(true);
  await expect(page.getByTestId("razorpay-create-order-btn")).toBeDisabled();
  await expect(page.getByTestId("connectivity-notice")).toBeVisible();
  const action = await page.getByTestId("razorpay-create-order-btn").boundingBox();
  expect(action!.height).toBeGreaterThanOrEqual(44);
  const stored = await page.evaluate(() => JSON.stringify([Object.values(localStorage), Object.values(sessionStorage)]));
  for (const contact of ["Fixture Buyer", "fixture@example.com", "9876543210", "razorpay_signature", "purchase_session"]) expect(stored).not.toContain(contact);
  await context.setOffline(false);
  state.status = "paid";
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(visible(page, "thank-you-copy")).toContainText("no verified purchase session");
  await context.setOffline(true);
  await expect(page.getByTestId("connectivity-notice")).toContainText("confirmed payment is preserved");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width, height: 360 });
  await page.getByTestId("check-payment-status").scrollIntoViewIfNeeded();
  expect((await page.getByTestId("check-payment-status").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (width === 320) await page.screenshot({ path: `/tmp/tkc-connectivity-320-${test.info().project.name}.png` });
  await context.setOffline(false);
  await context.addCookies([{ name: "fixture_session", value: "yes", url: "http://localhost:3100" }]);
  await page.setViewportSize({ width, height: 568 });
  await page.reload();
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  await page.getByTestId(`download-${ids[0]}`).click();
  await expect(page.getByTestId("downloads-panel")).toContainText("couldn't prepare your download");
  state.delivery = "failed";
  await page.reload();
  await expect(page.getByTestId("delivery-failed")).toContainText("Your payment is safe");
  await context.setOffline(true);
  for (const action of [page.getByTestId(`download-${ids[0]}`), page.getByTestId("delivery-retry-btn")]) {
    await expect(action).toBeDisabled();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("pre-order refresh drops contact fields, keeps cart, and blocked storage keeps a response-lost checkout token in memory", async ({ page, context }) => {
  await fixture(context);
  await details(page);
  await page.reload();
  await openCheckout(page);
  await expect(page.getByTestId("razorpay-checkout-name-input")).toHaveValue("");
  await expect(page.getByTestId("razorpay-checkout-email-input")).toHaveValue("");
  await expect(page.getByTestId("razorpay-checkout-mobile-input")).toHaveValue("");
  await page.evaluate(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  await page.getByTestId("razorpay-checkout-name-input").fill("Fixture Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("fixture@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
  const tokens: string[] = [];
  await context.route("**/api/orders", route => {
    tokens.push(route.request().postDataJSON().checkout_token);
    return tokens.length === 1 ? route.abort("connectionreset") : route.fulfill({ json: checkout, headers: { "set-cookie": "fixture_checkout=yes; Path=/; HttpOnly; SameSite=Strict" } });
  });
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("checkout-notice")).toContainText("Checkout could not start");
  await cancelPayment(page);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toBe(tokens[1]);
});

test("reload after a lost committed order response reuses the persisted checkout identity", async ({ page, context }) => {
  await fixture(context);
  const tokens: string[] = [];
  await context.route("**/api/orders", route => {
    tokens.push(route.request().postDataJSON().checkout_token);
    return tokens.length === 1 ? route.abort("connectionreset") : route.fulfill({ json: checkout, headers: { "set-cookie": "fixture_checkout=yes; Path=/; HttpOnly; SameSite=Strict" } });
  });
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("checkout-notice")).toBeVisible();
  await begin(page, false);
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toBe(tokens[1]);
});

test("cancelled checkout reload restores server details through resume without creating another order", async ({ page, context }) => {
  await fixture(context);
  let creates = 0;
  page.on("request", r => { if (r.url().endsWith("/api/orders")) creates++; });
  await begin(page, false);
  await page.reload();
  await openCheckout(page);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await expect(page.getByTestId("razorpay-checkout-email-input")).toHaveValue("fixture@example.com");
  expect(creates).toBe(1);
});

test("reconnect/focus never overwrites an explicitly edited customer form", async ({ page, context }) => {
  await fixture(context);
  await begin(page, false);
  await page.getByTestId("razorpay-checkout-email-input").fill("corrected@example.com");
  await page.clock.install();
  await context.setOffline(true);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.fastForward(751);
  await expect(page.getByTestId("razorpay-checkout-email-input")).toHaveValue("corrected@example.com");
  await expect(page.getByTestId("razorpay-review-step")).toHaveCount(0);
});

test("retrying a cancelled checkout without changes retains the same logical checkout", async ({ page, context }) => {
  await fixture(context);
  let creates = 0;
  page.on("request", r => { if (r.url().endsWith("/api/orders")) creates++; });
  await begin(page, false);
  await cancelPayment(page);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  expect(creates).toBe(1);
});

test("offline while Razorpay is visible, then browser reopen and delayed capture recovers without another payment", async ({ page, context }) => {
  const state = await fixture(context);
  await quietGateway(page);
  await begin(page, false);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByRole("button", { name: "Fixture gateway visible" })).toBeVisible();
  await context.setOffline(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("tkc_payment_attempt")!))).toMatchObject({ order_id: id });
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto("/books");
  await openCheckout(reopened);
  await expect(reopened).toHaveURL(new RegExp(`/thank-you\\?order=${id}`));
  await expect(reopened.getByTestId("resume-payment")).toHaveCount(0);
  state.status = "paid"; // Delayed webhook/provider reconciliation; browser never received a callback.
  await reopened.getByTestId("check-payment-status").click();
  await expect(visible(reopened, "thank-you-copy")).toContainText("no verified purchase session");
  await expect(reopened.getByTestId("downloads-panel")).toHaveCount(0);
  expect(state.verifies).toBe(0);
});

test("reconnect and focus/history flapping coalesce and never open payment or send email", async ({ page, context }) => {
  await fixture(context);
  await context.addCookies([{ name: "fixture_checkout", value: "yes", url: "http://localhost:3100" }]);
  let reconciles = 0;
  let mutations = 0;
  page.on("request", r => {
    if (r.url().endsWith("/api/orders/reconcile")) reconciles++;
    if (/\/api\/(orders\/delivery|orders\/resume|payments\/verify)$/.test(r.url())) mutations++;
  });
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("check-payment-status")).toBeEnabled();
  await page.clock.install();
  const baseline = reconciles;
  await context.setOffline(true);
  await expect(page.getByTestId("check-payment-status")).toBeDisabled();
  await page.clock.fastForward(180000);
  expect(reconciles).toBe(baseline);
  await context.setOffline(false);
  await page.evaluate(() => { for (let n = 0; n < 20; n++) for (const event of ["offline", "online", "focus", "pageshow"]) window.dispatchEvent(new Event(event)); });
  await page.clock.fastForward(751);
  await expect.poll(() => reconciles).toBe(baseline + 1);
  await page.evaluate(() => { for (let n = 0; n < 20; n++) window.dispatchEvent(new Event("online")); });
  await page.clock.fastForward(1000);
  expect(reconciles).toBe(baseline + 1);
  expect(mutations).toBe(0);
});

for (const tabs of [2, 5]) for (const outcome of ["paid", "refunded", "unknown"]) test(`${tabs} tabs: stale Pay reconciles ${outcome} after connectivity loss`, async ({ page, context }) => {
  test.setTimeout(90000);
  const state = await fixture(context);
  await quietGateway(page);
  await begin(page, false);
  state.retryAllowed = false;
  const siblings: Page[] = [];
  for (let n = 1; n < tabs; n++) {
    const sibling = await context.newPage();
    await sibling.goto(`/thank-you?order=${id}`);
    await expect(sibling.getByTestId("check-payment-status")).toBeEnabled();
    siblings.push(sibling);
  }
  await page.bringToFront();
  await context.setOffline(true);
  await expect(page.getByTestId("razorpay-create-order-btn")).toBeDisabled();
  state.status = outcome === "unknown" ? "payment_pending" : outcome;
  await context.route("**/api/orders/resume", route => route.fulfill({ status: outcome === "unknown" ? 503 : 409, json: { error: { code: outcome === "unknown" ? "PAYMENT_PROVIDER_UNAVAILABLE" : "ORDER_COMPLETED", message: "Check this purchase before paying again." } } }));
  await context.setOffline(false);
  // Either focus recovery or an explicit Pay tap may discover the terminal
  // server state first. Do not wait on a button already removed by recovery.
  await page.waitForFunction(() => window.location.pathname === "/thank-you" ||
    document.querySelector<HTMLButtonElement>('[data-testid="razorpay-create-order-btn"]')?.disabled === false);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-testid="razorpay-create-order-btn"]')?.click());
  if (outcome === "unknown") {
    await expect(page.getByTestId("checkout-notice")).toContainText("Razorpay could not open");
  }
  else await expect(page).toHaveURL(new RegExp(`/thank-you\\?order=${id}`));
  await expect(page.getByTestId("resume-payment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fixture gateway visible" })).toHaveCount(0);
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  if (outcome === "refunded") await expect(page.getByTestId("thank-you-payment-status")).toHaveText("refunded");
  for (const sibling of siblings) {
    await sibling.getByTestId("check-payment-status").click();
    await expect(sibling.getByTestId("resume-payment")).toHaveCount(0);
  }
  expect(state.verifies).toBe(0);
});

test("email acceptance response loss reconnects to SENT without resending; download retry reauthorizes", async ({ page, context }) => {
  const state = await fixture(context);
  state.status = "paid";
  await context.addCookies([{ name: "fixture_session", value: "yes", url: "http://localhost:3100" }]);
  let sends = 0;
  let downloads = 0;
  await context.route("**/api/orders/delivery", route => { sends++; state.delivery = "sent"; return route.abort("connectionreset"); });
  await context.route("**/api/downloads", route => {
    downloads++;
    return downloads === 1 ? route.abort("connectionreset") : route.fulfill({ json: { url: "http://localhost:3100/fixture.pdf" } });
  });
  await context.route("**/fixture.pdf", route => route.fulfill({ body: "%PDF-1.4 fixture", contentType: "application/pdf", headers: { "content-disposition": "attachment; filename=fixture.pdf" } }));
  await page.goto(`/thank-you?order=${id}`);
  await page.getByTestId("delivery-confirm-btn").click();
  await expect(page.getByTestId("delivery-failed")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId(`download-${ids[0]}`)).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId("delivery-sent")).toBeVisible();
  expect(sends).toBe(1);
  await page.getByTestId(`download-${ids[0]}`).click();
  await expect(page.getByTestId("downloads-panel")).toContainText("couldn't prepare your download");
  const transfer = page.waitForEvent("download");
  await page.getByTestId(`download-${ids[0]}`).click();
  await transfer;
  expect(downloads).toBe(2);
  expect(await page.evaluate(() => JSON.stringify([Object.values(localStorage), Object.values(sessionStorage)]))).not.toContain("fixture.pdf");
  await page.reload();
  await expect(page.getByTestId("delivery-sent")).toBeVisible();
  expect(sends).toBe(1);
});

test("corrupted metadata and cleared storage grant no purchase access or session", async ({ page, context }) => {
  await fixture(context);
  await page.goto("/books");
  await page.evaluate(() => {
    localStorage.setItem("tkc_payment_attempt", JSON.stringify({ order_id: "bad", started_at: "paid", purchase_session: "forged" }));
    localStorage.setItem("tkc_checkout_attempt", JSON.stringify({ fingerprint: "bad", order_id: "forged", paid: true }));
  });
  await page.goto(`/thank-you?order=${id}&payment_id=pay_recovery`);
  await expect(visible(page, "thank-you-heading")).toHaveText("This purchase is not available in this browser.");
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(visible(page, "thank-you-heading")).toHaveText("This purchase is not available in this browser.");
  expect(await page.evaluate(() => localStorage.getItem("tkc_checkout_attempt"))).toBeNull();
  expect((await context.cookies()).some(cookie => cookie.name === "fixture_session")).toBe(false);
});

test("ten same-turn delivery status checks start one reconciliation", async ({ page, context }) => {
  const state = await fixture(context);
  state.status = "paid";
  state.delivery = "sending";
  await context.addCookies([{ name: "fixture_session", value: "yes", url: "http://localhost:3100" }]);
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("delivery-check-status")).toBeEnabled();
  state.holdReconcile = true;
  await page.getByTestId("delivery-check-status").evaluate(el => { for (let n = 0; n < 10; n++) (el as HTMLButtonElement).click(); });
  await expect.poll(() => state.heldReconciles).toBe(1);
  state.releaseReconcile();
  await expect(page.getByTestId("delivery-check-status")).toBeEnabled();
  expect(state.heldReconciles).toBe(1);
});

test("expired checkout restores explicit support without redirect loops or a new payment", async ({ page, context }) => {
  await fixture(context);
  await begin(page, false);
  await page.reload();
  let resumes = 0;
  await context.route("**/api/orders/resume", route => { resumes++; return route.fulfill({ status: 404, json: { error: { code: "ORDER_NOT_FOUND", message: "Unavailable or expired" } } }); });
  await context.clearCookies();
  await openCheckout(page);
  await expect(page.getByTestId("checkout-unavailable")).toContainText("Expiry does not mean a payment failed");
  await expect(page).toHaveURL(/\/books$/);
  await page.clock.install();
  await page.evaluate(() => { for (let n = 0; n < 10; n++) window.dispatchEvent(new Event("focus")); });
  await page.clock.fastForward(1000);
  expect(resumes).toBe(1);
  await expect(page.getByTestId("razorpay-create-order-btn")).toHaveCount(0);
  await page.getByRole("button", { name: "Check saved purchase", exact: true }).click();
  await expect(visible(page, "thank-you-heading")).toHaveText("This purchase is not available in this browser.");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("tkc_checkout_attempt")!).order_id)).toBe(id);
});
