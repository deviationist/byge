import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

/**
 * Plus and minus, over the map.
 *
 * The map could always be zoomed — MapCanvas handles the wheel, pinch, and
 * +/- keys — but none of those is discoverable and two of them do not exist on
 * a touch device with one finger free. So the capability was there and the
 * affordance was not, which for most people is the same as it not being there.
 *
 * Buttons rather than a slider: zoom here is a small set of integer steps, and
 * a slider implies continuous control the tile grid cannot honour. They are
 * real buttons, so they are keyboard reachable and announce their own state
 * when a limit is reached, rather than going quietly dead at the ends.
 */
export type ZoomControlProps = {
  zoom: number;
  min: number;
  max: number;
  onChange: (zoom: number) => void;
};

const SIZE = 34;

/**
 * `dataSet` is a react-native-web affordance — it becomes `data-map-control` in
 * the DOM — and React Native's own types do not know it, so it needs the same
 * cast the other web-only props in this codebase use. Inert on native, which is
 * correct: the pan gesture it guards is web-only too, built on PointerEvent.
 */
const MAP_CONTROL = { dataSet: { mapControl: "true" } } as object;

export function ZoomControl({ zoom, min, max, onChange }: ZoomControlProps) {
  const { t } = useTranslation();

  return (
    <View
      testID="zoom-control"
      // Marks this subtree as a control rather than map surface. MapCanvas's
      // pan listener sits on the surface and sees every pointerdown inside it
      // through bubbling; without this it starts a drag and captures the
      // pointer, which steals the pointerup and stops the button ever firing a
      // click. See the guard in MapCanvas.
      {...MAP_CONTROL}
      // The container must not swallow drags meant for the map underneath —
      // only the two buttons are interactive.
      pointerEvents="box-none"
      style={{ position: "absolute", right: 10, top: 10, gap: 6 }}
    >
      <Step
        label={t("map.zoomIn")}
        glyph="+"
        disabled={zoom >= max}
        onPress={() => onChange(Math.min(max, zoom + 1))}
      />
      <Step
        label={t("map.zoomOut")}
        glyph="−"
        disabled={zoom <= min}
        onPress={() => onChange(Math.max(min, zoom - 1))}
      />
    </View>
  );
}

function Step({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Announced as disabled rather than merely looking faded, so a screen
      // reader user learns the limit instead of pressing into silence.
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      className="bg-surface border-line2"
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderWidth: 1,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {/*
        The glyph is decorative — `accessibilityLabel` above carries the meaning,
        and "plus" read aloud mid-map is noise.
      */}
      <Text aria-hidden className="text-ink" style={{ fontSize: 17, lineHeight: 20 }}>
        {glyph}
      </Text>
    </Pressable>
  );
}
