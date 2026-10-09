"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="font-serif text-4xl">We couldn’t load this page.</h1>
      <p className="mt-4">
        Please try again. Your payment status is kept securely on the server.
      </p>
      <button className="mt-8 underline" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
