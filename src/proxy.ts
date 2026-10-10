import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.razorpay.com https://*.razorpay.in",
    "font-src 'self'",
    `connect-src 'self' https://*.razorpay.com https://*.razorpay.in${development ? " ws: wss:" : ""}`,
    "frame-src https://*.razorpay.com https://*.razorpay.in",
    "form-action 'self' https://*.razorpay.com",
    "upgrade-insecure-requests",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon|apple-touch|og-image|covers|robots\\.txt|sitemap\\.xml).*)",
  ],
};
