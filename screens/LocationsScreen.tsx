import { useRouter } from "expo-router";
import { useState } from "react";
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
import { useResolvedTheme } from "../theme/ThemeProvider";

/**
 * Which of my places is wet?
 *
 * The list is the app's root, so it also owns the only route to About — an
 * attribution line is a legal obligation with a legal-sized affordance, and
 * must not be doing double duty as navigation.
 */
export function LocationsScreen() {
  const router = useRouter();
  const theme = useResolvedTheme();
  const { locations } = useLocations();
  const { data: verdicts } = useVerdicts(locations);
  const install = useInstallPrompt();
  const [clearedName, setClearedName] = useState<string | undefined>();

  const items = locations
    .map((l) => (verdicts?.[l.id] ? { ...l, verdict: verdicts[l.id] } : null))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Two distinct empty states. First run is a welcome; the one after removing
  // your last place confirms what you did and makes no pitch.
  const empty = (
    <EmptyState
      reason={clearedName ? "removed-last" : "first-run"}
      removedName={clearedName}
      onAdd={() => router.push("/add")}
    />
  );

  return (
    <Screen>
      <NavBar
        trailing={
          <Button label="About" variant="ghost" onPress={() => router.push("/about")} />
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
        onSelect={(id) => router.push(`/location/${id}`)}
        empty={empty}
        footer={
          <Button
            label="+ Add a place"
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
