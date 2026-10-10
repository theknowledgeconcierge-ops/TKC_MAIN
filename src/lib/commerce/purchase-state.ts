import type { PublicOrder } from "./types";

// Out-of-order responses cannot undo a terminal state already confirmed by the server.
export function mergePurchaseState(previous: PublicOrder | undefined, next: PublicOrder): PublicOrder {
  if (!previous || previous.id !== next.id) return next;
  if (previous.status === "refunded" && next.status !== "refunded") return previous;
  if (previous.status === "paid" && !["paid", "refunded"].includes(next.status)) return previous;
  if (next.status === "paid" && previous.delivery?.status === "sent")
    return { ...next, delivery: previous.delivery };
  return next;
}
