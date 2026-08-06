import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { cellOf, clampCoord, OutsideGridError } from "../lib/grid";
import type { Theme } from "../theme/useTheme";
import { Button } from "./Button";
import { type Basemap, type LatLon, MapCanvas, metersPerPixel } from "./MapCanvas";

/**
 * The add-a-place picker.
 *
 * CENTRE-PINNED. The marker is fixed at the centre of the viewport and the user
 * pans the world beneath it; the coordinate under the crosshair is the
 * selection. Not a draggable pin — a fixed target is steadier on a phone and it
 * keeps the point of interest beside the thumb instead of underneath it.
 *
 * NOT the phase-3 "live position" feature, and it must not look like it. This is
 * a ONE-SHOT pick: permission is asked at the moment the button is tapped, never
 * on load; nothing is watched; and once the map has been centred the control
 * returns to rest, because from that instant it is an ordinary pan that the user
 * still has to confirm. Phase 3 is a continuously-updating verdict for wherever
 * you are — a different thing, and it will need a different affordance. If you
 * ever reach for `watchPosition` in this file, you are building the wrong one.
 */

export type MapFieldProps = {
  /** The chosen coordinate. Controlled — search and manual entry set it too. */
  value: LatLon;
  onChange: (value: LatLon) => void;
  /** Drawn as a ring. The RadiusField control that sets it lives elsewhere. */
  radiusKm: number;
  theme: Theme;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  basemap?: Basemap;
  /**
   * Injected in tests. jsdom has no geolocation, and a component that reads the
   * global directly cannot be tested for the thing that matters most here —
   * that it never asks on mount.
   */
  geolocation?: Pick<Geolocation, "getCurrentPosition">;
};

/**
 * Is this coordinate inside the Nordic radar grid at all?
 *
 * Distinct from "can the radar see it": inside the grid but unobserved is the
 * `blind` swatch, and needs a fetch to know. This is only the domain check, and
 * it is free — which is what lets the warning appear WHILE panning, before
 * anything is saved.
 */
export function insideGrid(lat: number, lon: number): boolean {
  try {
    cellOf(lat, lon);
    return true;
  } catch (e) {
    if (e instanceof OutsideGridError) return false;
    throw e;
  }
}

type LocateStatus = "idle" | "locating" | "denied" | "unavailable" | "failed";

/** PERMISSION_DENIED. Read off the constant when present — the enum is on the error. */
const PERMISSION_DENIED = 1;

const MONO = "'IBM Plex Mono', monospace";

export function MapField({
  value,
  onChange,
  radiusKm,
  theme,
  zoom = 11,
  onZoomChange,
  basemap = "grey",
  geolocation,
}: MapFieldProps) {
  const [status, setStatus] = useState<LocateStatus>("idle");

  // getCurrentPosition can answer long after the screen is gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Every route into this component — pan, search, manual entry, locate — lands
  // here, so the 4-decimal clamp is applied in exactly one place and cannot be
  // skipped by whichever one gets added next.
  const commit = useCallback(
    (c: LatLon) => onChange({ lat: clampCoord(c.lat), lon: clampCoord(c.lon) }),
    [onChange],
  );

  const locate = useCallback(() => {
    const geo =
      geolocation ?? (typeof navigator !== "undefined" ? navigator.geolocation : undefined);
    if (!geo) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    geo.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return;
        // Straight back to rest. Leaving a "located" state on screen would grow
        // into the phase-3 live-position affordance by accident.
        setStatus("idle");
        commit({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        if (!mounted.current) return;
        setStatus(err?.code === PERMISSION_DENIED ? "denied" : "failed");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, [geolocation, commit]);

  const inside = useMemo(() => insideGrid(value.lat, value.lon), [value.lat, value.lon]);

  // The ring is drawn in real-world units, so it has to ask the projection how
  // big a pixel currently is rather than assume a scale.
  const ringPx = (2 * radiusKm * 1000) / metersPerPixel(value.lat, zoom);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: 300 }}>
        <MapCanvas
          center={value}
          zoom={zoom}
          onMove={commit}
          onMoveEnd={commit}
          onZoomChange={onZoomChange}
          basemap={basemap}
          theme={theme}
          label="Pick a place — pan the map to move the marker"
          attribution="© Kartverket"
        >
          {/* Ring first so the marker sits on top of it. */}
          <View
            pointerEvents="none"
            accessibilityLabel={`${radiusKm} km radius`}
            style={{
              position: "absolute",
              width: ringPx,
              height: ringPx,
              borderRadius: ringPx / 2,
              borderWidth: 1.5,
              borderColor: "var(--color-b4)",
              backgroundColor: "transparent",
            }}
          />
          <Marker />
        </MapCanvas>
      </View>

      <View
        style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}
      >
        <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
          <Text
            accessibilityLabel={`Selected coordinate ${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`}
            style={{ fontFamily: MONO, fontSize: 14, color: "var(--color-ink)" }}
          >
            {value.lat.toFixed(4)}, {value.lon.toFixed(4)}
          </Text>
          <Text
            style={{
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: 16,
              color: "var(--color-ink3)",
            }}
          >
            Four decimals max — MET rejects finer than that. ≈11 m, closer than the radar can
            see anyway.
          </Text>
        </View>

        <Button
          label={status === "locating" ? "Finding you…" : "Use my location"}
          variant="secondary"
          disabled={status === "locating"}
          onPress={locate}
          hint="Centres the map on your device. You still confirm the place."
        />
      </View>

      {status === "denied" ? (
        <Notice
          title="Location is blocked for this site"
          // iOS gives no in-page way back from a denial, so an apology would be
          // useless. Name the actual path, then point at the two routes that
          // still work — the map is not a dead end even when this button is.
          body="Your browser will not ask again from here. On iOS: Settings › Safari › Location. On Android and desktop: the padlock in the address bar. Meanwhile you can pan the map or type the coordinates."
        />
      ) : null}

      {status === "unavailable" ? (
        <Notice
          title="This device cannot report a location"
          body="Pan the map or type the coordinates instead."
        />
      ) : null}

      {status === "failed" ? (
        <Notice
          title="Could not get a fix"
          body="The device did not answer in time. Try again, or pan the map instead."
        />
      ) : null}

      {!inside ? (
        <Notice
          title="Outside the radar grid"
          // Warned here, while panning, rather than after saving — a place this
          // far out yields no answer at all, which is a different and worse
          // outcome than a dry one, and the user should learn it before they
          // name the thing and press save.
          body="The Nordic radar does not reach here, so this place would have no answer to give — not a dry one, none. Pan the marker back inside the grid."
        />
      ) : null}
    </View>
  );
}

/**
 * The centre pin. "Marker" is the right word here — this is a map pin, whereas
 * the list glyph is a Swatch.
 *
 * A crosshair rather than a teardrop: a teardrop points at ground it does not
 * cover, and at 3 km the difference is most of the radius.
 */
function Marker() {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="Selected point"
      role="img"
      style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          position: "absolute",
          width: 22,
          height: 1.5,
          backgroundColor: "var(--color-ink)",
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 1.5,
          height: 22,
          backgroundColor: "var(--color-ink)",
        }}
      />
      <View
        style={{
          width: 11,
          height: 11,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: "var(--color-surface)",
          backgroundColor: "var(--color-ink)",
        }}
      />
    </View>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: "var(--color-line2)",
        backgroundColor: "var(--color-sunk)",
        borderRadius: 10,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 13.5, color: "var(--color-ink)" }}>{title}</Text>
      <Text style={{ fontSize: 12.5, lineHeight: 19, color: "var(--color-ink2)" }}>{body}</Text>
    </View>
  );
}
