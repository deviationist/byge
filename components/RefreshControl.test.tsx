import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshControl, pullToRefreshProps, refreshMessage } from "./RefreshControl";

const noop = () => {};

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshMessage", () => {
  it("says 'already the latest' plainly, with the age", () => {
    // The outcome that decides whether the button is trusted. Analyses publish
    // every 5 min with 0-11 min of jitter, so a manual refresh often finds the
    // file we already have — and silence there reads as a broken button.
    expect(refreshMessage("already-latest", 3)).toBe("Already the latest — radar 3 min old.");
  });

  it("does not dress 'already the latest' as a failure", () => {
    const msg = refreshMessage("already-latest", 3) as string;
    expect(msg).not.toMatch(/fail|error|could not|try again/i);
  });

  it("distinguishes an update from a no-op", () => {
    expect(refreshMessage("updated", 1)).not.toBe(refreshMessage("already-latest", 1));
    expect(refreshMessage("updated", 1)).toMatch(/^Updated/);
  });

  it("says what it is doing while in flight", () => {
    expect(refreshMessage("refreshing")).toMatch(/checking/i);
  });

  it("leaves the failure to ErrorState rather than a passing note", () => {
    expect(refreshMessage("failed", 3)).toBeNull();
  });

  it("is silent when idle", () => {
    expect(refreshMessage("idle", 3)).toBeNull();
  });

  it("drops the age clause rather than inventing a number", () => {
    expect(refreshMessage("already-latest")).toBe("Already the latest.");
  });

  it("rounds the age to whole minutes", () => {
    expect(refreshMessage("already-latest", 3.4)).toContain("3 min old");
  });
});

describe("RefreshControl — affordances", () => {
  it("exposes a focusable button, since pull-to-refresh is keyboard-unreachable", () => {
    render(<RefreshControl status="idle" onRefresh={noop} />);
    const btn = screen.getByRole("button", { name: "Refresh" });
    expect(btn.getAttribute("tabindex")).not.toBe("-1");
  });

  it("refreshes from the button", () => {
    const onRefresh = vi.fn();
    render(<RefreshControl status="idle" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("exposes the pull gesture on the same handler", () => {
    // One path, two triggers — see ARCHITECTURE "Refresh".
    const onRefresh = vi.fn();
    const props = pullToRefreshProps({ status: "idle", onRefresh });
    expect(props.refreshControl.props.onRefresh).toBe(onRefresh);
    expect(props.refreshControl.props.refreshing).toBe(false);
  });

  it("reflects in-flight state in the pull affordance", () => {
    const props = pullToRefreshProps({ status: "refreshing", onRefresh: noop });
    expect(props.refreshControl.props.refreshing).toBe(true);
  });

  it("disables the button while a check is in flight", () => {
    render(<RefreshControl status="refreshing" onRefresh={noop} />);
    const btn = screen.getByRole("button", { name: "Refresh" });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("RefreshControl — outcomes", () => {
  it("shows nothing when idle, so the control is not noise", () => {
    const { container } = render(<RefreshControl status="idle" onRefresh={noop} />);
    expect(container.textContent).toBe("Refresh");
  });

  it("says so when there was nothing new", () => {
    const { container } = render(
      <RefreshControl status="already-latest" radarAgeMin={3} onRefresh={noop} />,
    );
    expect(container.textContent).toContain("Already the latest — radar 3 min old.");
  });

  it("announces outcomes in a live region", () => {
    const { container } = render(
      <RefreshControl status="already-latest" radarAgeMin={3} onRefresh={noop} />,
    );
    const live = container.querySelector('[role="status"]');
    expect(live?.textContent).toContain("Already the latest");
  });

  it("renders the failure as the inline error, not as staleness", () => {
    const { container } = render(<RefreshControl status="failed" onRefresh={noop} />);
    expect(container.textContent).toMatch(/refresh failed/i);
    expect(container.textContent).not.toMatch(/offline/i);
    expect(container.textContent).not.toMatch(/min ago/i);
  });

  it("offers a retry on failure", () => {
    const onRefresh = vi.fn();
    render(<RefreshControl status="failed" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe("RefreshControl — self-dismissal", () => {
  it("clears a transient message on its own", () => {
    vi.useFakeTimers();
    const { container } = render(
      <RefreshControl
        status="already-latest"
        radarAgeMin={3}
        onRefresh={noop}
        dismissAfterMs={4000}
      />,
    );
    expect(container.textContent).toContain("Already the latest");
    act(() => void vi.advanceTimersByTime(4000));
    expect(container.textContent).not.toContain("Already the latest");
  });

  it("keeps a failure on screen — an error is not a passing note", () => {
    vi.useFakeTimers();
    const { container } = render(
      <RefreshControl status="failed" onRefresh={noop} dismissAfterMs={4000} />,
    );
    act(() => void vi.advanceTimersByTime(60_000));
    expect(container.textContent).toMatch(/refresh failed/i);
  });

  it("does not time out the in-flight message", () => {
    vi.useFakeTimers();
    const { container } = render(
      <RefreshControl status="refreshing" onRefresh={noop} dismissAfterMs={1000} />,
    );
    act(() => void vi.advanceTimersByTime(60_000));
    expect(container.textContent).toMatch(/checking/i);
  });

  it("restarts the timer when a new outcome arrives", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <RefreshControl
        status="already-latest"
        radarAgeMin={3}
        onRefresh={noop}
        dismissAfterMs={4000}
      />,
    );
    act(() => void vi.advanceTimersByTime(4000));
    expect(container.textContent).not.toContain("Already the latest");

    rerender(
      <RefreshControl
        status="updated"
        radarAgeMin={0}
        onRefresh={noop}
        dismissAfterMs={4000}
      />,
    );
    expect(container.textContent).toContain("Updated");
  });
});
