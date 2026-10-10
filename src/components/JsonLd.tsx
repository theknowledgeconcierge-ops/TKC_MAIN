import { headers } from "next/headers";
import { serializeJsonLd } from "@/lib/seo";

export default async function JsonLd({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
