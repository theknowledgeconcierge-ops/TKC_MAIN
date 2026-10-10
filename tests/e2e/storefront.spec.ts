import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
const ids = [
  "the-first-table",
  "the-full-table",
  "behind-the-kitchen-door",
  "the-math-behind-the-menu",
  "empty-tables-to-full-house",
];
test("all routes, five covers, responsive layout and product contents", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/",
    "/books",
    ...ids.map((id) => `/books/${id}`),
    "/restaurant-business-collection",
    "/about",
    "/faq",
    "/thank-you",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    ).toBe(true);
  }
  await page.goto("/books");
  await expect(page.locator('[data-testid^="book-card-item-"]')).toHaveCount(5);
  await page.goto("/restaurant-business-collection");
  await expect(
    page.getByTestId("collection-page-covers").locator("a"),
  ).toHaveCount(5);
  await expect(page.getByTestId("collection-page-heading")).toContainText(
    "Five books",
  );
  await expect(page.getByTestId("collection-page")).toContainText("₹999");
  await expect(page.getByTestId("collection-page")).toContainText("₹499");
  await page.goto("/books/empty-tables-to-full-house");
  await expect(page.getByTestId("product-progress-meter")).toContainText(
    "1 of 5 selected",
  );
  await page.getByTestId("product-toc-toggle").click();
  await expect(page.getByTestId("product-toc-list")).toContainText(
    "Understand Your Restaurant",
  );
  await page.goto("/books/the-first-table");
  await page.getByTestId("product-toc-toggle").click();
  await expect(page.getByTestId("product-toc-list")).toContainText("The Idea");
  expect(errors).toEqual([]);
  expect((await page.goto("/books/missing-book"))?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Let’s get you back to the library." }),
  ).toBeVisible();
});
test("bag persists, deduplicates and confirms Remove all", async ({ page }) => {
  await page.goto("/books");
  await page
    .getByRole("main")
    .getByTestId(`book-card-add-btn-${ids[0]}`)
    .click();
  await page.reload();
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  await page.goto("/restaurant-business-collection");
  await page.getByTestId("collection-page-add-all-btn").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText(
    "5 selected",
  );
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText(
    "499",
  );
  await expect(page.getByTestId("smart-bag-tier-progress")).toContainText(
    "100%",
  );
  await expect(page.getByTestId("smart-bag-milestone-stop-5")).toHaveAttribute(
    "data-best-value",
    "true",
  );
  await page.getByTestId("smart-bag-remove-empty-tables-to-full-house").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText(
    "4 selected",
  );
  await expect(page.getByTestId("smart-bag-tier-progress")).toContainText(
    "80%",
  );
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText(
    "699",
  );
  await page
    .getByTestId("smart-bag-recommend-add-empty-tables-to-full-house")
    .click();
  await page.getByTestId("smart-bag-remove-all-btn").click();
  await page.getByTestId("smart-bag-clear-cancel-btn").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText(
    "5 selected",
  );
  await page.getByTestId("smart-bag-remove-all-btn").click();
  await page.getByTestId("smart-bag-clear-confirm-btn").click();
  await expect(page.getByTestId("smart-bag-empty-state")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("collection-page-add-all-btn")).toBeFocused();
});
for (const eligible of [true, false]) {
  test(`five-book checkout reviews the server price for ${eligible ? "first-time" : "returning"} buyers`, async ({
    page,
  }) => {
    const total = eligible ? 499 : 999;
    await page.route("**/api/orders", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.book_ids).toEqual([...ids].sort());
      expect(body).not.toHaveProperty("total");
      expect(body).not.toHaveProperty("eligible_first_time");
      await route.fulfill({
        json: {
          key_id: "rzp_test_fixture",
          payment_mode: "test",
          internal_order_id: "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612",
          order_number: "TKC-five-fixture",
          razorpay_order_id: "order_fivefixture",
          amount_paise: total * 100,
          currency: "INR",
          customer_name: "Test Buyer",
          customer_email: "buyer@example.com",
          customer_mobile: "9876543210",
          description: "Five handbooks",
          pricing: {
            book_count: 5,
            regular_total_inr: 1245,
            automatic_discount_inr: 246,
            automatic_price_inr: 999,
            coupon_code: eligible ? "FIRST50" : null,
            coupon_discount_inr: eligible ? 500 : 0,
            total_inr: total,
            total_savings_inr: 1245 - total,
            eligible_first_time: eligible,
            eligibility_status: eligible ? "eligible" : "returning_customer",
            message: eligible
              ? "First50 applied for a first-time buyer."
              : "The standard collection price applies to returning customers.",
          },
        },
      });
    });
    await page.goto("/restaurant-business-collection");
    await page.getByTestId("collection-page-add-all-btn").click();
    await page.getByTestId("smart-bag-checkout-btn").click();
    await expect(page.getByTestId("razorpay-estimated-summary")).toContainText(
      "499",
    );
    await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
    await page
      .getByTestId("razorpay-checkout-email-input")
      .fill("buyer@example.com");
    await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
    await page.getByTestId("razorpay-checkout-coupon-input").fill("First50");
    await page.getByTestId("razorpay-create-order-btn").click();
    await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText(
      `₹${total}`,
    );
    await expect(page.getByTestId("razorpay-open-btn")).toContainText(
      `₹${total}`,
    );
  });
}
test("invalid browser persistence and forged success cannot unlock downloads", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("knowledge_concierge_bag_v1", '{"not":"an array"}');
    sessionStorage.setItem(
      "knowledge_concierge_last_order",
      JSON.stringify({ status: "paid", books: ["the-first-table"] }),
    );
  });
  await page.goto("/books");
  await expect(page.getByTestId("nav-bag-count")).toHaveText("0");
  await page.goto("/thank-you?order=123");
  await expect(page.getByTestId("thank-you-heading")).toHaveText(
    "Return to your purchases.",
  );
  await expect(page.locator('[data-testid^="download-"]')).toHaveCount(0);
});
test("checkout reviews server total and payment confirmation survives refresh (provider fixtures)", async ({
  page,
}) => {
  const id = "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612";
  const pricing = {
    book_count: 1,
    regular_total_inr: 249,
    automatic_discount_inr: 0,
    automatic_price_inr: 249,
    coupon_code: null,
    coupon_discount_inr: 0,
    total_inr: 249,
    total_savings_inr: 0,
    message: "Your collection price is ready.",
  };
  const checkout = {
    key_id: "rzp_test_fixture",
    payment_mode: "test",
    internal_order_id: id,
    order_number: "TKC-fixture",
    razorpay_order_id: "order_fixture",
    amount_paise: 24900,
    currency: "INR",
    pricing,
    customer_name: "Buyer",
    customer_email: "buyer@example.com",
    customer_mobile: "9876543210",
    description: "One handbook",
  };
  const order = {
    id,
    order_number: "TKC-fixture",
    status: "paid",
    books: [ids[0]],
    pricing,
    payment_mode: "test",
    entitlements: [{ id, product_id: ids[0] }],
  };
  await page.route("**/api/orders", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).not.toHaveProperty("total");
    expect(body.checkout_token).toHaveLength(43);
    await route.fulfill({ json: checkout });
  });
  await page.route("**/api/payments/verify", (route) =>
    route.fulfill({ json: order }),
  );
  await page.route("**/api/orders/reconcile", (route) =>
    route.fulfill({ json: order }),
  );
  await page.route(`**/api/orders/${id}`, (route) =>
    route.fulfill({ json: order }),
  );
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.Razorpay=class { constructor(o){this.o=o} on(e,f){this.fail=f} open(){if(!window.__gatewayAttempt){window.__gatewayAttempt=1;throw Error('fixture_network_failure')} if(document.querySelector('dialog:modal')) throw Error('gateway_blocked_by_native_modal'); const box=document.createElement('div'); box.style='position:fixed;inset:0;background:white;z-index:2147483647'; const pay=document.createElement('button'); pay.textContent='Confirm fixture payment'; pay.onclick=()=>{box.remove();this.o.handler({razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:'fixture'})}; const close=document.createElement('button'); close.textContent='Close fixture checkout'; close.onclick=()=>{box.remove();this.o.modal.ondismiss()}; const fail=document.createElement('button');fail.textContent='Fail fixture payment';fail.onclick=()=>this.fail();box.append(pay,close,fail);document.body.append(box)} };",
    }),
  );
  await page.goto("/books");
  await page
    .getByRole("main")
    .getByTestId(`book-card-add-btn-${ids[0]}`)
    .click();
  await page.getByTestId("nav-bag-toggle-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
  await page
    .getByTestId("razorpay-checkout-email-input")
    .fill("buyer@example.com");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toContainText(
    "249",
  );
  await page.getByTestId("razorpay-open-btn").click();
  await expect(
    page.getByText("Razorpay could not open", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("razorpay-confirmed-total")).toBeVisible();
  await page.getByTestId("razorpay-open-btn").click();
  await expect(
    page.getByRole("button", { name: "Confirm fixture payment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fail fixture payment" }).click();
  expect(await page.locator("dialog:modal").count()).toBe(0);
  await page.getByRole("button", { name: "Close fixture checkout" }).click();
  await expect(page.getByTestId("razorpay-confirmed-total")).toBeVisible();
  await page.getByTestId("razorpay-open-btn").click();
  await page.getByRole("button", { name: "Confirm fixture payment" }).click();
  await expect(page.getByTestId("thank-you-payment-status")).toHaveText("paid");
  await page.reload();
  await expect(page.getByTestId(`download-${ids[0]}`)).toBeEnabled();
});
test("production CSP uses a fresh nonce and API rejects invalid input", async ({
  page,
  request,
}) => {
  const a = await page.goto("/");
  const csp = a?.headers()["content-security-policy"];
  expect(csp).toContain("'nonce-");
  expect(csp).not.toContain("unsafe-eval");
  const b = await page.goto("/books");
  expect(b?.headers()["content-security-policy"]).not.toBe(csp);
  const response = await request.post("/api/orders", {
    headers: { Origin: "http://localhost:3100" },
    data: { book_ids: ["unknown"] },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  const pdf = await request.get("/handbooks/the-first-table.pdf");
  expect(pdf.status()).toBe(404);
});
test("private recovery fragment is exchanged before order reads and stripped from the URL", async ({
  page,
}) => {
  const id = "eeedc015-b764-4c98-8b40-f44955a71625";
  const token = "a".repeat(43);
  let authorized = false;
  let exchanges = 0;
  const order = {
    id,
    order_number: "TKC-recovered",
    status: "paid",
    books: [ids[0]],
    pricing: { total_inr: 249 },
    payment_mode: "test",
    entitlements: [{ id, product_id: ids[0] }],
  };
  await page.route("**/api/orders/access", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ order_id: id, token });
    authorized = true;
    exchanges++;
    await route.fulfill({ json: order });
  });
  await page.route(`**/api/orders/${id}`, (route) => {
    expect(authorized).toBe(true);
    return route.fulfill({ json: order });
  });
  await page.route("**/api/orders/reconcile", (route) => {
    expect(authorized).toBe(true);
    return route.fulfill({ json: order });
  });
  await page.goto(`/thank-you?order=${id}#access=${token}`);
  await expect(page.getByTestId("thank-you-payment-status")).toHaveText("paid");
  expect(new URL(page.url()).hash).toBe("");
  expect(exchanges).toBe(1);
  await expect(page.getByTestId(`download-${ids[0]}`)).toBeEnabled();
});
test("storefront still works when browser persistence is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/books");
  await page
    .getByRole("main")
    .getByTestId(`book-card-add-btn-${ids[0]}`)
    .click();
  await expect(page.getByTestId("nav-bag-count")).toHaveText("1");
  await page.getByTestId("nav-bag-toggle-btn").click();
  await expect(page.getByTestId("smart-bag-selected-count")).toHaveText(
    "1 selected",
  );
});

