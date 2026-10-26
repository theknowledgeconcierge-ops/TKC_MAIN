import { expect, test, type Page } from "@playwright/test";
import { booksForSeries, series } from "../../src/lib/catalog/series";

const key = "knowledge_concierge_bag_v1";
const restaurant = booksForSeries("restaurant-playbooks").map(book => book.id);
const online = booksForSeries("start-selling-online").map(book => book.id);

test.beforeEach(async ({ context }) => {
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
  await context.route("https://checkout.razorpay.com/**", route => route.abort());
});

async function recommendationIds(page: Page) {
  return page.locator('[data-testid^="smart-bag-recommend-add-"]').evaluateAll(buttons =>
    buttons.map(button => button.getAttribute("data-testid")!.replace("smart-bag-recommend-add-", "")));
}

test("empty bag has no series promotions, including after clearing", async ({ page }) => {
  await page.goto("/books");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await expect(page.getByTestId("smart-bag-empty-state")).toBeVisible();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveCount(0);
  await expect(page.getByTestId("smart-bag-recommendations")).toHaveCount(0);
  await page.getByTestId("smart-bag-close-btn").click();
  await page.getByTestId(`book-card-add-btn-${online[0]}`).click();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveCount(1);
  await page.getByTestId("smart-bag-remove-all-btn").click();
  await page.getByTestId("smart-bag-clear-confirm-btn").click();
  await expect(page.getByTestId("smart-bag-empty-state")).toBeVisible();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveCount(0);
  await expect(page.getByTestId("smart-bag-recommendations")).toHaveCount(0);
});

for (const info of series) test(`${info.id} gets a single meter and compact recommendations from its own series`, async ({ page }, testInfo) => {
  const ids = booksForSeries(info.id).map(book => book.id);
  await page.goto("/books");
  await page.getByTestId(`book-card-add-btn-${ids[0]}`).click();
  const meter = page.getByTestId("smart-bag-tier-progress");
  await expect(meter).toHaveCount(1);
  await expect(meter).toHaveAttribute("data-series", info.id);
  await expect(meter).toContainText(`1 of ${ids.length} books selected`);
  await expect(page.getByTestId("smart-bag-recommendations")).toHaveAttribute("data-series", info.id);
  expect(await recommendationIds(page)).toEqual(ids.slice(1, 3));
  await page.getByTestId("smart-bag-more-recommendations").click();
  expect(await recommendationIds(page)).toEqual(ids.slice(1));
  await page.getByTestId("smart-bag-more-recommendations").click();
  expect(await recommendationIds(page)).toEqual(ids.slice(1, 3));
  const add = page.getByTestId(`smart-bag-recommend-add-${ids[1]}`);
  if (testInfo.project.name === "mobile") expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.getByTestId("smart-bag-drawer").evaluate(drawer => drawer.scrollWidth - drawer.clientWidth)).toBe(0);
  await testInfo.attach("focused-bag", { body: await page.screenshot(), contentType: "image/png" });
  await add.click();
  await expect(add).toBeDisabled();
  await expect(meter).toContainText(`2 of ${ids.length} books selected`);
  await expect(page.getByTestId("nav-bag-count")).toHaveText("2");
  expect(await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!), key)).toEqual(ids.slice(0, 2));
});

test("completing a series stops recommendations without promoting the other bundle", async ({ page, context }) => {
  await context.addInitScript(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), { key, ids: online.slice(0, 3) });
  await page.goto("/books");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId(`smart-bag-recommend-add-${online[3]}`).click();
  await expect(page.getByTestId("smart-bag-tier-progress")).toContainText("4 of 4 books selected");
  await expect(page.getByTestId("smart-bag-tier-progress")).toContainText("100%");
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText("₹499");
  await expect(page.getByTestId("smart-bag-recommendations")).toHaveCount(0);
  await expect(page.getByTestId("smart-bag-drawer")).not.toContainText("Restaurant Playbook Series");
});

test("mixed bag focuses on the latest addition and returns to the remaining series on removal", async ({ page }) => {
  await page.goto("/books");
  await page.getByTestId(`book-card-add-btn-${restaurant[0]}`).click();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveAttribute("data-series", "restaurant-playbooks");
  await page.getByTestId("smart-bag-close-btn").click();
  await page.getByTestId(`book-card-add-btn-${online[0]}`).click();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveCount(1);
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveAttribute("data-series", "start-selling-online");
  expect(await recommendationIds(page)).toEqual(online.slice(1, 3));
  await expect(page.getByTestId(`smart-bag-item-${restaurant[0]}`)).toHaveCount(1);
  await page.getByTestId(`smart-bag-remove-${online[0]}`).click();
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveAttribute("data-series", "restaurant-playbooks");
  expect(await recommendationIds(page)).toEqual(restaurant.slice(1, 3));
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
});
