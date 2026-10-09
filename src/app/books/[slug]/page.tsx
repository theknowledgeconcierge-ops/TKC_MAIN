import { notFound } from "next/navigation";
import Product from "@/views/Product";
import { activeBooks } from "@/lib/catalog";
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
  return {
    title: book?.title ?? "Handbook not found",
    description: book?.description,
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!activeBooks.some((book) => book.slug === slug)) notFound();
  return <Product slug={slug} />;
}
