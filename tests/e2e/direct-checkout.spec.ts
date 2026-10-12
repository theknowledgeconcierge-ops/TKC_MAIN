import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { catalogue } from "../../src/lib/catalog";
import { quoteFor } from "../../src/lib/commerce/pricing";

const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
const first = catalogue[0].id;
async function setup(context: BrowserContext, count = 1, mode: "test" | "live" = "test") {
  const books = catalogue.slice(0, count).map(book => book.id);
  const pricing = quoteFor(books);
  let creates = 0;
  let verifies = 0;
  let rejectCreate = false;
  let retryAllowed = true;
  let rejectResume = false;
  let releaseVerify!: () => void;
  const verifyGate = new Promise<void>(resolve => { releaseVerify = resolve; });
  const checkout = { key_id: `rzp_${mode}_fixture`, payment_mode: mode, internal_order_id: id,
    order_number: "TKC-direct", razorpay_order_id: "order_direct", amount_paise: pricing.total_inr * 100,
    currency: "INR", pricing, customer_name: "Test Buyer", customer_email: "buyer@example.com",
    customer_mobile: "9876543210", description: "Handbooks" };
  const paid = { id, order_number: "TKC-direct", status: "paid", books, pricing, payment_mode: mode, download_authorized: true,
    entitlements: [{ id, product_id: first }], delivery: null };
  await context.route("**/api/orders", async route => {
    creates++;
    expect(route.request().postDataJSON()).not.toHaveProperty("amount_paise");
    return route.fulfill(rejectCreate ? { status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Please retry this checkout." } } } : { json: checkout });
  });
  await context.route("**/api/orders/resume", route => route.fulfill(rejectResume ?
    { status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Please retry this checkout." } } } : { json: checkout }));
  await context.route("**/api/orders/reconcile", route => route.fulfill({ json: verifies ? paid : { ...paid, status: "payment_pending", download_authorized: false, payment_retry_allowed: retryAllowed, entitlements: [] } }));
  await context.route(`**/api/orders/${id}`, route => route.fulfill({ json: paid }));
  await context.route("**/api/payments/verify", async route => { verifies++; await verifyGate; await route.fulfill({ json: paid }); });
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({
    contentType: "application/javascript", body: `window.Razorpay=class {
      constructor(o){this.o=o;window.__directOptions=o;window.__directOpens=(window.__directOpens||0)+1}
      on(e,f){this.failure=f}
      open(){
        if(document.querySelector('dialog:modal')) throw Error('Razorpay hidden by modal');
        const box=document.createElement('div');box.style='position:fixed;inset:0;background:white;z-index:2147483647';
        for(const [label,action] of [['Cancel fixture',()=>{box.remove();this.o.modal.ondismiss()}],
          ['Fail fixture',()=>{this.failure({});box.remove();this.o.modal.ondismiss()}],
          ['Pay fixture',()=>{box.remove();this.o.handler({razorpay_order_id:'order_direct',razorpay_payment_id:'pay_direct',razorpay_signature:'fixture'})}]]){
          const b=document.createElement('button');b.textContent=label;b.onclick=action;box.append(b)
        }document.body.append(box)
      }};`,
  }));
  // Browser tests never contact Meta, including PageView and InitiateCheckout.
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
  return { books, total: pricing.total_inr, checkout, releaseVerify, get creates() { return creates; }, get verifies() { return verifies; },
    set rejectCreate(value: boolean) { rejectCreate = value; }, set retryAllowed(value: boolean) { retryAllowed = value; }, set rejectResume(value: boolean) { rejectResume = value; } };
}
async function openForm(page: Page, books: string[] = [first]) {
  await page.goto("/books");
  for (const book of books) await page.getByRole("main").getByTestId(`book-card-add-btn-${book}`).click();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
}
async function fill(page: Page) {
  await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
}

for (const count of [1, 2, 5]) test(`${count} books: one Pay click opens the verified Razorpay amount and prefill`, async ({ page, context }) => {
  const state = await setup(context, count);
  await openForm(page, state.books);
  const pay = page.getByTestId("razorpay-create-order-btn");
  await expect(pay).toHaveText(`Pay ₹${state.total} with Razorpay`);
  await expect(page.getByRole("button", { name: "Review order", exact: true })).toHaveCount(0);
  await fill(page);
  await pay.click();
  await expect(page.getByRole("button", { name: "Pay fixture", exact: true })).toBeVisible();
  const options = await page.evaluate(() => (window as unknown as { __directOptions: { amount: number; order_id: string; prefill: object } }).__directOptions);
  expect(options).toMatchObject({ amount: state.total * 100, order_id: "order_direct", prefill: { name: "Test Buyer", email: "buyer@example.com", contact: "9876543210" } });
  await expect(page.getByTestId("razorpay-review-step")).toHaveCount(0);
  expect(state.creates).toBe(1);
  expect(state.verifies).toBe(0);
});

test("invalid fields show accessible errors and never create an order", async ({ page, context }) => {
  const state = await setup(context);
  await openForm(page);
  const pay = page.getByTestId("razorpay-create-order-btn");
  await expect(pay).toBeEnabled();
  await pay.click();
  for (const field of ["name", "email", "mobile"]) await expect(page.getByTestId(`razorpay-checkout-${field}-input`)).toHaveAttribute("aria-invalid", "true");
  await fill(page);
  await page.getByTestId("razorpay-checkout-email-input").fill("not-an-email");
  await pay.click();
  await expect(page.locator("#checkout-email-error")).toBeVisible();
  expect(state.creates).toBe(0);
});

test("server quote and fresh preflight override the browser's cart estimate", async ({ page, context }) => {
  const state = await setup(context);
  const pricing = { ...state.checkout.pricing, total_inr: 199 };
  await context.route("**/api/orders/quote", route => route.fulfill({ json: pricing }));
  await context.route("**/api/orders/resume", route => route.fulfill({ json: { ...state.checkout, amount_paise: 19900, pricing } }));
  await openForm(page); await fill(page);
  await expect(page.getByTestId("razorpay-create-order-btn")).toHaveText("Pay ₹199 with Razorpay");
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByRole("button", { name: "Pay fixture" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __directOptions: { amount: number } }).__directOptions.amount)).toBe(19900);
});

test("cancel and failure preserve fields; retries use the same order", async ({ page, context }) => {
  const state = await setup(context);
  await openForm(page);
  await fill(page);
  const pay = page.getByTestId("razorpay-create-order-btn");
  await pay.click();
  await page.getByRole("button", { name: "Cancel fixture" }).click();
  await expect(page.getByTestId("checkout-notice")).toContainText("Payment window closed");
  await expect(page.getByTestId("razorpay-checkout-email-input")).toHaveValue("buyer@example.com");
  await pay.click();
  await page.getByRole("button", { name: "Fail fixture" }).click();
  await expect(page.getByTestId("checkout-notice")).toContainText("Payment was not completed");
  await expect(page.getByTestId("razorpay-checkout-name-input")).toHaveValue("Test Buyer");
  expect(state.creates).toBe(1);
  expect(state.verifies).toBe(0);
});

test("duplicate clicks open once and redirect only after server payment verification", async ({ page, context }) => {
  // Capture Pixel calls locally; this fixture cannot transmit a real conversion.
  await context.addInitScript(() => {
    const pixel = window as Window & { fbq?: (...args: unknown[]) => void; __pixelCalls?: unknown[][] };
    pixel.__pixelCalls = [];
    pixel.fbq = (...args) => { pixel.__pixelCalls!.push(args); };
  });
  const state = await setup(context, 1, "live");
  await openForm(page);
  await fill(page);
  await expect(page.getByTestId("razorpay-create-order-btn")).toBeEnabled();
  await page.getByTestId("razorpay-create-order-btn").evaluate(el => { for (let i=0; i<10; i++) (el as HTMLButtonElement).click(); });
  await page.getByRole("button", { name: "Pay fixture" }).click();
  await expect(page.getByTestId("razorpay-checkout-title")).toHaveText("Payment verification");
  await expect(page).toHaveURL(/\/books$/);
  expect(state.creates).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __directOpens: number }).__directOpens)).toBe(1);
  await expect(page.getByTestId("downloads-panel")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.filter(call => call[1] === "Purchase"))).toEqual([]);
  state.releaseVerify();
  await expect(page).toHaveURL(new RegExp(`/thank-you\\?order=${id}`));
  await expect(page.getByTestId(`download-${first}`)).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.filter(call => call[1] === "Purchase"))).toEqual([
    ["track", "Purchase", { value: 249, currency: "INR", content_type: "product", content_ids: [first], num_items: 1 }, { eventID: `purchase_${id}` }],
  ]);
  expect(state.verifies).toBe(1);
});

