import { expect, test } from "@playwright/test";
import { activeBooks, type ProductId } from "../../src/lib/catalog";
import { productContent } from "../../src/lib/product-content";
import { publishedReviews, reviewStats } from "../../src/lib/reviews";

test.beforeEach(async ({ context }) => {
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
});

for (const book of activeBooks) {
  test(`${book.title}: real samples, accessible gallery, review integrity and purchase`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    expect((await page.goto(`/books/${book.slug}`))?.status()).toBe(200);
    await expect(page.getByTestId("product-title")).toHaveText(book.title);
    await expect(page.getByTestId("product-selling-price")).toHaveText("₹249");
    const reviews = publishedReviews(book.id);
    const stats = reviewStats(reviews);
    await expect(page.getByTestId("rating-summary")).toContainText(stats.average === null ? "No reader reviews yet" : `${stats.average.toFixed(1)}/5 · ${stats.count} reviews`);
    await expect(page.getByTestId("product-price-panel").getByTestId("purchase-original-price")).toContainText("₹499");
    const whatsapp = page.getByTestId("product-price-panel").getByTestId("whatsapp-purchase");
    const whatsappUrl = new URL((await whatsapp.getAttribute("href"))!);
    expect(whatsappUrl.origin + whatsappUrl.pathname).toBe("https://wa.me/919557156634");
    expect(whatsappUrl.searchParams.get("text")).toBe(`I want to buy ${book.title}`);
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    const gallery = page.getByTestId("book-preview");
    await expect(gallery.getByRole("button", { name: "Show Front cover", exact: true })).toHaveAttribute("aria-pressed", "true");
    await gallery.getByRole("button", { name: "Next preview", exact: true }).click();
    for (const [index, sample] of productContent[book.id as ProductId].previews.entries()) {
      if (index > 0) await gallery.getByRole("button", { name: "Next preview", exact: true }).click();
      await expect(page.getByTestId("preview-indicator")).toContainText(`${index + 2} of 4`);
      await expect(page.getByTestId("preview-main-image")).toHaveAttribute("alt", `${book.title}, PDF page ${sample.page}: ${sample.label}`);
      await expect.poll(() => page.getByTestId("preview-main-image").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    const previous = gallery.getByRole("button", { name: "Previous preview", exact: true });
    await previous.focus();
    await previous.press("ArrowLeft");
    await expect(page.getByTestId("preview-indicator")).toContainText("3 of 4");
    await gallery.getByRole("button", { name: "Enlarge current preview" }).click();
    const dialog = page.getByRole("dialog", { name: `${book.title} enlarged preview` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close enlarged preview" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(gallery.getByRole("button", { name: "Enlarge current preview" })).toBeFocused();
    await page.getByTestId("rating-summary").click();
    await expect(page.getByTestId("book-reviews")).toBeInViewport();
    const section = page.getByTestId("book-reviews");
    if (reviews.length) {
      await expect(section.locator("article")).toHaveCount(6);
      await expect(section.locator("article").first()).toContainText(reviews[0].name!);
      await expect(section.locator("article").first()).toContainText(reviews[0].text);
      await section.getByRole("button", { name: "Load more reviews" }).click();
      await expect(section.locator("article")).toHaveCount(Math.min(12, reviews.length));
      if (reviews.length > 12) await section.getByRole("button", { name: "Load more reviews" }).click();
      await expect(section.locator("article")).toHaveCount(reviews.length);
      await expect(section.getByRole("button", { name: "Load more reviews" })).toHaveCount(0);
    } else {
      await expect(section).toContainText("No reader reviews yet.");
      await expect(section.locator("article")).toHaveCount(0);
    }
    await expect(section).not.toContainText(/Illustrative|Verified purchase/);
    await page.getByTestId("product-toc-toggle").click();
    for (const chapter of book.toc) await expect(page.getByTestId("product-toc-list")).toContainText(chapter);
    await page.getByTestId("book-detail-add-btn").click();
    await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("1 selected");
    await expect(page.getByTestId(`smart-bag-remove-${book.id}`)).toBeVisible();
    await page.getByTestId("smart-bag-close-btn").click();
    await expect(page.getByTestId("book-detail-add-btn")).toHaveText("Add to bag");
    await page.getByTestId("book-detail-buy-btn").click();
    await expect(page.getByTestId("razorpay-checkout-modal")).toBeVisible();
    await expect(page.getByTestId("smart-bag-drawer")).toHaveCount(0);
    await page.getByTestId("bundle-upsell-decline").click();
    await expect(page.getByTestId("razorpay-checkout-email-input")).toBeVisible();
    await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹249");
    await page.getByTestId("razorpay-checkout-close-btn").click();
    await expect(page.getByTestId("smart-bag-drawer")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("collection shows all five real products and exact individual comparison", async ({ page }) => {
  await page.goto("/restaurant-business-collection");
  await expect(page.getByTestId("collection-page-covers").locator("a")).toHaveCount(5);
  for (const book of activeBooks) await expect(page.getByTestId(`collection-book-${book.id}`)).toContainText(book.title);
  await expect(page.getByTestId("collection-page")).toContainText("₹1,245");
  await expect(page.getByTestId("collection-page")).toContainText("Save ₹746");
  await expect(page.getByTestId("purchase-original-price")).toContainText("₹1,245");
  await expect(page.getByTestId("book-reviews")).toContainText("original four-book collection");
  await expect(page.getByTestId("rating-summary")).toContainText("15 reviews");
  const whatsappUrl = new URL((await page.getByTestId("whatsapp-purchase").getAttribute("href"))!);
  expect(whatsappUrl.pathname).toBe("/919557156634");
  expect(whatsappUrl.searchParams.get("text")).toBe("I want to buy the Complete Restaurant Business Collection (all 5 books)");
  // Intercept WhatsApp locally: test the actual click without contacting the recipient.
  await page.context().route("https://wa.me/**", route => route.fulfill({ contentType: "text/html", body: "<p>WhatsApp link fixture</p>" }));
  const popupOpened = page.waitForEvent("popup");
  await page.getByTestId("whatsapp-purchase").click();
  const popup = await popupOpened;
  await expect(popup).toHaveURL(whatsappUrl.toString());
  await popup.close();
  await page.getByTestId("collection-page-add-all-btn").click();
  await expect(page.getByTestId("razorpay-checkout-modal")).toBeVisible();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await expect(page.getByTestId("smart-bag-drawer")).toHaveCount(0);
  await page.getByTestId("razorpay-checkout-close-btn").click();
  await page.getByTestId("collection-page-add-to-bag-btn").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("5 selected");
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText("499");
});

test("product and collection fit narrow mobile, tablet and desktop without broken images", async ({ page }, info) => {
  test.setTimeout(60000);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/books/empty-tables-to-full-house", "/restaurant-business-collection"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (path === "/restaurant-business-collection") {
        const contents = await page.getByTestId("collection-preview").boundingBox();
        const price = await page.getByTestId("collection-price-panel").boundingBox();
        expect(contents!.y + contents!.height).toBeLessThanOrEqual(price!.y + 1);
      }
      const images = page.locator("main img:visible");
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      }
      if (width === 320 || width === 1440) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: info.outputPath(`${path.includes('books/') ? 'product' : 'collection'}-${width}.png`), fullPage: true }); }
    }
  }
});

