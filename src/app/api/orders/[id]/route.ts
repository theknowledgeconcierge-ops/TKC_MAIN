import { NextRequest } from "next/server";
import { orderIdSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  boundary,
  json,
  rateLimit,
  checkoutTokenFrom,
  purchaseSessionFrom,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return boundary(async () => {
    const id = orderIdSchema.parse((await context.params).id);
    const service = commerce();
    await rateLimit(request, service.repo, "read-order", 120, 60);
    return json(
      await service.read(
        id,
        checkoutTokenFrom(request, id),
        purchaseSessionFrom(request, id),
      ),
    );
  });
}
