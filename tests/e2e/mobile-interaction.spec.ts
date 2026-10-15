import { addFromCard } from "./fixtures/shopping";
import { expect, test, type Page } from "@playwright/test";

// Keep fixture runs isolated from the production advertising dataset.
test.beforeEach(async ({ context }) => {
  // These regressions exercise checkout after the offer has already been declined.
  await context.addInitScript((books: string[]) => {
    for (let mask=1; mask < (1 << books.length); mask++) {
      const selection = books.filter((_, index) => mask & (1 << index)).sort().join(",");
      sessionStorage.setItem(`tkc_bundle_upsell_seen_${selection}`, "1");
    }
  }, [first, second]);
  await context.route("https://connect.facebook.net/**", route => route.abort());
  await context.route("https://www.facebook.com/**", route => route.abort());
});

const first = "the-first-table";
const second = "the-full-table";
const widths = [320, 360, 375, 390, 412, 430];

async function ready(page: Page, path = "/books") {
  await page.goto(path);
  // Exercise a hydrated handler before timing interactions.
  await page.getByTestId("nav-bag-toggle-btn").click();
  await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("smart-bag-drawer")).not.toBeVisible();
}

async function tapAtCenter(page: Page, testId: string, count = 1) {
  const button = page.getByTestId(testId);
  await button.evaluate((node) =>
    node.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const box = (await button.boundingBox())!;
  for (let i = 0; i < count; i++)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

for (const cpuRate of [1, 4]) test(`first tap reaches Add, badge and feedback within 100 ms without network (${cpuRate}x CPU slowdown)`, async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Touchscreen measurement");
  await ready(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  let requests = 0;
  await page.route("**/api/**", (route) => { requests++; return route.abort(); });
  await page.context().setOffline(true);
  await page.evaluate(() => {
    document.addEventListener("pointerup", () => performance.mark("cart-tap"), { once: true, capture: true });
    const badge = document.querySelector('[data-testid="nav-bag-count"]')!;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="nav-bag-count"]')?.textContent === "1") {
        observer.disconnect();
        requestAnimationFrame(() => performance.mark("cart-frame"));
      }
    });
    observer.observe(badge.parentElement!, { subtree: true, childList: true, characterData: true });
  });
  await tapAtCenter(page, `book-card-add-btn-${first}`);
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1", { timeout: 1000 });
  await expect(page.getByTestId(`book-card-add-btn-${first}`)).toContainText("In bag");
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName("cart-frame").length)).toBe(1);
  const latency = await page.evaluate(() => performance.getEntriesByName("cart-frame")[0].startTime - performance.getEntriesByName("cart-tap")[0].startTime);
  await info.attach("tap-to-frame-ms", { body: JSON.stringify({ latency, requests, cpuRate }), contentType: "application/json" });
  expect(latency).toBeLessThan(100);
  expect(requests).toBe(0);
  await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
  await page.evaluate(() => {
    document.addEventListener("pointerup", () => performance.mark("remove-tap"), { once: true, capture: true });
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="smart-bag-item-the-first-table"]')) {
        observer.disconnect();
        requestAnimationFrame(() => performance.mark("remove-frame"));
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });
  });
  await tapAtCenter(page, `smart-bag-remove-${first}`);
  await expect(page.getByTestId("nav-bag-count")).toHaveText("0");
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName("remove-frame").length)).toBe(1);
  const removeLatency = await page.evaluate(() => performance.getEntriesByName("remove-frame")[0].startTime - performance.getEntriesByName("remove-tap")[0].startTime);
  await info.attach("remove-tap-to-frame-ms", { body: JSON.stringify({ latency: removeLatency, requests, cpuRate }), contentType: "application/json" });
  expect(removeLatency).toBeLessThan(100);
  expect(requests).toBe(0);
});

