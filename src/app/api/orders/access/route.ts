import { NextRequest } from "next/server";
import { accessSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  setAccessCookie,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, accessSchema);
    const service = commerce();
    await rateLimit(request, service.repo, "access-order", 30, 60);
    await service.authorized(input.order_id, input.token);
    const response = json({ status: "authorized" });
    setAccessCookie(response, input.order_id, input.token);
    return response;
  });
}
