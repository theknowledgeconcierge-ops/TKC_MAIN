import { NextRequest } from "next/server";
import { resumeSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  checkoutTokenFrom,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const { order_id: id, book_ids } = await readJson(request, resumeSchema);
    const service = commerce();
    await rateLimit(request, service.repo, "resume-order", 20, 60, id);
    return json(
      await service.resume(id, checkoutTokenFrom(request, id), book_ids),
    );
  });
}
