import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
});

for (const path of ["/", "/books"]) test(`${path}: Add opens bag and In Bag removes only that book`, async ({ page }) => {
  await page.goto(path);
  const first = page.getByRole("main").getByTestId("book-card-add-btn-the-first-table");
  const second = page.getByRole("main").getByTestId("book-card-add-btn-the-full-table");
  await first.click();
  await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("1 selected");
  await page.getByTestId("smart-bag-close-btn").click();
  await expect(first).toContainText("In bag");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await second.click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("2 selected");
  await page.getByTestId("smart-bag-close-btn").click();
  await expect(first).toHaveAccessibleName("In bag: The First Table. Remove from bag");
  await first.press("Enter");
  await expect(first).toHaveText("Add to bag");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  await expect(page.getByTestId("smart-bag-drawer")).toHaveCount(0);
  await expect(page.getByTestId("cart-announcer")).toContainText("The First Table removed from your bag.");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("knowledge_concierge_bag_v1") || "[]"))).toEqual(["the-full-table"]);
  await page.reload();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("2 selected");
  await expect(page.getByTestId("smart-bag-remove-the-full-table")).toBeVisible();
  await expect(page.getByTestId("smart-bag-remove-the-first-table")).toBeVisible();
});
