"use client";
import { MessageCircle, Send, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const answers: Record<string, string> = {
  "Which book should I start with?":
    "If you are planning a restaurant, start with The First Table. For a first online product business, start with From “Someday” to Sold. Each series also has its own complete bundle.",
  "What's included in the bundle?":
    "Choose the Restaurant Playbook Bundle (five books) or Start Selling Online Bundle (four books). Each bundle is ₹499; individual books are ₹199.",
  "How do I download my purchase?":
    "After payment is verified, download your handbooks on the purchase page in the same browser. We also email the PDFs to the address you confirm, so you can access them on any device.",
  "Are these physical books?":
    "No. These are digital PDF handbooks designed for reading and repeated reference on supported devices.",
};

export default function ConciergeChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const ask = (question: string) =>
    setMessages((current) => [
      ...current,
      `Q: ${question}`,
      `A: ${answers[question] ?? "Explore the handbooks or visit Questions & help for purchase and download guidance."}`,
    ]);
  return (
    // The wrapper spans the panel's box even while it is hidden; only its children may take taps.
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <div
        className={`max-h-[calc(100dvh-6rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto overscroll-contain border border-[#b49a6a]/40 bg-[#fbf9f5] shadow-2xl transition-all duration-300 ${open ? "pointer-events-auto translate-y-0 opacity-100" : "invisible translate-y-4 opacity-0"}`}
        inert={!open}
        data-testid="concierge-panel"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#181412] px-4 py-3 text-[#fbf9f5]">
          <div>
            <p className="font-serif text-lg">The Knowledge Assistant</p>
            <p
              className="mock-pill mt-1 bg-[#2e241f] text-[#e9dfcf]"
              data-testid="concierge-mock-badge"
            >
              HANDBOOK GUIDE
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-11 text-[#fbf9f5] hover:bg-white/10 hover:text-white sm:size-6"
            onClick={() => setOpen(false)}
            aria-label="Close knowledge assistant"
            data-testid="concierge-close-btn"
          >
            <X />
          </Button>
        </div>
        <div
          className="max-h-56 space-y-3 overflow-y-auto p-4"
          data-testid="concierge-messages"
        >
          {messages.length === 0 ? (
            <p className="text-sm leading-relaxed text-[#6e655e]">
              Ask about the right handbook, the collection, or how digital
              access works.
            </p>
          ) : (
            messages.map((message, index) => (
              <p
                key={`${message}-${index}`}
                className={`text-sm leading-relaxed ${message.startsWith("A:") ? "bg-[#f5f0e6] p-3 text-[#29231f]" : "text-[#8c6d46]"}`}
              >
                {message}
              </p>
            ))
          )}
        </div>
        <div className="space-y-2 border-t border-[#2e241f]/10 p-3">
          {Object.keys(answers)
            .slice(0, 3)
            .map((question) => (
              <button
                type="button"
                key={question}
                onClick={() => ask(question)}
                className="block min-h-11 w-full text-left text-xs text-[#6e655e] hover:text-[#29231f] sm:min-h-0"
                data-testid={`concierge-question-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                {question}
              </button>
            ))}
          <button
            type="button"
            className="mt-2 flex min-h-11 items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8c6d46] sm:min-h-0"
            onClick={() => ask("How do I download my purchase?")}
            data-testid="concierge-send-btn"
          >
            <Send className="size-3" />
            Ask the concierge
          </button>
        </div>
      </div>
      <Button
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto size-12 rounded-full bg-[#b49a6a] p-0 text-[#181412] shadow-xl hover:bg-[#99733e]"
        data-testid="concierge-toggle-btn"
        aria-label={open ? "Close knowledge assistant" : "Open knowledge assistant"}
        aria-expanded={open}
      >
        <MessageCircle className="size-5" />
      </Button>
    </div>
  );
}
