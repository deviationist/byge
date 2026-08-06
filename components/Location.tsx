import { Text, View } from "react-native";
import type { Theme } from "../theme/useTheme";

/**
 * One location's identity: name, place, coordinates.
 *
 * Three placements, one component — the list row, the verdict header and the
 * map popup. They differ only in how much of the identity is worth spending
 * space on, so that is the only thing `variant` changes. Splitting this into
 * three components is how the same place ends up named two different ways in
 * two different screens.
 */
export type LocationVariant = "row" | "header" | "popup";

export type LocationProps = {
  name: string;
  place?: string;
  lat?: number;
  lon?: number;
  /**
   * Accepted for interface parity. Every colour here is a CSS var that already
   * switches with the root class, so nothing reads it.
   */
  theme: Theme;
  variant?: LocationVariant;
  /** Override the variant default. */
  showPlace?: boolean;
  /** Override the variant default. */
  showCoords?: boolean;
};

/**
 * 4 decimals, always.
 *
 * MET returns 403 above 4 decimals, so this is a hard API limit rather than a
 * style choice — but it is also the honest precision: our grid is 1 km, and the
 * 5th decimal is ~1 m. More digits would imply a resolution the data does not
 * have.
 */
export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

const DEFAULTS: Record<LocationVariant, { place: boolean; coords: boolean; size: number }> = {
  // The row leads with the name at reading size; the status line beneath it is
  // what the row is actually for, so the place would only crowd it.
  row: { place: false, coords: false, size: 16 },
  // The header is the one place you confirm you are looking at the right dot on
  // the map, so it carries everything.
  header: { place: true, coords: true, size: 13 },
  // A popup is already anchored on the map — the coordinates are the pin.
  popup: { place: true, coords: false, size: 13 },
};

export function Location({
  name,
  place,
  lat,
  lon,
  variant = "row",
  showPlace,
  showCoords,
}: LocationProps) {
  const d = DEFAULTS[variant];
  const withPlace = (showPlace ?? d.place) && !!place;
  const withCoords = (showCoords ?? d.coords) && lat !== undefined && lon !== undefined;

  return (
    <View style={{ gap: 2, minWidth: 0, flexShrink: 1 }}>
      <Text
        testID="location-name"
        numberOfLines={1}
        className="text-ink"
        style={{
          fontSize: d.size,
          lineHeight: d.size * 1.3,
          fontWeight: "500",
          letterSpacing: d.size * -0.01,
        }}
      >
        {name}
        {withPlace ? (
          // Softer, but on the same line: the place qualifies the name, it is
          // not a second fact about it.
          <Text
            testID="location-place"
            className="text-ink2"
            style={{ fontWeight: "400" }}
          >
            {` · ${place}`}
          </Text>
        ) : null}
      </Text>

      {withCoords ? (
        <Text
          testID="location-coords"
          className="text-ink3"
          style={{ fontSize: 9.5, lineHeight: 14, letterSpacing: 0.4 }}
        >
          {formatCoords(lat as number, lon as number)}
        </Text>
      ) : null}
    </View>
  );
}
