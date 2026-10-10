import { notFound } from "next/navigation";
import Product from "@/views/Product";
import { activeBooks } from "@/lib/catalog";
import JsonLd from "@/components/JsonLd";
import { bookMetadata, bookStructuredData } from "@/lib/seo";
export const dynamicParams = false;
export function generateStaticParams() {
  return activeBooks.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = activeBooks.find((book) => book.slug === slug);
  if (!book) notFound();
  return bookMetadata(book);
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = activeBooks.find((book) => book.slug === slug);
  if (!book) notFound();
  return (
    <>
      <JsonLd data={bookStructuredData(book)} />
      <Product slug={slug} />
    </>
  );
}
