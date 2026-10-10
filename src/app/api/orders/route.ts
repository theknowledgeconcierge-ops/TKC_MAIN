import { NextRequest } from "next/server";
import { createOrderSchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  setCheckoutCookie,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, createOrderSchema);
    const service = commerce();
    await rateLimit(request, service.repo, "create-order", 30, 3600);
    const order = await service.create(input);
    const response = json(order, 201);
    setCheckoutCookie(response, order.internal_order_id, input.checkout_token);
    return response;
  });
}
