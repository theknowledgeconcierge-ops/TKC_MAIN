import { expect, test } from "@playwright/test";

const ids = [
  "the-first-table",
  "the-full-table",
  "behind-the-kitchen-door",
  "the-math-behind-the-menu",
  "empty-tables-to-full-house",
];

for (const width of [320, 360, 375, 390, 412, 430]) {
  test(`removed books return to Add without Undo or empty space at ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Mobile bag layout");
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto("/restaurant-business-collection");
    await page.getByTestId("nav-bag-toggle-btn").click();
    await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
    await page.getByTestId("smart-bag-close-btn").click();
    await page.getByTestId("collection-page-add-to-bag-btn").click();
    await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("5 selected");

    await page.getByTestId(`smart-bag-remove-${ids[0]}`).click();
    await expect(page.getByTestId(`smart-bag-item-${ids[0]}`)).toHaveCount(0);
    await expect(page.locator('[data-testid^="smart-bag-removed-"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /undo/i })).toHaveCount(0);
    await expect(page.getByText("Removed from your bag", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("smart-bag-drawer").locator(".line-through")).toHaveCount(0);
    await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("4 selected");
    await expect(page.getByTestId("smart-bag-tier-progress")).toContainText("4 of 5 books selected");
    await expect(page.getByTestId("smart-bag-tier-progress")).toContainText("80%");
    await expect(page.getByTestId("smart-bag-price-summary")).toContainText("₹796");
    await expect(page.getByTestId(`smart-bag-recommend-add-${ids[0]}`)).toBeEnabled();

    // Deliberate separate removals, outside the repeat-tap window for shifted rows.
    for (const id of ids.slice(1)) {
      await page.waitForTimeout(450);
      await page.getByTestId(`smart-bag-remove-${id}`).click();
      await expect(page.getByTestId(`smart-bag-item-${id}`)).toHaveCount(0);
      if (id !== ids.at(-1)) {
        const more = page.getByTestId("smart-bag-more-recommendations");
        if (await more.count() && await more.getAttribute("aria-expanded") === "false") await more.click();
        await expect(page.getByTestId(`smart-bag-recommend-add-${id}`)).toBeEnabled();
      }
    }
    await expect(page.getByTestId("nav-bag-count")).toHaveText("0");
    await expect(page.getByTestId("smart-bag-selected-section")).toHaveCount(0);
    await expect(page.getByTestId("smart-bag-price-summary")).toHaveCount(0);
    await expect(page.getByTestId("smart-bag-empty-state")).toBeVisible();
    await expect(page.getByTestId("smart-bag-tier-progress")).toHaveCount(0);
    await expect(page.getByTestId("smart-bag-checkout-btn")).toBeDisabled();
    await expect(page.getByTestId("smart-bag-recommendations")).toHaveCount(0);

    const layout = await page.getByTestId("smart-bag-drawer").evaluate((drawer) => {
      return {
        overflow: drawer.scrollWidth - drawer.clientWidth,
      };
    });
    expect(layout).toEqual({ overflow: 0 });
    await info.attach(`empty-bag-${width}px`, { body: await page.screenshot(), contentType: "image/png" });

    await page.reload();
    await page.getByTestId("nav-bag-toggle-btn").click();
    await expect(page.getByTestId("smart-bag-empty-state")).toBeVisible();
    await page.getByTestId("smart-bag-close-btn").click();
    await page.goto("/books");
    await page.getByTestId(`book-card-add-btn-${ids[0]}`).click();
    await expect(page.getByTestId(`smart-bag-item-${ids[0]}`)).toBeVisible();
    await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
    await page.reload();
    await page.getByTestId("nav-bag-toggle-btn").click();
    await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("1 selected");
    await expect(page.getByTestId("smart-bag-price-summary")).toContainText("₹199");
  });
}
