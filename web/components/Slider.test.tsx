import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Slider, sliderFromKey } from "./Slider";

/**
 * The mechanics were extracted from `RadiusField`, whose 25 tests pass unchanged
 * against the extraction — that is the evidence the move preserved behaviour.
 * What is tested here is what the extraction ADDED: a step that need not be a
 * whole number, because the overlay's opacity moves in twentieths and the
 * radius moved in kilometres.
 */
describe("sliderFromKey", () => {
  it("increases right and up, decreases left and down", () => {
    // The convention every platform slider follows. Reversed, the control works
    // perfectly and does the opposite of what the hand expects.
    expect(sliderFromKey("ArrowRight", 5, 0, 10, 1)).toBe(6);
    expect(sliderFromKey("ArrowUp", 5, 0, 10, 1)).toBe(6);
    expect(sliderFromKey("ArrowLeft", 5, 0, 10, 1)).toBe(4);
    expect(sliderFromKey("ArrowDown", 5, 0, 10, 1)).toBe(4);
  });

  it("moves five steps on Page keys and to the ends on Home/End", () => {
    expect(sliderFromKey("PageUp", 4, 0, 100, 2)).toBe(14);
    expect(sliderFromKey("PageDown", 50, 0, 100, 2)).toBe(40);
    expect(sliderFromKey("Home", 50, 3, 97, 1)).toBe(3);
    expect(sliderFromKey("End", 50, 3, 97, 1)).toBe(97);
  });

  it("normalises an off-grid value onto the step grid", () => {
    // 5 is not on a grid of 2, so a press lands on the grid rather than 5 ± 2 —
    // which can move more or less than one step from an off-grid start. That is
    // the intended trade: a value restored from storage or rounded by a
    // different caller is corrected on first use, instead of the control living
    // permanently between its own tick marks.
    expect(sliderFromKey("ArrowRight", 5, 0, 100, 2)).toBe(8);
    expect(sliderFromKey("ArrowLeft", 5, 0, 100, 2)).toBe(4);
    // On-grid values, which is every value the app itself produces, step by
    // exactly one step.
    expect(sliderFromKey("ArrowRight", 6, 0, 100, 2)).toBe(8);
    expect(sliderFromKey("ArrowLeft", 6, 0, 100, 2)).toBe(4);
  });

  it("stops at the ends rather than running past them", () => {
    expect(sliderFromKey("ArrowLeft", 0, 0, 10, 1)).toBe(0);
    expect(sliderFromKey("ArrowRight", 10, 0, 10, 1)).toBe(10);
  });

  it("leaves keys that are not its own alone", () => {
    // Tab must reach the next control, and Escape must close whatever this
    // slider is inside — a menu, in the overlay's case.
    for (const k of ["Tab", "Escape", "Enter", " ", "a"]) {
      expect(sliderFromKey(k, 5, 0, 10, 1)).toBeNull();
    }
  });

  it("does not produce 0.30000000000000004", () => {
    // A fractional step accumulates float error, and the error reaches the
    // screen: a value formatted as a percentage renders "30.000000000000004 %".
    let v = 0.35;
    for (let i = 0; i < 9; i++) {
      v = sliderFromKey("ArrowRight", v, 0.35, 1, 0.05) as number;
    }
    expect(v).toBe(0.8);
    expect(String(v)).not.toMatch(/0{6,}[1-9]/);
  });
});

describe("Slider", () => {
  const setup = (over: Partial<Parameters<typeof Slider>[0]> = {}) => {
    const onChange = vi.fn();
    render(
      <Slider value={0.6} min={0.35} max={1} step={0.05} onChange={onChange} {...over} />,
    );
    return onChange;
  };

  it("announces itself as a slider with its range and value", () => {
    setup({ valueText: "60 %" });
    const s = screen.getByRole("slider");
    expect(s).toHaveAttribute("aria-valuemin", "0.35");
    expect(s).toHaveAttribute("aria-valuemax", "1");
    expect(s).toHaveAttribute("aria-valuenow", "0.6");
    expect(s).toHaveAttribute("aria-valuetext", "60 %");
  });

  it("is reachable by keyboard", () => {
    // A slider that cannot be tabbed to is a slider half the people using it
    // cannot operate.
    setup();
    expect(screen.getByRole("slider")).toHaveAttribute("tabindex", "0");
  });

  it("changes on an arrow key", () => {
    const onChange = setup();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(0.65);
  });

  it("ignores keys it does not own, so a menu can still close", () => {
    const onChange = setup();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves on a pointer press at a position on the track", () => {
    // THE REGRESSION THIS REPLACES. It was a Pressable reading
    // `e.nativeEvent.locationX`, which react-native-web does not put on these
    // press events — so the value was undefined, the arithmetic made NaN, and
    // once that was guarded the control silently did nothing at all. Guarding a
    // bad input is not the same as having a good one.
    const onChange = setup();
    const el = screen.getByRole("slider");
    // jsdom reports a zero-width rect, so the geometry is stubbed rather than
    // measured: what is under test is that a POINTER event drives the control.
    el.getBoundingClientRect = () => ({ left: 0, width: 100, right: 100 }) as DOMRect;
    fireEvent.pointerDown(el, { clientX: 50, pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    expect(Number.isFinite(onChange.mock.calls[0][0])).toBe(true);
  });

  it("keeps tracking a drag that leaves the row", () => {
    // Move and up are on the document, so a sweep past the end keeps scrubbing
    // and — more importantly — still ends.
    const onChange = setup();
    const el = screen.getByRole("slider");
    el.getBoundingClientRect = () => ({ left: 0, width: 100, right: 100 }) as DOMRect;
    fireEvent.pointerDown(el, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 90 });
    const last = onChange.mock.calls.at(-1)?.[0];
    fireEvent.pointerUp(document);
    fireEvent.pointerMove(document, { clientX: 20 });
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(last);
  });

  it("does not emit NaN when a press carries no position", () => {
    // THE CRASH THIS FIXES. `Math.max(0, NaN)` is NaN, not 0, so a clamp built
    // from min/max does not sanitise a bad input — it passes it through. The
    // value reached the overlay as `opacity: NaN`, which React rejects
    // outright: "NaN is an invalid value for the opacity css style property".
    const onChange = setup();
    fireEvent.click(screen.getByRole("slider"));
    for (const call of onChange.mock.calls) {
      expect(Number.isFinite(call[0])).toBe(true);
    }
  });

  it("reports a usable value even if handed a broken one", () => {
    // A slider whose own aria-valuenow is NaN is unreadable to assistive tech,
    // and its fill would be NaN wide.
    render(
      <Slider value={Number.NaN} min={0.1} max={0.9} step={0.1} onChange={() => {}} />,
    );
    const s = screen.getAllByRole("slider").at(-1);
    expect(s).toHaveAttribute("aria-valuenow", "0.1");
  });

  it("keys never produce NaN from a broken value", () => {
    expect(sliderFromKey("ArrowRight", Number.NaN, 0.1, 0.9, 0.1)).toBe(0.2);
  });
});
