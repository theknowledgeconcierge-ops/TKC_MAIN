import { notFound } from "next/navigation";
import Collection from "@/views/Collection";
import JsonLd from "@/components/JsonLd";
import { series, booksForSeries } from "@/lib/catalog/series";
import { collectionStructuredData, pageMetadata, PRODUCTION_ORIGIN } from "@/lib/seo";

export function generateStaticParams() { return series.map(item => ({ slug: item.id })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const info = series.find(item => item.id === slug);
  if (!info) notFound();
  return pageMetadata({ path: info.path, title: `${info.name} & ₹499 Bundle`, description: info.description }, { url: `${PRODUCTION_ORIGIN}${booksForSeries(info.id)[0].cover_image_url}`, alt: info.name });
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const info = series.find(item => item.id === slug);
  if (!info) notFound();
  return <><JsonLd data={collectionStructuredData({ path: info.path, title: info.name, description: info.description }, booksForSeries(info.id), info.bundlePrice)} /><Collection seriesId={info.id} /></>;
}
