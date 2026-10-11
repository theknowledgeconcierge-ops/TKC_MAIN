import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
// Android resizes the layout for the keyboard, so modal forms keep their buttons reachable.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    // Let Next suspend CSS smooth scrolling while restoring the route's scroll position.
    <html lang="en" data-scroll-behavior="smooth">
      <head>
  <meta name="csp-nonce" content={nonce} />

  <Script
    id="meta-pixel"
    strategy="afterInteractive"
    nonce={nonce}
  >
    {`
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window,document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');

      fbq('init', '1734846194265411');
      fbq('track', 'PageView');
    `}
  </Script>
</head>
      <body>
        <Storefront>{children}</Storefront>
      </body>
    </html>
  );
}
