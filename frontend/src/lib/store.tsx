import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "knowledge_concierge_bag_v1";
const tierPrices: Record<number, number> = { 1: 249, 2: 399, 3: 549, 4: 699, 5: 999 };

export interface BagSummary {
  count: number;
  regularTotal: number;
  automaticPrice: number;
  automaticDiscount: number;
  couponDiscount: number;
  total: number;
  totalSavings: number;
}

interface StoreContextValue {
  selectedIds: string[];
  bagOpen: boolean;
  setBagOpen: (open: boolean) => void;
  addBook: (id: string) => void;
  removeBook: (id: string) => void;
  clearBag: () => void;
  summary: BagSummary;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const summaryFor = (ids: string[], eligibleFirstTime = true): BagSummary => {
  const count = Math.min(new Set(ids).size, 5);
  const regularTotal = count * 249;
  const automaticPrice = count === 5 ? 999 : (tierPrices[count] ?? 0);
  const automaticDiscount = regularTotal - automaticPrice;
  const couponDiscount = count === 5 && eligibleFirstTime ? 500 : 0;
  const total = automaticPrice - couponDiscount;
  return { count, regularTotal, automaticPrice, automaticDiscount, couponDiscount, total, totalSavings: regularTotal - total };
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [bagOpen, setBagOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);

  const value = useMemo<StoreContextValue>(() => ({
    selectedIds,
    bagOpen,
    setBagOpen,
    addBook: (id) => setSelectedIds((current) => current.includes(id) ? current : [...current, id]),
    removeBook: (id) => setSelectedIds((current) => current.filter((bookId) => bookId !== id)),
    clearBag: () => setSelectedIds([]),
    summary: summaryFor(selectedIds),
  }), [bagOpen, selectedIds]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
};
