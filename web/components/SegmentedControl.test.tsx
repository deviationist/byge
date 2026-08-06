import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BASEMAP_OPTIONS, nextIndex, SegmentedControl, themeOptions } from "./SegmentedControl";
import type { KartverketLayer } from "./TileLayer";

const MIN_TARGET = 44;

describe("nextIndex", () => {
  it("wraps at both ends", () => {
    // A three-option group that stops dead makes you reverse direction to
    // reach the option you just passed.
    expect(nextIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextIndex("ArrowLeft", 0, 3)).toBe(2);
  });

  it("treats vertical arrows the same as horizontal", () => {
    expect(nextIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextIndex("ArrowUp", 1, 3)).toBe(0);
  });

  it("jumps to the ends", () => {
    expect(nextIndex("Home", 2, 4)).toBe(0);
    expect(nextIndex("End", 0, 4)).toBe(3);
  });

  it("ignores keys that are not ours", () => {
    // Swallowing Tab would turn the control into a keyboard trap.
    expect(nextIndex("Tab", 1, 3)).toBeNull();
    expect(nextIndex("Enter", 1, 3)).toBeNull();
  });
});

describe("SegmentedControl", () => {
  function renderTheme(value: "light" | "dark" | "system" = "light") {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Appearance"
        options={themeOptions()}
        value={value}
        onChange={onChange}
      />,
    );
    return onChange;
  }

  it("is one question with N answers, not N unrelated buttons", () => {
    renderTheme();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("selects on press", () => {
    const onChange = renderTheme();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("marks the selection with more than colour", () => {
    // The basemap switcher floats over a map whose colour is not ours to
    // control, so a fill alone is not a reliable signal.
    renderTheme("dark");
    const on = screen.getByRole("radio", { name: "Dark" });
    expect(on).toHaveAttribute("aria-checked", "true");
    expect(on).toHaveTextContent("✓");
    expect(screen.getByRole("radio", { name: "Light" })).not.toHaveTextContent("✓");
  });

  it("moves with arrow keys", () => {
    const onChange = renderTheme("light");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("wraps backwards off the first option", () => {
    const onChange = renderTheme("light");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("system");
  });

  it("moves focus with the selection", () => {
    // Otherwise the value changes but focus stays behind, so the next arrow
    // press starts from the wrong segment.
    renderTheme("light");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Dark" }));
  });

  it("is a single Tab stop", () => {
    // Four tabbable segments would cost four Tab presses to step past.
    renderTheme("dark");
    const stops = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName("Dark");
  });

  it("meets the 44px minimum hit area on every segment", () => {
    renderTheme();
    for (const el of screen.getAllByRole("radio")) {
      expect(Number.parseFloat(el.style.minHeight)).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(Number.parseFloat(el.style.minWidth)).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });

  it("keeps an accessible name when the visible label is hidden", () => {
    // The map overlay hides the caption; it must not lose the name with it.
    render(
      <SegmentedControl<KartverketLayer>
        label="Basemap"
        labelHidden
        options={BASEMAP_OPTIONS}
        value="grey"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Basemap" })).toBeTruthy();
    expect(screen.queryByText("Basemap")).toBeNull();
  });

  it("serves the basemap choice from the same component", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl<KartverketLayer>
        label="Basemap"
        options={BASEMAP_OPTIONS}
        value="grey"
        onChange={onChange}
      />,
    );
    // Named for the layer, not for a sketch: there is no satellite option
    // because Kartverket's open cache has no aerial layer to point one at.
    fireEvent.click(screen.getByRole("radio", { name: /Nautical/ }));
    expect(onChange).toHaveBeenCalledWith("nautical");
  });

  it("carries a spoken hint where the label cannot say enough", () => {
    renderTheme();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAccessibleDescription(
      /device appearance/i,
    );
  });
});
