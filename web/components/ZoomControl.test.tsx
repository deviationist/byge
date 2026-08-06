import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ZoomControl } from "./ZoomControl";

/**
 * The map could always be zoomed — wheel, pinch, +/- keys. None of those is
 * discoverable, and two do not exist for a phone user with one hand full. The
 * capability was there and the affordance was not, which for most people is
 * indistinguishable from a map that does not zoom.
 */

const control = (zoom: number, onChange = vi.fn()) => {
  render(<ZoomControl zoom={zoom} min={3} max={16} onChange={onChange} />);
  return onChange;
};

describe("ZoomControl", () => {
  it("steps in", () => {
    const onChange = control(11);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it("steps out", () => {
    const onChange = control(11);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("never asks for a zoom past the top of the tile pyramid", () => {
    // Past max there are no tiles, so the map would go blank rather than closer.
    const onChange = control(16);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never asks for a zoom below the bottom", () => {
    const onChange = control(3);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces a limit instead of going quietly dead", () => {
    // Faded-but-clickable is the failure mode: a sighted user sees the state, a
    // screen reader user presses into silence and cannot tell why.
    control(16);
    expect(screen.getByRole("button", { name: "Zoom in" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Zoom out" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("does not block drags meant for the map underneath", () => {
    // It sits on top of a surface whose whole job is being dragged.
    control(11);
    expect(screen.getByTestId("zoom-control")).toHaveStyle({ pointerEvents: "box-none" });
  });

  it("labels the buttons in words, not glyphs", () => {
    // "+" read aloud in the middle of a map is noise; the glyph is aria-hidden
    // and the name carries the meaning.
    control(11);
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
  });
});
