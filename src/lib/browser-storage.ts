export function readStorage(key: string): unknown {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A blocked browser store must not break checkout. */
  }
}
export function rememberOrder(id: string) {
  const stored = readStorage("tkc_purchase_ids");
  const ids = Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === "string")
    : [];
  writeStorage("tkc_purchase_ids", [...new Set([id, ...ids])].slice(0, 12));
}
export function randomCheckoutToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
