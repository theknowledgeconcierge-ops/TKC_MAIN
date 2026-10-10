import type { Metadata } from "next";
import { headers } from "next/headers";
import Storefront from "@/components/Storefront";
import { isPreviewDeployment, PRODUCTION_ORIGIN, SITE_NAME } from "@/lib/seo";
import "./globals.css";
const socialImage = {
  url: `${PRODUCTION_ORIGIN}/og-image.png`,
  width: 1200,
  height: 630,
  alt: "The Knowledge Concierge restaurant business handbooks on Pixel n Palm",
};
export const metadata: Metadata = {
  // Social crawlers need absolute image URLs.
  metadataBase: new URL(PRODUCTION_ORIGIN),
  title: {
    default: "Restaurant Business PDF Handbooks | Pixel n Palm",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Practical restaurant business handbooks covering startup planning, marketing, operations and finance.",
  ...(isPreviewDeployment() ? { robots: { index: false, follow: false } } : {}),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: SITE_NAME,
    description: "Practical restaurant business handbooks. Knowledge, curated.",
    type: "website",
    siteName: SITE_NAME,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "Practical restaurant business handbooks. Knowledge, curated.",
    images: [socialImage],
  },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <html lang="en">
      <head>
        <meta name="csp-nonce" content={nonce} />
      </head>
      <body>
        <Storefront>{children}</Storefront>
      </body>
    </html>
  );
}
