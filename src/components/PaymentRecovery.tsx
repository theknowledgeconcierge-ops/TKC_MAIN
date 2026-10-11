"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PAYMENT_LEAVE_COPY, PAYMENT_SUPPORT_EMAIL, PAYMENT_WAIT_COPY } from "@/lib/payment-support";
import ConnectivityNotice from "@/components/ConnectivityNotice";
import { useConnectivity } from "@/lib/connectivity";

export function PaymentSupport({ mode = "uncertain" }: { mode?: "uncertain" | "paid" | "email" }) {
  return <aside className="mt-5 text-left text-sm leading-relaxed text-[#6e655e]" data-testid="payment-support">
    <p className="font-medium text-[#29231f]">{mode === "email" ? "Your payment is safe and your books remain available for download in this browser." : mode === "paid" ? "Paid but can't access your books?" : "Payment issue?"}</p>
    <p>{mode === "email" ? "If delivery continues to fail, email " : mode === "paid" ? "Email " : "If you've completed a payment but can't access your books, contact "}
      <a className="inline-flex min-h-11 max-w-full items-center break-all underline" href={`mailto:${PAYMENT_SUPPORT_EMAIL}`}>{PAYMENT_SUPPORT_EMAIL}</a>
      {mode === "email" ? " and we'll help." : " with your payment screenshot/reference and the email or mobile number used at checkout. We'll verify your payment and help deliver your books."}
    </p>
  </aside>;
}

export function VerificationRecovery({ pending, confirmLeave, onContinue, onLeave, onCheckAgain }: {
  pending: boolean; confirmLeave: boolean; onContinue: () => void; onLeave: () => void; onCheckAgain: () => void;
}) {
  const [slow, setSlow] = useState(false);
  const online = useConnectivity();
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(timer);
  }, [pending]);
  return <section className="flex max-h-[calc(94dvh-8rem)] flex-col p-5 sm:p-6" data-testid="verification-recovery" aria-live="polite">
    <div className="min-h-0 overflow-y-auto overscroll-contain">
    <ConnectivityNotice />
    <h3 className="font-serif text-2xl text-[#29231f]">{confirmLeave ? "Payment verification is still in progress" : pending && !slow ? "Verifying payment…" : "We're still checking your payment."}</h3>
    <p className="mt-3 text-sm leading-relaxed text-[#6e655e]">{confirmLeave ? PAYMENT_LEAVE_COPY : pending && !slow ? "Please wait while we confirm your payment with Razorpay." : PAYMENT_WAIT_COPY}</p>
    {(confirmLeave || slow || !pending) && <PaymentSupport />}
    </div>
    <div className="mt-5 flex shrink-0 flex-col gap-3">
      {confirmLeave ? <>
        <Button className="min-h-11" onClick={onContinue} data-testid="verification-continue">Continue verification</Button>
        <Button className="min-h-11" variant="outline" onClick={onLeave} data-testid="verification-leave">Leave this page</Button>
      </> : !pending && <>
        <Button className="min-h-11" disabled={!online} onClick={onCheckAgain} data-testid="verification-check-again">Check again</Button>
        <Button className="min-h-11" variant="outline" onClick={onLeave}>Leave this page</Button>
      </>}
    </div>
  </section>;
}
