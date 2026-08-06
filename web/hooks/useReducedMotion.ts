import { useEffect, useState } from "react";

/**
 * Has the reader asked the OS for less motion?
 *
 * A HOOK RATHER THAN A ONE-OFF READ, because the answer changes. macOS and iOS
 * both expose the setting in a place people toggle mid-session — often because
 * something on screen is making them ill — and a value sampled once at mount
 * keeps animating for as long as the tab stays open.
 *
 * WHAT BYGE DOES WITH IT is slow the radar down rather than freeze it. Stepping
 * through the next two hours is how the map screen is read; removing the motion
 * would remove the point instead. So the playhead goes back to a slideshow —
 * discrete frames, 900 ms apart — and the cross-fade, which is itself motion, is
 * switched off. Less, not none.
 *
 * Defaults to false when there is no `matchMedia` (jsdom, SSR): the safe wrong
 * answer here is the ordinary one, because the reader can still pause.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matches());

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    onChange();
    // `addEventListener` on a MediaQueryList is the modern spelling; Safari
    // below 14 only has `addListener`, and this is exactly the audience least
    // likely to be on a current browser.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return reduced;
}

function matches(): boolean {
  return typeof matchMedia === "function" && matchMedia(QUERY).matches;
}
