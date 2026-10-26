import { expect, test } from "@playwright/test";
import { series } from "../../src/lib/catalog/series";
import { activeBooks } from "../../src/lib/catalog";
import {
  bookMetadata,
  PRODUCTION_ORIGIN,
  publicPages,
} from "../../src/lib/seo";

test.use({ javaScriptEnabled: false, userAgent: "Googlebot" });

const pages = [
  ...Object.values(publicPages),
  ...series.map(item => ({ path: item.path, title: `${item.name} & ₹499 Bundle`, description: item.description })),
  ...activeBooks.map((book) => ({
    path: `/books/${book.slug}`,
    title: (bookMetadata(book).title as { absolute: string }).absolute.replace(
      " | Pixel n Palm",
      "",
    ),
    description: book.description,
  })),
];

test("production robots and sitemap expose only canonical public URLs", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const policy = await robots.text();
  expect(policy).toContain("Allow: /");
  expect(policy).toContain("Disallow: /api/");
  expect(policy).not.toMatch(/Disallow: \/(?:\s|$)|Disallow: \/thank-you/);
  expect(policy).toContain(`Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`);
  expect(robots.headers()["cache-control"]).not.toContain("no-store");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  expect(urls.sort()).toEqual(
    pages
      .map(
        (page) => `${PRODUCTION_ORIGIN}${page.path === "/" ? "" : page.path}`,
      )
      .sort(),
  );
  expect(xml).not.toMatch(
    /localhost|netlify\.app|thank-you|checkout|payment|order|download|<lastmod>/,
  );
  expect(sitemap.headers()["cache-control"]).not.toContain("no-store");
});

test("every public page has server-rendered content, complete metadata, factual JSON-LD and working links/images", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const links = new Set<string>();
  const assets = new Set<string>();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const entry of pages) {
    const response = await page.goto(entry.path);
    expect(response?.status(), entry.path).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBeUndefined();
    const canonical = `${PRODUCTION_ORIGIN}${entry.path === "/" ? "" : entry.path}`;
    await expect(page).toHaveTitle(`${entry.title} | Pixel n Palm`);
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      "content",
      entry.description,
    );
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonical,
    );
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    for (const [property, expected] of Object.entries({
      "og:title": `${entry.title} | Pixel n Palm`,
      "og:description": entry.description,
      "og:url": canonical,
      "og:type": entry.path.startsWith("/books/") ? "book" : "website",
    })) {
      await expect(
        page.locator(`head meta[property="${property}"]`),
      ).toHaveAttribute("content", expected);
    }
    await expect(
      page.locator('head meta[name="twitter:card"]'),
    ).toHaveAttribute("content", "summary_large_image");
    await expect(
      page.locator('head meta[name="twitter:title"]'),
    ).toHaveAttribute("content", `${entry.title} | Pixel n Palm`);
    await expect(
      page.locator('head meta[name="twitter:description"]'),
    ).toHaveAttribute("content", entry.description);
    for (const selector of [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]) {
      const image = await page.locator(selector).getAttribute("content");
      expect(image).toMatch(/^https:\/\/pixelnpalm\.com\//);
      assets.add(new URL(image!).pathname);
    }
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.locator("main h1").evaluate((heading) => {
        for (
          let node: Element | null = heading;
          node;
          node = node.parentElement
        ) {
          if (Number(getComputedStyle(node).opacity) === 0) return false;
        }
        return true;
      }),
      entry.path,
    ).toBe(true);
    titles.add(await page.title());
    descriptions.add(entry.description);
    const data = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          nonce: (node as HTMLScriptElement).nonce,
          data: JSON.parse(node.textContent!),
        })),
      );
    expect(data.length).toBeGreaterThan(0);
    for (const node of data) {
      expect(node.nonce).not.toBe("");
      expect(response?.headers()["content-security-policy"]).toContain(
        `'nonce-${node.nonce}'`,
      );
      expect(JSON.stringify(node.data)).not.toMatch(
        /localhost|netlify\.app|aggregateRating|availability|isbn/,
      );
    }
    for (const anchor of await page
      .locator("a[href]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href")!),
      )) {
      if (anchor.startsWith("/")) links.add(anchor.split("#")[0]);
    }
    for (const image of await page.locator("img").evaluateAll((nodes) =>
      nodes.map((node) => ({
        src: node.getAttribute("src")!,
        alt: node.getAttribute("alt"),
        sizes: node.getAttribute("sizes"),
        controlLabel: node.closest("button")?.getAttribute("aria-label"),
      })),
    )) {
      // Preview thumbnails are decorative within descriptively labelled buttons.
      if (image.alt === "") expect(image.controlLabel).toBeTruthy();
      else expect(image.alt).toBeTruthy();
      expect(image.sizes).toBeTruthy();
      assets.add(image.src);
    }
    for (const icon of await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!)))
      assets.add(icon);
    const book = activeBooks.find(
      (book) => entry.path === `/books/${book.slug}`,
    );
    if (book) {
      await expect(page.getByTestId("product-description")).toHaveText(
        book.description,
      );
      for (const chapter of book.toc)
        await expect(page.getByTestId("product-toc-list")).toContainText(
          chapter,
        );
      const graph = data[0].data["@graph"];
      expect(graph[0]).toMatchObject({
        name: book.title,
        author: { name: book.author },
        offers: { price: book.selling_price_inr, priceCurrency: book.currency },
      });
    }
  }
  expect(titles.size).toBe(pages.length);
  expect(descriptions.size).toBe(pages.length);
  for (const link of links)
    expect((await request.get(link)).status(), link).toBe(200);
  for (const asset of assets) {
    const response = await request.get(asset);
    expect(response.status(), asset).toBe(200);
    expect(response.headers()["content-type"], asset).toMatch(/^image\//);
  }
});

