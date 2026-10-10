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
  await expect(page.getByTestId("smart-bag-price-summary")).toContainText(
    "Promotional discount",
  );
  await expect(page.getByTestId("smart-bag-best-value-promo")).toHaveText(
    "Promo price",
  );
  await expect(page.locator("body")).not.toContainText(
    /eligib|first-time|returning customer/i,
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
test("five-book checkout shows the server-verified ₹499 promotional price on both screens", async ({
  page,
}) => {
  const requests: unknown[] = [];
  await page.route("**/api/orders", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    expect(body.book_ids).toEqual([...ids].sort());
    expect(body.email).toBe("buyer@example.com");
    for (const field of ["total", "amount_paise", "pricing", "eligible_first_time"])
      expect(body).not.toHaveProperty(field);
    await route.fulfill({
      json: {
        key_id: "rzp_test_fixture",
        payment_mode: "test",
        internal_order_id: "99a3cb9b-6ef1-4fb7-a60e-87a758e9f612",
        order_number: "TKC-five-fixture",
        razorpay_order_id: "order_fivefixture",
        amount_paise: 49900,
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
          coupon_code: "FIRST50",
          coupon_discount_inr: 500,
          total_inr: 499,
          total_savings_inr: 746,
          message: "Promotional collection price applied.",
        },
      },
    });
  });
  await page.goto("/restaurant-business-collection");
  await page.getByTestId("collection-page-add-all-btn").click();
  await page.getByTestId("smart-bag-checkout-btn").click();
  const estimate = page.getByTestId("razorpay-estimated-summary");
  for (const row of [
    /Selected books\s*5/,
    /Regular collection price\s*₹1,245/,
    /Collection discount\s*−₹246/,
    /Promotional discount\s*−₹500/,
    /Estimated total\s*₹499/,
  ])
    await expect(estimate).toContainText(row);
  const email = page.getByTestId("razorpay-checkout-email-input");
  await expect(email).toHaveAttribute("required", "");
  await expect(page.locator("#checkout-email-note")).toHaveText(
    "Your books and purchase receipt will be delivered here.",
  );
  await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
  await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
  await page.getByTestId("razorpay-checkout-coupon-input").fill("First50");
  for (const value of ["", "not-an-email"]) {
    await email.fill(value);
    await page.getByTestId("razorpay-create-order-btn").click();
    expect(
      await email.evaluate((node) => (node as HTMLInputElement).validity.valid),
    ).toBe(false);
  }
  expect(requests).toHaveLength(0);
  await email.fill("buyer@example.com");
  await page.getByTestId("razorpay-create-order-btn").click();
  await expect(page.getByTestId("razorpay-checkout-title")).toHaveText(
    "Review your order",
  );
  const review = page.getByTestId("razorpay-confirmed-summary");
  for (const row of [
    /Regular price\s*₹1,245/,
    /Collection discount\s*−₹246/,
    /Promotional discount\s*−₹500/,
    /Payable\s*₹499/,
  ])
    await expect(review).toContainText(row);
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await expect(page.getByTestId("razorpay-delivery-email")).toContainText(
    "buyer@example.com",
  );
  await expect(page.getByTestId("razorpay-open-btn")).toContainText(
    "Pay ₹499 with Razorpay",
  );
  await expect(page.getByTestId("razorpay-edit-details-btn")).toHaveText(
    "Edit customer details",
  );
  await expect(page.getByTestId("razorpay-price-change-notice")).toHaveCount(0);
  await expect(page.getByTestId("razorpay-checkout-modal")).not.toContainText(
    /eligib|first-time|returning|No email is required/i,
  );
  await expect(
    page.getByText("Save your private purchase link", { exact: true }),
  ).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
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
  await expect(page.getByTestId("thank-you-heading")).toHaveText([
    "Return to your purchases.",
  ]);
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
    download_authorized: true,
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
  expect(
    (await page.context().cookies()).some((cookie) =>
      cookie.name.includes("tkc_session_"),
    ),
  ).toBe(false);
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
test("legacy purchase links and a copied thank-you URL cannot unlock a clean browser", async ({
  page,
  request,
}) => {
  const id = "eeedc015-b764-4c98-8b40-f44955a71625";
  let exchanged = false;
  await page.route("**/api/orders/access", async (route) => {
    exchanged = true;
    await route.fulfill({ status: 404 });
  });
  await page.route(`**/api/orders/${id}`, (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: { message: "Open this purchase in the original browser." },
      },
    }),
  );
  await page.route("**/api/orders/reconcile", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { message: "Purchase session required." } },
    }),
  );
  await page.goto(`/thank-you?order=${id}#access=${"a".repeat(43)}`);
  // Array form retries until the route transition leaves exactly one page.
  await expect(page.getByTestId("thank-you-heading")).toHaveText([
    "This purchase is not available in this browser.",
  ]);
  await expect(page.getByTestId("thank-you-copy")).toHaveText(
    "Downloads and delivery settings are available only from the browser used to complete the purchase.",
  );
  await expect(page.getByTestId("thank-you-return-store")).toHaveAttribute(
    "href",
    "/books",
  );
  expect(new URL(page.url()).hash).toBe("");
  expect(exchanged).toBe(false);
  await expect(page.locator('[data-testid^="download-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="delivery-"]')).toHaveCount(0);
  await expect(page.getByTestId("thank-you-order-number")).toHaveCount(0);
  await expect(page.getByTestId("save-purchase-link")).toHaveCount(0);
  expect(
    (
      await request.post("/api/orders/access", {
        data: { order_id: id, token: "a".repeat(43) },
      })
    ).status(),
  ).toBe(405);
  expect(
    (
      await request.post("/api/orders/recovery-link", {
        data: { order_id: id },
      })
    ).status(),
  ).toBe(405);
});
test("a paid status without a purchase session never renders downloadable books", async ({
  page,
}) => {
  const id = "eeedc015-b764-4c98-8b40-f44955a71625";
  const order = {
    id,
    order_number: "TKC-no-session",
    status: "paid",
    download_authorized: false,
    books: [ids[0]],
    pricing: { total_inr: 249 },
    payment_mode: "test",
    entitlements: [],
  };
  for (const path of [`**/api/orders/${id}`, "**/api/orders/reconcile"])
    await page.route(path, (route) => route.fulfill({ json: order }));
  await page.goto(`/thank-you?order=${id}`);
  await expect(page.getByTestId("thank-you-heading")).toHaveText([
    "Payment confirmed. Purchase session unavailable.",
  ]);
  await expect(page.getByTestId("thank-you-copy")).toContainText(
    "Do not pay again",
  );
  await expect(page.locator('[data-testid^="download-"]')).toHaveCount(0);
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
  test(`${count}-book purchase retries callback verification, refreshes and downloads every PDF (external fixtures)`, async ({
    page,
  }) => {
    const selected = ids.slice(0, count);
    const id = "649c9c83-0758-4dd7-a853-054793b2209c";
    const total = [0, 249, 399, 549, 699, 499][count];
    let settled = false;
    let callbackReceived = false;
    let verificationAttempts = 0;
    const session = "s".repeat(43);
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
      download_authorized: settled,
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
      verificationAttempts++;
      if (verificationAttempts === 1) {
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Temporary verification outage.",
            },
          },
        });
      } else {
        settled = true;
        await route.fulfill({
          json: purchase(),
          headers: {
            "Set-Cookie": `tkc_session_${id}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
          },
        });
      }
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
      // The Strict session cookie still reaches same-origin download fetches.
      expect(await route.request().headerValue("cookie")).toContain(
        `tkc_session_${id}=${session}`,
      );
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
    await expect(page.getByTestId("checkout-save-purchase-link")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText(
      `₹${total}`,
    );
    expect(
      (await page.context().cookies()).some((cookie) =>
        cookie.name.startsWith("tkc_session_"),
      ),
    ).toBe(false);
    await page.getByTestId("razorpay-open-btn").click();
    await expect(page.getByTestId("thank-you-payment-status")).toHaveText(
      "paid",
    );
    expect(callbackReceived).toBe(true);
    expect(verificationAttempts).toBe(2);
    const cookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === `tkc_session_${id}`,
    )!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    expect(await page.evaluate(() => document.cookie)).not.toContain(session);
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain(session);
    expect(
      await page.evaluate(() => JSON.stringify(sessionStorage)),
    ).not.toContain(session);
    expect(await page.content()).not.toContain(session);
    expect(page.url()).not.toContain(session);
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

const deliveryOrderId = "5d2c3c7e-8f1a-4b6e-9d0c-2a7b9e4f1c63";
function deliveryOrder(delivery: Record<string, unknown>) {
  return {
    id: deliveryOrderId,
    order_number: "TKC-delivery-fixture",
    status: "paid",
    books: [ids[0], ids[1]],
    pricing: { total_inr: 399 },
    payment_mode: "test",
    download_authorized: true,
    entitlements: [
      { id: "5d2c3c7e-8f1a-4b6e-9d0c-2a7b9e4f1c60", product_id: ids[0] },
      { id: "5d2c3c7e-8f1a-4b6e-9d0c-2a7b9e4f1c61", product_id: ids[1] },
    ],
    delivery: {
      email: "checkout@example.com",
      status: "pending",
      locked: false,
      sent_at: null,
      error: null,
      can_retry: true,
      ...delivery,
    },
  };
}
async function routeDelivery(
  page: import("@playwright/test").Page,
  responses: Record<string, unknown>[],
) {
  let current = deliveryOrder({});
  const bodies: Record<string, unknown>[] = [];
  for (const path of [`**/api/orders/${deliveryOrderId}`, "**/api/orders/reconcile"])
    await page.route(path, (route) => route.fulfill({ json: current }));
  await page.route("**/api/orders/delivery", async (route) => {
    bodies.push(route.request().postDataJSON());
    current = deliveryOrder(responses.shift()!);
    await route.fulfill({ json: current });
  });
  return bodies;
}

test("post-purchase delivery confirms, survives a provider failure and locks after sending", async ({
  page,
}) => {
  const bodies = await routeDelivery(page, [
    { status: "failed", error: "provider_unavailable" },
    {
      status: "sent",
      locked: true,
      can_retry: false,
      sent_at: "2026-10-10T12:00:00.000Z",
    },
  ]);
  await page.goto(`/thank-you?order=${deliveryOrderId}`);
  // Array form retries until the route transition leaves exactly one page.
  await expect(page.getByTestId("thank-you-overline")).toHaveText([
    "✓ Payment successful",
  ]);
  await expect(page.getByTestId("thank-you-heading")).toHaveText([
    "Your 2 books are ready.",
  ]);
  const panel = page.getByTestId("delivery-pending");
  await expect(panel).toContainText("We'll send the PDFs to:");
  await expect(panel.getByTestId("delivery-email")).toHaveText(
    "checkout@example.com",
  );
  await expect(page.getByTestId("downloads-panel")).toBeVisible();
  await page.getByTestId("delivery-confirm-btn").click();
  const failed = page.getByTestId("delivery-failed");
  await expect(failed).toContainText("We couldn't send the email right now.");
  await expect(failed.getByRole("button", { name: "Download books now" })).toBeVisible();
  // Email failure never hides the paid state or browser downloads.
  await expect(page.getByTestId("thank-you-payment-status")).toHaveText("paid");
  await expect(page.getByTestId(`download-${ids[0]}`)).toBeEnabled();
  await page.getByTestId("delivery-retry-btn").click();
  const sent = page.getByTestId("delivery-sent");
  await expect(sent).toContainText("✓ Books sent");
  await expect(sent).toContainText("Your 2 books were sent to:");
  await expect(sent).toContainText("Check Spam/Promotions if you don't see the email.");
  await expect(page.getByTestId("delivery-change-btn")).toHaveCount(0);
  expect(bodies).toEqual([
    { order_id: deliveryOrderId },
    { order_id: deliveryOrderId },
  ]);
});

test("post-purchase delivery sends to a corrected email and offers no further changes", async ({
  page,
}) => {
  const bodies = await routeDelivery(page, [
    { email: "reader@example.com", status: "sent", locked: true, can_retry: false },
  ]);
  await page.goto(`/thank-you?order=${deliveryOrderId}`);
  await page.getByTestId("delivery-change-btn").click();
  const form = page.getByTestId("delivery-change-form");
  await expect(page.getByTestId("delivery-pending")).toContainText(
    "Current: checkout@example.com",
  );
  await expect(form).toContainText("Send my books instead to:");
  await page.getByTestId("delivery-email-input").fill("not-an-email");
  await page.getByTestId("delivery-update-btn").click();
  expect(bodies).toHaveLength(0);
  await page.getByTestId("delivery-email-input").fill("Reader@Example.com");
  await page.getByTestId("delivery-update-btn").click();
  await expect(page.getByTestId("delivery-sent").getByTestId("delivery-email")).toHaveText(
    "reader@example.com",
  );
  await expect(page.getByTestId("delivery-change-btn")).toHaveCount(0);
  await expect(page.getByTestId("delivery-email-input")).toHaveCount(0);
  // The client names its order and address only; recipients' files are chosen by the server.
  expect(bodies).toEqual([
    { order_id: deliveryOrderId, email: "reader@example.com" },
  ]);
});

test("download all requests exactly the purchased books from the authorized order", async ({
  page,
}) => {
  await routeDelivery(page, []);
  const requested: string[] = [];
  const files: string[] = [];
  await page.route("**/api/downloads", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.order_id).toBe(deliveryOrderId);
    const entitlement = deliveryOrder({}).entitlements.find(
      (item) => item.id === body.entitlement_id,
    )!;
    requested.push(entitlement.product_id);
    await route.fulfill({
      json: {
        url: `https://delivery-fixture.supabase.co/storage/v1/object/sign/handbooks/handbooks/${entitlement.product_id}.pdf?token=expiring-fixture`,
        expires_in: 60,
      },
    });
  });
  await page.route("https://delivery-fixture.supabase.co/**", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").at(-1)!;
    files.push(filename);
    await route.fulfill({
      contentType: "application/pdf",
      headers: { "Content-Disposition": `attachment; filename="${filename}"` },
      body: `%PDF-1.7\nfixture ${filename}\n%%EOF`,
    });
  });
  await page.goto(`/thank-you?order=${deliveryOrderId}`);
  await page.getByTestId("downloads-all-btn").click();
  await expect.poll(() => requested).toEqual([ids[0], ids[1]]);
  await expect.poll(() => files).toEqual([`${ids[0]}.pdf`, `${ids[1]}.pdf`]);
  await expect(page.getByTestId("thank-you-page")).toBeVisible();
});

