import { expect, test } from "@playwright/test";
import { booksForSeries } from "../../src/lib/catalog/series";

test.beforeEach(async ({ context }) => {
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
  await context.route("https://checkout.razorpay.com/**", route => route.abort());
});

for (const [path, seriesId] of [
  ["/restaurant-business-collection", "restaurant-playbooks"],
  ["/series/restaurant-playbooks", "restaurant-playbooks"],
  ["/series/start-selling-online", "start-selling-online"],
] as const) test(`${path} ad link opens only its complete series in the basket`, async ({ page }) => {
  const books = booksForSeries(seriesId);
  await page.goto(`${path}?bag=1&utm_source=facebook&utm_campaign=bundle&fbclid=fixture-click#book-preview`);
  await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText(`${books.length} selected`);
  for (const book of books) await expect(page.getByTestId(`smart-bag-item-${book.id}`)).toHaveCount(1);
  await expect(page.getByTestId("smart-bag-tier-progress")).toHaveAttribute("data-series", seriesId);
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText("₹499");
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveCount(0);
  const url = new URL(page.url());
  expect(url.searchParams.has("bag")).toBe(false);
  expect(url.searchParams.get("utm_source")).toBe("facebook");
  expect(url.searchParams.get("utm_campaign")).toBe("bundle");
  expect(url.searchParams.get("fbclid")).toBe("fixture-click");
  expect(url.hash).toBe("#book-preview");
  await page.getByTestId("smart-bag-close-btn").click();
  await expect(page.getByTestId("smart-bag-drawer")).not.toBeVisible();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId(`smart-bag-remove-${books[0].id}`).click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText(`${books.length - 1} selected`);
  await page.reload();
  await expect(page.getByTestId("nav-bag-count")).toHaveText(String(books.length - 1));
  await expect(page.getByTestId("smart-bag-drawer")).not.toBeVisible();
});

test("an ad bundle merges with the saved bag without duplicates or lost books", async ({ page, context }) => {
  const restaurant = booksForSeries("restaurant-playbooks").map(book => book.id);
  const online = booksForSeries("start-selling-online")[0].id;
  await context.addInitScript(ids => localStorage.setItem("knowledge_concierge_bag_v1", JSON.stringify(ids)), [online, restaurant[0]]);
  await page.goto("/restaurant-business-collection?bag=1");
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("6 selected");
  await expect(page.getByTestId(`smart-bag-item-${online}`)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("knowledge_concierge_bag_v1")!))).toEqual([online, ...restaurant]);
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText("₹698");
});

for (const suffix of ["", "?bag=0"]) test(`ordinary collection visit ${suffix || "without a query"} does not add books`, async ({ page }) => {
  await page.goto(`/restaurant-business-collection${suffix}`);
  await page.getByTestId("nav-bag-toggle-btn").click();
  await expect(page.getByTestId("smart-bag-empty-state")).toBeVisible();
  await expect(page.getByTestId("nav-bag-count")).toHaveText("0");
});
