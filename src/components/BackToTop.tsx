"use client";
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 480);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  return (
    <Button
      size="icon"
      variant="outline"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-5 left-4 z-40 size-11 rounded-full sm:size-8 border-[#b49a6a]/60 bg-[#fbf9f5]/95 shadow-lg backdrop-blur-sm sm:left-5 ${visible ? "translate-y-0 opacity-100" : "pointer-events-none invisible translate-y-3 opacity-0"}`}
      data-testid="back-to-top-btn"
    >
      <ArrowUp className="size-4" />
    </Button>
  );
}
