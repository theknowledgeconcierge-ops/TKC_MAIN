"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}
export const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
export const useConnectivity = () => useSyncExternalStore(subscribe, isOnline, () => true);

// Connectivity/history signals request fresh truth; they never authorize or start a payment.
export function useRecoveryEvents(check: () => void, enabled: boolean) {
  const latest = useRef(check);
  latest.current = check;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextCheck = 0;
    const schedule = () => {
      clearTimeout(timer);
      if (!isOnline() || document.visibilityState === "hidden" || Date.now() < nextCheck) return;
      timer = setTimeout(() => {
        if (!isOnline() || document.visibilityState === "hidden") return;
        nextCheck = Date.now() + 5000;
        latest.current();
      }, 750);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "tkc_payment_attempt" || event.key === "tkc_checkout_attempt") schedule();
    };
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("focus", schedule);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [enabled]);
}
