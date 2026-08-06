import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { useLocations } from "../hooks/useLocations";
import { TWO_PANE_BREAKPOINT, TwoPane } from "../layouts/TwoPane";
import { LocationsScreen } from "./LocationsScreen";
import { VerdictScreen } from "./VerdictScreen";

/**
 * The app's root: a list on phone, a list beside a verdict on anything wider.
 *
 * Two-pane exists because it is the only part of the design that delivers
 * something phone cannot — comparing two places with no navigation at all.
 * Which is also why selection here is STATE rather than a route: navigating
 * would be the very thing the layout is meant to remove.
 *
 * The contract, from Specimen-Mutations:
 *
 *   list pane     always present, always the full list, never collapsible
 *   detail pane   exactly one verdict, or an explicit empty message — never
 *                 blank, and never a place that no longer exists
 *   selection     exactly one row selected whenever the detail pane holds a
 *                 verdict, and it is the place shown; they never disagree
 *   after removal re-points to the nearest surviving neighbour, and the notice
 *                 names it
 *   no back       there is nowhere to go back to, so the detail pane has none
 *
 * Phone keeps the same two screens as separate destinations with a real back.
 * It is not a collapsed pane.
 */
export function HomeScreen() {
  const { locations } = useLocations();
  // `select` arrives after a mutation — a removal re-points the pane at the
  // surviving neighbour, a save points it at what was just added.
  const { select } = useLocalSearchParams<{ select?: string }>();
  const [picked, setPicked] = useState<string | undefined>();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_PANE_BREAKPOINT;

  // The selection invariant, resolved in one place so the two panes cannot
  // disagree. A picked id that no longer exists (it was just removed) falls
  // through to the route hint, then to the first place — the pane is never
  // left holding a place that is gone.
  const exists = (id?: string) => (id && locations.some((l) => l.id === id) ? id : undefined);
  const selectedId = wide ? (exists(picked) ?? exists(select) ?? locations[0]?.id) : undefined;

  const list = (
    <LocationsScreen
      selectedId={selectedId}
      // Wide swaps the pane; narrow navigates, because there is no pane to swap.
      onSelect={wide ? (id) => setPicked(id) : undefined}
    />
  );

  const detail = selectedId ? (
    <VerdictScreen id={selectedId} showBack={false} />
  ) : (
    <EmptyPane />
  );

  return <TwoPane list={list} detail={detail} show="list" breakpoint={TWO_PANE_BREAKPOINT} />;
}

/**
 * The detail pane with nothing to hold.
 *
 * Reached only when there are no places at all. A pane showing the verdict of a
 * place that no longer exists is the worst outcome available here, so it is
 * emptied and says why rather than left blank.
 */
function EmptyPane() {
  return (
    <View
      testID="pane-empty"
      style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 48 }}
    >
      <View style={{ maxWidth: 340, gap: 12 }}>
        <Text className="text-ink3 font-display" style={{ fontSize: 26, lineHeight: 31 }}>
          Nothing to show.
        </Text>
        <Text className="text-ink3 font-mono" style={{ fontSize: 10.5, lineHeight: 18 }}>
          The place that was here is gone. Add one and its answer appears in this pane.
        </Text>
      </View>
    </View>
  );
}
