import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { dismissToast, subscribeToasts, TOAST_MS, type Toast } from "../lib/toast";

/**
 * Where mutation receipts are read.
 *
 * Mounted once at the root, above the navigator, so it survives the route
 * change between the screen that mutated and the screen you land on. See
 * `lib/toast.ts` for why this cannot be per-screen state and must not be a
 * route param.
 *
 * TWO RULES CARRIED OVER FROM THE INLINE NOTICE THIS REPLACES, because they
 * were right and only the delivery was wrong:
 *
 * IT NEVER OFFERS UNDO. There is none — the confirmation happened before the
 * deletion, and `ConfirmSheet` said in as many words that nothing is holding a
 * copy. A dead "Undo" implies a way back that does not exist.
 *
 * ONE SLOT FOR EVERY MUTATION — "Removed Cabin.", "Saved Cabin.", "Cabin now
 * covers 15 km." — so the pattern is learnable rather than per-action.
 *
 * WHAT A TOAST GIVES UP, stated plainly: it is transient, so it can be missed.
 * That is acceptable here precisely because none of these messages is load
 * bearing — every one of them confirms a change that is ALSO visible on the
 * screen behind it. The row is gone; the new row is there. The receipt is
 * courtesy, not the evidence.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <View
      testID="toast-host"
      // Never eats a tap meant for the screen underneath — only the toasts
      // themselves are interactive.
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        gap: 8,
        alignItems: "center",
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </View>
  );
}

function ToastRow({ toast }: { toast: Toast }) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <Pressable
      testID="toast"
      accessibilityRole="button"
      // The label names the message, so dismissing is not a mystery button.
      accessibilityLabel={t("toast.dismiss", { message: toast.text })}
      onPress={() => dismissToast(toast.id)}
      className="bg-sunk border-line"
      style={{
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        maxWidth: 420,
      }}
    >
      {/*
        `status` rather than `alert`: this reports something that already
        happened successfully. `alert` would interrupt a screen reader
        mid-sentence to announce a routine confirmation.
      */}
      <Text
        role="status"
        aria-live="polite"
        className="text-ink2 font-mono"
        style={{ fontSize: 11, lineHeight: 17 }}
      >
        {toast.text}
      </Text>
    </Pressable>
  );
}
