import { NextRequest } from "next/server";
import { verifySchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  tokenFrom,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, verifySchema);
    const service = commerce();
    await rateLimit(
      request,
      service.repo,
      "verify-payment",
      30,
      60,
      input.internal_order_id,
    );
    return json(
      await service.verify(input, tokenFrom(request, input.internal_order_id)),
    );
  });
}
