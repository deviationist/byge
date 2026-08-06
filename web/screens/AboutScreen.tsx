import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Attribution } from "../components/Attribution";
import { BrandMark } from "../components/BrandMark";
import { NavBar } from "../components/NavBar";
import { SegmentedControl } from "../components/SegmentedControl";
import { useBack } from "../hooks/useBack";
import { chooseLanguage, type LanguageChoice, languageChoice } from "../i18n";
import { Screen } from "../layouts/Screen";
import { Section } from "../layouts/Section";
import { APP_VERSION } from "../lib/version";
import { useThemeContext } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";
import type { ThemeChoice } from "../theme/useTheme";

// Built at render, not as a module constant: a constant calls t() at import
// time, which can precede i18n init and pins English into a value no language
// switch can reach. Three labels that existed as `appearance.*` keys were
// hardcoded here regardless — the string table had them, this screen ignored it.
function themeOptions(t: TFunction) {
  return [
    { value: "light" as const, label: t("appearance.light") },
    { value: "dark" as const, label: t("appearance.dark") },
    {
      value: "system" as const,
      label: t("appearance.system"),
      hint: t("appearance.systemHint"),
    },
  ] satisfies readonly { value: ThemeChoice; label: string; hint?: string }[];
}

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
  // Local, because i18next's change is what actually re-renders the tree — this
  // only keeps the control's own selected state in step.
  const [language, setLanguage] = useState<LanguageChoice>(languageChoice());

  const body = { fontSize: 14, lineHeight: 23 } as const;
  const note = {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 19,
  } as const;

  return (
    <Screen>
      <NavBar onBack={goBack} backLabel={t("nav.backToPlaces")}>
        <Text
          accessibilityRole="header"
          className="text-ink font-display"
          style={{ fontSize: 24 }}
        >
          {t("nav.aboutByge")}
        </Text>
      </NavBar>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <BrandMark size={52} />
        {/*
          These two were hardcoded English while `about.pronunciation` and
          `about.what` sat unused in the string table — the extraction created
          the keys and never came back for the screen.
        */}
        <Text className="text-ink3" style={note}>
          {t("about.pronunciation")}
        </Text>
      </View>

      {/*
        The display face at 300, matching the headline register: this sentence
        is the app describing what it is, which is the same kind of statement as
        a verdict, not a caption about one. 40ch because it is a paragraph to
        read rather than a column to scan.
      */}
      <Text
        className="text-ink font-display"
        style={{ fontSize: 19, lineHeight: 29, fontWeight: "300", maxWidth: "40ch" as never }}
      >
        {t("about.what")}
      </Text>

      <Section title={t("about.appearanceSection")}>
        <SegmentedControl
          label={t("about.appearance")}
          labelHidden
          options={themeOptions(t)}
          value={choice}
          onChange={choose}
        />
      </Section>

      {/*
        A Norwegian app whose default is English needs a way to say so. It
        follows the device unless told otherwise — which is the right default,
        and also the reason the control has to exist: someone reading English on
        a Norwegian phone, or the reverse, otherwise has no way out.

        The names are each written IN their own language. "Norwegian" is no use
        to the person who needs it; «Norsk» is.
      */}
      <Section title={t("about.languageSection")}>
        <SegmentedControl<LanguageChoice>
          label={t("about.language")}
          labelHidden
          options={[
            { value: "system", label: t("language.system"), hint: t("language.systemHint") },
            { value: "en", label: "English" },
            { value: "nb", label: "Norsk" },
          ]}
          value={language}
          onChange={(next) => {
            chooseLanguage(next);
            setLanguage(next);
          }}
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

      {/*
        "offline-capable" is a claim, so it is only made because the service
        worker makes it true — the last verdict is readable with no network.
        The design's line ends in a link to Settings; there is no Settings
        screen, so it ends here instead of pointing at nothing.
      */}
      <View
        className="border-t-line"
        style={{ marginTop: "auto", borderTopWidth: 1, paddingTop: 14 }}
      >
        <Text className="text-ink3" style={note}>
          {t("about.version", { version: APP_VERSION })}
        </Text>
      </View>
    </Screen>
  );
}
