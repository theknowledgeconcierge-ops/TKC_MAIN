import { ChevronDown } from "lucide-react";
import { PAYMENT_SUPPORT_EMAIL } from "@/lib/payment-support";
const faqs = [
  [
    "Are these physical books?",
    "No. These are downloadable digital PDF handbooks.",
  ],
  [
    "How will I receive my purchase?",
    "After a captured payment, download your PDFs from the purchase page in the same browser and confirm your delivery email. If you leave before confirming delivery, we automatically email the books to the address used at checkout once payment is confirmed. Copied purchase URLs do not grant access.",
  ],
  [
    "Can I buy books separately?",
    "Yes. Each title is available individually at ₹249.",
  ],
  [
    "What is included in the complete collection?",
    "All five restaurant business handbooks for a ₹499 promotional price. The regular collection price is ₹999.",
  ],
  [
    "How do collection savings work?",
    "One handbook is ₹249, two are ₹399, three are ₹549 and four are ₹699. All five have a ₹999 regular collection price and a ₹499 promotional price. Your exact payable amount is confirmed before payment.",
  ],
  [
    "Will these books guarantee restaurant success?",
    "No. They are educational resources designed to support better decisions, not a guarantee of business results.",
  ],
  ["Can I read these on my phone?", "Yes, using a compatible PDF reader."],
  [
    "Can I request a refund?",
    "Keep your Razorpay payment reference and order number when asking the seller about a refund. A processed refund revokes download access.",
  ],
  [
    "I paid but verification stopped. Should I pay again?",
    `Please don't make another payment yet. We check captured payments independently of your browser. Once confirmed, your books are also delivered to the email used at checkout. If you've completed a payment but can't access your books, email ${PAYMENT_SUPPORT_EMAIL} with your payment screenshot/reference and the email or mobile number used at checkout. We'll verify your payment and help deliver your books.`,
  ],
  [
    "What if my books haven't arrived by email?",
    `Check Spam/Promotions and try the purchase page in the browser used to pay. Confirmed purchases usually receive email within about 10 minutes. If delivery or downloads are unavailable, email ${PAYMENT_SUPPORT_EMAIL}. A screenshot/reference helps us investigate; we verify payment in Razorpay before arranging delivery.`,
  ],
];
export default function Faq() {
  return (
    <div
      className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8"
      data-testid="faq-page"
    >
      <p className="overline">Questions, answered</p>
      <h1
        className="mt-5 font-serif text-5xl text-[#29231f]"
        data-testid="faq-heading"
      >
        Frequently asked questions.
      </h1>
      <div
        className="mt-12 divide-y divide-[#2e241f]/10 border-y border-[#2e241f]/10"
        data-testid="faq-list"
      >
        {faqs.map(([question, answer], index) => (
          <details name="faq" className="group" key={question}>
            <summary
              className="flex w-full cursor-pointer list-none items-center justify-between gap-4 py-6 text-left font-serif text-2xl text-[#29231f] [&::-webkit-details-marker]:hidden"
              data-testid={`faq-toggle-${index}`}
            >
              <h2>{question}</h2>
              <ChevronDown className="size-5 shrink-0 text-[#8c6d46] transition-transform group-open:rotate-180" />
            </summary>
            <p
              className="max-w-2xl pb-6 text-base leading-relaxed text-[#6e655e]"
              data-testid={`faq-answer-${index}`}
            >
              {answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
