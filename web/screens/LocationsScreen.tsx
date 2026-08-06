import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Attribution } from "../components/Attribution";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { InstallPrompt } from "../components/InstallPrompt";
import { LocationsList } from "../components/LocationsList";
import { Notice } from "../components/Notice";
import { NavBar } from "../components/NavBar";
import { PrecipitationLegend } from "../components/PrecipitationLegend";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useLocations } from "../hooks/useLocations";
import { useVerdicts } from "../hooks/useVerdict";
import { Screen } from "../layouts/Screen";
import { useResolvedTheme } from "../theme/ThemeProvider";

/**
 * Which of my places is wet?
 *
 * The list is the app's root, so it also owns the only route to About — an
 * attribution line is a legal obligation with a legal-sized affordance, and
 * must not be doing double duty as navigation.
 */
export type LocationsScreenProps = {
  /** Highlighted row in two-pane. Undefined on phone, where nothing is selected. */
  selectedId?: string;
  /**
   * Two-pane swaps the detail pane instead of navigating, so selecting a row
   * must not push a route. Phone leaves this undefined and gets navigation.
   */
  onSelect?: (id: string) => void;
};

export function LocationsScreen({ selectedId, onSelect }: LocationsScreenProps = {}) {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { locations } = useLocations();
  const { data: verdicts } = useVerdicts(locations);
  const install = useInstallPrompt();
  // Set by whichever screen removed your last place. It has to arrive as a
  // route param: this screen remounts on navigation, so local state would
  // always be empty here and the cleared state could never fire.
  //
  // `removed` names what went, `showing` names what the detail pane re-pointed
  // to (two-pane only), `saved` and `edited` cover the other mutations. All
  // arrive as route params rather than state because this screen remounts on
  // navigation — local state would always be empty here, which is exactly how
  // the cleared empty state was unreachable until 2026-08-05.
  const { removed, showing, saved } = useLocalSearchParams<{
    removed?: string;
    showing?: string;
    saved?: string;
  }>();

  // Two-pane names both facts because both changed — the row is gone AND the
  // detail pane is a different place. Phone names one, because one changed.
  const notice = removed
    ? showing
      ? `Removed ${removed}. Showing ${showing}.`
      : `Removed ${removed}.`
    : saved
      ? showing
        ? `Saved ${saved}. Showing it now.`
        : `Saved ${saved}.`
      : undefined;

  // Rows come from the SAVED LIST, not from the verdicts. A verdict merges in
  // when it arrives; until then the row is present and says it is checking.
  // Deriving rows from verdicts made every saved place disappear behind the
  // first-run welcome until the first fetch resolved.
  const items = locations.map((l) => ({ ...l, verdict: verdicts?.[l.id] }));

  // Two distinct empty states. First run is a welcome; the one after removing
  // your last place confirms what you did and makes no pitch.
  const empty = (
    <EmptyState
      // Presence of the param, not its truthiness: a place saved with a blank
      // name still got removed, and EmptyState has copy for a nameless removal
      // ("Removed."). Testing truthiness would show the first-run welcome —
      // the wrong copy for the wrong reason.
      reason={removed !== undefined ? "removed-last" : "first-run"}
      removedName={removed}
      onAdd={() => router.push("/add")}
    />
  );

  return (
    <Screen>
      <NavBar
        trailing={
          <Button
            label={t("nav.about")}
            variant="ghost"
            onPress={() => router.push("/about")}
          />
        }
      >
        <View />
      </NavBar>

      {install.available ? (
        <InstallPrompt theme={theme} onInstall={install.prompt} onDismiss={install.dismiss} />
      ) : null}

      {/*
        Above the list, because the list is where the change is visible. When
        the list is EMPTY the cleared state already says what happened, so
        stacking a notice on top of it would say it twice.
      */}
      {items.length > 0 ? <Notice text={notice} /> : null}

      <LocationsList
        items={items}
        theme={theme}
        selectedId={selectedId}
        onSelect={onSelect ?? ((id) => router.push(`/location/${id}`))}
        empty={empty}
        footer={
          <Button
            label={t("nav.addPlace")}
            variant="secondary"
            block
            onPress={() => router.push("/add")}
          />
        }
      />

      {items.length > 0 ? <PrecipitationLegend theme={theme} /> : null}

      <View style={{ marginTop: "auto", paddingTop: 24 }}>
        <Attribution />
      </View>
    </Screen>
  );
}
