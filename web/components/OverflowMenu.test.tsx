import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { locationMenuItems, type MenuItem, OverflowMenu } from "./OverflowMenu";

function items(over: Partial<Record<"edit" | "remove", () => void>> = {}): MenuItem[] {
  return [
    { key: "edit", label: "Edit place", onSelect: over.edit ?? (() => {}) },
    { key: "remove", label: "Remove place", onSelect: over.remove ?? (() => {}) },
  ];
}

const trigger = () => screen.getByRole("button", { name: "More actions" });
const openMenu = () => fireEvent.click(trigger());

describe("OverflowMenu opening and closing", () => {
  it("starts closed", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on the trigger", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("toggles shut on a second press", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    openMenu();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("reflects open state on the trigger", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    openMenu();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on an outside press", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("stays open when pressed inside", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("does not open when disabled", () => {
    render(<OverflowMenu items={items()} theme="light" disabled />);
    fireEvent.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("OverflowMenu keyboard", () => {
  it("Escape closes and returns focus to the trigger", () => {
    // A menu you cannot escape by keyboard is a trap, and closing onto <body>
    // is only marginally better — the user loses their place entirely.
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("Escape never selects anything", () => {
    const edit = vi.fn();
    const remove = vi.fn();
    render(<OverflowMenu items={items({ edit, remove })} theme="light" />);
    openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(edit).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("focuses the first item on open", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("ArrowDown on the trigger opens onto the first item", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("ArrowUp on the trigger opens onto the last item", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[1]);
  });

  it("arrows move between items and wrap", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    const rows = screen.getAllByRole("menuitem");
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[1]);
  });

  it("Home and End jump to the ends", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    const rows = screen.getAllByRole("menuitem");
    fireEvent.keyDown(document, { key: "End" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(document, { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("Enter activates the focused item", () => {
    // These rows are divs with role=menuitem — a browser only synthesises a
    // click from Enter on real buttons, so without explicit handling the menu
    // would be reachable by keyboard and impossible to use with one.
    const edit = vi.fn();
    render(<OverflowMenu items={items({ edit })} theme="light" />);
    openMenu();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(edit).toHaveBeenCalledOnce();
  });

  it("Space activates the focused item", () => {
    const remove = vi.fn();
    render(<OverflowMenu items={items({ remove })} theme="light" />);
    openMenu();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: " " });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("Tab closes rather than trapping focus", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps exactly one item in the tab order", () => {
    // Roving tabindex: tabbing into a menu should land once, not walk every row.
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    const tabbable = screen
      .getAllByRole("menuitem")
      .filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });
});

describe("OverflowMenu selection", () => {
  it("runs the item's action on click", () => {
    const edit = vi.fn();
    render(<OverflowMenu items={items({ edit })} theme="light" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit place/ }));
    expect(edit).toHaveBeenCalledOnce();
  });

  it("closes and returns focus after selecting", () => {
    render(<OverflowMenu items={items()} theme="light" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove place/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("reopens cleanly after a selection", () => {
    // Guards the state getting stuck: a menu that selects once and then refuses
    // to open again, or reopens with no item focused, is a dead control.
    const edit = vi.fn();
    render(<OverflowMenu items={items({ edit })} theme="light" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit place/ }));
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it("shows an item's hint", () => {
    render(
      <OverflowMenu
        items={[
          { key: "r", label: "Remove place", hint: "Cannot be undone", onSelect: () => {} },
        ]}
        theme="light"
      />,
    );
    openMenu();
    expect(screen.getByText("Cannot be undone")).toBeTruthy();
  });
});

describe("OverflowMenu disabled items", () => {
  const withDisabled: MenuItem[] = [
    { key: "a", label: "First", onSelect: () => {} },
    { key: "b", label: "Second", onSelect: () => {}, disabled: true },
    { key: "c", label: "Third", onSelect: () => {} },
  ];

  it("marks them for assistive tech", () => {
    render(<OverflowMenu items={withDisabled} theme="light" />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Second/ }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("skips them when arrowing", () => {
    render(<OverflowMenu items={withDisabled} theme="light" />);
    openMenu();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Third/ }));
  });

  it("never fires them", () => {
    const onSelect = vi.fn();
    render(
      <OverflowMenu
        items={[{ key: "b", label: "Second", onSelect, disabled: true }]}
        theme="light"
      />,
    );
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Second/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still opens when every item is disabled", () => {
    // A disabled row exists to say the action is there but unavailable. Refusing
    // to open would withhold exactly that, and leave the trigger looking broken.
    render(
      <OverflowMenu
        items={[{ key: "b", label: "Second", onSelect: () => {}, disabled: true }]}
        theme="light"
      />,
    );
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    // Nothing focusable, so focus must not land on a dead row.
    expect(screen.getAllByRole("menuitem")).not.toContain(document.activeElement);
  });
});

describe("OverflowMenu is also the dropdown", () => {
  // DropdownMenu and OverflowMenu differ only in what opens them, so they are
  // one component. These assert that the second role really is covered rather
  // than aspirational.
  it("takes a visible trigger label", () => {
    render(
      <OverflowMenu items={items()} theme="light" triggerText="Terrain" label="Basemap" />,
    );
    expect(screen.getByText("Terrain")).toBeTruthy();
  });

  it("opens the same panel from a labelled trigger", () => {
    render(
      <OverflowMenu items={items()} theme="light" triggerText="Terrain" label="Basemap" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Terrain/ }));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("hangs the panel from either edge", () => {
    const panel = () => screen.getByRole("menu") as HTMLElement;
    const { unmount } = render(<OverflowMenu items={items()} theme="light" align="end" />);
    openMenu();
    expect(panel().style.right).toBe("0px");
    unmount();
    render(<OverflowMenu items={items()} theme="light" align="start" />);
    openMenu();
    expect(panel().style.left).toBe("0px");
  });

  it("names the panel for assistive tech", () => {
    render(
      <OverflowMenu items={items()} theme="light" label="Actions" menuLabel="Place actions" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe("Place actions");
  });

  it("falls back to the trigger's name for the panel", () => {
    render(<OverflowMenu items={items()} theme="light" label="Actions" />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe("Actions");
  });
});

describe("locationMenuItems", () => {
  it("offers exactly edit and remove", () => {
    const list = locationMenuItems({ onEdit: () => {}, onRemove: () => {} });
    expect(list.map((i) => i.key)).toEqual(["edit", "remove"]);
  });

  it("says removal cannot be undone before the sheet does", () => {
    // There is no account, no sync and no undo, so the cost is stated at the
    // first point the user can see it.
    const remove = locationMenuItems({ onEdit: () => {}, onRemove: () => {} })[1];
    expect(remove.hint).toMatch(/cannot be undone/i);
  });

  it("names what edit actually reaches", () => {
    const edit = locationMenuItems({ onEdit: () => {}, onRemove: () => {} })[0];
    expect(edit.hint).toMatch(/radius/i);
  });
});
