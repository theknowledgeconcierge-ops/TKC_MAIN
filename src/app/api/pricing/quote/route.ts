import { NextRequest } from "next/server";
import { quoteSchema } from "@/lib/commerce/validation";
import { quoteFor } from "@/lib/commerce/pricing";
import { assertSameOrigin, boundary, json, readJson } from "@/lib/server/http";
import { HttpError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return boundary(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, quoteSchema);
    try {
      return json(quoteFor(input.book_ids, null, input.coupon_code));
    } catch {
      throw new HttpError(
        400,
        "INVALID_SELECTION",
        "Please review the selected handbooks and coupon code.",
      );
    }
  });
}