test("direct purchase preserves the bag, avoids duplicates and tracks checkout once per opening", async ({ page, context }) => {
  await context.addInitScript(() => {
    const fixture = window as unknown as Window & { fbq: (...args: unknown[]) => void; checkoutEvents: unknown[][] };
    fixture.checkoutEvents = [];
    fixture.fbq = (...args) => fixture.checkoutEvents.push(args);
  });
  await page.goto("/books/the-first-table");
  await page.getByTestId("book-detail-add-btn").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("1 selected");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("knowledge_concierge_bag_v1") || "[]"))).toEqual(["the-first-table"]);
  await page.getByTestId("smart-bag-close-btn").click();
  await page.goto("/books/the-full-table");
  await page.getByTestId("book-detail-buy-btn").click();
  await expect(page.getByTestId("smart-bag-drawer")).toHaveCount(0);
  await page.getByTestId("bundle-upsell-decline").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹399");
  const events = await page.evaluate(() => (window as unknown as Window & { checkoutEvents: unknown[][] }).checkoutEvents.filter(event => event[1] === "InitiateCheckout"));
  expect(events).toHaveLength(1);
  expect(events[0][2]).toMatchObject({ content_ids: ["the-first-table", "the-full-table"], value: 399, num_items: 2 });
  await page.getByTestId("razorpay-checkout-close-btn").click();
  await page.getByTestId("book-detail-add-btn").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText("2 selected");
  await page.getByTestId("smart-bag-close-btn").click();
  await expect(page.getByTestId("book-detail-add-btn")).toHaveText("Add to bag");
  await page.getByTestId("book-detail-buy-btn").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹399");
  await expect(page.getByTestId("bundle-upsell")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Window & { checkoutEvents: unknown[][] }).checkoutEvents.filter(event => event[1] === "InitiateCheckout").length)).toBe(2);
});

test("mobile purchase copy is compact and Add to Bag matches the other purchase buttons", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/books/the-full-table");
  await expect(page.getByTestId("product-subtitle")).toBeHidden();
  await expect(page.getByTestId("product-description")).toBeHidden();
  await expect(page.getByTestId("product-topic-preview")).toBeHidden();
  const copy = await page.getByTestId("product-mobile-description").boundingBox();
  const buy = await page.getByTestId("book-detail-buy-btn").boundingBox();
  const add = await page.getByTestId("book-detail-add-btn").boundingBox();
  const whatsapp = await page.getByTestId("product-price-panel").getByTestId("whatsapp-purchase").boundingBox();
  expect(copy!.height).toBeLessThanOrEqual(72);
  expect(buy!.y - (copy!.y + copy!.height)).toBeLessThan(160);
  expect(add!.width).toBe(buy!.width);
  expect(add!.width).toBe(whatsapp!.width);
  expect(add!.height).toBeGreaterThanOrEqual(48);
  await page.getByTestId("product-price-panel").screenshot({ path: info.outputPath("compact-purchase-panel.png") });
});

test("bundle recommendation buys directly through the shared checkout", async ({ page }) => {
  await page.goto("/books/the-full-table");
  await page.getByTestId("collection-primary-cta").click();
  await expect(page.getByTestId("razorpay-checkout-modal")).toBeVisible();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await expect(page.getByTestId("smart-bag-drawer")).toHaveCount(0);
});
