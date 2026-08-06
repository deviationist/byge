import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  clampRadius,
  RADIUS_COSTLY,
  RADIUS_DEFAULT,
  radiusHint,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_SATURATES,
  RadiusField,
  radiusFromKey,
  radiusNote,
  radiusValueText,
} from "./RadiusField";

const MIN_TARGET = 44;

describe("radius bounds", () => {
  it("defaults to 3 km, floors at 2, caps at 25", () => {
    expect(RADIUS_DEFAULT).toBe(3);
    expect(RADIUS_MIN).toBe(2);
    expect(RADIUS_MAX).toBe(25);
  });

  it("clamps and rounds to whole km", () => {
    // Sub-km precision is meaningless against a 1 km grid.
    expect(clampRadius(0)).toBe(RADIUS_MIN);
    expect(clampRadius(1000)).toBe(RADIUS_MAX);
    expect(clampRadius(7.4)).toBe(7);
  });
});

describe("radiusNote", () => {
  it("says nothing at the useful end", () => {
    // A warning that fires at 3 km would be noise on the default.
    expect(radiusNote(RADIUS_DEFAULT)).toBeNull();
    expect(radiusNote(RADIUS_SATURATES - 1)).toBeNull();
  });

  it("warns about saturation, not about size, once wide", () => {
    // The honest problem at 15 km is that the answer stops discriminating —
    // not that the number is too big.
    const note = radiusNote(15) ?? "";
    expect(note).toMatch(/15 km/);
    expect(note).toMatch(/stops discriminating/i);
    expect(note).toMatch(/3 km/);
  });

  it("adds the payload cost only at the very wide end", () => {
    expect(radiusNote(RADIUS_COSTLY - 1)).not.toMatch(/350 KB/);
    expect(radiusNote(RADIUS_MAX)).toMatch(/350 KB/);
    expect(radiusNote(RADIUS_MAX)).toMatch(/8 KB/);
  });

  it("frames the cost as a cost, never as a stop", () => {
    // 25 km is a legitimate "watch the whole valley" choice.
    expect(radiusNote(RADIUS_MAX)).toMatch(/not a limit/i);
  });
});

describe("radiusValueText", () => {
  it("names the default rather than reading a bare number", () => {
    expect(radiusValueText(RADIUS_DEFAULT)).toMatch(/default/i);
  });

  it("explains the floor in terms of the grid", () => {
    expect(radiusValueText(RADIUS_MIN)).toMatch(/1 km grid/);
  });

  it("calls the wide end a watch area", () => {
    expect(radiusValueText(20)).toMatch(/watch area/i);
  });
});

describe("radiusFromKey", () => {
  it("steps 1 km on arrows, in both orientations", () => {
    expect(radiusFromKey("ArrowRight", 5)).toBe(6);
    expect(radiusFromKey("ArrowUp", 5)).toBe(6);
    expect(radiusFromKey("ArrowLeft", 5)).toBe(4);
    expect(radiusFromKey("ArrowDown", 5)).toBe(4);
  });

  it("steps 5 km on page keys", () => {
    // 2 to 25 in single steps is 23 presses.
    expect(radiusFromKey("PageUp", 5)).toBe(10);
    expect(radiusFromKey("PageDown", 12)).toBe(7);
  });

  it("jumps to the ends", () => {
    expect(radiusFromKey("Home", 12)).toBe(RADIUS_MIN);
    expect(radiusFromKey("End", 12)).toBe(RADIUS_MAX);
  });

  it("never leaves the bounds", () => {
    expect(radiusFromKey("ArrowLeft", RADIUS_MIN)).toBe(RADIUS_MIN);
    expect(radiusFromKey("PageUp", RADIUS_MAX)).toBe(RADIUS_MAX);
  });

  it("ignores keys that are not ours", () => {
    expect(radiusFromKey("Tab", 5)).toBeNull();
    expect(radiusFromKey("a", 5)).toBeNull();
  });
});

describe("RadiusField", () => {
  const slider = () => screen.getByRole("slider");

  it("exposes itself as a labelled slider with a real range", () => {
    render(<RadiusField value={3} onChange={() => {}} />);
    const el = slider();
    expect(el).toHaveAccessibleName("Radius");
    expect(el).toHaveAttribute("aria-valuemin", String(RADIUS_MIN));
    expect(el).toHaveAttribute("aria-valuemax", String(RADIUS_MAX));
    expect(el).toHaveAttribute("aria-valuenow", "3");
    expect(el).toHaveAttribute("aria-valuetext", expect.stringMatching(/default/i));
  });

  it("shows the value in km", () => {
    render(<RadiusField value={12} onChange={() => {}} />);
    expect(screen.getByText("12 km")).toBeTruthy();
  });

  it("widens and narrows by 1 km from the buttons", () => {
    const onChange = vi.fn();
    render(<RadiusField value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Wider" }));
    expect(onChange).toHaveBeenCalledWith(4);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Narrower" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("is keyboard navigable", () => {
    const onChange = vi.fn();
    render(<RadiusField value={3} onChange={onChange} />);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("stops at the floor and the cap instead of wrapping", () => {
    // Wrapping 25 km round to 2 km would be a silent, enormous change.
    const onChange = vi.fn();
    const { rerender } = render(<RadiusField value={RADIUS_MIN} onChange={onChange} />);
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
    rerender(<RadiusField value={RADIUS_MAX} onChange={onChange} />);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the step buttons at the bounds", () => {
    render(<RadiusField value={RADIUS_MAX} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Wider" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Narrower" })).not.toBeDisabled();
  });

  it("meets the 44px minimum hit area on both steppers", () => {
    render(<RadiusField value={3} onChange={() => {}} />);
    for (const name of ["Narrower", "Wider"]) {
      const el = screen.getByRole("button", { name });
      expect(Number.parseFloat(el.style.width)).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(Number.parseFloat(el.style.height)).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });

  it("always explains that wider is more sensitive, never less", () => {
    // Without this, someone who widens and sees the verdict flip to "raining"
    // will think the widening made it rain.
    render(<RadiusField value={3} onChange={() => {}} />);
    expect(screen.getByText(radiusHint())).toBeTruthy();
    expect(radiusHint()).toMatch(/never turn a wet answer dry/i);
  });

  it("keeps quiet at the default and speaks up when wide", () => {
    const { rerender } = render(<RadiusField value={RADIUS_DEFAULT} onChange={() => {}} />);
    expect(screen.queryByText(/stops discriminating/i)).toBeNull();
    rerender(<RadiusField value={15} onChange={() => {}} />);
    expect(screen.getByText(/stops discriminating/i)).toBeTruthy();
  });

  it("announces the wide-end note politely rather than interrupting", () => {
    render(<RadiusField value={15} onChange={() => {}} />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(/stops discriminating/i);
  });

  it("renders every radius in range without throwing", () => {
    for (let km = RADIUS_MIN; km <= RADIUS_MAX; km++) {
      const { unmount } = render(<RadiusField value={km} onChange={() => {}} />);
      expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", String(km));
      unmount();
    }
  });
});
