import { afterEach, describe, expect, it, vi } from "vitest";
import { activeBooks } from "@/lib/catalog";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  PRODUCTION_ORIGIN,
  bookMetadata,
  bookStructuredData,
  pageMetadata,
  publicPages,
  serializeJsonLd,
} from "@/lib/seo";

afterEach(() => vi.unstubAllEnvs());

describe("production SEO", () => {
  it.each([
    "http://localhost:3000",
    "https://stately-praline-26f65f.netlify.app",
    "https://preview--pixelnpalm.netlify.app",
    "https://www.pixelnpalm.com",
  ])("never derives SEO URLs from commerce APP_URL %s", (appUrl) => {
    vi.stubEnv("APP_URL", appUrl);
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    for (const page of Object.values(publicPages)) {
      const metadata = pageMetadata(page);
      expect(metadata.alternates?.canonical).toBe(
        `${PRODUCTION_ORIGIN}${page.path === "/" ? "" : page.path}`,
      );
      expect(metadata.openGraph).toMatchObject({
        url: `${PRODUCTION_ORIGIN}${page.path === "/" ? "" : page.path}`,
        type: "website",
        title:
          metadata.title && (metadata.title as { absolute: string }).absolute,
        description: page.description,
      });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(JSON.stringify(metadata)).not.toMatch(
        /localhost|netlify\.app|www\.pixelnpalm/,
      );
    }
  });

  it("lists only public canonical landing pages and active books", () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      ...Object.values(publicPages).map(
        (page) => `${PRODUCTION_ORIGIN}${page.path === "/" ? "" : page.path}`,
      ),
      ...activeBooks.map((book) => `${PRODUCTION_ORIGIN}/books/${book.slug}`),
    ]);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.join(" ")).not.toMatch(
      /thank-you|checkout|payment|order|download|api|\?/,
    );
    expect(sitemap().every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
  });

  it("allows public resources and noindex HTML to be crawled and references the production sitemap", () => {
    vi.stubEnv("DEPLOY_CONTEXT", "production");
    const policy = robots();
    expect(policy.sitemap).toBe(`${PRODUCTION_ORIGIN}/sitemap.xml`);
    expect(policy.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/api$", "/internal/"],
    });
  });

  it.each(["deploy-preview", "branch-deploy"])(
    "keeps %s out of search without leaking its origin",
    (context) => {
      vi.stubEnv("DEPLOY_CONTEXT", context);
      expect(pageMetadata(publicPages.home).robots).toEqual({
        index: false,
        follow: false,
      });
      expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(sitemap()).toEqual([]);
      expect(robots().sitemap).toBe(`${PRODUCTION_ORIGIN}/sitemap.xml`);
    },
  );

  it("gives every public page and book a distinct title and description", () => {
    const metadata = [
      ...Object.values(publicPages).map((page) => pageMetadata(page)),
      ...activeBooks.map(bookMetadata),
    ];
    expect(
      new Set(metadata.map((page) => JSON.stringify(page.title))).size,
    ).toBe(metadata.length);
    expect(new Set(metadata.map((page) => page.description)).size).toBe(
      metadata.length,
    );
    for (const book of activeBooks) {
      expect(bookMetadata(book).openGraph).toMatchObject({
        images: [
          {
            url: `${PRODUCTION_ORIGIN}${book.cover_image_url}`,
            alt: `${book.title} by ${book.author} cover`,
          },
        ],
      });
    }
  });

  it("uses only real catalogue facts in book schema and linked breadcrumbs", () => {
    for (const book of activeBooks) {
      const data = bookStructuredData(book);
      const product = data["@graph"][0];
      expect(product).toMatchObject({
        "@type": ["Product", "Book"],
        name: book.title,
        description: book.description,
        author: { "@type": "Person", name: book.author },
        numberOfPages: book.pages,
        bookFormat: "https://schema.org/EBook",
        encodingFormat: "application/pdf",
        offers: {
          price: book.selling_price_inr,
          priceCurrency: book.currency,
          url: `${PRODUCTION_ORIGIN}/books/${book.slug}`,
        },
      });
      expect(data["@graph"][1]).toMatchObject({ "@type": "BreadcrumbList" });
      expect(JSON.stringify(data)).not.toMatch(
        /aggregateRating|review|availability|isbn|priceValidUntil/i,
      );
      expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
    }
  });

  it("safely serializes structured data containing HTML-like content", () => {
    const data = { name: "</script><script>alert('test')</script>" };
    const json = serializeJsonLd(data);
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual(data);
  });
});
