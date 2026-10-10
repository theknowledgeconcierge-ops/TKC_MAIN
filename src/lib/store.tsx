"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { activeBooks } from "./catalog";
import { quoteFor } from "./commerce/pricing";
import { readStorage, writeStorage } from "./browser-storage";
const BAG_STORAGE_KEY = "knowledge_concierge_bag_v1";
interface BagSummary {
  count: number;
  regularTotal: number;
  automaticPrice: number;
  automaticDiscount: number;
  couponDiscount: number;
  total: number;
  totalSavings: number;
}
function sanitizeBag(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === "string" && activeBooks.some((b) => b.id === id),
          ),
        ),
      ]
    : [];
}
export function summaryFor(ids: string[]): BagSummary {
  const selected = sanitizeBag(ids);
  if (!selected.length)
    return {
      count: 0,
      regularTotal: 0,
      automaticPrice: 0,
      automaticDiscount: 0,
      couponDiscount: 0,
      total: 0,
      totalSavings: 0,
    };
  const q = quoteFor(selected);
  return {
    count: q.book_count,
    regularTotal: q.regular_total_inr,
    automaticPrice: q.automatic_price_inr,
    automaticDiscount: q.automatic_discount_inr,
    couponDiscount: q.coupon_discount_inr,
    total: q.total_inr,
    totalSavings: q.total_savings_inr,
  };
}
interface Cart {
  selectedIds: string[];
  summary: BagSummary;
  persistenceError: string;
}
interface CartActions {
  setBagOpen: (open: boolean) => void;
  addBook: (id: string) => void;
  addBooks: (ids: string[]) => void;
  removeBook: (id: string) => void;
  clearBag: () => void;
  removePurchased: (ids: string[]) => void;
  announce: (message: string) => void;
}
// Split so that opening the bag or changing its contents re-renders only the
// components that read that piece, not every page that merely calls an action.
const CartContext = createContext<Cart | null>(null);
const BagOpenContext = createContext<boolean | null>(null);
const ActionsContext = createContext<CartActions | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const savedIds = useRef<string[] | null>(null);
  useEffect(() => {
    const saved = readStorage(BAG_STORAGE_KEY);
    const ids = sanitizeBag(saved);
    if (Array.isArray(saved)) savedIds.current = ids;
    setSelectedIds(ids);
    setHydrated(true);
    const sync = (event: StorageEvent) => {
      if (event.key === BAG_STORAGE_KEY || event.key === null) {
        const ids = sanitizeBag(readStorage(BAG_STORAGE_KEY));
        savedIds.current = ids;
        setSelectedIds(ids);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (writeStorage(BAG_STORAGE_KEY, selectedIds)) {
      // A successful restoration must not erase the failure notice before it can be read.
      if (selectedIds !== savedIds.current) setPersistenceError("");
      savedIds.current = selectedIds;
    } else if (savedIds.current) {
      if (selectedIds !== savedIds.current) setSelectedIds(savedIds.current);
      setPersistenceError(
        "Your bag could not be saved. Your last saved selection has been restored.",
      );
    } else {
      // With storage blocked from the outset, local shopping still works for this visit.
      setPersistenceError(
        (previous) => previous || "Browser storage is unavailable. Your bag will last for this visit only.",
      );
    }
  }, [selectedIds, hydrated]);
  const cart = useMemo<Cart>(
    () => ({ selectedIds, summary: summaryFor(selectedIds), persistenceError }),
    [selectedIds, persistenceError],
  );
  const actions = useMemo<CartActions>(
    () => ({
      setBagOpen,
      addBook: (id) => setSelectedIds((ids) => sanitizeBag([...ids, id])),
      addBooks: (ids) =>
        setSelectedIds((current) => sanitizeBag([...current, ...ids])),
      removeBook: (id) =>
        setSelectedIds((ids) => ids.filter((value) => value !== id)),
      removePurchased: (purchased) =>
        setSelectedIds((ids) => ids.filter((id) => !purchased.includes(id))),
      clearBag: () => setSelectedIds([]),
      // Alternate a trailing space so a repeated message is still re-announced.
      announce: (message) =>
        setAnnouncement((previous) =>
          previous === message ? `${message} ` : message,
        ),
    }),
    [],
  );
  return (
    <ActionsContext.Provider value={actions}>
      <BagOpenContext.Provider value={bagOpen}>
        <CartContext.Provider value={cart}>
          {children}
          <output
            className="sr-only"
            aria-live="polite"
            data-testid="cart-announcer"
          >
            {announcement}
          </output>
        </CartContext.Provider>
      </BagOpenContext.Provider>
    </ActionsContext.Provider>
  );
}
function required<T>(value: T | null): T {
  if (value === null) throw new Error("Missing StoreProvider");
  return value;
}
export const useCart = () => required(useContext(CartContext));
export const useBagOpen = () => required(useContext(BagOpenContext));
export const useCartActions = () => required(useContext(ActionsContext));
