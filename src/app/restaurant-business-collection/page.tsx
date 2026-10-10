import Collection from "@/views/Collection";
import JsonLd from "@/components/JsonLd";
import { activeBooks } from "@/lib/catalog";
import { collectionStructuredData, pageMetadata, publicPages } from "@/lib/seo";
export const metadata = pageMetadata(publicPages.collection);
export default function Page() {
  return (
    <>
      <JsonLd
        data={collectionStructuredData(publicPages.collection, activeBooks)}
      />
      <Collection />
    </>
  );
}
