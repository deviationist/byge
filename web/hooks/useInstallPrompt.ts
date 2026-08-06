import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

const KEY = "byge:install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * The PWA install affordance.
 *
 * Dismissal persists — `InstallPrompt` itself holds no state, deliberately, so
 * a remount would otherwise bring back a prompt the user already refused. That
 * is the difference between an offer and nagging.
 *
 * The prompt is only ever shown when the browser has actually offered it. On
 * iOS there is no `beforeinstallprompt` at all, so this stays silent rather
 * than showing an "Add" button that cannot do anything.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1",
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onPrompt = (e: Event) => {
      // Suppress the browser's own mini-infobar so ours is the only offer.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, "1");
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    // Either way the event is spent — the browser will fire a fresh one if the
    // user is still eligible.
    setDeferred(null);
  }, [deferred]);

  return { available: !!deferred && !dismissed, prompt, dismiss };
}
