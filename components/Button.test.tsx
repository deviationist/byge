import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { NavBar, NavBarButton } from "./NavBar";

const MIN_TARGET = 44;

describe("Button", () => {
  it("calls onPress", () => {
    const onPress = vi.fn();
    render(<Button label="Save place" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Save place" }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", () => {
    const onPress = vi.fn();
    render(<Button label="Save place" onPress={onPress} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Save place" }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("meets the 44px minimum hit area", () => {
    // The design comp used 30px targets. Below 44 a thumb misses.
    render(<Button label="Add" />);
    const el = screen.getByRole("button", { name: "Add" });
    expect(Number.parseFloat(el.style.minHeight)).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it("exposes disabled state to assistive tech", () => {
    render(<Button label="Save" disabled />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("NavBar", () => {
  it("renders a back button that meets the hit target", () => {
    render(<NavBarButton onPress={() => {}} />);
    const el = screen.getByRole("button", { name: "Back" });
    expect(Number.parseFloat(el.style.width)).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(Number.parseFloat(el.style.height)).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it("labels the back button for screen readers, not just a caret glyph", () => {
    render(<NavBarButton onPress={() => {}} label="Back to places" />);
    expect(screen.getByRole("button", { name: "Back to places" })).toBeTruthy();
  });

  it("omits the back button on root screens rather than leaving a hole", () => {
    const { container } = render(<NavBar>{null}</NavBar>);
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
  });

  it("renders trailing content alongside the slot", () => {
    render(
      <NavBar onBack={() => {}} trailing={<span data-testid="more" />}>
        <span data-testid="title" />
      </NavBar>,
    );
    expect(screen.getByTestId("title")).toBeTruthy();
    expect(screen.getByTestId("more")).toBeTruthy();
  });
});

describe("Button hints", () => {
  it("renders the hint where assistive tech can reach it", () => {
    // `accessibilityHint` does not exist in react-native-web's implementation
    // (zero hits in its dist), so passing it type-checks, looks wired, and
    // reaches nobody. Same shape as a log-parsing jail that can never fire.
    render(<Button label="Remove Cabin" hint="This cannot be undone" />);
    const btn = screen.getByRole("button", { name: "Remove Cabin" });
    const id = btn.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe("This cannot be undone");
  });

  it("adds no describedby when there is no hint", () => {
    render(<Button label="Save" />);
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-describedby");
  });
});
