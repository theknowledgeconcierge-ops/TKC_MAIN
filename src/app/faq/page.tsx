import Faq from "@/views/Faq";
import JsonLd from "@/components/JsonLd";
import { breadcrumbStructuredData, pageMetadata, publicPages } from "@/lib/seo";
export const metadata = pageMetadata(publicPages.faq);
export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Questions & help", path: "/faq" },
        ])}
      />
      <Faq />
    </>
  );
}
