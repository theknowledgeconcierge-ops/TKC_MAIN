import "server-only";
import { randomUUID, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./errors";
import { serverEnv } from "./env";
import type { Repository } from "./contracts";

export const cookieName = (orderId: string) => `tkc_purchase_${orderId}`;
export const tokenFrom = (request: NextRequest, orderId: string) =>
  request.cookies.get(cookieName(orderId))?.value;
export function setAccessCookie(
  response: NextResponse,
  orderId: string,
  token: string,
) {
  response.cookies.set(cookieName(orderId), token, {
    httpOnly: true,
    secure:
      new URL(process.env.APP_URL ?? "http://localhost").protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function boundary(
  action: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const response = await action();
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    const known = error instanceof HttpError;
    const status = known
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 503;
    const code = known
      ? error.code
      : error instanceof z.ZodError
        ? "INVALID_REQUEST"
        : "SERVICE_UNAVAILABLE";
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "api_request_failed",
          request_id: requestId,
          code,
        }),
      );
    const response = json(
      {
        error: {
          code,
          message: known
            ? error.message
            : status === 400
              ? "Please check the submitted details and try again."
              : "We could not complete the request. Please retry shortly.",
          request_id: requestId,
        },
      },
      status,
    );
    response.headers.set("X-Request-Id", requestId);
    if (status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_URL;
  if (!configured)
    throw new HttpError(
      503,
      "CONFIGURATION_REQUIRED",
      "Application origin is not configured.",
    );
  if (
    origin !== new URL(configured).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(
      403,
      "INVALID_ORIGIN",
      "Please submit this request from the storefront.",
    );
}
export async function readBody(
  request: NextRequest,
  maxBytes = 16384,
): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}
export async function readJson<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new HttpError(415, "JSON_REQUIRED", "Send application/json.");
  const raw = await readBody(request);
  let data: unknown;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Invalid JSON request.");
  }
  return schema.parse(data);
}
export async function rateLimit(
  request: NextRequest,
  repo: Repository,
  scope: string,
  limit: number,
  seconds: number,
  orderId = "",
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = createHmac("sha256", serverEnv().SUPABASE_SERVICE_ROLE_KEY)
    .update(`${scope}:${ip}:${orderId}`)
    .digest("hex");
  if (!(await repo.rateLimit(key, limit, seconds)))
    throw new HttpError(
      429,
      "TOO_MANY_REQUESTS",
      "Too many requests. Please wait a minute and try again.",
    );
}
