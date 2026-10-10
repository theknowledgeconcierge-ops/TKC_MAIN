import { NextRequest } from "next/server";
import { reconcileSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  checkoutTokenFrom,
  purchaseSessionFrom,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const { order_id: id } = await readJson(request, reconcileSchema);
    const service = commerce();
    await rateLimit(request, service.repo, "reconcile-order", 20, 60, id);
    return json(
      await service.reconcile(
        id,
        checkoutTokenFrom(request, id),
        purchaseSessionFrom(request, id),
      ),
    );
  });
}
