import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

const noop = () => {};

describe("InstallPrompt", () => {
  it("gives an honest reason to install", () => {
    const { container } = render(
      <InstallPrompt onInstall={noop} onDismiss={noop} theme="light" />,
    );
    expect(container.textContent).toMatch(/add it to your home screen/i);
    expect(container.textContent).toMatch(/works offline with the last verdict/i);
  });

  it("is dismissible", () => {
    const onDismiss = vi.fn();
    render(<InstallPrompt onInstall={noop} onDismiss={onDismiss} theme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("installs", () => {
    const onInstall = vi.fn();
    render(<InstallPrompt onInstall={onInstall} onDismiss={noop} theme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("never covers the verdict — it is in flow, not an overlay", () => {
    // The answer to "is it raining on me" is the only reason anyone opened the
    // app. An install nag on top of it trades the whole purpose for an install.
    const { container } = render(
      <InstallPrompt onInstall={noop} onDismiss={noop} theme="light" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).toBe("relative");
    expect(["absolute", "fixed"]).not.toContain(root.style.position);
  });

  it("renders no modal or scrim", () => {
    const { baseElement, container } = render(
      <InstallPrompt onInstall={noop} onDismiss={noop} theme="light" />,
    );
    // A Modal would portal outside the container; nothing here should.
    expect(baseElement.textContent).toBe(container.textContent);
    expect(container.innerHTML).not.toContain("--color-scrim");
  });

  it("keeps both actions at a 44px minimum target", () => {
    // The comp drew 30px chips. A dismiss you keep missing is worse than none.
    render(<InstallPrompt onInstall={noop} onDismiss={noop} theme="light" />);
    for (const name of ["Not now", "Add"]) {
      const el = screen.getByRole("button", { name }) as HTMLElement;
      expect(Number.parseFloat(el.style.minHeight)).toBeGreaterThanOrEqual(44);
    }
  });

  it("carries the mark, so the thing being installed is recognisable", () => {
    render(<InstallPrompt onInstall={noop} onDismiss={noop} theme="dark" />);
    expect(screen.getByRole("img", { name: "byge" })).toBeTruthy();
  });

  it("holds no state — a dismissal is the caller's to remember", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <InstallPrompt onInstall={noop} onDismiss={onDismiss} theme="light" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    // Still rendered: the component reports the intent and nothing more, so
    // persistence lives where it can outlive a remount.
    expect(container.firstElementChild).not.toBeNull();
  });
});
