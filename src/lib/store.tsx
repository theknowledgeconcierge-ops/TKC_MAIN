"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
interface Store {
  selectedIds: string[];
  bagOpen: boolean;
  setBagOpen: (open: boolean) => void;
  addBook: (id: string) => void;
  addBooks: (ids: string[]) => void;
  removeBook: (id: string) => void;
  clearBag: () => void;
  removePurchased: (ids: string[]) => void;
  summary: BagSummary;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  useEffect(() => {
    setSelectedIds(sanitizeBag(readStorage(BAG_STORAGE_KEY)));
    setHydrated(true);
    const sync = (event: StorageEvent) => {
      if (event.key === BAG_STORAGE_KEY)
        setSelectedIds(sanitizeBag(readStorage(BAG_STORAGE_KEY)));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (hydrated) writeStorage(BAG_STORAGE_KEY, selectedIds);
  }, [selectedIds, hydrated]);
  const value = useMemo<Store>(
    () => ({
      selectedIds,
      bagOpen,
      setBagOpen,
      addBook: (id) => setSelectedIds((ids) => sanitizeBag([...ids, id])),
      addBooks: (ids) =>
        setSelectedIds((current) => sanitizeBag([...current, ...ids])),
      removeBook: (id) =>
        setSelectedIds((ids) => ids.filter((value) => value !== id)),
      removePurchased: (purchased) =>
        setSelectedIds((ids) => ids.filter((id) => !purchased.includes(id))),
      clearBag: () => setSelectedIds([]),
      summary: summaryFor(selectedIds),
    }),
    [selectedIds, bagOpen],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Missing StoreProvider");
  return store;
}
