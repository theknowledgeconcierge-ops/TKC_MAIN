import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="overline">Page not found</p>
      <h1 className="mt-5 font-serif text-4xl">
        Let’s get you back to the library.
      </h1>
      <Link href="/books" className="mt-8 inline-block underline">
        Browse the handbooks
      </Link>
    </div>
  );
}
