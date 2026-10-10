import { Suspense } from "react";
import ThankYou from "@/views/ThankYou";
export const metadata = {
  title: "Your purchase",
  robots: { index: false, follow: false },
  description:
    "View purchase status and access your purchased PDF handbooks in the browser used for payment.",
};
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Suspense
      fallback={<p className="p-12 text-center">Loading your purchase…</p>}
    >
      <ThankYou />
    </Suspense>
  );
}