test("a remembered order priced before a change is replaced by a fresh ₹499 order", async ({
  page,
}) => {
  const fixture = (id: string, gateway: string, total: number, message: string) => ({
    key_id: "rzp_test_fixture",
    payment_mode: "test",
    internal_order_id: id,
    order_number: `TKC-${id.replaceAll("-", "")}`,
    razorpay_order_id: gateway,
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
      coupon_code: total === 499 ? "FIRST50" : null,
      coupon_discount_inr: 999 - total,
      total_inr: total,
      total_savings_inr: 1245 - total,
      message,
    },
  });
  const staleId = "1f3e0d2c-0b4a-4c6d-8e7f-9a0b1c2d3e4f";
  const created: { checkout_token: string }[] = [];
  const resumed: unknown[] = [];
  await page.route("**/api/orders", async (route) => {
    created.push(route.request().postDataJSON());
    // First visit: the order a previous deployment priced at ₹999.
    await route.fulfill({
      status: 201,
      json:
        created.length === 1
          ? fixture(staleId, "order_staleprice", 999, "The standard collection price applies to returning customers.")
          : fixture("2a4f1e3d-1c5b-4d7e-9f80-a1b2c3d4e5f6", "order_freshprice", 499, "Promotional collection price applied."),
    });
  });
  await page.route("**/api/orders/resume", async (route) => {
    resumed.push(route.request().postDataJSON());
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: "CHECKOUT_PRICE_CHANGED",
          message: "Prices have changed since this checkout started.",
        },
      },
    });
  });
  await page.goto("/restaurant-business-collection");
  await page.getByTestId("collection-page-add-all-btn").click();
  const submit = async () => {
    await page.getByTestId("smart-bag-checkout-btn").click();
    await page.getByTestId("razorpay-checkout-name-input").fill("Test Buyer");
    await page.getByTestId("razorpay-checkout-email-input").fill("buyer@example.com");
    await page.getByTestId("razorpay-checkout-mobile-input").fill("9876543210");
    await page.getByTestId("razorpay-create-order-btn").click();
  };
  await submit();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹999");
  await page.getByTestId("razorpay-checkout-close-btn").click();
  if (!(await page.getByTestId("smart-bag-checkout-btn").isVisible()))
    await page.getByTestId("nav-bag-toggle-btn").click();

  // Same browser, same details: the remembered order is refused and replaced.
  await submit();
  await expect(page.getByTestId("razorpay-confirmed-total")).toHaveText("₹499");
  await expect(page.getByTestId("razorpay-open-btn")).toContainText("Pay ₹499 with Razorpay");
  await expect(page.getByTestId("razorpay-price-change-notice")).toHaveCount(0);
  await expect(page.getByText("Your order has been refreshed with the latest price.")).toBeVisible();
  await expect(page.getByTestId("razorpay-review-step")).not.toContainText("returning customers");
  expect(resumed).toEqual([{ order_id: staleId, book_ids: [...ids].sort() }]);
  expect(created).toHaveLength(2);
  expect(created[1].checkout_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(created[1].checkout_token).not.toBe(created[0].checkout_token);
  const remembered = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tkc_checkout_attempt") ?? "null"),
  );
  expect(remembered.order_id).toBe("2a4f1e3d-1c5b-4d7e-9f80-a1b2c3d4e5f6");
});
