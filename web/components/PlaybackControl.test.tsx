import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaybackControl } from "./PlaybackControl";

/**
 * The control's whole job is saying which of four situations you are in, and
 * three of them look identical in the numbers: a playhead on the last frame is
 * "finished" if the run is complete, "caught up" if it is still streaming, and
 * "nothing yet" if there is no run at all.
 *
 * The bug these exist to prevent shipped: on a fresh map the field had one
 * frame, the playhead was on it, and the control offered REPLAY — on a run that
 * had not started.
 */
const base = { playing: false, onToggle: vi.fn(), index: 0, count: 24, minutes: 0 };

describe("PlaybackControl", () => {
  it("offers replay only when the run is finished", () => {
    render(<PlaybackControl {...base} index={23} count={24} />);
    expect(screen.getByRole("button", { name: "Play again from now" })).toBeVisible();
  });

  it("does NOT offer replay while frames are still arriving", () => {
    // The regression. One frame in hand, playhead on it, 23 still on the wire:
    // the playhead is caught up, not finished, and replaying would rewind a run
    // the reader has not seen.
    render(<PlaybackControl {...base} index={0} count={1} expected={24} buffering />);
    expect(screen.queryByRole("button", { name: "Play again from now" })).toBeNull();
    expect(screen.getByRole("button", { name: "Play the next two hours" })).toBeVisible();
  });

  it("says how much of the run is still coming", () => {
    // "FRAME 1 OF 1" would be true and misleading in the same breath.
    render(<PlaybackControl {...base} index={0} count={1} expected={24} buffering />);
    expect(screen.getByText("FRAME 1 · 24 ON THE WAY")).toBeVisible();
  });

  it("is disabled, not misleading, when there is nothing to play", () => {
    render(<PlaybackControl {...base} count={0} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    // Never "FRAME 1 OF 0".
    expect(screen.queryByText(/OF 0/)).toBeNull();
  });

  it("reports the frame plainly once the run is in", () => {
    render(<PlaybackControl {...base} index={4} count={24} expected={24} />);
    expect(screen.getByText("FRAME 5 OF 24")).toBeVisible();
  });

  it("names the horizon only when something is still falling at the end", () => {
    // Saying the run ends over a clear field would invent an open end nobody
    // claimed.
    const { rerender } = render(<PlaybackControl {...base} index={23} count={24} />);
    expect(screen.queryByTestId("playback-horizon")).toBeNull();
    rerender(<PlaybackControl {...base} index={23} count={24} openEnded />);
    expect(screen.getByTestId("playback-horizon")).toBeVisible();
  });

  describe("stepping", () => {
    it("moves one frame at a time, in both directions", () => {
      // A different verb from play: "run the two hours" versus "show me that
      // one". Inching back and forth over the moment a band arrives is the
      // thing people actually do on a radar map.
      const onStep = vi.fn();
      render(<PlaybackControl {...base} index={5} count={24} onStep={onStep} />);
      fireEvent.click(screen.getByRole("button", { name: "Previous frame" }));
      fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
      expect(onStep.mock.calls).toEqual([[-1], [1]]);
    });

    it("disables the ends rather than wrapping them", () => {
      // The run loops on its own; an explicit step should never teleport across
      // the whole two hours.
      // Scoped to each render's own container: two PlaybackControls in one
      // document share `screen`, and an unscoped testID finds both.
      const first = within(
        render(<PlaybackControl {...base} index={0} count={24} onStep={vi.fn()} />).container,
      );
      expect(first.getByTestId("step-back")).toBeDisabled();
      expect(first.getByTestId("step-forward")).not.toBeDisabled();

      const last = within(
        render(<PlaybackControl {...base} index={23} count={24} onStep={vi.fn()} />).container,
      );
      expect(last.getByTestId("step-forward")).toBeDisabled();
      expect(last.getByTestId("step-back")).not.toBeDisabled();
    });

    it("is absent when the caller cannot step", () => {
      // The transport is shared, and a dead control is worse than no control.
      render(<PlaybackControl {...base} index={5} count={24} />);
      expect(screen.queryByTestId("step-back")).toBeNull();
    });

    it("disables both ends when there is nothing to play", () => {
      const { getByTestId } = render(<PlaybackControl {...base} count={0} onStep={vi.fn()} />);
      expect(getByTestId("step-back")).toBeDisabled();
      expect(getByTestId("step-forward")).toBeDisabled();
    });
  });
});
