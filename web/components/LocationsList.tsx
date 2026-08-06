import type { ReactNode } from "react";
import { View } from "react-native";
import type { Verdict } from "../lib/forecast";
import type { Theme } from "../theme/useTheme";
import { LocationCard } from "./LocationCard";

/**
 * The saved places, plus the state where there are none.
 *
 * The empty state is passed IN rather than imported. `EmptyState` is the app's
 * actual first impression and owns its own copy and call-to-action; this list
 * only owns the decision of *when* it is shown, which is the part that belongs
 * to the list.
 */
export type LocationsListItem = {
  id: string;
  name: string;
  place?: string;
  lat?: number;
  lon?: number;
  verdict?: Verdict;
};

export type LocationsListProps = {
  items: LocationsListItem[];
  theme: Theme;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Shown instead of the list when nothing is saved. */
  empty?: ReactNode;
  /** FlatList-shaped alias for `empty`, for callers that already speak that. */
  ListEmptyComponent?: ReactNode;
  /**
   * Trailing content — the "+ Add a place" affordance. Deliberately NOT
   * rendered in the empty state: an EmptyState with its own call-to-action plus
   * a second add button is two front doors to the same room.
   */
  footer?: ReactNode;
};

export function LocationsList({
  items,
  theme,
  selectedId,
  onSelect,
  empty,
  ListEmptyComponent,
  footer,
}: LocationsListProps) {
  if (items.length === 0) {
    return <View testID="locations-empty">{empty ?? ListEmptyComponent ?? null}</View>;
  }

  return (
    <View
      testID="locations-list"
      accessibilityRole="list"
      style={{ flexDirection: "column", gap: 8 }}
    >
      {items.map((it) => (
        <LocationCard
          key={it.id}
          name={it.name}
          place={it.place}
          lat={it.lat}
          lon={it.lon}
          verdict={it.verdict}
          theme={theme}
          variant="row"
          selected={it.id === selectedId}
          // No handler means no Pressable, so a read-only list is not
          // announced as a row of buttons that do nothing.
          onPress={onSelect ? () => onSelect(it.id) : undefined}
        />
      ))}
      {footer ?? null}
    </View>
  );
}
