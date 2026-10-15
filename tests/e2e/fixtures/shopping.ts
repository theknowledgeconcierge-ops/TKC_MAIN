import { expect, type Page } from "@playwright/test";

// Checkout setup deliberately closes each newly opened bag before selecting
// another card. Customer-facing card/drawer behavior is tested separately.
export async function addFromCard(page: Page, id: string) {
  const button = page.getByRole("main").getByTestId(`book-card-add-btn-${id}`);
  if (await button.getAttribute("data-state") === "idle") {
    await button.click();
    await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
    await expect(page.getByTestId(`smart-bag-item-${id}`)).toBeVisible();
    await page.getByTestId("smart-bag-close-btn").click();
  }
}
