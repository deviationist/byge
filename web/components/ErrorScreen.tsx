import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import { MONO } from "../theme/tokens";
import { Attribution } from "./Attribution";
import { Button } from "./Button";

/**
 * Every dead end, in one component — because they differ only in what they can
 * honestly say.
 *
 * THE RULE: name what happened, in the voice the verdict uses, and offer the one
 * route that actually helps. No apology copy, no illustration, no "oops". A dead
 * end is information too, and byge's whole claim is that it tells you what it
 * knows — including that it does not have this.
 *
 * The four are not one screen with four strings, because what we KNOW differs:
 *
 *   deleted    the link was valid and the place is gone. The only case that
 *              names a cause, because it is the only one we know. It does not
 *              offer to restore it: byge keeps places locally and holds no copy,
 *              so "restore" would mean guessing a coordinate we no longer have.
 *   notFound   no such route. Shows the PATH, because a mistyped or truncated
 *              shared link is the likely cause and the path is the evidence.
 *   offline    nothing is broken and nothing is lost — different in kind from a
 *              404. The answer exists, we just cannot reach it, so the action is
 *              retry and the tone is not failure.
 *   crash      the one case we cannot explain, so it does not pretend to. It
 *              shows a reference and does not blame the reader.
 *
 * Attribution rides along: MET's licence does not lapse on an error page.
 */
export type ErrorKind = "deleted" | "notFound" | "offline" | "crash";

export type ErrorScreenProps = {
  kind: ErrorKind;
  /** The place that is gone. `deleted` only. */
  name?: string;
  /** The address that led here. `notFound` and `deleted`. */
  path?: string;
  /** Fault reference. `crash` only. */
  reference?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export function ErrorScreen({
  kind,
  name,
  path,
  reference,
  onPrimary,
  onSecondary,
}: ErrorScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const phone = width < 720;

  const copy = COPY[kind];
  const detail =
    kind === "crash"
      ? (reference ?? defaultReference())
      : kind === "offline"
        ? ""
        : (path ?? "");

  return (
    <View
      testID="error-screen"
      className="bg-bg"
      style={{
        flex: 1,
        paddingTop: phone ? 22 : 56,
        paddingHorizontal: phone ? 22 : 64,
        paddingBottom: phone ? 26 : 40,
      }}
    >
      <View style={{ flex: 1, justifyContent: "center", maxWidth: phone ? 420 : 520 }}>
        <Text
          className="text-ink3"
          style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.9, marginBottom: 18 }}
        >
          {t(copy.code)}
        </Text>

        {/*
          The display face at the headline's own size. A dead end is a statement
          byge is making, not a system message it is relaying, and setting it in
          chrome type would make it the latter.
        */}
        <Text
          accessibilityRole="header"
          className="text-ink font-display"
          style={{
            fontSize: phone ? 34 : 44,
            fontWeight: "300",
            lineHeight: (phone ? 34 : 44) * 1.12,
            letterSpacing: (phone ? 34 : 44) * -0.015,
          }}
        >
          {t(copy.title)}
        </Text>

        <Text
          className="text-ink2"
          style={{
            fontSize: phone ? 14.5 : 16,
            lineHeight: (phone ? 14.5 : 16) * 1.6,
            marginTop: 16,
          }}
        >
          {t(copy.body, { name: name ?? t("error.thatPlace") })}
        </Text>

        {detail ? (
          // The evidence, in the register byge uses for machinery. Broken across
          // lines rather than truncated: a path you cannot read whole is not
          // evidence of anything.
          <View
            className="border-l-line2"
            style={{ marginTop: 20, borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 2 }}
          >
            <Text
              className="text-ink3"
              style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 18 }}
            >
              {detail}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
          <Button label={t(copy.primary)} onPress={onPrimary} />
          {copy.secondary && onSecondary ? (
            <Button label={t(copy.secondary)} variant="secondary" onPress={onSecondary} />
          ) : null}
        </View>
      </View>

      <View
        className="border-t-line"
        style={{ marginTop: 36, paddingTop: 16, borderTopWidth: 1 }}
      >
        <Attribution />
      </View>
    </View>
  );
}

const COPY: Record<
  ErrorKind,
  { code: string; title: string; body: string; primary: string; secondary?: string }
> = {
  deleted: {
    code: "error.codeNothing",
    title: "error.deletedTitle",
    body: "error.deletedBody",
    primary: "error.yourPlaces",
    secondary: "error.addAgain",
  },
  notFound: {
    code: "error.codeNothing",
    title: "error.notFoundTitle",
    body: "error.notFoundBody",
    primary: "error.yourPlaces",
  },
  offline: {
    code: "error.codeOffline",
    title: "error.offlineTitle",
    body: "error.offlineBody",
    primary: "error.tryAgain",
    secondary: "error.yourPlaces",
  },
  crash: {
    code: "error.codeFailed",
    title: "error.crashTitle",
    body: "error.crashBody",
    primary: "error.reload",
    secondary: "error.yourPlaces",
  },
};

/**
 * A reference the reader can quote.
 *
 * Deliberately NOT an error message or a stack: those name our internals to
 * somebody who cannot act on them, and can carry a place name. A timestamp is
 * enough to find the fault at our end and says nothing about the reader.
 */
function defaultReference(): string {
  return `ref ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
}
