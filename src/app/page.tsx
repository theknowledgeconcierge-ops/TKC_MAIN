import Home from "@/views/Home";
import JsonLd from "@/components/JsonLd";
import { pageMetadata, publicPages, websiteStructuredData } from "@/lib/seo";

export const metadata = pageMetadata(publicPages.home);
export default function Page() {
  return (
    <>
      <JsonLd data={websiteStructuredData} />
      <Home />
    </>
  );
}
