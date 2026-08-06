import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Attribution } from "../components/Attribution";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { InstallPrompt } from "../components/InstallPrompt";
import { LocationsList } from "../components/LocationsList";
import { NavBar } from "../components/NavBar";
import { PrecipitationLegend } from "../components/PrecipitationLegend";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useLocations } from "../hooks/useLocations";
import { useVerdicts } from "../hooks/useVerdict";
import { Screen } from "../layouts/Screen";
import { hasEverSaved, lastRemoved } from "../lib/storage";
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

  // Rows come from the SAVED LIST, not from the verdicts. A verdict merges in
  // when it arrives; until then the row is present and says it is checking.
  // Deriving rows from verdicts made every saved place disappear behind the
  // first-run welcome until the first fetch resolved.
  const items = locations.map((l) => ({ ...l, verdict: verdicts?.[l.id] }));

  // Two distinct empty states. First run is a welcome; the one after removing
  // your last place confirms what you did and makes no pitch.
  const empty = (
    <EmptyState
      // Derived from a sticky flag rather than a `?removed=` param. The param
      // named the place, which read better — but it also meant the distinction
      // evaporated on reload and rode along in the address bar. The name is not
      // lost: the toast carries it, which is where the receipt belongs.
      reason={hasEverSaved() ? "removed-last" : "first-run"}
      removedName={lastRemoved()}
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
