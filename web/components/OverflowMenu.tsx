import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Theme } from "../theme/useTheme";
import { MoreButton } from "./MoreButton";

/**
 * The one menu in byge.
 *
 * DropdownMenu and OverflowMenu are the same component. They differ only in what
 * opens them — a bare glyph in a nav bar, or a labelled button — so they are one
 * file with a `triggerText` prop rather than two implementations that drift
 * apart. The panel, the keyboard model and the focus contract are identical, and
 * that contract is the hard part; duplicating it is how one copy ends up without
 * an Escape handler.
 *
 * Its real job is Edit / Remove on the verdict screen. That is deliberately NOT
 * swipe-to-delete: swipe is keyboard-unreachable, awkward under a screen reader,
 * and meaningless in the two-pane desktop layout. A menu works on every viewport
 * and every input.
 *
 * KEYBOARD CONTRACT — a menu you cannot escape by keyboard is a trap:
 *
 *   ArrowDown/Up on the trigger  open, landing on the first / last item
 *   ArrowDown/Up in the menu     move, wrapping, skipping disabled items
 *   Home / End                   first / last
 *   Enter / Space                activate
 *   Escape                       close, focus RETURNS to the trigger
 *   Tab                          close and let focus move on — never trapped
 *
 * Enter/Space are handled here rather than left to the Pressable: these items
 * are divs with `role="menuitem"`, and a browser only synthesises a click from
 * Enter on real buttons. Relying on onPress alone would ship a menu that is
 * reachable by keyboard but cannot be activated by one.
 */
export type MenuItem = {
  key: string;
  label: string;
  /** Optional second line — e.g. that an action cannot be undone. */
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
};

export type OverflowMenuProps = {
  items: MenuItem[];
  theme: Theme;
  /** Accessible name of the trigger. */
  label?: string;
  /** Accessible name of the panel. Defaults to the trigger's name. */
  menuLabel?: string;
  /** Set this to get the labelled-dropdown shape instead of the bare glyph. */
  triggerText?: string;
  /** Which edge of the trigger the panel hangs from. */
  align?: "start" | "end";
  disabled?: boolean;
};

const el = (r: unknown) => r as unknown as HTMLElement | null;

export function OverflowMenu({
  items,
  theme,
  label = "More actions",
  menuLabel,
  triggerText,
  align = "end",
  disabled = false,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const wrapRef = useRef<View | null>(null);
  const triggerRef = useRef<View | null>(null);
  const itemRefs = useRef<(View | null)[]>([]);

  // Memoised so the document-level key handler below is not torn down and
  // rebound on every render.
  const enabled = useMemo(
    () => items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0),
    [items],
  );
  const firstEnabled = enabled.length ? enabled[0] : -1;
  const lastEnabled = enabled.length ? enabled[enabled.length - 1] : -1;

  const focusTrigger = useCallback(() => {
    el(triggerRef.current)?.focus();
  }, []);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      // Closing must never drop focus onto <body>. Escape and activation both
      // come back to the trigger; an outside click does not, because the user
      // has already chosen where to go.
      if (returnFocus) focusTrigger();
    },
    [focusTrigger],
  );

  const openAt = useCallback(
    (index: number) => {
      if (disabled) return;
      // Opens even when every item is disabled (index is then -1, and nothing
      // takes focus). Refusing to open would hide the fact that the actions
      // exist at all, which is the one thing a disabled row is there to say.
      setActive(index);
      setOpen(true);
    },
    [disabled],
  );

  const select = useCallback(
    (i: number) => {
      const item = items[i];
      if (!item || item.disabled) return;
      close(true);
      item.onSelect();
    },
    [items, close],
  );

  // Move focus onto the active item whenever it changes while open. Roving
  // tabindex (below) keeps exactly one item in the tab order.
  useEffect(() => {
    if (!open) return;
    el(itemRefs.current[active])?.focus();
  }, [open, active]);

  // Arrow-to-open on the trigger. Attached to the node rather than the document
  // so it only fires when the trigger itself has focus.
  useEffect(() => {
    const node = el(triggerRef.current);
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openAt(firstEnabled);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openAt(lastEnabled);
      }
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [open, openAt, firstEnabled, lastEnabled]);

  // Menu-level keys. On the document because focus sits on an item, and because
  // that guarantees Escape works no matter which item is focused.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const step = (dir: 1 | -1) => {
      if (!enabled.length) return;
      const at = enabled.indexOf(active);
      const next = at < 0 ? 0 : (at + dir + enabled.length) % enabled.length;
      setActive(enabled[next]);
    };

    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          close(true);
          break;
        case "ArrowDown":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          step(-1);
          break;
        case "Home":
          e.preventDefault();
          setActive(firstEnabled);
          break;
        case "End":
          e.preventDefault();
          setActive(lastEnabled);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          select(active);
          break;
        case "Tab":
          // Close but do NOT swallow the Tab — trapping focus in a menu that
          // only holds two actions is worse than letting it go.
          close(false);
          break;
        default:
          break;
      }
    };

    const onDown = (e: Event) => {
      const wrap = el(wrapRef.current);
      if (wrap && !wrap.contains(e.target as Node)) close(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, active, enabled, firstEnabled, lastEnabled, close, select]);

  return (
    <View ref={wrapRef} style={{ position: "relative" }}>
      <MoreButton
        ref={triggerRef}
        label={label}
        text={triggerText}
        expanded={open}
        disabled={disabled}
        onPress={() => (open ? close(false) : openAt(firstEnabled))}
      />

      {open ? (
        <View
          role="menu"
          aria-label={menuLabel ?? label}
          aria-orientation="vertical"
          className="bg-surface border-line2"
          style={{
            position: "absolute",
            top: "100%",
            marginTop: 6,
            ...(align === "end" ? { right: 0 } : { left: 0 }),
            minWidth: 200,
            zIndex: 50,
            borderWidth: 1,
            borderRadius: 12,
            paddingVertical: 6,
            ...({
              boxShadow:
                theme === "dark"
                  ? "0 10px 28px -10px rgba(0,0,0,.7)"
                  : "0 10px 28px -12px rgba(21,24,27,.35)",
            } as object),
          }}
        >
          {items.map((item, i) => (
            <Pressable
              key={item.key}
              ref={(r) => {
                itemRefs.current[i] = r;
              }}
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              tabIndex={i === active ? 0 : -1}
              disabled={item.disabled}
              onPress={() => select(i)}
              // Hovering moves the active item so pointer and keyboard cannot
              // disagree about which row is current.
              onHoverIn={() => !item.disabled && setActive(i)}
              className={i === active && !item.disabled ? "bg-sunk" : "bg-transparent"}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 14,
                paddingVertical: 8,
                gap: 2,
                opacity: item.disabled ? 0.4 : 1,
                ...(pressed ? { opacity: 0.7 } : null),
              })}
            >
              <Text className="text-ink" style={{ fontSize: 14.5 }}>
                {item.label}
              </Text>
              {item.hint ? (
                <Text className="text-ink3" style={{ fontSize: 11.5, lineHeight: 16 }}>
                  {item.hint}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The verdict screen's two actions, in one place so every caller words them the
 * same way. Remove says what it costs here rather than only in the sheet — by
 * the time the sheet is open the user has already decided.
 */
export function locationMenuItems(opts: {
  onEdit: () => void;
  onRemove: () => void;
}): MenuItem[] {
  return [
    {
      key: "edit",
      label: "Edit place",
      hint: "Name, coordinates and radius",
      onSelect: opts.onEdit,
    },
    { key: "remove", label: "Remove place", hint: "Cannot be undone", onSelect: opts.onRemove },
  ];
}
