import { formatInr } from "@/lib/catalog";

export default function PurchasePrice({ original, price, sellingTestId }: { original: number; price: number; sellingTestId?: string }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4" data-testid="purchase-price">
    <del className="text-base text-[#75685c] decoration-1 sm:text-xl" data-testid="purchase-original-price"><span className="sr-only">Original price </span>{formatInr(original)}</del>
    <span aria-label={`Current price ${formatInr(price)}`} className="font-serif text-4xl font-semibold tracking-tight text-[#29231f] sm:text-5xl" data-testid={sellingTestId}>{formatInr(price)}</span>
    {original > price && <span className="rounded-full border border-[#cdb88c] bg-[#f5ecd9] px-2.5 py-1 text-[11px] font-semibold text-[#735325] sm:px-3 sm:text-xs">Save {formatInr(original - price)}</span>}
  </div>;
}
