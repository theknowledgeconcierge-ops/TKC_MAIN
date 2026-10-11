import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { apiPost } from "@/lib/api";

const id = "bbf0142d-4ded-4709-b74c-c627156d633c";
const attempt = { fingerprint: "a".repeat(64), token: "b".repeat(43), order_id: id, book_ids: ["book"] };
let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("retains the same checkout identity in memory when storage is unavailable", async () => {
  vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
  const recovery = await import("@/lib/checkout-recovery");
  recovery.saveCheckoutAttempt(attempt);
  expect(recovery.getCheckoutAttempt()).toEqual(attempt);
  recovery.markPaymentAttempt(id);
  expect(recovery.getPaymentAttempt()?.order_id).toBe(id);
});
it("rejects corrupted/expired recovery references and never reads stored paid/authorization proof", async () => {
  const recovery = await import("@/lib/checkout-recovery");
  for (const invalid of [null, [], { fingerprint: 1 }, { ...attempt, order_id: "forged" }, { ...attempt, token: "bad" }]) {
    storage.set("tkc_checkout_attempt", JSON.stringify(invalid));
    expect(recovery.getCheckoutAttempt()).toBeNull();
  }
  for (const invalid of [{ order_id: id, started_at: 0 }, { order_id: "bad", started_at: Date.now() }, { order_id: id, started_at: Date.now() + 600000 }]) {
    storage.set("tkc_payment_attempt", JSON.stringify(invalid));
    expect(recovery.getPaymentAttempt()).toBeNull();
  }
  storage.set("tkc_checkout_attempt", JSON.stringify({ ...attempt, email: "fixture@example.com", paid: true, purchase_session: "forged" }));
  expect(recovery.getCheckoutAttempt()).toEqual(attempt);
});
it("prefers unsaved memory when old storage is readable but writes/removal fail, and honors another tab's later write", async () => {
  storage.set("tkc_checkout_attempt", JSON.stringify(attempt));
  storage.set("tkc_payment_attempt", JSON.stringify({ order_id: id, started_at: Date.now() }));
  window.localStorage.setItem = () => { throw new Error("quota"); };
  window.localStorage.removeItem = () => { throw new Error("blocked"); };
  const recovery = await import("@/lib/checkout-recovery");
  const next = { ...attempt, fingerprint: "c".repeat(64), token: "d".repeat(43) };
  recovery.saveCheckoutAttempt(next);
  expect(recovery.getCheckoutAttempt()).toEqual(next);
  const other = "aaf0142d-4ded-4709-b74c-c627156d633c";
  recovery.markPaymentAttempt(other);
  expect(recovery.getPaymentAttempt()?.order_id).toBe(other);
  recovery.clearPaymentAttempt(other);
  expect(recovery.getPaymentAttempt()).toBeNull();
  storage.set("tkc_checkout_attempt", JSON.stringify({ ...attempt, token: "e".repeat(43) }));
  expect(recovery.getCheckoutAttempt()?.token).toBe("e".repeat(43));
});
it("persists only a non-authorizing attempt reference and clears only the matching order", async () => {
  const recovery = await import("@/lib/checkout-recovery");
  recovery.markPaymentAttempt(id);
  expect(Object.keys(JSON.parse(storage.get("tkc_payment_attempt")!)).sort()).toEqual(["order_id", "started_at"]);
  recovery.clearPaymentAttempt("another-order");
  expect(recovery.getPaymentAttempt()?.order_id).toBe(id);
  recovery.clearPaymentAttempt(id);
  expect(recovery.getPaymentAttempt()).toBeNull();
});
it("expires an in-memory attempt too when persistent storage is blocked", async () => {
  vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
  const recovery = await import("@/lib/checkout-recovery");
  recovery.markPaymentAttempt(id);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 86400000);
  expect(recovery.getPaymentAttempt()).toBeNull();
});
it("fails offline server operations immediately without queuing a mutation", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(apiPost("/orders", {})).rejects.toMatchObject({ code: "CLIENT_OFFLINE" });
  expect(fetcher).not.toHaveBeenCalled();
});
