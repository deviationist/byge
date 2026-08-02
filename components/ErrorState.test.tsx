import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState (full)", () => {
  it("says the request failed while online — never that we are offline", () => {
    // The distinction from StaleBanner is the reason this component exists.
    // "Offline" here would promise an automatic recovery that is not coming.
    const { container } = render(<ErrorState />);
    expect(container.textContent).toMatch(/could not reach the radar/i);
    expect(container.textContent).toMatch(/online/i);
    expect(container.textContent).not.toMatch(/you are offline/i);
  });

  it("says there is nothing to show rather than showing a guess", () => {
    const { container } = render(<ErrorState />);
    expect(container.textContent).toMatch(/nothing to show/i);
    expect(container.textContent).toMatch(/will not guess/i);
  });

  it("never presents the failure as mere staleness", () => {
    const { container } = render(<ErrorState />);
    expect(container.textContent).not.toMatch(/min ago|from before/i);
  });

  it("offers a retry that calls back", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry entirely when there is nothing to retry with", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows optional detail without replacing the plain sentence", () => {
    const { container } = render(<ErrorState detail="HTTP 503 thredds.met.no" />);
    expect(container.textContent).toContain("HTTP 503 thredds.met.no");
    expect(container.textContent).toMatch(/could not reach the radar/i);
  });

  it("announces itself as an alert", () => {
    const { container } = render(<ErrorState />);
    expect(container.firstElementChild?.getAttribute("role")).toBe("alert");
  });
});

describe("ErrorState (inline)", () => {
  it("keeps the previous verdict and only notes the refresh failed", () => {
    const { container } = render(<ErrorState variant="inline" />);
    expect(container.textContent).toMatch(/refresh failed/i);
    expect(container.textContent).toMatch(/still the answer from before/i);
  });

  it("does not take over with the full-state heading", () => {
    const { container } = render(<ErrorState variant="inline" />);
    expect(container.textContent).not.toMatch(/could not reach the radar/i);
  });

  it("is a status rather than an alert — the verdict is still on screen", () => {
    const { container } = render(<ErrorState variant="inline" />);
    expect(container.firstElementChild?.getAttribute("role")).toBe("status");
  });

  it("never says offline either", () => {
    const { container } = render(<ErrorState variant="inline" />);
    expect(container.textContent).not.toMatch(/offline/i);
  });

  it("retries from the inline form too", () => {
    const onRetry = vi.fn();
    render(<ErrorState variant="inline" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