test("creation and preflight failures remain retryable on the same form", async ({ page, context }) => {
  const state = await setup(context);
  state.rejectCreate = true;
  await openForm(page); await fill(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("checkout-notice")).toContainText("Checkout could not start");
  state.rejectCreate = false; state.rejectResume = true;
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("checkout-notice")).toContainText("Razorpay could not open");
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByTestId("razorpay-checkout-email-input")).toHaveValue("buyer@example.com");
  state.rejectResume = false;
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByRole("button", { name: "Pay fixture" })).toBeVisible();
  expect(state.creates).toBe(2);
});

test("uncertain dismissal blocks another Pay until reconciliation permits retry", async ({ page, context }) => {
  const state = await setup(context);
  state.retryAllowed = false;
  await openForm(page); await fill(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await page.getByRole("button", { name: "Cancel fixture" }).click();
  await expect(page.getByRole("button", { name: "Check payment status", exact: true })).toBeVisible();
  await expect(page.getByTestId("razorpay-create-order-btn")).toHaveCount(0);
  await expect(page).toHaveURL(/\/books$/);
  state.retryAllowed = true;
  await page.getByRole("button", { name: "Check payment status", exact: true }).click();
  await expect(page.getByTestId("razorpay-create-order-btn")).toBeEnabled();
  expect(state.creates).toBe(1);
});

test("mobile form keeps a 44px payment control without horizontal overflow", async ({ page, context }) => {
  await setup(context);
  await page.setViewportSize({ width: 320, height: 568 });
  await openForm(page);
  const pay = page.getByTestId("razorpay-create-order-btn");
  await pay.scrollIntoViewIfNeeded();
  expect((await pay.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.getByTestId("razorpay-checkout-modal").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/direct-checkout-${test.info().project.name}.png` });
});
