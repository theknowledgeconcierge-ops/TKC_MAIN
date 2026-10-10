import Library from "@/views/Library";
import JsonLd from "@/components/JsonLd";
import { activeBooks } from "@/lib/catalog";
import { collectionStructuredData, pageMetadata, publicPages } from "@/lib/seo";
export const metadata = pageMetadata(publicPages.books);
export default function Page() {
  return (
    <>
      <JsonLd data={collectionStructuredData(publicPages.books, activeBooks)} />
      <Library />
    </>
  );
}
