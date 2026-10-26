import { expect, test } from "@playwright/test";
import { activeBooks } from "../../src/lib/catalog";
import { booksForSeries } from "../../src/lib/catalog/series";
import { quoteFor } from "../../src/lib/commerce/pricing";

const online = booksForSeries("start-selling-online").map(book => book.id);
const restaurant = booksForSeries("restaurant-playbooks").map(book => book.id);
test.beforeEach(async ({ context }) => {
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
  await context.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {constructor(o){window.__multiOptions=o} on(){} open(){if(document.querySelector('dialog:modal'))throw Error('blocked_by_dialog')}}" }));
});
test("library filters expose all nine books and both bundles", async ({ page }) => {
  await page.goto("/books");
  const cards = page.locator('[data-testid^="book-card-item-"]');
  await expect(cards).toHaveCount(9);
  for (const book of activeBooks) await expect(page.getByTestId(`book-card-price-${book.slug}`)).toContainText("₹199");
  await page.getByRole("button", { name: "Restaurant Playbook Series", exact: true }).click();
  await expect(cards).toHaveCount(5);
  await page.getByRole("button", { name: "Start Selling Online Series", exact: true }).click();
  await expect(cards).toHaveCount(4);
  await page.getByRole("button", { name: "Complete Bundles", exact: true }).click();
  await expect(page.getByTestId("featured-collection-section")).toHaveCount(2);
  await expect(page.getByTestId("collection-primary-cta").nth(0)).toContainText("₹499");
  await expect(page.getByTestId("collection-primary-cta").nth(1)).toContainText("₹499");
});
test("online series preserves reading order, original covers and empty review state", async ({ page }) => {
  await page.goto("/series/start-selling-online");
  await expect(page.getByTestId("collection-page-covers").locator("a")).toHaveCount(4);
  expect(await page.getByTestId("collection-page-covers").locator("a").evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(online.map(id => `/books/${id}`));
  await expect(page.getByTestId("collection-page")).toContainText("243 pages in total");
  await expect(page.getByTestId("book-reviews")).toContainText("No reader reviews yet.");
  await page.getByTestId("collection-page-add-all-btn").click();
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await expect(page.getByTestId("nav-bag-count")).toHaveText("4");
});
test("mixed cart upgrade completes only the online series and keeps restaurant book", async ({ page, context }) => {
  const initial = [restaurant[0], ...online.slice(0, 3)];
  await context.addInitScript(ids => localStorage.setItem("knowledge_concierge_bag_v1", JSON.stringify(ids)), initial);
  await page.goto("/books");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveCount(1);
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveAttribute("data-series", "start-selling-online");
  await page.getByTestId("smart-bag-checkout-btn").click();
  await expect(page.getByTestId("bundle-upsell")).toContainText("Start Selling Online Series");
  await expect(page.getByTestId("bundle-upsell-difference")).toHaveText("SAVE ₹98");
  await expect(page.getByTestId("bundle-upsell-collection").locator("img")).toHaveCount(4);
  await page.getByTestId("bundle-upsell-upgrade").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹698");
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("knowledge_concierge_bag_v1")!));
  expect([...ids].sort()).toEqual([restaurant[0], ...online].sort());
});
test("both bundles share the existing checkout with a 99800 paise payment order", async ({ page, context }) => {
  await context.addInitScript(ids => localStorage.setItem("knowledge_concierge_bag_v1", JSON.stringify(ids)), activeBooks.map(book => book.id));
  const requests: { book_ids: string[] }[] = [];
  let prepared: Record<string, unknown>;
  await context.route("**/api/orders/resume", route => route.fulfill({ json: prepared }));
  await context.route("**/api/orders", async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const pricing = quoteFor(body.book_ids);
    prepared = { internal_order_id: "bb9b8b41-a7de-43f0-aa80-88990841b441", order_number: "TKC-both", razorpay_order_id: "order_both", key_id: "rzp_test_fixture", payment_mode: "test", amount_paise: pricing.total_inr * 100, currency: "INR", pricing, customer_name: body.full_name, customer_email: body.email, customer_mobile: body.mobile, description: "Both bundles" };
    await route.fulfill({ json: prepared });
  });
  await page.goto("/books"); await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹998");
  await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].book_ids).toHaveLength(9);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __multiOptions?: { amount: number } }).__multiOptions?.amount), { timeout: 15000 }).toBe(99800);
});

test("completing the offered series in another tab closes the obsolete offer", async ({ page, context }) => {
  await context.addInitScript(ids => localStorage.setItem("knowledge_concierge_bag_v1", JSON.stringify(ids)), [online[0]]);
  await page.goto("/books");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await expect(page.getByTestId("bundle-upsell")).toBeVisible();
  await page.evaluate(ids => {
    const key = "knowledge_concierge_bag_v1";
    const newValue = JSON.stringify(ids);
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: localStorage }));
  }, online);
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
});
