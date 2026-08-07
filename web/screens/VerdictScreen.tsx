import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
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
import { RadarPreview } from "../components/RadarPreview";
import { RefreshControl } from "../components/RefreshControl";
import { StaleBanner } from "../components/StaleBanner";
import { useLocations } from "../hooks/useLocations";
import { useRefresh, useVerdict } from "../hooks/useVerdict";
import { pagePadFor, Screen } from "../layouts/Screen";
import { isBlindVerdict } from "../lib/forecast";
import { toast } from "../lib/toast";
import { useResolvedTheme } from "../theme/ThemeProvider";

/**
 * The answer.
 *
 * The order IS the argument: answer -> what it feels like -> how sure we are ->
 * the shape of the next two hours -> and only then, at the foot, the radar.
 * The headline stays typographically dominant at every size; extra desktop
 * width goes to whitespace, not to promoting the timeline.
 *
 * Renders complete with no radar present. The preview at the bottom loads on
 * its own schedule and is absent until it does — it is never a hole where a map
 * should be, and the answer above never waits on it.
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
  const { t } = useTranslation();
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
        <ErrorState detail={t("verdict.notSaved")} onRetry={() => router.replace("/")} />
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
    // Two-pane names both facts because both changed — the row is gone AND the
    // detail pane is a different place. Phone names one, because one changed.
    // The receipt goes to the toast store, not the URL — see lib/toast.ts.
    toast(
      next
        ? t("toast.removedShowing", { name: location.name, showing: next.name })
        : t("toast.removed", { name: location.name }),
    );
    router.replace({ pathname: "/", params: next ? { select: next.id } : {} });
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

  // The design's vertical rhythm, from VerdictScreen.dc.html. It is deliberately
  // NOT uniform: the argument is answer → what it feels like → how sure → shape
  // of the next two hours, and the gaps widen down the page so each block reads
  // as a further step away from the headline rather than as another paragraph
  // of it. A single `gap` on Screen would flatten exactly that.
  //
  // They were 26/40, 26/34 and 30/42, which is round ONE. The shape of the
  // argument is unchanged; the desktop steps simply tightened.
  const gapAfterHead = phone ? 26 : 36;
  const gapAfterHeadline = phone ? 26 : 32;
  const gapAfterBadge = phone ? 28 : 36;

  return (
    <Screen measure={phone ? null : 620} pad={pagePadFor(width)}>
      <NavBar
        // No back control in the two-pane detail pane: the list is beside it,
        // so there is nowhere to go back TO. A back button that returns you to
        // a screen already on screen is a lie about the layout.
        onBack={showBack ? () => router.push("/") : undefined}
        backLabel={showBack ? t("nav.backToPlaces") : undefined}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/*
              The age of the analysis, where the specimen puts it. It also lives
              in the refresh control at the foot, and that is not duplication:
              down there it is the OUTCOME of pressing refresh, up here it dates
              the answer you are reading before you decide whether to trust it.
              "no radar signal" rather than an age when there is no coverage —
              a blind verdict has no analysis to be old.
            */}
            <Text
              testID="verdict-age"
              className="text-ink3 font-mono"
              style={{ fontSize: 9.5, letterSpacing: 0.3, textAlign: "right" }}
            >
              {verdict
                ? blind
                  ? t("verdict.noRadar")
                  : t("verdict.radarAge", { age: Math.round(verdict.analysisAgeMin) })
                : ""}
            </Text>
            <OverflowMenu
              theme={theme}
              label={t("verdict.moreFor", { name: location.name })}
              items={[
                {
                  label: t("verdict.edit"),
                  key: "edit",
                  hint: t("verdict.editHint"),
                  onSelect: () => router.push(`/edit/${location.id}`),
                },
                {
                  label: t("verdict.remove"),
                  key: "remove",
                  hint: t("verdict.removeHint"),
                  onSelect: () => setConfirming(true),
                },
              ]}
            />
          </View>
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

      <View style={{ height: gapAfterHead }} />

      {isError && !verdict ? (
        <ErrorState
          variant="inline"
          detail={t("verdict.unreachable")}
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
                  marginTop: gapAfterHeadline,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  // `12px 22px` in the design — the badge and the confidence
                  // bars sit far apart on one line and close together when they
                  // wrap. A single `gap` gave the wrapped case 22 px of air it
                  // does not want.
                  rowGap: 12,
                  columnGap: 22,
                }}
              >
                <PrecipitationLevelCard verdict={verdict} theme={theme} />
                <PrecipitationConfidence verdict={verdict} theme={theme} />
              </View>

              <View style={{ marginTop: gapAfterBadge }}>
                <PrecipitationGraph frames={verdict.frames} theme={theme} />
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <View style={{ marginTop: "auto", paddingTop: 28, gap: 16 }}>
        {/*
          The map, still subordinate and still at the foot.

          It was a bare line of text, on the design's reasoning that the map is a
          confirmation layer you go looking for — never the landing view, never
          the biggest thing here, because the answer is the sentence above. That
          ruling holds and this obeys it: it sits below the graph, after
          everything that answers the question, and a strip this size cannot
          compete with a 54-point headline. What it changes is that the old link
          asked you to take the trip on faith. Somebody deciding whether to check
          the evidence should be able to see whether there IS any weather nearby
          first.

          Hidden for a blind verdict: there is no field to show, and offering to
          explain a non-answer is worse than not offering.
        */}
        {hasReading ? (
          <RadarPreview
            lat={location.lat}
            lon={location.lon}
            name={location.name}
            radiusKm={location.radiusKm}
            theme={theme}
            height={phone ? 140 : 180}
            onPress={() => router.push(`/map/${location.id}`)}
          />
        ) : null}

        <RefreshControl
          status={busy ? "refreshing" : (outcome ?? "idle")}
          radarAgeMin={verdict ? Math.round(verdict.analysisAgeMin) : undefined}
          onRefresh={() => void refresh()}
        />
        {/*
          Only when this screen IS the screen. In two-pane the list pane already
          carries it, and MET's attribution appearing twice on one screen reads
          as a layout mistake rather than as diligence. `showBack` distinguishes
          the two cases: it is false exactly when this is a pane.
        */}
        {showBack ? <Attribution /> : null}
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
