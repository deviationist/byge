import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetToasts, TOAST_MS, toast } from "../lib/toast";
import { ToastHost } from "./ToastHost";

/**
 * The bug this file exists for: the confirmation never went away. It lived in
 * the URL as `?saved=Fish&showing=Fish`, and a route param is state, not an
 * event — nothing clears it, so "Saved Fish. Showing it now." sat there
 * indefinitely.
 */

beforeEach(() => {
  resetToasts();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastHost", () => {
  it("shows a receipt that was queued before it mounted", () => {
    // The whole point. The screen that mutates emits and navigates away; the
    // host is mounted at the root and reads it on arrival. If subscription did
    // not replay the queue, every receipt would be lost in the race.
    toast("Saved Fish.");
    render(<ToastHost />);
    expect(screen.getByText("Saved Fish.")).toBeInTheDocument();
  });

  it("goes away on its own", () => {
    render(<ToastHost />);
    act(() => toast("Saved Fish."));
    expect(screen.getByText("Saved Fish.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TOAST_MS + 10));
    expect(screen.queryByText("Saved Fish.")).not.toBeInTheDocument();
  });

  it("is still there a moment before it expires", () => {
    // Guards the other direction: a toast that vanished in 200 ms would also
    // pass "goes away on its own" and would be unreadable.
    render(<ToastHost />);
    act(() => toast("Saved Fish."));
    act(() => vi.advanceTimersByTime(TOAST_MS - 200));
    expect(screen.getByText("Saved Fish.")).toBeInTheDocument();
  });

  it("can be dismissed by tapping it", () => {
    render(<ToastHost />);
    act(() => toast("Removed Cabin."));
    act(() => screen.getByTestId("toast").click());
    expect(screen.queryByText("Removed Cabin.")).not.toBeInTheDocument();
  });

  it("expires each receipt on its own clock, not the last one's", () => {
    // A shared timer would let a late second toast keep the first one alive, or
    // cut it short — both leave the reader out of step with what they did.
    render(<ToastHost />);
    act(() => toast("Saved Fish."));
    act(() => vi.advanceTimersByTime(TOAST_MS - 500));
    act(() => toast("Saved Cabin."));

    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText("Saved Fish.")).not.toBeInTheDocument();
    expect(screen.getByText("Saved Cabin.")).toBeInTheDocument();
  });

  it("announces politely rather than interrupting", () => {
    // These confirm something that already succeeded. `alert` would cut a
    // screen reader off mid-sentence for a routine receipt.
    render(<ToastHost />);
    act(() => toast("Saved Fish."));
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("does not swallow taps meant for the screen underneath", () => {
    // The host spans the bottom of every screen. If it caught pointer events it
    // would block the "Add a place" button it sits over.
    render(<ToastHost />);
    expect(screen.getByTestId("toast-host")).toHaveStyle({ pointerEvents: "box-none" });
  });

  it("never offers undo", () => {
    // There is none: ConfirmSheet said in as many words that nothing is holding
    // a copy. A dead affordance is worse than no affordance.
    render(<ToastHost />);
    act(() => toast("Removed Cabin."));
    expect(screen.queryByText(/undo/i)).not.toBeInTheDocument();
  });
});
