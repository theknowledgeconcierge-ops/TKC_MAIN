import { activeBooks } from "@/lib/catalog";
export function GET() {
  return Response.json({ books: activeBooks });
}
