import type { MetadataRoute } from "next";
import { series } from "@/lib/catalog/series";
import { activeBooks } from "@/lib/catalog";
import {
  canonicalUrl,
  isPreviewDeployment,
  PRODUCTION_ORIGIN,
  publicPages,
} from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (isPreviewDeployment()) return [];
  return [
    ...Object.values(publicPages).map((page) => ({
      url: canonicalUrl(page.path),
    })),
    ...series.map(item => ({ url: canonicalUrl(item.path) })),
    ...activeBooks.map((book) => ({
      url: `${PRODUCTION_ORIGIN}/books/${book.slug}`,
      images: [`${PRODUCTION_ORIGIN}${book.cover_image_url}`],
    })),
  ];
}
