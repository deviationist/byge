import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MANIFEST_BACKGROUND, SplashScreen } from "./SplashScreen";

const root = (c: Element) => c.firstElementChild as HTMLElement;

describe("SplashScreen", () => {
  it("matches the manifest background_color per scheme", () => {
    // Any mismatch shows as a flash between the OS-drawn splash and this one.
    expect(MANIFEST_BACKGROUND.light).toBe("#F6F4F0");
    expect(MANIFEST_BACKGROUND.dark).toBe("#0E1113");
  });

  it("paints that background from the resolved theme", () => {
    const light = render(<SplashScreen theme="light" />).container;
    const dark = render(<SplashScreen theme="dark" />).container;
    expect(root(light).style.backgroundColor).toBe("rgb(246, 244, 240)");
    expect(root(dark).style.backgroundColor).toBe("rgb(14, 17, 19)");
  });

  it("uses a literal colour, not the themed CSS variable", () => {
    // `.dark` lands on the document root in an effect, i.e. after first paint.
    // A dark-scheme user would get one light frame on the exact screen whose
    // job is to have no seam — so the resolved prop wins over the variable.
    const { container } = render(<SplashScreen theme="dark" />);
    expect(root(container).style.backgroundColor).not.toContain("var(");
  });

  it("centres the mark", () => {
    const { container } = render(<SplashScreen theme="light" />);
    expect(root(container).style.alignItems).toBe("center");
    expect(root(container).style.justifyContent).toBe("center");
    expect(screen.getByRole("img", { name: "byge" })).toBeTruthy();
  });

  it("is a doorway, not a wait — nothing here needs finishing", () => {
    // No progress bar, no spinner, no percentage. A progress indicator is a
    // promise about duration this screen cannot keep, and one that sits still
    // reads as failure.
    const { container } = render(<SplashScreen theme="light" />);
    expect(container.textContent).toBe("");
    expect(container.innerHTML).not.toMatch(/progressbar|animation|@keyframes/i);
  });

  it("shows no wordmark", () => {
    const { container } = render(<SplashScreen theme="light" />);
    expect(container.textContent).not.toContain("byge");
  });

  it("still identifies itself to a screen reader", () => {
    const { container } = render(<SplashScreen theme="light" />);
    expect(root(container).getAttribute("aria-label")).toBe("byge");
  });

  it("fills the viewport", () => {
    const { container } = render(<SplashScreen theme="light" />);
    expect(root(container).style.flexGrow).toBe("1");
  });
});
