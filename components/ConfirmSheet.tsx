import { useEffect, useRef } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { Button } from "./Button";

/**
 * For the one action in byge that cannot be undone.
 *
 * There is no account, no sync and no undo, so the honesty has to sit BEFORE
 * the action rather than in a toast after it: the sheet names the place, says
 * what is lost, and puts the plain word on the button ("Remove Cabin", not
 * "OK"). Cancel is "Keep it" so both buttons describe outcomes and neither is
 * a shrug.
 *
 * The destructive button is deliberately NOT red. Nothing else in byge uses
 * alarm colour — the blues are data — so a lone red button reads as an error
 * rather than a choice. It carries primary weight because it is what you came
 * here to do; the wording carries the caution instead.
 */
export type ConfirmSheetProps = {
  open: boolean;
  title: string;
  body: string;
  /** Optional monospace line naming exactly what is affected. */
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmSheet({
  open,
  title,
  body,
  detail,
  confirmLabel,
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const cancelRef = useRef<View | null>(null);

  // Focus lands on the SAFE option when the sheet opens, never the destructive
  // one — an inherited Return should keep your place, not delete it. Without
  // this, focus stays on the trigger behind the scrim and a keyboard user has
  // to hunt for a dialog that has already taken over the screen.
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    // RN's View type does not declare focus(); the web node has it.
    (cancelRef.current as unknown as HTMLElement | null)?.focus();
  }, [open]);

  // Escape closes. A confirmation you cannot dismiss with the keyboard is a
  // trap, and this one guards a destructive action.
  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      {/* Tapping the scrim cancels — the safe outcome, never the destructive one. */}
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: "var(--color-scrim)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        {/* Swallow presses inside the card so it does not dismiss itself. */}
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={title}
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 400,
            backgroundColor: "var(--color-surface)",
            borderWidth: 1,
            borderColor: "var(--color-line2)",
            borderRadius: 16,
            padding: 22,
            gap: 16,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              lineHeight: 30,
              letterSpacing: -0.3,
              color: "var(--color-ink)",
            }}
          >
            {title}
          </Text>

          <Text style={{ fontSize: 13.5, lineHeight: 22, color: "var(--color-ink2)" }}>
            {body}
          </Text>

          {detail ? (
            <Text
              style={{
                fontSize: 10.5,
                lineHeight: 18,
                color: "var(--color-ink3)",
                backgroundColor: "var(--color-sunk)",
                borderRadius: 9,
                paddingVertical: 11,
                paddingHorizontal: 13,
              }}
            >
              {detail}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
            <Button label={confirmLabel} onPress={onConfirm} variant="primary" />
            <Button
              ref={cancelRef}
              label={cancelLabel}
              onPress={onCancel}
              variant="secondary"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Copy for removing a saved place. Kept here so every caller says the same thing. */
export function removeLocationCopy(name: string, detail?: string) {
  return {
    title: `Remove ${name}?`,
    body:
      "This deletes the place and its saved answer from this device. " +
      "There is no account and no sync, so it cannot be brought back.",
    detail,
    confirmLabel: `Remove ${name}`,
    cancelLabel: "Keep it",
  };
}
