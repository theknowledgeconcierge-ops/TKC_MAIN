import { NextRequest } from "next/server";
import { deliverySchema } from "@/lib/commerce/validation";
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
    const input = await readJson(request, deliverySchema);
    const service = commerce();
    await rateLimit(request, service.repo, "delivery", 10, 60, input.order_id);
    return json(
      await service.deliver(
        input.order_id,
        purchaseSessionFrom(request, input.order_id),
        input.email,
      ),
    );
  });
}
