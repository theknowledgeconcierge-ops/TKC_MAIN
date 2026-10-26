import Collection from "@/views/Collection";
import JsonLd from "@/components/JsonLd";
import { booksForSeries } from "@/lib/catalog/series";
import { collectionStructuredData, pageMetadata, publicPages } from "@/lib/seo";
export const metadata = pageMetadata(publicPages.collection);
export default function Page() {
  return (
    <>
      <JsonLd
        data={collectionStructuredData(publicPages.collection, booksForSeries("restaurant-playbooks"), 499)}
      />
      <Collection />
    </>
  );
}
