import About from "@/views/About";
import JsonLd from "@/components/JsonLd";
import { breadcrumbStructuredData, pageMetadata, publicPages } from "@/lib/seo";
export const metadata = pageMetadata(publicPages.about);
export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbStructuredData([{ name: "About", path: "/about" }])}
      />
      <About />
    </>
  );
}
