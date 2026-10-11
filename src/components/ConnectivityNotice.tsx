"use client";
import { useConnectivity } from "@/lib/connectivity";

export default function ConnectivityNotice({ stage = "payment" }: { stage?: "details" | "payment" | "paid" }) {
  const online = useConnectivity();
  if (online) return null;
  return <output data-testid="connectivity-notice" className="my-4 block border border-[#b49a6a]/40 bg-[#eadfcd] p-4 text-left text-sm leading-relaxed text-[#5d4b3f]">
    You&apos;re offline. {stage === "details" ? "Your checkout details stay in this tab. Your bag is saved when browser storage is available." : stage === "paid" ? "Reconnect to check delivery or retry a download. Your confirmed payment is preserved." : "We'll check your payment when your connection returns. Please don't make another payment yet."}
  </output>;
}