test("FAQ and book contents work without JavaScript and preserve single-open FAQ behavior", async ({
  page,
}) => {
  await page.goto("/faq");
  await expect(page.getByTestId("faq-answer-0")).toBeHidden();
  await page.getByTestId("faq-toggle-0").click();
  await expect(page.getByTestId("faq-answer-0")).toBeVisible();
  await page.getByTestId("faq-toggle-1").click();
  await expect(page.getByTestId("faq-answer-0")).toBeHidden();
  await expect(page.getByTestId("faq-answer-1")).toBeVisible();
  await page.goto("/books/the-first-table");
  await expect(page.getByTestId("product-toc-list")).toBeHidden();
  await page.getByTestId("product-toc-toggle").click();
  await expect(page.getByTestId("product-toc-list")).toBeVisible();
});

test("transactional paths, 404s and duplicate URLs have safe indexing behavior", async ({
  page,
  request,
}) => {
  for (const path of [
    "/thank-you",
    "/thank-you?order=not-a-real-order",
    "/api/downloads",
    "/api/orders",
    "/checkout",
    "/payment/callback",
    "/orders",
    "/downloads",
    "/purchases",
  ]) {
    const response = await request.get(path);
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
  }
  await page.goto("/thank-you");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(
    0,
  );
  for (const path of ["/books/missing-book", "/missing-page"]) {
    expect((await page.goto(path))?.status()).toBe(404);
    expect(
      await page
        .locator('meta[name="robots"]')
        .evaluateAll((nodes) =>
          nodes.some((node) =>
            node.getAttribute("content")?.includes("noindex"),
          ),
        ),
    ).toBe(true);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
  await page.goto("/books/the-first-table?utm_source=seo-test&ref=campaign");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${PRODUCTION_ORIGIN}/books/the-first-table`,
  );
  const slash = await request.get("/books/", { maxRedirects: 0 });
  expect(slash.status()).toBe(308);
  expect(slash.headers().location).toBe("/books");
  const alias = await request.get("/books?utm_source=seo-test", {
    headers: { Host: "stately-praline-26f65f.netlify.app" },
    maxRedirects: 0,
  });
  expect(alias.status()).toBe(308);
  expect(alias.headers().location).toBe(
    `${PRODUCTION_ORIGIN}/books?utm_source=seo-test`,
  );
});
