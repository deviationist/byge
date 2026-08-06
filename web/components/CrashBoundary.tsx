import { Component, type ReactNode } from "react";
import { ErrorScreen } from "./ErrorScreen";

/**
 * The last dead end, and the only one that cannot be a route.
 *
 * The other three are reachable states — a bad address, a removed place, a lost
 * connection — so a screen can decide to show them. A fault is different: by
 * definition the code that would have decided is the code that just failed. So
 * it needs a boundary rather than a branch.
 *
 * WHY IT MATTERS HERE MORE THAN IN MOST APPS. Without one, a render error in
 * React 18+ unmounts the whole tree and leaves a blank white page. For byge that
 * is the worst possible failure: a blank screen where an answer should be reads
 * as "nothing to report", which is indistinguishable from "dry" and is exactly
 * the claim this app must never make by accident.
 *
 * It reports a REFERENCE, not the error. A stack names our internals to somebody
 * who cannot act on them, and can carry a place name into a screenshot — the one
 * piece of data byge promises stays on the device.
 */
type Props = { children: ReactNode };
type State = { failed: boolean; reference?: string };

export class CrashBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    // Timestamp only. Enough to find the fault in our own logs, and it says
    // nothing about the reader.
    return {
      failed: true,
      reference: `ref ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    };
  }

  componentDidCatch(error: Error) {
    // Console rather than a service: byge has no telemetry, and adding some
    // quietly here would contradict what the About screen says about it.
    console.error("byge: unhandled render error", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorScreen
        kind="crash"
        reference={this.state.reference}
        // A full reload rather than a state reset. The tree that failed is the
        // tree we would be resetting, and a boundary that keeps re-rendering a
        // broken subtree loops rather than recovers.
        onPrimary={() => {
          if (typeof location !== "undefined") location.reload();
        }}
        onSecondary={() => {
          if (typeof location !== "undefined") location.assign("/");
        }}
      />
    );
  }
}
