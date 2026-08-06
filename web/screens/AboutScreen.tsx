import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Attribution } from "../components/Attribution";
import { BrandMark } from "../components/BrandMark";
import { NavBar } from "../components/NavBar";
import { SegmentedControl } from "../components/SegmentedControl";
import { useBack } from "../hooks/useBack";
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
  const goBack = useBack("/");
  const { t } = useTranslation();
  const { choice, choose } = useThemeContext();

  const body = { fontSize: 14, lineHeight: 23 } as const;
  const note = {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 19,
  } as const;

  return (
    <Screen>
      <NavBar onBack={goBack} backLabel={t("nav.backToPlaces")}>
        <View />
      </NavBar>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <BrandMark size={52} />
        <Text className="text-ink3" style={note}>
          byge /ˈbyːɡə/{"\n"}Norwegian: a passing shower.
        </Text>
      </View>

      <Text className="text-ink" style={{ fontSize: 19, lineHeight: 29 }}>
        byge reads MET Norway’s radar nowcast for your exact coordinate and tells you whether it
        is raining, and for how long. Nothing else.
      </Text>

      <Section title={t("about.appearanceSection")}>
        <SegmentedControl
          label={t("about.appearance")}
          labelHidden
          options={THEME_OPTIONS}
          value={choice}
          onChange={choose}
        />
      </Section>

      <Section title={t("about.howItWorks")}>
        <Text className="text-ink2" style={body}>
          {t("about.advection")}
        </Text>
        <Text className="text-ink2" style={body}>
          {t("about.horizon")}
        </Text>
        <Text className="text-ink2" style={body}>
          {t("about.blind")}
        </Text>
      </Section>

      <Section title={t("about.data")}>
        <Attribution />
        <Text className="text-ink3" style={note}>
          {t("about.notAffiliated")}
        </Text>
      </Section>
    </Screen>
  );
}
