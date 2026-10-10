import type { MetadataRoute } from "next";
import { isPreviewDeployment, PRODUCTION_ORIGIN } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: isPreviewDeployment()
      ? { userAgent: "*", disallow: "/" }
      : {
          userAgent: "*",
          allow: "/",
          // HTML purchase pages stay crawlable so crawlers can see noindex.
          disallow: ["/api/", "/api$", "/internal/"],
        },
    sitemap: `${PRODUCTION_ORIGIN}/sitemap.xml`,
  };
}
