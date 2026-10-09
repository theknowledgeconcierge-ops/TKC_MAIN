import { commerce } from "@/lib/server/runtime";
import { boundary, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return boundary(async () => {
    // Validates configuration and database/schema reachability without writes or customer data.
    await commerce().repo.getOrder("00000000-0000-4000-8000-000000000000");
    return json({ status: "ready" });
  });
}
