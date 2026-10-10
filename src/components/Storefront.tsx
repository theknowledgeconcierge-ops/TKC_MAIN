"use client";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { StoreProvider, useStore } from "@/lib/store";
import SmartBag from "@/components/SmartBag";
import ConciergeChatbot from "@/components/ConciergeChatbot";
import BackToTop from "@/components/BackToTop";

function Header() {
  const { summary, setBagOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const links = [
    ["/", "Home"],
    ["/books", "All Books"],
    ["/restaurant-business-collection", "Collection"],
    ["/about", "About"],
  ];
  const handleNavigation = (
    href: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => {
    setMenuOpen(false);
    if (href === "/" && pathname === "/") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  return (
    <>
      <div
        className="bg-[#302821] px-3 py-2 text-center text-[10px] tracking-wide text-[#f7f4ee] sm:px-4 sm:text-xs"
        data-testid="announcement-bar"
      >
        <Link
          href="/restaurant-business-collection"
          data-testid="announcement-collection-link"
        >
          All 5 restaurant handbooks · ₹999 standard · ₹499 for eligible
          first-time buyers{" "}
          <span className="ml-1 text-[#c5a880] sm:ml-2">Shop →</span>
        </Link>
      </div>
      <header
        className="sticky top-0 z-50 border-b border-[#2e241f]/10 bg-[#fbf9f5]/95 py-3 backdrop-blur-xl sm:py-4"
        data-testid="site-header"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 sm:gap-6 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="min-w-0 shrink"
            onClick={(event) => handleNavigation("/", event)}
            data-testid="nav-brand-link"
          >
            <span className="block truncate font-serif text-sm tracking-[0.06em] text-[#29231f] min-[390px]:text-base sm:text-xl sm:tracking-[0.08em]">
              THE KNOWLEDGE CONCIERGE
            </span>
            <span className="mt-1 hidden text-[10px] uppercase tracking-[0.26em] text-[#8c6d46] sm:block">
              Knowledge, curated.
            </span>
          </Link>
          <nav
            className="hidden items-center gap-7 md:flex"
            data-testid="desktop-navigation"
          >
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={(event) => handleNavigation(href, event)}
                className={`text-sm ${pathname === href ? "text-[#8c6d46]" : "text-[#6e655e] hover:text-[#29231f]"}`}
                data-testid={`nav-${label.toLowerCase().replace(" ", "-")}-link`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/thank-you"
              className="mr-2 hidden text-xs text-[#8c6d46] md:inline-block"
              data-testid="nav-purchases-link"
            >
              My purchases
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="px-2 sm:px-3"
              onClick={() => setBagOpen(true)}
              aria-label="Open shopping bag"
              data-testid="nav-bag-toggle-btn"
            >
              <ShoppingBag className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Bag</span>
              <span
                className="ml-1 font-mono text-xs"
                data-testid="nav-bag-count"
              >
                {summary.count}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              data-testid="nav-mobile-menu-btn"
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menuOpen && (
          <nav
            className="border-t border-[#2e241f]/10 px-4 pb-2 pt-4 md:hidden"
            data-testid="mobile-navigation"
          >
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={(event) => handleNavigation(href, event)}
                className="block border-b border-[#2e241f]/10 py-3 text-sm text-[#6e655e]"
                data-testid={`mobile-nav-${label.toLowerCase().replace(" ", "-")}-link`}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/thank-you"
              onClick={(event) => handleNavigation("/thank-you", event)}
              className="block py-3 text-sm text-[#6e655e]"
              data-testid="mobile-nav-purchases-link"
            >
              My purchases
            </Link>
          </nav>
        )}
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer
      className="mt-24 bg-[#181412] text-[#f7f4ee]"
      data-testid="site-footer"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
        <div>
          <p className="font-serif text-2xl" data-testid="footer-brand">
            THE KNOWLEDGE CONCIERGE
          </p>
          <p
            className="mt-4 max-w-sm text-sm leading-relaxed text-[#c5b7a8]"
            data-testid="footer-description"
          >
            Practical handbooks for the decisions behind better restaurants.
            Curated for clarity, built to be returned to.
          </p>
        </div>
        <div>
          <p className="overline text-[#c5a880]">Explore</p>
          <div className="mt-4 space-y-3 text-sm text-[#c5b7a8]">
            <Link
              href="/books"
              className="block hover:text-white"
              data-testid="footer-books-link"
            >
              All books
            </Link>
            <Link
              href="/restaurant-business-collection"
              className="block hover:text-white"
              data-testid="footer-collection-link"
            >
              Complete collection
            </Link>
            <Link
              href="/about"
              className="block hover:text-white"
              data-testid="footer-about-link"
            >
              About the brand
            </Link>
          </div>
        </div>
        <div>
          <p className="overline text-[#c5a880]">Support</p>
          <p
            className="mt-4 text-sm leading-relaxed text-[#c5b7a8]"
            data-testid="footer-support-note"
          >
            Keep your private purchase link to return to your handbooks on any
            device.
          </p>
          <Link
            href="/faq"
            className="mt-4 inline-block text-sm text-[#c5a880]"
          >
            Questions &amp; help
          </Link>
          <Link href="/thank-you" className="mt-3 block text-sm text-[#c5a880]">
            My purchases
          </Link>
        </div>
      </div>
      <div
        className="border-t border-[#c5a880]/20 px-4 py-5 text-center text-xs text-[#9f9082]"
        data-testid="footer-copyright"
      >
        © {new Date().getFullYear()} THE KNOWLEDGE CONCIERGE. All rights
        reserved.
      </div>
    </footer>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <Header />
      <main>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <SmartBag />
      <BackToTop />
      <ConciergeChatbot />
      <Toaster />
    </>
  );
}

export default function Storefront({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <Shell>{children}</Shell>
      </StoreProvider>
    </QueryClientProvider>
  );
}