test("ten rapid Add taps preserve one book and ten Remove taps preserve the next book", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Physical touch coordinates");
  await ready(page);
  await tapAtCenter(page, `book-card-add-btn-${first}`, 10);
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  await page.getByTestId("smart-bag-close-btn").click();
  await tapAtCenter(page, `book-card-add-btn-${second}`);
  await expect(page.getByTestId("smart-bag-drawer")).toBeVisible();
  await tapAtCenter(page, `smart-bag-remove-${first}`, 10);
  await expect(page.getByTestId(`smart-bag-item-${first}`)).toHaveCount(0);
  await expect(page.getByTestId(`smart-bag-item-${second}`)).toBeVisible();
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  await page.getByTestId(`smart-bag-recommend-add-${first}`).click();
  await expect(page.getByTestId(`smart-bag-item-${first}`)).toBeVisible();
  await page.getByTestId(`smart-bag-remove-${first}`).click();
  await page.keyboard.press("Escape");
  // A deliberate re-add after removal must add the book and reopen the bag.
  await tapAtCenter(page, `book-card-add-btn-${first}`);
  await expect(page.getByTestId("nav-bag-count")).toHaveText("2");
});

test("bag controls respond on the next frame after opening and focus returns", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Mobile drawer");
  await ready(page);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("nav-bag-toggle-btn").click();
    const operable = await page.getByTestId("smart-bag-close-btn").evaluate((button) => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    expect(operable).toBe(true);
    await page.getByTestId("smart-bag-close-btn").click();
    await expect(page.getByTestId("nav-bag-toggle-btn")).toBeFocused();
  }
});

test("ten rapid recommendation Add taps add only the intended book", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Physical touch coordinates");
  await ready(page);
  await addFromCard(page, first);
  await addFromCard(page, second);
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId(`smart-bag-remove-${second}`).click();
  await tapAtCenter(page, `smart-bag-recommend-add-${second}`, 10);
  await expect(page.getByTestId("nav-bag-count")).toHaveText("2");
  await expect(page.getByTestId(`smart-bag-item-${second}`)).toBeVisible();
});

test("a hidden assistant cannot intercept a lower-screen Add target", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Mobile hit testing");
  await ready(page);
  const button = page.getByTestId(`book-card-add-btn-${first}`);
  await button.evaluate((node) => {
    window.scrollBy({ top: node.getBoundingClientRect().y - (innerHeight - 180), behavior: "instant" });
  });
  expect(await button.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
});

test("assistant close stays reachable on a short screen after conversation grows", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Short mobile viewport");
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  await page.getByTestId("concierge-toggle-btn").click();
  const question = page.getByTestId("concierge-question-which-book-should-i-start-with-");
  await question.click();
  await question.click();
  const close = page.getByTestId("concierge-close-btn");
  const box = (await close.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  await close.click();
  await expect(page.getByTestId("concierge-panel")).not.toBeVisible();
});

for (const persistent of [true, false]) test(`cart ${persistent ? "persistent" : "transient"} storage failure rolls back a persisted removal with a clear error`, async ({ page }) => {
  await ready(page);
  await addFromCard(page, first);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("knowledge_concierge_bag_v1") || "[]").length)).toBe(1);
  await page.evaluate((persistent) => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (key === "knowledge_concierge_bag_v1" && (persistent || !failed)) {
        failed = true;
        throw new DOMException("Full", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  }, persistent);
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId(`smart-bag-remove-${first}`).click();
  await expect(page.getByTestId(`smart-bag-item-${first}`)).toBeVisible();
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByTestId("cart-storage-error")).toBeVisible();
  if (!persistent) {
    await page.getByTestId(`smart-bag-recommend-add-${second}`).click();
    await expect(page.getByTestId("cart-storage-error")).toHaveCount(0);
  } else {
    await page.getByTestId(`smart-bag-remove-${first}`).click();
    await expect(page.getByTestId(`smart-bag-item-${first}`)).toBeVisible();
    await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  }
});