for (const count of [1, 2, 3, 4, 5]) {
  test(`${count}-book purchase recovers a lost callback, refreshes and downloads every PDF (external fixtures)`, async ({
    page,
  }) => {
    const selected = ids.slice(0, count);
    const id = "649c9c83-0758-4dd7-a853-054793b2209c";
    const total = [0, 249, 399, 549, 699, 499][count];
    let settled = false;
    let callbackReceived = false;
    let failDownload = true;
    const pricing = {
      book_count: count,
      regular_total_inr: count * 249,
      automatic_discount_inr: count * 249 - (count === 5 ? 999 : total),
      automatic_price_inr: count === 5 ? 999 : total,
      coupon_code: count === 5 ? "FIRST50" : null,
      coupon_discount_inr: count === 5 ? 500 : 0,
      total_inr: total,
      total_savings_inr: count * 249 - total,
      message: "Server verified collection price.",
    };
    const entitlements = selected.map((product_id, index) => ({
      id: `649c9c83-0758-4dd7-a853-054793b2209${index}`,
      product_id,
    }));
    const purchase = () => ({
      id,
      order_number: "TKC-lifecycle-fixture",
      status: settled ? "paid" : "payment_pending",
      books: selected,
      pricing,
      payment_mode: "test",
      entitlements: settled ? entitlements : [],
    });
    await page.route("**/api/orders", async (route) => {
      expect(route.request().postDataJSON().book_ids).toEqual(
        [...selected].sort(),
      );
      await route.fulfill({
        json: {
          key_id: "rzp_test_fixture",
          payment_mode: "test",
          internal_order_id: id,
          order_number: "TKC-lifecycle-fixture",
          razorpay_order_id: "order_lifecyclefixture",
          amount_paise: total * 100,
          currency: "INR",
          pricing,
          customer_name: "Lifecycle Buyer",
          customer_email: "buyer@example.com",
          customer_mobile: "9876543210",
          description: `${count} handbooks`,
        },
      });
    });
    await page.route("**/api/payments/verify", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        internal_order_id: id,
        razorpay_order_id: "order_lifecyclefixture",
        razorpay_payment_id: "pay_lifecyclefixture",
        razorpay_signature: "a".repeat(64),
      });
      callbackReceived = true;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Temporary verification outage. Check your purchase page.",
          },
        },
      });
    });
    await page.route(`**/api/orders/${id}`, (route) =>
      route.fulfill({ json: purchase() }),
    );
    await page.route("**/api/orders/reconcile", (route) =>
      route.fulfill({ json: purchase() }),
    );
    await page.route("**/api/downloads", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.order_id).toBe(id);
      expect(settled).toBe(true);
      const entitlement = entitlements.find(
        (item) => item.id === body.entitlement_id,
      );
      expect(entitlement).toBeDefined();
      if (failDownload) {
        failDownload = false;
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Temporary storage outage. Retry the download.",
            },
          },
        });
      } else
        await route.fulfill({
          json: {
            url: `https://delivery-fixture.supabase.co/storage/v1/object/sign/handbooks/handbooks/${entitlement!.product_id}.pdf?token=expiring-fixture`,
            expires_in: 60,
          },
        });
    });
    await page.route(
      "https://delivery-fixture.supabase.co/**",
      async (route) => {
        const filename = new URL(route.request().url()).pathname
          .split("/")
          .at(-1)!;
        expect(selected.map((book) => `${book}.pdf`)).toContain(filename);
        await route.fulfill({
          contentType: "application/pdf",
          headers: {
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
          body: `%PDF-1.7\nLifecycle fixture: ${filename}\n%%EOF`,
        });
      },
    );
    await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.Razorpay=class { constructor(o){this.o=o} on(){} open(){if(document.querySelector('dialog:modal')) throw Error('blocked_by_dialog'); if(this.o.amount!==${total * 100}||this.o.order_id!=='order_lifecyclefixture') throw Error('wrong_checkout_amount_or_order'); this.o.handler({razorpay_order_id:'order_lifecyclefixture',razorpay_payment_id:'pay_lifecyclefixture',razorpay_signature:'${"a".repeat(64)}'})} };`,
      }),
    );
    await page.goto("/books");
    for (const book of selected)
      await page
        .getByRole("main")
        .getByTestId(`book-card-add-btn-${book}`)
        .click();
    await page.getByTestId("nav-bag-toggle-btn").click();
    await page.getByTestId("smart-bag-checkout-btn").click();
    await page
      .getByTestId("razorpay-checkout-name-input")
      .fill("Lifecycle Buyer");
    await page
      .getByTestId("razorpay-checkout-email-input")
      .fill("buyer@example.com");
    await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
    await page.getByTestId("razorpay-create-order-btn").click();
    await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText(
      `₹${total}`,
    );
    await page.getByTestId("razorpay-open-btn").click();
    await expect(page.getByTestId("thank-you-heading")).toHaveText(
      "Processing payment…",
    );
    expect(callbackReceived).toBe(true);
    await expect(page.locator('[data-testid^="download-"]')).toHaveCount(0);
    settled = true;
    await page.getByTestId("check-payment-status").click();
    await expect(page.getByTestId("thank-you-payment-status")).toHaveText(
      "paid",
    );
    await page.reload();
    await expect(page.locator('[data-testid^="download-"]')).toHaveCount(count);
    await page.getByTestId(`download-${selected[0]}`).click();
    await expect(
      page.getByText("Temporary storage outage. Retry the download."),
    ).toBeVisible();
    for (const book of selected) {
      const downloading = page.waitForEvent("download");
      await page.getByTestId(`download-${book}`).click();
      const file = await downloading;
      expect(file.suggestedFilename()).toBe(`${book}.pdf`);
      expect(await readFile((await file.path())!, "utf8")).toContain(
        `Lifecycle fixture: ${book}.pdf`,
      );
      expect(await file.failure()).toBeNull();
    }
    await expect(page.getByTestId("thank-you-payment-status")).toHaveText(
      "paid",
    );
  });
}
