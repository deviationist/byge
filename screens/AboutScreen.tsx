import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Attribution } from "../components/Attribution";
import { BrandMark } from "../components/BrandMark";
import { NavBar } from "../components/NavBar";
import { SegmentedControl } from "../components/SegmentedControl";
import { Screen } from "../layouts/Screen";
import { Section } from "../layouts/Section";
import { useThemeContext } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";
import type { ThemeChoice } from "../theme/useTheme";

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
  { value: "system" as const, label: "System" },
] satisfies readonly { value: ThemeChoice; label: string }[];

/**
 * What byge is, how to change its appearance, and the attribution in full.
 *
 * Appearance lives here rather than in a Settings screen: theme is the only
 * genuinely global preference (radius is per-location), and one control does
 * not earn a screen of its own.
 */
export function AboutScreen() {
  const router = useRouter();
  const { choice, choose } = useThemeContext();

  const body = { fontSize: 14, lineHeight: 23, color: "var(--color-ink2)" } as const;
  const note = {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 19,
    color: "var(--color-ink3)",
  } as const;

  return (
    <Screen>
      <NavBar onBack={() => router.back()} backLabel="Back to places">
        <View />
      </NavBar>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <BrandMark size={52} />
        <Text style={note}>byge /ˈbyːɡə/{"\n"}Norwegian: a passing shower.</Text>
      </View>

      <Text style={{ fontSize: 19, lineHeight: 29, color: "var(--color-ink)" }}>
        byge reads MET Norway’s radar nowcast for your exact coordinate and tells you whether it
        is raining, and for how long. Nothing else.
      </Text>

      <Section title="Appearance">
        <SegmentedControl
          label="Appearance"
          labelHidden
          options={THEME_OPTIONS}
          value={choice}
          onChange={choose}
        />
      </Section>

      <Section title="How it works">
        <Text style={body}>
          Forecast frames are advection-only: the measured rain field slides along measured
          motion. Cells do not grow or die, so far-out frames are weaker — which is what the
          confidence marker tells you.
        </Text>
        <Text style={body}>
          The horizon is 115 minutes. When a spell is still going at the horizon, byge reports a
          lower bound and says so. It will never round an unknown into a number.
        </Text>
        <Text style={body}>
          Where the radar cannot see, byge says so rather than saying “dry”. Those are different
          claims.
        </Text>
      </Section>

      <Section title="Data">
        <Attribution />
        <Text style={note}>Not affiliated with, or endorsed by, MET Norway or NRK.</Text>
      </Section>
    </Screen>
  );
}
