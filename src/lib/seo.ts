import type { Metadata } from "next";
import type { Book } from "./catalog";

// Commerce APP_URL also supports local/preview origins; search URLs never do.
export const PRODUCTION_ORIGIN = "https://pixelnpalm.com";
export const SITE_NAME = "Pixel n Palm";
// Match Next.js metadata's normalization of the root URL.
export const canonicalUrl = (path: string) =>
  `${PRODUCTION_ORIGIN}${path === "/" ? "" : path}`;
export const isPreviewDeployment = () =>
  ["deploy-preview", "branch-deploy"].includes(
    process.env.DEPLOY_CONTEXT ?? process.env.CONTEXT ?? "",
  );

export const privateRoutePrefixes = [
  "/api",
  "/thank-you",
  "/checkout",
  "/payment",
  "/payments",
  "/order",
  "/orders",
  "/success",
  "/download",
  "/downloads",
  "/purchase",
  "/purchases",
  "/account",
  "/internal",
];

export const publicPages = {
  home: {
    path: "/",
    title: "Restaurant Business PDF Handbooks",
    description:
      "Explore five practical PDF handbooks from The Knowledge Concierge on starting, marketing, managing and financing a restaurant in the Indian business context.",
  },
  books: {
    path: "/books",
    title: "Browse Restaurant Business Books & PDF Guides",
    description:
      "Find the restaurant handbook for your next decision: startup planning, customer demand, daily operations, menu costing or business growth. Browse all five PDFs.",
  },
  collection: {
    path: "/restaurant-business-collection",
    title: "The Complete Restaurant Business PDF Collection",
    description:
      "Discover all five restaurant business handbooks by Rakesh Chauhan, covering the journey from your first idea to marketing, operations, finance and rebuilding demand.",
  },
  about: {
    path: "/about",
    title: "About The Knowledge Concierge",
    description:
      "Learn about The Knowledge Concierge: practical business handbooks with Indian market context, worked examples, worksheets and frameworks for restaurant decisions.",
  },
  faq: {
    path: "/faq",
    title: "PDF Handbook Purchases & Downloads: FAQs",
    description:
      "Answers about restaurant PDF handbooks, individual books, collection savings, payment confirmation, reading on your phone, purchase access and refund requests.",
  },
  disclaimer: {
    path: "/disclaimer",
    title: "Disclaimer",
    description:
      "Read The Knowledge Concierge's educational disclaimer, including independent business decisions, accuracy, professional advice and limitations of liability.",
  },
  contact: {
    path: "/contact-us",
    title: "Contact Us",
    description:
      "Contact The Knowledge Concierge for book, payment, order and download support. Find customer support hours, business details and consumer grievance information.",
  },
  shipping: {
    path: "/shipping-delivery-policy",
    title: "Shipping & Delivery Policy",
    description:
      "Learn how The Knowledge Concierge delivers digital PDF books, when downloads become available, and how to get help with missing or delayed access.",
  },
  refunds: {
    path: "/refund-cancellation-policy",
    title: "Refund & Cancellation Policy",
    description:
      "Read The Knowledge Concierge's digital product refund and cancellation policy, including support for duplicate charges, missing downloads and technical problems.",
  },
} as const;

type SeoPage = { path: string; title: string; description: string };
type SeoImage = { url: string; alt: string; width?: number; height?: number };
const socialImage = {
  url: `${PRODUCTION_ORIGIN}/og-image.png`,
  width: 1200,
  height: 630,
  alt: "The Knowledge Concierge restaurant business handbooks on Pixel n Palm",
};

export function pageMetadata(
  page: SeoPage,
  image: SeoImage = socialImage,
): Metadata {
  const title = `${page.title} | ${SITE_NAME}`;
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: canonicalUrl(page.path) },
    robots: { index: !isPreviewDeployment(), follow: !isPreviewDeployment() },
    openGraph: {
      title,
      description: page.description,
      url: canonicalUrl(page.path),
      type: "website",
      siteName: SITE_NAME,
      locale: "en_IN",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
      images: [image],
    },
  };
}

export function bookMetadata(book: Book): Metadata {
  const metadata = pageMetadata(
    {
      path: `/books/${book.slug}`,
      title: book.seo_title,
      description: book.description,
    },
    {
      url: `${PRODUCTION_ORIGIN}${book.cover_image_url}`,
      alt: `${book.title} by ${book.author} cover`,
    },
  );
  return { ...metadata, openGraph: { ...metadata.openGraph, type: "book" } };
}

export function breadcrumbStructuredData(
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map(
      (item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: canonicalUrl(item.path),
      }),
    ),
  };
}

export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${PRODUCTION_ORIGIN}/#organization`,
      name: "The Knowledge Concierge",
      url: PRODUCTION_ORIGIN,
    },
    {
      "@type": "WebSite",
      "@id": `${PRODUCTION_ORIGIN}/#website`,
      name: SITE_NAME,
      alternateName: "The Knowledge Concierge",
      url: PRODUCTION_ORIGIN,
      publisher: { "@id": `${PRODUCTION_ORIGIN}/#organization` },
      inLanguage: "en",
    },
  ],
};

export function bookStructuredData(book: Book) {
  const url = `${PRODUCTION_ORIGIN}/books/${book.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Product", "Book"],
        "@id": `${url}#book`,
        name: book.title,
        alternativeHeadline: book.subtitle,
        description: book.description,
        url,
        image: `${PRODUCTION_ORIGIN}${book.cover_image_url}`,
        sku: book.id,
        author: { "@type": "Person", name: book.author },
        numberOfPages: book.pages,
        bookFormat: "https://schema.org/EBook",
        encodingFormat: "application/pdf",
        inLanguage: "en",
        offers: {
          "@type": "Offer",
          url,
          price: book.selling_price_inr,
          priceCurrency: book.currency,
          seller: { "@id": `${PRODUCTION_ORIGIN}/#organization` },
        },
      },
      breadcrumbStructuredData([
        { name: "Books", path: "/books" },
        { name: book.title, path: `/books/${book.slug}` },
      ]),
    ],
  };
}

export function collectionStructuredData(
  page: SeoPage,
  books: readonly Book[],
) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        url: canonicalUrl(page.path),
        name: page.title,
        description: page.description,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: books.length,
          itemListElement: books.map((book, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: book.title,
            url: `${PRODUCTION_ORIGIN}/books/${book.slug}`,
          })),
        },
      },
      breadcrumbStructuredData([{ name: page.title, path: page.path }]),
    ],
  };
}

export const serializeJsonLd = (data: Record<string, unknown>) =>
  JSON.stringify(data).replace(/</g, "\\u003c");
