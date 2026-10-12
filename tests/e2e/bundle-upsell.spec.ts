import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { activeBooks } from "../../src/lib/catalog";
import { quoteFor } from "../../src/lib/commerce/pricing";

const ids = activeBooks.map(book => book.id);
const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
async function fixture(context: BrowserContext) {
  const requests: { book_ids: string[]; full_name: string; email: string; mobile: string }[] = [];
  let checkout: Record<string, unknown>;
  let verifies = 0;
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
  await context.route("**/api/orders", route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const pricing = quoteFor(body.book_ids, body.coupon_code);
    checkout = { internal_order_id: id, order_number: "TKC-upsell", razorpay_order_id: "order_upsell", key_id: "rzp_test_fixture",
      currency: "INR", payment_mode: "test", amount_paise: pricing.total_inr * 100, pricing,
      customer_name: body.full_name, customer_email: body.email, customer_mobile: body.mobile, description: "Handbooks" };
    return route.fulfill({ json: checkout });
  });
  await context.route("**/api/orders/resume", route => route.fulfill({ json: checkout }));
  const purchase = () => ({ id, order_number: "TKC-upsell", status: "paid", payment_mode: "test", books: requests.at(-1)!.book_ids,
    pricing: checkout.pricing, download_authorized: true, entitlements: [{ id, product_id: ids[0] }], delivery: null });
  await context.route("**/api/payments/verify", route => { verifies++; return route.fulfill({ json: purchase() }); });
  await context.route(`**/api/orders/${id}`, route => route.fulfill({ json: purchase() }));
  await context.route("**/api/orders/reconcile", route => route.fulfill({ json: purchase() }));
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript",
    body: `window.Razorpay=class {constructor(o){this.o=o;window.__bundleOptions=o} on(){} open(){
      if(document.querySelector('dialog:modal')) throw Error('blocked_by_dialog');
      const button=document.createElement('button');button.textContent='Complete fixture payment';
      button.onclick=()=>{button.remove();this.o.handler({razorpay_order_id:'order_upsell',razorpay_payment_id:'pay_upsell',razorpay_signature:'fixture'})};
      document.body.append(button)
    }}`,
  }));
  return { requests, get verifies() { return verifies; } };
}
async function open(page: Page, count: number) {
  await page.goto("/books");
  for (const book of ids.slice(0, count)) await page.getByRole("main").getByTestId(`book-card-add-btn-${book}`).click();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
}
async function details(page: Page) {
  await page.getByTestId("razorpay-checkout-name-input").fill("Upsell Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
}
for (const [count, highlight] of [[1, "ADD JUST ₹250"], [2, "ADD JUST ₹100"], [3, "SAVE ₹50"], [4, "SAVE ₹200"]] as const) {
  test(`${count} books: server pricing produces a truthful offer with actual covers`, async ({ page, context }) => {
    const state = await fixture(context);
    await open(page, count);
    await expect(page.getByTestId("bundle-upsell-difference")).toHaveText(highlight);
    await expect(page.getByTestId("bundle-upsell-selection").locator("img")).toHaveCount(count);
    await expect(page.getByTestId("bundle-upsell-collection").locator("img")).toHaveCount(5);
    await expect(page.getByTestId("bundle-upsell")).toContainText("₹99.80 per book");
    expect(state.requests).toHaveLength(0);
    await page.getByTestId("bundle-upsell-decline").click();
    await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText(`₹${quoteFor(ids.slice(0, count)).total_inr}`);
    await expect(page.getByTestId("nav-bag-count")).toHaveText(String(count));
  });
}
test("upgrade collects missing details on checkout, then verifies the ₹499 payment", async ({ page, context }) => {
  const state = await fixture(context);
  await open(page, 1);
  await page.getByTestId("bundle-upsell-upgrade").click();
  await expect(page.getByTestId("nav-bag-count")).toHaveText("5");
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  expect(state.requests).toHaveLength(0);
  await details(page);
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByRole("button", { name: "Complete fixture payment" })).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0].book_ids).toEqual([...ids].sort());
  expect(await page.evaluate(() => (window as unknown as { __bundleOptions: { amount: number } }).__bundleOptions.amount)).toBe(49900);
  await page.getByRole("button", { name: "Complete fixture payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/thank-you\\?order=${id}`));
  await expect(page.getByTestId(`download-${ids[0]}`)).toBeEnabled();
  expect(state.verifies).toBe(1);
});
test("upgrade preserves entered details and opens Razorpay without another Pay click", async ({ page, context }) => {
  const state = await fixture(context);
  await open(page, 1);
  await page.getByTestId("bundle-upsell-decline").click();
  await details(page);
  await page.getByTestId("razorpay-checkout-close-btn").click();
  await page.keyboard.press("Escape");
  await page.getByRole("main").getByTestId(`book-card-add-btn-${ids[1]}`).click();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await expect(page.getByTestId("bundle-upsell-difference")).toHaveText("ADD JUST ₹100");
  await page.getByTestId("bundle-upsell-upgrade").click();
  await expect(page.getByRole("button", { name: "Complete fixture payment" })).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]).toMatchObject({ full_name: "Upsell Buyer", email: "buyer@example.com", mobile: "9876543210", book_ids: [...ids].sort() });
  await expect(page.getByTestId("razorpay-review-step")).toHaveCount(0);
  expect(await page.locator("dialog:modal").count()).toBe(0);
});
test("declining does not reoffer on close/reopen during the same attempt", async ({ page, context }) => {
  await fixture(context); await open(page, 1);
  await page.getByTestId("bundle-upsell-decline").click();
  await page.getByTestId("razorpay-checkout-close-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await expect(page.getByTestId("razorpay-checkout-name-input")).toBeVisible();
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
});
test("all five selected skips the offer", async ({ page, context }) => {
  await fixture(context); await open(page, 5);
  await expect(page.getByTestId("razorpay-checkout-name-input")).toBeVisible();
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
});
test("320px mobile offer has no overflow and both controls are reachable", async ({ page, context }) => {
  await fixture(context);
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page, 4);
  await expect(page.getByTestId("bundle-upsell-difference")).toHaveText("SAVE ₹200");
  expect(await page.getByTestId("bundle-upsell").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const id of ["bundle-upsell-upgrade", "bundle-upsell-decline"]) {
    const control = page.getByTestId(id);
    await control.scrollIntoViewIfNeeded();
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/bundle-upsell-${test.info().project.name}.png` });
});
