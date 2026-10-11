import { readStorage, writeStorage } from "./browser-storage";

interface CheckoutAttempt {
  fingerprint: string;
  token?: string;
  order_id?: string;
  book_ids?: string[];
}
interface PaymentAttempt { order_id: string; started_at: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let checkoutMemory: CheckoutAttempt | null = null;
let paymentMemory: PaymentAttempt | null = null;
let checkoutWriteFailed = false;
let paymentWriteFailed = false;
let checkoutBeforeWrite: string | undefined;
let paymentBeforeWrite: string | undefined;
export function getCheckoutAttempt(): CheckoutAttempt | null {
  const stored = readStorage("tkc_checkout_attempt");
  if (checkoutWriteFailed && JSON.stringify(stored) === checkoutBeforeWrite) return checkoutMemory;
  checkoutWriteFailed = false;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return checkoutMemory;
  const value = stored as Partial<CheckoutAttempt>;
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    (value.token !== undefined && (typeof value.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.token))) ||
    (value.order_id !== undefined && (typeof value.order_id !== "string" || !uuid.test(value.order_id)))) return checkoutMemory;
  return {
    fingerprint: value.fingerprint,
    ...(value.token ? { token: value.token } : {}),
    ...(value.order_id ? { order_id: value.order_id } : {}),
    ...(Array.isArray(value.book_ids) && value.book_ids.length <= 5 && value.book_ids.every(id => typeof id === "string" && id.length <= 80) ? { book_ids: value.book_ids } : {}),
  };
}
export function saveCheckoutAttempt(attempt: CheckoutAttempt) {
  checkoutMemory = attempt;
  checkoutBeforeWrite = JSON.stringify(readStorage("tkc_checkout_attempt"));
  checkoutWriteFailed = !writeStorage("tkc_checkout_attempt", attempt);
}
export function getPaymentAttempt(): PaymentAttempt | null {
  const durable = readStorage("tkc_payment_attempt");
  const unsaved = paymentWriteFailed && JSON.stringify(durable) === paymentBeforeWrite;
  if (!unsaved) paymentWriteFailed = false;
  const stored = unsaved ? paymentMemory : durable ?? paymentMemory;
  if (!stored || typeof stored !== "object") return null;
  const value = stored as Partial<PaymentAttempt>;
  if (typeof value.order_id !== "string" || !uuid.test(value.order_id) ||
    typeof value.started_at !== "number" || !Number.isFinite(value.started_at) ||
    value.started_at > Date.now() + 60000 || Date.now() - value.started_at > 30 * 86400000) return null;
  return { order_id: value.order_id, started_at: value.started_at };
}
export function markPaymentAttempt(order_id: string) {
  // This records uncertainty, never payment success or authorization.
  paymentMemory = { order_id, started_at: Date.now() };
  paymentBeforeWrite = JSON.stringify(readStorage("tkc_payment_attempt"));
  paymentWriteFailed = !writeStorage("tkc_payment_attempt", paymentMemory);
}
export function clearPaymentAttempt(id: string) {
  if (getPaymentAttempt()?.order_id !== id) return;
  paymentMemory = null;
  paymentBeforeWrite = JSON.stringify(readStorage("tkc_payment_attempt"));
  try { window.localStorage.removeItem("tkc_payment_attempt"); paymentWriteFailed = false; }
  catch { paymentWriteFailed = true; }
}
