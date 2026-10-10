import { NextRequest } from "next/server";
import { downloadSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  purchaseSessionFrom,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, downloadSchema);
    const service = commerce();
    await rateLimit(request, service.repo, "download", 30, 60, input.order_id);
    return json(
      await service.download(
        input.order_id,
        input.entitlement_id,
        purchaseSessionFrom(request, input.order_id),
      ),
    );
  });
}
