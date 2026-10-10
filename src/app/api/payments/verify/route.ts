import { NextRequest } from "next/server";
import { verifySchema } from "@/lib/commerce/validation";
import { commerce } from "@/lib/server/runtime";
import {
  assertSameOrigin,
  boundary,
  json,
  rateLimit,
  readJson,
  checkoutTokenFrom,
  purchaseSessionFrom,
  setPurchaseSessionCookie,
} from "@/lib/server/http";
import { HttpError } from "@/lib/server/errors";
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
    const order = await service.verify(
      input,
      checkoutTokenFrom(request, input.internal_order_id),
    );
    if (order.status !== "paid") return json(order);
    let session = purchaseSessionFrom(request, order.id);
    if (session) {
      try {
        await service.sessionOrder(order.id, session);
      } catch (error) {
        if (!(error instanceof HttpError && error.code === "PURCHASE_SESSION_REQUIRED")) throw error;
        session = undefined;
      }
    }
    session ??= await service.issuePurchaseSession(order.id, input.razorpay_payment_id);
    const response = json(await service.read(order.id, undefined, session));
    setPurchaseSessionCookie(response, order.id, session);
    return response;
  });
}
