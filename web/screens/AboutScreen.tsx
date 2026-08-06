import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { Attribution } from "../components/Attribution";
import { BrandMark } from "../components/BrandMark";
import { NavBar } from "../components/NavBar";
import { SegmentedControl } from "../components/SegmentedControl";
import { useBack } from "../hooks/useBack";
import { chooseLanguage, type LanguageChoice, languageChoice } from "../i18n";
import { pagePadFor, Screen } from "../layouts/Screen";
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
  const goBack = useBack("/");
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { choice, choose } = useThemeContext();
  // Local, because i18next's change is what actually re-renders the tree — this
  // only keeps the control's own selected state in step.
  const [language, setLanguage] = useState<LanguageChoice>(languageChoice());

  // Measured off the specimen rather than picked: 13/1.6 for the prose, mono
  // 10/1.7 for the machinery. This screen had 14/23 and mono 11/19 — close
  // enough to look deliberate and wrong enough that the notes sat a shade
  // heavier than the same register does everywhere else in the app.
  const body = { fontSize: 13, lineHeight: 21, maxWidth: "52ch" as never } as const;
  const note = {
    fontFamily: MONO,
    fontSize: 10,
    lineHeight: 17,
  } as const;

  return (
    // GAP AND PAD, both of which were missing entirely.
    //
    // `Screen` applies no rhythm unless it is asked for one, so every block on
    // this page — the mark, the sentence, all four sections, the footer — was
    // butted flush against its neighbours at zero pixels, and the page padding
    // fell back to the tight uniform value the two-pane LIST column wants
    // rather than the growing gutter a reading screen takes. The specimen is
    // explicit about both: a uniform 22 px between blocks, and 18/24/10 →
    // 40/44/26 → 62/72/34 as the viewport grows.
    //
    // This is the same omission the verdict screen had. Worth noticing that
    // the default is the trap: a screen that forgets to ask looks broken rather
    // than looking plain.
    <Screen gap={22} pad={pagePadFor(width)}>
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

        NOT `marginTop: auto`. It was, which pinned this to the bottom of the
        viewport and opened a void between the last section and the rule on any
        screen taller than the content — the single most visible part of the
        spacing being wrong. In the specimen it is simply the last block in the
        column, 22 px after the one before it like everything else.
      */}
      <View className="border-t-line" style={{ borderTopWidth: 1, paddingTop: 14 }}>
        <Text className="text-ink3" style={note}>
          {t("about.version", { version: APP_VERSION })}
        </Text>
      </View>
    </Screen>
  );
}