test("a persisted cross-tab update becomes the rollback baseline when writes fail", async ({ page }) => {
  test.setTimeout(60000);
  await ready(page);
  await addFromCard(page, first);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("knowledge_concierge_bag_v1"))).toContain(first);
  const sibling = await page.context().newPage();
  await sibling.bringToFront();
  await ready(sibling);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await sibling.evaluate((id) => localStorage.setItem("knowledge_concierge_bag_v1", JSON.stringify([id])), second);
  await expect(page.getByTestId(`book-card-add-btn-${second}`)).toHaveAttribute("data-state", "in-bag");
  await expect(page.getByTestId(`book-card-add-btn-${first}`)).toHaveAttribute("data-state", "idle");
  await page.bringToFront();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId(`smart-bag-remove-${second}`).click();
  await expect(page.getByTestId(`smart-bag-item-${second}`)).toBeVisible();
  await expect(page.getByTestId("cart-storage-error")).toBeVisible();
  await sibling.close();
});

test("checkout acknowledges slow and failed requests, rejects duplicate submissions and verifies before success", async ({ page }) => {
  const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
  const pricing = { book_count: 1, regular_total_inr: 249, automatic_discount_inr: 0, automatic_price_inr: 249, coupon_discount_inr: 0, total_inr: 249, total_savings_inr: 0, message: "Confirmed" };
  let releaseOrder!: () => void;
  let releaseScript!: () => void;
  let releaseVerify!: () => void;
  const orderGate = new Promise<void>((resolve) => { releaseOrder = resolve; });
  const scriptGate = new Promise<void>((resolve) => { releaseScript = resolve; });
  const verifyGate = new Promise<void>((resolve) => { releaseVerify = resolve; });
  let requests = 0;
  const preparedCheckout = { key_id: "rzp_test_fixture", payment_mode: "test", internal_order_id: id, order_number: "TKC-mobile", razorpay_order_id: "order_mobile", amount_paise: 24900, currency: "INR", pricing, customer_name: "Test Buyer", customer_email: "buyer@example.com", customer_mobile: "9876543210", description: "One handbook" };
  await page.route(/\/api\/orders(?:\/resume)?$/, async (route) => {
    if (route.request().url().endsWith("/resume")) return route.fulfill({ json: preparedCheckout });
    requests++;
    await orderGate;
    if (requests === 1) return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Temporary outage. Please retry." } } });
    return route.fulfill({ json: preparedCheckout });
  });
  await page.route("https://checkout.razorpay.com/v1/checkout.js", async (route) => {
    await scriptGate;
    await route.fulfill({ contentType: "application/javascript", body: "window.Razorpay=class {constructor(o){this.o=o} on(){} open(){this.o.handler({razorpay_order_id:'order_mobile',razorpay_payment_id:'pay_mobile',razorpay_signature:'fixture'})}}" });
  });
  const order = { id, order_number: "TKC-mobile", status: "paid", books: [first], pricing, payment_mode: "test", download_authorized: true, entitlements: [] };
  await page.route("**/api/payments/verify", async (route) => { await verifyGate; await route.fulfill({ json: order }); });
  for (const path of [`**/api/orders/${id}`, "**/api/orders/reconcile"])
    await page.route(path, (route) => route.fulfill({ json: order }));
  await ready(page);
  await addFromCard(page, first);
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
  await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
  await page.getByTestId("razorpay-create-order-btn").evaluate((node) => { const button = node as HTMLButtonElement; button.click(); button.click(); button.click(); });
  await expect(page.getByTestId("razorpay-create-order-btn")).toHaveAttribute("aria-busy", "true");
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByTestId("razorpay-checkout-close-btn")).toBeDisabled();
  releaseOrder();
  await expect(page.getByTestId("checkout-notice")).toContainText("Temporary outage");
  await expect(page.getByTestId("razorpay-create-order-btn")).toBeEnabled();
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹249");
  await expect(page.getByTestId("razorpay-create-order-btn")).toContainText("Opening Razorpay…");
  await expect(page.getByTestId("razorpay-create-order-btn")).toHaveAttribute("aria-busy", "true");
  releaseScript();
  await expect(page.getByTestId("razorpay-open-btn")).toContainText("Verifying payment…");
  await expect(page.getByTestId("thank-you-payment-status")).toHaveCount(0);
  releaseVerify();
  await expect(page.getByTestId("thank-you-payment-status")).toHaveText("paid");
  expect(requests).toBe(2);
  await page.getByTestId("thank-you-explore-btn").click();
  await addFromCard(page, second);
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await expect(page.getByTestId("razorpay-checkout-name-input")).toBeVisible();
  await expect(page.getByTestId("razorpay-confirmed-summary")).toHaveCount(0);
});

