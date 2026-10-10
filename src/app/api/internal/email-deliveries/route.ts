import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { commerce } from "@/lib/server/runtime";
import { serverEnv } from "@/lib/server/env";
import { HttpError } from "@/lib/server/errors";
import { boundary, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Server-to-server only: called by the scheduled Netlify function with a shared secret.
export async function POST(request: NextRequest) {
  return boundary(async () => {
    const secret = serverEnv().EMAIL_DELIVERY_CRON_SECRET;
    if (!secret)
      throw new HttpError(
        503,
        "CONFIGURATION_REQUIRED",
        "Delivery fallback is not configured.",
      );
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new HttpError(404, "NOT_FOUND", "Not found.");
    // Counts only: no customer data leaves this endpoint or its logs.
    return json(await commerce().processFallbackDeliveries());
  });
}
