import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorScreen } from "./ErrorScreen";

/**
 * Four dead ends that differ only in what they can honestly say. The failure
 * mode is a screen claiming to know a cause it does not, or apologising for a
 * state that is nobody's fault.
 */

describe("ErrorScreen", () => {
  it("names the place, and the cause, only when it removed one", () => {
    // The only case where we know why. Everything else would be guessing.
    render(<ErrorScreen kind="deleted" name="Cabin" path="/location/7f2a/map" />);
    expect(screen.getByText(/Cabin/)).toBeInTheDocument();
    expect(screen.getByText(/removed from this device/)).toBeInTheDocument();
  });

  it("does not offer to restore a deleted place", () => {
    // byge keeps places locally and holds no copy. "Restore" would mean
    // inventing a coordinate we no longer have — a confident wrong answer.
    render(<ErrorScreen kind="deleted" name="Cabin" onSecondary={vi.fn()} />);
    // No restore ACTION. The copy does say the word — "there is nothing to
    // restore" — and that is the point: it names the thing it is ruling out
    // rather than leaving the reader to wonder why it is missing.
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing to restore/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add it again" })).toBeInTheDocument();
  });

  it("shows the path on a 404, because that is the evidence", () => {
    // A truncated shared link is the likely cause, and the reader can only see
    // that if the address is in front of them.
    render(<ErrorScreen kind="notFound" path="/location/7f2a9/mapp" />);
    expect(screen.getByText("/location/7f2a9/mapp")).toBeInTheDocument();
  });

  it("does not treat being offline as a failure", () => {
    // Nothing is broken and nothing is lost — a different KIND of state from a
    // 404, and the tone has to carry that or the reader thinks data is gone.
    render(<ErrorScreen kind="offline" />);
    expect(screen.getByText(/Nothing is lost/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("does not blame the reader for a fault", () => {
    render(<ErrorScreen kind="crash" />);
    expect(screen.getByText(/not your doing/)).toBeInTheDocument();
  });

  it("gives a fault a reference and never a stack", () => {
    // A stack names our internals to somebody who cannot act on them, and can
    // carry a place name into a screenshot.
    render(<ErrorScreen kind="crash" reference="ref 2026-08-06 20:11" />);
    expect(screen.getByText("ref 2026-08-06 20:11")).toBeInTheDocument();
  });

  it("keeps the attribution, because a licence does not lapse on an error", () => {
    render(<ErrorScreen kind="crash" />);
    expect(screen.getByText("MET Norway")).toBeInTheDocument();
  });

  it("announces its title as a heading", () => {
    // A dead end is a statement byge is making, and a screen reader user should
    // land on it the same way they land on a verdict.
    render(<ErrorScreen kind="notFound" />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("never apologises", () => {
    // No "oops", no "sorry". A dead end is information, and the voice is the
    // same one the verdict uses.
    for (const kind of ["deleted", "notFound", "offline", "crash"] as const) {
      const { unmount } = render(<ErrorScreen kind={kind} name="Cabin" />);
      expect(screen.queryByText(/oops|sorry/i)).not.toBeInTheDocument();
      unmount();
    }
  });
});
