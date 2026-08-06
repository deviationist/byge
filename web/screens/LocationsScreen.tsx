import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { AddPlaceCard } from "../components/AddPlaceCard";
import { Attribution } from "../components/Attribution";
import { EmptyState } from "../components/EmptyState";
import { InstallPrompt } from "../components/InstallPrompt";
import { ListHeader } from "../components/ListHeader";
import { LocationsList } from "../components/LocationsList";
import { PrecipitationLegend } from "../components/PrecipitationLegend";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useLocations } from "../hooks/useLocations";
import { useVerdicts } from "../hooks/useVerdict";
import { Screen } from "../layouts/Screen";
import { hasEverSaved, lastRemoved } from "../lib/storage";
import { useResolvedTheme } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";

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
  // `onSelect` is supplied only by the two-pane shell, which is also the only
  // place the list is a 300 px column — so it is the honest signal for "step
  // everything down a size", and it needs no second breakpoint check that could
  // disagree with the one TwoPane already made.
  const twoPane = !!onSelect;

  // Rows come from the SAVED LIST, not from the verdicts. A verdict merges in
  // when it arrives; until then the row is present and says it is checking.
  // Deriving rows from verdicts made every saved place disappear behind the
  // first-run welcome until the first fetch resolved.
  const items = locations.map((l) => ({ ...l, verdict: verdicts?.[l.id] }));

  // Every verdict is cut from the SAME MET analysis, so any one of them dates
  // all of them — no need to reduce over the set looking for the oldest.
  const age = items.find((i) => i.verdict)?.verdict?.analysisAgeMin;

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
    // Measured against the specimen: the design's masthead carries a 14 px
    // bottom padding in the two-pane column and the standalone list screen sets
    // its blocks on a 22 px rhythm. `Screen` applies no gap unless asked, so
    // without this every child sat flush against the next and the list started
    // hard against the caption.
    <Screen gap={twoPane ? 14 : 22}>
      {/*
        The masthead replaces a nav bar. The design puts no bar on this screen
        at all — it is the root, so there is nothing to go back to, and About
        lives in the attribution line at the foot where the other legal text is.
        A bar holding one ghost button was furniture around an empty slot.
      */}
      <ListHeader count={locations.length} ageMin={age} compact={twoPane} />

      {install.available ? (
        <InstallPrompt theme={theme} onInstall={install.prompt} onDismiss={install.dismiss} />
      ) : null}

      {/*
        In the two-pane column the cards sit WIDER than the header above them —
        the design insets the masthead 22 px and the cards 12 px, so the list
        reads as a stack of objects the heading labels rather than as a block of
        text the heading is part of. Pulling out by 8 from the screen's 20 px
        gutter is what produces that 12.
      */}
      <View style={twoPane ? { marginHorizontal: -8, gap: 6 } : { gap: 8 }}>
        <LocationsList
          items={items}
          theme={theme}
          compact={twoPane}
          selectedId={selectedId}
          onSelect={onSelect ?? ((id) => router.push(`/location/${id}`))}
          empty={empty}
          footer={<AddPlaceCard compact={twoPane} onPress={() => router.push("/add")} />}
        />

        {items.length > 0 ? <PrecipitationLegend theme={theme} /> : null}
      </View>

      {/*
        The way into the radar map, and its weight is the ruling.
        A line of text UNDER the places — not a card, not an icon, not a tile,
        and never a tab. The risk Design identified was never that the map
        exists; it is that the map becomes the front door. So it sits below the
        thing this screen is about, at the same weight as "See why — radar map"
        on the verdict, and says plainly that it has no place attached.
      */}
      <Pressable
        testID="radar-entry"
        accessibilityRole="link"
        accessibilityLabel={t("list.radarEntry")}
        onPress={() => router.push("/map")}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          paddingVertical: 8,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text className="text-ink2" style={{ fontSize: 12.5 }}>
          {t("list.radarEntry")} <Text style={{ fontFamily: MONO }}>→</Text>
        </Text>
      </Pressable>

      <View style={{ marginTop: "auto", paddingTop: 24 }}>
        <Attribution onAbout={() => router.push("/about")} />
      </View>
    </Screen>
  );
}
