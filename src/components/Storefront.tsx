"use client";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { StoreProvider, useCart, useCartActions } from "@/lib/store";
import SmartBag from "@/components/SmartBag";
import ConciergeChatbot from "@/components/ConciergeChatbot";
import BackToTop from "@/components/BackToTop";

function Header() {
  const { summary, persistenceError } = useCart();
  const { setBagOpen } = useCartActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const links = [
    ["/", "Home"],
    ["/books", "All Books"],
    ["/series/restaurant-playbooks", "Restaurant Series"],
    ["/series/start-selling-online", "Selling Online"],
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
          href="/books#bundles"
          className="-my-2 block min-h-11 content-center py-2 sm:min-h-0"
          data-testid="announcement-collection-link"
        >
          Nine practical business books · ₹199 each · Complete either series for ₹499{" "}
          <span className="ml-1 text-[#c5a880] sm:ml-2">Shop →</span>
        </Link>
      </div>
      <header
        className="sticky top-0 z-50 border-b border-[#2e241f]/10 bg-[#fbf9f5]/95 py-1.5 backdrop-blur-xl sm:py-4"
        data-testid="site-header"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 sm:gap-6 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-h-11 min-w-0 shrink flex-col justify-center sm:min-h-0"
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
            className="hidden items-center gap-4 lg:flex"
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
              className="mr-2 hidden text-xs text-[#8c6d46] lg:inline-block"
              data-testid="nav-purchases-link"
            >
              My purchases
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-w-11 px-2 sm:h-7 sm:min-w-0 sm:px-3"
              onClick={() => setBagOpen(true)}
              aria-label={`Open shopping bag, ${summary.count} ${summary.count === 1 ? "book" : "books"}`}
              data-testid="nav-bag-toggle-btn"
            >
              <ShoppingBag className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Bag</span>
              <span
                // Re-keyed so the count visibly pops the moment it changes.
                key={summary.count}
                className="animate-count-pop ml-1 inline-block font-mono text-xs"
                data-testid="nav-bag-count"
              >
                {summary.count}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8 lg:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              data-testid="nav-mobile-menu-btn"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {persistenceError && <p role="alert" className="px-4 py-2 text-sm text-[#9b3d32]">{persistenceError}</p>}
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="border-t border-[#2e241f]/10 px-4 pb-2 pt-4 lg:hidden"
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
            Practical handbooks for starting, managing and growing a business.
            Curated for clarity, built to be returned to.
          </p>
        </div>
        <div>
          <p className="overline text-[#c5a880]">Explore</p>
          <div className="mt-4 space-y-3 text-sm text-[#c5b7a8]">
            <Link
              href="/books"
              className="flex min-h-11 items-center hover:text-white sm:block sm:min-h-0"
              data-testid="footer-books-link"
            >
              All books
            </Link>
            <Link
              href="/restaurant-business-collection"
              className="flex min-h-11 items-center hover:text-white sm:block sm:min-h-0"
              data-testid="footer-collection-link"
            >
              Restaurant Playbook Series
            </Link>
            <Link href="/series/start-selling-online" className="flex min-h-11 items-center hover:text-white sm:block sm:min-h-0">Start Selling Online Series</Link>
            <Link
              href="/about"
              className="flex min-h-11 items-center hover:text-white sm:block sm:min-h-0"
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
            Return to My purchases in the browser used to complete payment. Keep
            your payment reference if you need help.
          </p>
          <Link
            href="/faq"
            className="mt-4 inline-flex min-h-11 items-center text-sm text-[#c5a880] sm:min-h-0"
          >
            Questions &amp; help
          </Link>
          <Link href="/thank-you" className="mt-3 flex min-h-11 items-center text-sm text-[#c5a880] sm:block sm:min-h-0">
            My purchases
          </Link>
        </div>
      </div>
      <nav
        aria-label="Policies and contact"
        className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-1 px-4 pb-8 text-sm text-[#c5b7a8] sm:px-6 lg:px-8"
      >
        {[
          ["/contact-us", "Contact Us"],
          ["/shipping-delivery-policy", "Shipping & Delivery Policy"],
          ["/refund-cancellation-policy", "Refund & Cancellation Policy"],
          ["/disclaimer", "Disclaimer"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="inline-flex min-h-11 items-center hover:text-white">
            {label}
          </Link>
        ))}
      </nav>
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
  // No keyed exit wrapper: it faded the new page out and remounted it on every navigation.
  return (
    <>
      <Header />
      <main>{children}</main>
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
