import i18next from "i18next";
import { useEffect, useState } from "react";
import { RefreshControl as ScrollRefreshControl, Text, View } from "react-native";
import { Button } from "./Button";
import { ErrorState } from "./ErrorState";

/**
 * Manual refresh, and the three things that can come of it.
 *
 * The one that decides whether this control is trusted is the middle one.
 * Analyses publish every 5 minutes with 0-11 minutes of jitter, so a manual
 * refresh very often finds the file we already have. That is a correct,
 * successful outcome — but if it renders as a spinner resolving into no visible
 * change, it reads as broken, and people stop pressing the button. So it gets
 * words: "Already the latest — radar 3 min old."
 *
 *   updated         a newer analysis arrived. The verdict updates in place;
 *                   this control says so briefly and gets out of the way.
 *   already-latest  nothing newer exists yet. Stated plainly, not hidden.
 *   failed          the check failed. The existing verdict stays exactly where
 *                   it is, with an inline note — which is ErrorState, NOT
 *                   StaleBanner. StaleBanner means offline-with-cache; this
 *                   means we asked and got nothing.
 *
 * TWO AFFORDANCES, ON PURPOSE. Pull-to-refresh is invisible to a keyboard and
 * to anyone who cannot make the gesture, so the button is not a fallback — it
 * is the accessible primary. `pullToRefreshProps()` supplies the gesture side
 * for whichever ScrollView hosts this control, keeping both triggers on the one
 * `onRefresh` path (see ARCHITECTURE "Refresh").
 */
export type RefreshStatus = "idle" | "refreshing" | "updated" | "already-latest" | "failed";

export type RefreshControlProps = {
  status: RefreshStatus;
  /** Age of the analysis now on screen, in minutes — named in the message. */
  radarAgeMin?: number;
  onRefresh: () => void;
  /** How long a transient message lingers. */
  dismissAfterMs?: number;
};

/**
 * Props to spread onto the hosting ScrollView so the pull gesture runs through
 * the same handler as the button. Kept out of the component because the gesture
 * belongs to the scroll container, not to a presentational control.
 */
export function pullToRefreshProps(opts: { status: RefreshStatus; onRefresh: () => void }) {
  return {
    refreshControl: (
      <ScrollRefreshControl
        refreshing={opts.status === "refreshing"}
        onRefresh={opts.onRefresh}
      />
    ),
  };
}

/**
 * The message for an outcome, or null when there is nothing to say.
 *
 * `failed` returns null because it is not a passing note — it is rendered as
 * ErrorState's inline form and stays until it is retried.
 */
export function refreshMessage(status: RefreshStatus, radarAgeMin?: number): string | null {
  const age = radarAgeMin === undefined ? null : Math.max(0, Math.round(radarAgeMin));
  switch (status) {
    case "refreshing":
      return i18next.t("refresh.checking");
    case "updated":
      return age === null
        ? i18next.t("refresh.updated")
        : i18next.t("refresh.updatedAge", { age });
    case "already-latest":
      // Never "up to date" or a bare checkmark. The reader is owed the age, so
      // "nothing changed" is verifiable rather than something to take on faith.
      return age === null
        ? i18next.t("refresh.latest")
        : i18next.t("refresh.latestAge", { age });
    default:
      return null;
  }
}

/** Outcomes that should clear themselves; `failed` and `refreshing` must not. */
const TRANSIENT: RefreshStatus[] = ["updated", "already-latest"];

export function RefreshControl({
  status,
  radarAgeMin,
  onRefresh,
  dismissAfterMs = 6000,
}: RefreshControlProps) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(false);
    if (!TRANSIENT.includes(status)) return;
    const t = setTimeout(() => setExpired(true), dismissAfterMs);
    return () => clearTimeout(t);
  }, [status, dismissAfterMs]);

  const message = expired ? null : refreshMessage(status, radarAgeMin);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <Button
        label={i18next.t("refresh.action")}
        variant="secondary"
        onPress={onRefresh}
        disabled={status === "refreshing"}
        hint={i18next.t("refresh.hint")}
      />

      {/* A live region, so the outcome reaches a screen reader too. Pressing a
          button and hearing nothing is the same failure as seeing nothing. */}
      <View role="status" style={{ flex: 1, minWidth: 160 }}>
        {message ? (
          <Text className="text-ink2" style={{ fontSize: 12, lineHeight: 18 }}>
            {message}
          </Text>
        ) : null}
      </View>

      {status === "failed" ? (
        <View style={{ width: "100%" }}>
          <ErrorState variant="inline" onRetry={onRefresh} />
        </View>
      ) : null}
    </View>
  );
}
