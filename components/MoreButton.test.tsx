import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoreButton } from "./MoreButton";

describe("MoreButton", () => {
  it("has an accessible name — the glyph alone says nothing", () => {
    render(<MoreButton />);
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
  });

  it("takes a caller-supplied name", () => {
    render(<MoreButton label="Actions for Cabin" />);
    expect(screen.getByRole("button", { name: "Actions for Cabin" })).toBeTruthy();
  });

  it("announces whether the menu is open", () => {
    // react-native-web does NOT map accessibilityState.expanded to an
    // attribute, so this is set explicitly. Without the assertion a silent
    // regression here would leave screen-reader users with no open/closed cue.
    const { container, rerender } = render(<MoreButton expanded={false} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-expanded")).toBe("false");
    rerender(<MoreButton expanded />);
    expect(el.getAttribute("aria-expanded")).toBe("true");
  });

  it("declares that it opens a menu", () => {
    const { container } = render(<MoreButton />);
    expect((container.firstElementChild as HTMLElement).getAttribute("aria-haspopup")).toBe(
      "menu",
    );
  });

  it("meets the 44px minimum hit area", () => {
    const { container } = render(<MoreButton />);
    const s = (container.firstElementChild as HTMLElement).style;
    expect(Number.parseFloat(s.minWidth)).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(s.minHeight)).toBeGreaterThanOrEqual(44);
  });

  it("keeps the 44px floor in the labelled shape too", () => {
    const { container } = render(<MoreButton text="Terrain" />);
    expect(
      Number.parseFloat((container.firstElementChild as HTMLElement).style.minHeight),
    ).toBeGreaterThanOrEqual(44);
  });

  it("presses", () => {
    const onPress = vi.fn();
    render(<MoreButton onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("does not press while disabled", () => {
    const onPress = vi.fn();
    const { container } = render(<MoreButton onPress={onPress} disabled />);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows visible text in the labelled-dropdown shape", () => {
    // This is what lets one menu component serve both the overflow and the
    // dropdown role instead of two near-identical files.
    render(<MoreButton text="Terrain" />);
    expect(screen.getByText("Terrain")).toBeTruthy();
  });

  it("shows only the glyph when unlabelled", () => {
    const { container } = render(<MoreButton />);
    expect(container.textContent).toBe("⋯");
  });

  it("forwards a ref, so a menu can return focus to it", () => {
    // Escape has to land somewhere. Without this the menu closes onto <body>.
    let node: unknown = null;
    render(
      <MoreButton
        ref={(r) => {
          node = r;
        }}
      />,
    );
    (node as HTMLElement).focus();
    expect(document.activeElement).toBe(node);
  });
});
