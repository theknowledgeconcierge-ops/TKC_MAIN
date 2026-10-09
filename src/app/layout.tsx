import type { Metadata } from "next";
import { headers } from "next/headers";
import Storefront from "@/components/Storefront";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "The Knowledge Concierge | Knowledge, Curated.",
    template: "%s | The Knowledge Concierge",
  },
  description:
    "Practical restaurant business handbooks covering startup planning, marketing, operations and finance.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "The Knowledge Concierge",
    description: "Practical restaurant business handbooks. Knowledge, curated.",
    type: "website",
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
