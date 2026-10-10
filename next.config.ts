import type { NextConfig } from "next";
const context = process.env.CONTEXT ?? "";
const preview = ["deploy-preview", "branch-deploy"].includes(context);
const previewUrl = process.env.DEPLOY_PRIME_URL;
if (preview) {
  const url = URL.canParse(previewUrl ?? "") ? new URL(previewUrl!) : null;
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Netlify preview requires DEPLOY_PRIME_URL to be an HTTPS origin",
    );
}
const config: NextConfig = {
  // Netlify context/preview URLs are build-only. Never add credentials here.
  env: {
    DEPLOY_CONTEXT: context,
    ...(preview ? { APP_URL: previewUrl! } : {}),
  },
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};
export default config;
