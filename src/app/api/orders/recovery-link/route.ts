import { NextRequest } from "next/server";
import { reconcileSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  tokenFrom,
} from "@/lib/server/http";
import { serverEnv } from "@/lib/server/env";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const { order_id: id } = await readJson(request, reconcileSchema);
    const service = commerce();
    await rateLimit(request, service.repo, "recovery-link", 10, 60, id);
    const token = tokenFrom(request, id);
    await service.authorized(id, token);
    const url = new URL("/thank-you", serverEnv().APP_URL);
    url.searchParams.set("order", id);
    url.hash = `access=${token}`;
    return json({ url: url.toString() });
  });
}
