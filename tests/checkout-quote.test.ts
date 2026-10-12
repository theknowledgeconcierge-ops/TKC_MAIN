import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/orders/quote/route";
import { catalogue } from "@/lib/catalog";

beforeEach(() => vi.stubEnv("APP_URL", "http://localhost:3000"));
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/orders/quote", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
describe("checkout quote HTTP boundary", () => {
  it.each([[1, 249], [2, 399], [5, 499]])("quotes %i books without creating a payment or trusting client prices", async (count, total) => {
    const response = await POST(request({ book_ids: catalogue.slice(0, count).map(book => book.id), total: 1, amount_paise: 100 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total_inr: total, book_count: count });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects an invalid selection or coupon instead of displaying a fabricated price", async () => {
    expect((await POST(request({ book_ids: ["missing"] }))).status).toBe(400);
    expect((await POST(request({ book_ids: catalogue.map(book => book.id), coupon_code: "UNKNOWN" }))).status).toBe(400);
  });
  it("refuses cross-origin requests", async () => {
    expect((await POST(request({ book_ids: [catalogue[0].id] }, "https://other.example"))).status).toBe(403);
  });
});
