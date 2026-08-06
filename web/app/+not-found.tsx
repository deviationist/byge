import { useRouter } from "expo-router";
import { ErrorScreen } from "../components/ErrorScreen";

/**
 * Expo Router's catch-all. Reached by a mistyped address or, more often, a
 * shared link that got cut short somewhere between being sent and being opened.
 *
 * `replace`, not `push`: a dead end should not sit in history for the back
 * button to return to.
 */
export default function NotFound() {
  const router = useRouter();
  return (
    <ErrorScreen
      kind="notFound"
      // The address the READER used, read from the browser rather than from the
      // router. `useSegments()` reports the route that matched, which for a
      // catch-all is "+not-found" — an internal name that is no evidence of
      // anything and tells them nothing about the link they followed.
      path={typeof location === "undefined" ? undefined : location.pathname}
      onPrimary={() => router.replace("/")}
    />
  );
}
