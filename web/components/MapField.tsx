import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { cellOf, clampCoord, OutsideGridError } from "../lib/grid";
import type { Theme } from "../theme/useTheme";
import { Button } from "./Button";
import {
  type Basemap,
  type LatLon,
  MAX_ZOOM,
  MapCanvas,
  MIN_ZOOM,
  metersPerPixel,
} from "./MapCanvas";
import { basemapSegments, SegmentedControl } from "./SegmentedControl";
import { creditFor } from "./TileLayer";
import type { KartverketLayer } from "./TileLayer";
import { ZoomControl } from "./ZoomControl";

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
  const { t } = useTranslation();
  const [status, setStatus] = useState<LocateStatus>("idle");
  // Owned here rather than lifted to the screen: which map you find easiest to
  // recognise a place on is a property of looking at the map, not of the place
  // being saved. Nothing about the verdict depends on it, so it does not belong
  // in `SavedLocation`.
  const [layer, setLayer] = useState<KartverketLayer>(basemap);

  // Zoom is uncontrolled unless a caller asks to hear about it. Both screens
  // that embed a map want zoom buttons and neither wants to own the number, so
  // making the prop mandatory would have meant identical boilerplate twice —
  // and it is how the buttons came to render nowhere at all: they were gated on
  // `onZoomChange`, which nobody passed.
  const [ownZoom, setOwnZoom] = useState(zoom);
  const currentZoom = onZoomChange ? zoom : ownZoom;
  const setZoom = useCallback(
    (z: number) => {
      setOwnZoom(z);
      onZoomChange?.(z);
    },
    [onZoomChange],
  );

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
  const ringPx = (2 * radiusKm * 1000) / metersPerPixel(value.lat, currentZoom);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: 300 }}>
        <MapCanvas
          center={value}
          zoom={currentZoom}
          onMove={commit}
          onMoveEnd={commit}
          onZoomChange={setZoom}
          basemap={layer}
          theme={theme}
          label={t("map.pick")}
          attribution={creditFor(layer)}
        >
          {/* Ring first so the marker sits on top of it. */}
          <View
            pointerEvents="none"
            accessibilityLabel={`${radiusKm} km radius`}
            // Band 4 — the ring is drawn in the palette, not in chrome ink, so
            // the circle reads as belonging to the weather it will report on.
            className="border-b4 bg-transparent"
            style={{
              position: "absolute",
              width: ringPx,
              height: ringPx,
              borderRadius: ringPx / 2,
              borderWidth: 1.5,
            }}
          />
          <Marker />
          <ZoomControl zoom={currentZoom} min={MIN_ZOOM} max={MAX_ZOOM} onChange={setZoom} />
        </MapCanvas>
      </View>

      {/*
        Under the map, not floating over it. The map pane is 300 px tall and
        already carries a crosshair, a radius ring, an attribution line and the
        zoom buttons; a fifth thing on top of the imagery is where a picker
        stops being a picker. `labelHidden` because "Map style" beside four
        style names is a caption stating the obvious — but the name stays in the
        accessibility tree, where a radiogroup with no name is a puzzle.
      */}
      <SegmentedControl<KartverketLayer>
        label={t("basemap.label")}
        labelHidden
        options={basemapSegments()}
        value={layer}
        onChange={setLayer}
      />

      <View
        style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}
      >
        {/*
          No coordinate readout here any more. It used to be the only place the
          numbers appeared, so it carried them AND the four-decimal note — but
          the screen now has two labelled, editable coordinate boxes, and
          repeating the same pair of numbers above them with the same hint
          underneath said one thing three times. The boxes are the readout.
        */}
        <View style={{ flex: 1, minWidth: 180 }} />

        <Button
          label={status === "locating" ? t("map.locating") : t("map.locate")}
          variant="secondary"
          disabled={status === "locating"}
          onPress={locate}
          hint={t("map.locateHint")}
        />
      </View>

      {status === "denied" ? (
        <Notice
          title={t("map.blockedTitle")}
          // iOS gives no in-page way back from a denial, so an apology would be
          // useless. Name the actual path, then point at the two routes that
          // still work — the map is not a dead end even when this button is.
          body={t("map.blockedBody")}
        />
      ) : null}

      {status === "unavailable" ? (
        <Notice title={t("map.unsupportedTitle")} body={t("map.unsupportedBody")} />
      ) : null}

      {status === "failed" ? (
        <Notice title={t("map.failedTitle")} body={t("map.failedBody")} />
      ) : null}

      {!inside ? (
        <Notice
          title={t("map.outsideTitle")}
          // Warned here, while panning, rather than after saving — a place this
          // far out yields no answer at all, which is a different and worse
          // outcome than a dry one, and the user should learn it before they
          // name the thing and press save.
          body={t("map.outsideBody")}
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
  const { t } = useTranslation();
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={t("map.selectedPoint")}
      role="img"
      style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}
    >
      <View className="bg-ink" style={{ position: "absolute", width: 22, height: 1.5 }} />
      <View className="bg-ink" style={{ position: "absolute", width: 1.5, height: 22 }} />
      <View
        className="bg-ink border-surface"
        style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 2 }}
      />
    </View>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View
      accessibilityRole="alert"
      className="bg-sunk border-line2"
      style={{
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        gap: 4,
      }}
    >
      <Text className="text-ink" style={{ fontSize: 13.5 }}>
        {title}
      </Text>
      <Text className="text-ink2" style={{ fontSize: 12.5, lineHeight: 19 }}>
        {body}
      </Text>
    </View>
  );
}
