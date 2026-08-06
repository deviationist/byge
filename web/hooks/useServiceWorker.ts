import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Registers the service worker on web.
 *
 * Registration is deferred to after load so it never competes with the first
 * paint — byge promises an answer in under a second, and a worker install is
 * not worth delaying that for.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // No worker in dev: a stale cached shell during development is a debugging
    // trap that costs more than offline support is worth there.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing is not fatal — the app works online without it.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
}
