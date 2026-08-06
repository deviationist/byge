import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { Attribution } from "../components/Attribution";
import { ConfirmSheet, removeLocationCopy } from "../components/ConfirmSheet";
import { CoverageNotice } from "../components/CoverageNotice";
import { ErrorState } from "../components/ErrorState";
import { Location } from "../components/Location";
import { LocationStatusText } from "../components/LocationStatusText";
import { NavBar } from "../components/NavBar";
import { OverflowMenu } from "../components/OverflowMenu";
import { PrecipitationConfidence } from "../components/PrecipitationConfidence";
import { PrecipitationGraph } from "../components/PrecipitationGraph";
import { PrecipitationLevelCard } from "../components/PrecipitationLevelCard";
import { RefreshControl } from "../components/RefreshControl";
import { StaleBanner } from "../components/StaleBanner";
import { useLocations } from "../hooks/useLocations";
import { useRefresh, useVerdict } from "../hooks/useVerdict";
import { Screen } from "../layouts/Screen";
import { isBlindVerdict } from "../lib/forecast";
import { useResolvedTheme } from "../theme/ThemeProvider";

/**
 * The answer.
 *
 * The order IS the argument: answer -> what it feels like -> how sure we are ->
 * the shape of the next two hours -> and only then a small link to the map.
 * The headline stays typographically dominant at every size; extra desktop
 * width goes to whitespace, not to promoting the timeline.
 *
 * Renders complete with no map present. The map link is a line of text, not a
 * hole where a map should be.
 */
export type VerdictScreenProps = {
  /**
   * Which place to show. Falls back to the route param when absent.
   *
   * Two-pane renders this INSIDE the list route, where there is no `[id]`
   * segment to read — the pane's selection is the shell's state, not the URL's.
   * Phone keeps using the route, so back behaves like a real destination.
   */
  id?: string;
  /** Two-pane suppresses the back control: there is nowhere to go back to. */
  showBack?: boolean;
};

export function VerdictScreen({ id: idProp, showBack = true }: VerdictScreenProps = {}) {
  const router = useRouter();
  const theme = useResolvedTheme();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = idProp ?? params.id;
  const { byId, remove, neighbourOf } = useLocations();
  const location = byId(id);

  const { data: verdict, isError } = useVerdict(location);
  const stamp = verdict?.frames[0]?.time?.toISOString();
  const { refresh, busy, outcome } = useRefresh(stamp);
  const [confirming, setConfirming] = useState(false);

  const phone = width < 720;
  const tablet = width >= 720 && width < 1080;
  // Sizes from the design: the headline is the focal point at every viewport.
  const headlineSize = phone ? 38 : tablet ? 46 : 54;

  if (!location) {
    return (
      <Screen>
        <ErrorState
          detail="This place is not saved on this device."
          onRetry={() => router.replace("/")}
        />
      </Screen>
    );
  }

  function doRemove() {
    if (!location) return;
    const next = neighbourOf(location.id);
    remove(location.id);
    setConfirming(false);
    // ALWAYS the list, never the neighbour's verdict.
    //
    // Following the neighbour is tempting — you were reading a verdict, so you
    // get a verdict — and it is what this did until Design ruled on it. It
    // loses on two counts. It shows an answer about a place you did not ask
    // about, which is the one thing byge must never do. And it hides the only
    // evidence the removal worked, because the list is where the change is
    // visible. It also silently turns a destructive action into navigation, so
    // a mis-tap leaves you reading Work while believing you are on Cabin.
    //
    // `showing` is passed for two-pane, where the detail pane DOES re-point and
    // the notice has to name both facts. Phone ignores it.
    router.replace({
      pathname: "/",
      params: {
        removed: location.name,
        ...(next ? { showing: next.name, select: next.id } : null),
      },
    });
  }

  const copy = removeLocationCopy(
    location.name,
    `${location.place ?? ""} · ${location.lat}, ${location.lon} · ${location.radiusKm} km`.replace(
      /^ · /,
      "",
    ),
  );

  const blind = verdict ? isBlindVerdict(verdict) : false;
  const hasReading = !!verdict && !blind;

  return (
    <Screen measure={phone ? null : 620}>
      <NavBar
        // No back control in the two-pane detail pane: the list is beside it,
        // so there is nowhere to go back TO. A back button that returns you to
        // a screen already on screen is a lie about the layout.
        onBack={showBack ? () => router.push("/") : undefined}
        backLabel={showBack ? "Back to places" : undefined}
        trailing={
          <OverflowMenu
            theme={theme}
            label={`More for ${location.name}`}
            items={[
              {
                label: "Edit place",
                key: "edit",
                hint: "coordinate, radius and name",
                onSelect: () => router.push(`/edit/${location.id}`),
              },
              {
                label: "Remove place",
                key: "remove",
                hint: "cannot be undone",
                onSelect: () => setConfirming(true),
              },
            ]}
          />
        }
      >
        <Location
          name={location.name}
          place={location.place}
          lat={location.lat}
          lon={location.lon}
          variant="header"
          showPlace
          showCoords
          theme={theme}
        />
      </NavBar>

      {isError && !verdict ? (
        <ErrorState
          variant="inline"
          detail="MET Norway did not answer, and nothing is cached for this place yet."
          onRetry={() => void refresh()}
        />
      ) : null}

      {verdict && verdict.analysisAgeMin > 20 ? (
        <StaleBanner ageMin={Math.round(verdict.analysisAgeMin)} />
      ) : null}

      {verdict ? (
        <>
          <LocationStatusText verdict={verdict} theme={theme} size={headlineSize} />

          {/* Adjacent to the headline on purpose: a partially-observed answer is
              drawn from less of the circle than the user asked for, and that
              qualification is worthless below the fold. */}
          {blind || verdict.partial ? (
            <CoverageNotice observed={verdict.observed} theme={theme} />
          ) : null}

          {hasReading ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <PrecipitationLevelCard verdict={verdict} theme={theme} />
                <PrecipitationConfidence verdict={verdict} theme={theme} />
              </View>

              <PrecipitationGraph frames={verdict.frames} theme={theme} />
            </>
          ) : null}
        </>
      ) : null}

      <View style={{ marginTop: "auto", paddingTop: 28, gap: 16 }}>
        <RefreshControl
          status={busy ? "refreshing" : (outcome ?? "idle")}
          radarAgeMin={verdict ? Math.round(verdict.analysisAgeMin) : undefined}
          onRefresh={() => void refresh()}
        />
        <Attribution />
      </View>

      <ConfirmSheet
        open={confirming}
        title={copy.title}
        body={copy.body}
        detail={copy.detail}
        confirmLabel={copy.confirmLabel}
        cancelLabel={copy.cancelLabel}
        onConfirm={doRemove}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