for (const width of widths) {
  test(`journey has no horizontal overflow and mobile controls are comfortable at ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Mobile viewport matrix");
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    for (const path of ["/", "/books", `/books/${first}`, "/restaurant-business-collection", "/about", "/faq", "/disclaimer", "/contact-us", "/shipping-delivery-policy", "/refund-cancellation-policy", "/thank-you"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(1);
    }
    for (const control of [page.getByTestId("nav-brand-link"), page.getByTestId("announcement-collection-link"), ...await page.getByTestId("site-footer").getByRole("link").all()]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await ready(page);
    await addFromCard(page, first);
    await page.getByTestId("nav-bag-toggle-btn").click();
    for (const id of ["smart-bag-close-btn", "smart-bag-remove-all-btn", `smart-bag-remove-${first}`, "smart-bag-checkout-btn"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.width, id).toBeGreaterThanOrEqual(44);
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }
    expect(await page.getByTestId("smart-bag-drawer").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByTestId("smart-bag-checkout-btn").click();
    for (const id of ["razorpay-checkout-close-btn", "razorpay-checkout-name-input", "razorpay-checkout-email-input", "razorpay-create-order-btn"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height, id).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width, id).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width, height: 360 });
    await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
    await page.getByTestId("razorpay-create-order-btn").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("razorpay-create-order-btn")).toBeInViewport();
    await page.getByTestId("razorpay-checkout-close-btn").scrollIntoViewIfNeeded();
    await page.getByTestId("razorpay-checkout-close-btn").click();
    await page.keyboard.press("Escape");
    await page.getByTestId("nav-mobile-menu-btn").click();
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();
    await page.getByTestId("nav-mobile-menu-btn").click();
    await expect(page.getByTestId("mobile-navigation")).toHaveCount(0);

    const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
    const books = [first, second, "behind-the-kitchen-door", "the-math-behind-the-menu", "empty-tables-to-full-house"];
    const order = { id, order_number: "TKC-mobile-viewport", status: "paid", books, pricing: { total_inr: 499 }, payment_mode: "test", download_authorized: true, entitlements: books.map((product_id, i) => ({ id: `${id}-${i}`, product_id })), delivery: { email: "a-long-delivery-address-for-mobile-layout@example.com", status: "pending", locked: false, sent_at: null, error: null, can_retry: true } };
    for (const path of [`**/api/orders/${id}`, "**/api/orders/reconcile"])
      await page.route(path, (route) => route.fulfill({ json: order }));
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto(`/thank-you?order=${id}`);
    await expect(page.getByTestId("downloads-panel")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const control of [page.getByTestId("downloads-all-btn"), page.getByTestId(`download-${first}`), page.getByTestId("delivery-confirm-btn"), page.getByTestId("delivery-change-btn")]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId("delivery-change-btn").click();
    await expect(page.getByTestId("delivery-email-input")).toBeVisible();
    await expect(page.getByTestId("delivery-update-btn")).toBeVisible();
  });
}

test("a short mobile bag can scroll the selected item above its fixed checkout footer", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Short mobile viewport");
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  await addFromCard(page, first);
  await page.getByTestId("nav-bag-toggle-btn").click();
  const remove = page.getByTestId(`smart-bag-remove-${first}`);
  await remove.scrollIntoViewIfNeeded();
  expect(await remove.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  await remove.click();
  await expect(page.getByTestId(`smart-bag-item-${first}`)).toHaveCount(0);
});
