import { NextRequest } from "next/server";
import { commerce } from "@/lib/server/runtime";
import { boundary, json, readBody } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return boundary(async () => {
    const raw = await readBody(request, 65536);
    return json(
      await commerce().webhook(
        raw,
        request.headers.get("x-razorpay-signature"),
        request.headers.get("x-razorpay-event-id") ?? undefined,
      ),
    );
  });
}
