import { type Href, useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Back, for a screen that can be arrived at cold.
 *
 * `router.back()` alone assumes there is something to pop, and in a PWA there
 * very often is not. Open `/add` from a bookmark, a shared link, the home-screen
 * icon, or simply refresh the page — the history stack is one entry deep, and
 * back does nothing at all. Expo Router says so out loud in development ("The
 * action 'GO_BACK' was not handled by any navigator") and silently does nothing
 * in production, which is worse: a back button that looks enabled and is inert.
 *
 * So every back control names where it goes when there is no history. History
 * wins when it exists, because it is the more truthful answer — it returns you
 * to the screen you actually came from, which may not be the fallback.
 *
 * `replace`, not `push`, for the fallback: arriving at the list should not
 * leave the screen you just left sitting on the stack for a second back press
 * to return to. That would build a loop out of a dead end.
 */
// `Href` rather than `string`: expo-router types its routes, and a typo in a
// fallback path is exactly the sort of thing that only shows up when someone
// hits back on a cold load — the rarest path to test by hand.
export function useBack(fallback: Href) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  }, [router, fallback]);
}
