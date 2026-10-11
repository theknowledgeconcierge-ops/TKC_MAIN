import type { ReactNode } from "react";
import JsonLd from "@/components/JsonLd";
import { breadcrumbStructuredData } from "@/lib/seo";

export default function InformationPage({
  title,
  path,
  children,
}: {
  title: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <>
      <JsonLd data={breadcrumbStructuredData([{ name: title, path }])} />
      <article
        className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8"
        data-testid="information-page"
      >
        <header className="border-b border-[#2e241f]/10 pb-8">
          <p className="overline">THE KNOWLEDGE CONCIERGE</p>
          <h1 className="mt-5 font-serif text-3xl leading-tight text-[#29231f] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-sm text-[#6e655e]">
            Last updated: <time dateTime="2026-10-11">11 October 2026</time>
          </p>
        </header>
        <div className="space-y-8 pt-8 text-base leading-relaxed text-[#6e655e] [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:text-[#29231f] [&_p]:mt-3 [&_a]:inline-block [&_a]:min-h-11 [&_a]:max-w-full [&_a]:content-center [&_a]:break-words [&_a]:text-[#8c6d46] [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </div>
      </article>
    </>
  );
}
