import { NextRequest } from "next/server";
import { createOrderSchema } from "@/lib/commerce/validation";
import { quoteFor } from "@/lib/commerce/pricing";
import { assertSameOrigin, boundary, json, readJson } from "@/lib/server/http";
import { HttpError } from "@/lib/server/errors";

const quoteSchema = createOrderSchema.pick({ book_ids: true, coupon_code: true });
// Public catalogue pricing only: no order, payment or customer record is created.
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, quoteSchema);
    try {
      return json(quoteFor(input.book_ids, input.coupon_code));
    } catch {
      throw new HttpError(400, "INVALID_SELECTION", "Please review your books and coupon code.");
    }
  });
}
