import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button } from "../components/Button";
import { ConfirmSheet, removeLocationCopy } from "../components/ConfirmSheet";
import { MapField } from "../components/MapField";
import { NavBar } from "../components/NavBar";
import { PlaceSearch } from "../components/PlaceSearch";
import { RadiusField } from "../components/RadiusField";
import { TextField } from "../components/TextField";
import { useBack } from "../hooks/useBack";
import { useLocations } from "../hooks/useLocations";
import { Screen } from "../layouts/Screen";
import { Section } from "../layouts/Section";
import { reverseGeocode } from "../lib/geocode";
import { clampCoord } from "../lib/grid";
import { DEFAULT_RADIUS_KM } from "../lib/storage";
import { toast } from "../lib/toast";
import { useResolvedTheme } from "../theme/ThemeProvider";
import { MONO } from "../theme/tokens";

/** A route param that is only usable if it is really a number. */
function numeric(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Oslo, as a starting view for a brand-new place. */
const DEFAULT_CENTRE = { lat: 59.9273, lon: 10.7607 };

/**
 * Add a place — and, with an `id` in the route, edit one.
 *
 * ONE component, two modes. Radius and coordinates are set here and nowhere
 * else, so without an edit mode they would be write-once: someone who picks
 * 3 km for a cabin could never widen it, and a pin dropped one valley over
 * would be permanent.
 */
export function AddLocationScreen() {
  const router = useRouter();
  const goBack = useBack("/");
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  // `lat`/`lon` arrive from the radar map's "Save this point as a place", which
  // is the one route from browsing back into what byge does. They only seed the
  // starting centre — the pin, the radius and the name are all still yours.
  const { id, lat, lon } = useLocalSearchParams<{ id?: string; lat?: string; lon?: string }>();
  const { byId, add, update, remove, neighbourOf } = useLocations();

  const existing = id ? byId(id) : undefined;
  const editing = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [centre, setCentre] = useState({
    lat: existing?.lat ?? numeric(lat) ?? DEFAULT_CENTRE.lat,
    lon: existing?.lon ?? numeric(lon) ?? DEFAULT_CENTRE.lon,
  });
  const [radiusKm, setRadiusKm] = useState(existing?.radiusKm ?? DEFAULT_RADIUS_KM);
  const [confirming, setConfirming] = useState(false);

  const canSave = name.trim().length > 0;

  // The "Grünerløkka, Oslo" line, resolved from wherever the pin currently is.
  //
  // Undefined until it resolves and undefined FOREVER when it does not — out at
  // sea, over the border, offline, or simply not in OSM. The save path stores
  // whatever it holds at that moment, including nothing, and a place with no
  // context line is a perfectly ordinary place. It is never worth blocking Save
  // on, and never worth a spinner: the answer byge exists to give does not
  // depend on it.
  const [place, setPlace] = useState(existing?.place);

  useEffect(() => {
    const ac = new AbortController();
    // Debounced, because `centre` changes on every frame of a drag and each
    // change is a request we would be asking someone else to serve.
    const timer = setTimeout(() => {
      void reverseGeocode(centre.lat, centre.lon, { signal: ac.signal }).then((found) =>
        setPlace(found ?? undefined),
      );
    }, 600);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [centre.lat, centre.lon]);

  function save() {
    if (!canSave) return;
    const payload = { name, lat: centre.lat, lon: centre.lon, radiusKm, place };
    if (editing && existing) {
      update(existing.id, payload);
      // An edit lands on that place's VERDICT, not the list — an edit changes
      // the answer, and the answer is what was being adjusted. Widening 3 km to
      // 15 km can turn "Dry" into "Rain within 8 km", so the list would hide
      // the consequence of the edit.
      router.replace(`/location/${existing.id}`);
    } else {
      // A new place confirms on the LIST, where the new row is visible. On
      // two-pane it also becomes the detail pane: unlike a removal there is no
      // risk in showing it, because it is the place you just asked for.
      const created = add(payload);
      // The receipt goes to the toast store, NOT the URL — see lib/toast.ts.
      // `select` stays, because which place the detail pane shows is real state
      // rather than an expiring message.
      toast(t("toast.savedShowing", { name: created.name }));
      router.replace({ pathname: "/", params: { select: created.id } });
    }
  }

  function doRemove() {
    if (!existing) return;
    const next = neighbourOf(existing.id);
    remove(existing.id);
    setConfirming(false);
    // ALWAYS the list, never the neighbour's verdict.
    //
    // Following the neighbour is tempting — you were reading a verdict, so you
    // get a verdict — and it is what this did until Design ruled on it. It
    // loses on two counts. It shows an answer about a place you did not ask
    // about, which is the one thing byge must never do. And it hides the only
    // evidence the removal worked, because the list is where the change is
    // visible. It also silently turns a destructive action into navigation, so
    // a mis-tap leaves you reading Work while believing you are on Cabin.
    //
    // Two-pane names both facts because both changed — the row is gone AND the
    // detail pane is a different place. Phone names one, because one changed.
    toast(
      next
        ? t("toast.removedShowing", { name: existing.name, showing: next.name })
        : t("toast.removed", { name: existing.name }),
    );
    router.replace({ pathname: "/", params: next ? { select: next.id } : {} });
  }

  const copy = existing
    ? removeLocationCopy(
        existing.name,
        `${existing.lat}, ${existing.lon} · ${existing.radiusKm} km`,
      )
    : null;

  return (
    <Screen>
      {/*
        The title sits IN the bar beside the caret, set in the display face —
        the design puts it there, and it was a mono section label reading "ADD A
        PLACE", which is the register byge uses for instrumentation. A screen's
        own name is not instrumentation.
      */}
      <NavBar onBack={goBack} backLabel={t("nav.back")}>
        <Text
          accessibilityRole="header"
          className="text-ink font-display"
          style={{ fontSize: 24 }}
        >
          {editing ? t("add.titleEdit") : t("add.titleAdd")}
        </Text>
      </NavBar>

      {/*
        Search first, because it is how you get to a place you can NAME, and the
        map is how you get to a place you can only point at. Editing skips it:
        the pin is already where you put it, and a search box above it invites
        you to throw that away.
      */}
      {editing ? null : (
        <Section title={t("add.search")}>
          <PlaceSearch
            theme={theme}
            onPick={(p) => {
              setCentre({ lat: clampCoord(p.lat), lon: clampCoord(p.lon) });
              // Pre-fills the name, because the thing you searched for is
              // almost always what you would have typed. Still editable — it is
              // a suggestion, and "Grünerløkka" is not what everyone calls home.
              if (!name.trim()) setName(p.name);
            }}
          />
        </Section>
      )}

      <Section title={t("add.orCoordinates")}>
        <MapField
          value={centre}
          onChange={(v) => setCentre({ lat: clampCoord(v.lat), lon: clampCoord(v.lon) })}
          radiusKm={radiusKm}
          theme={theme}
        />

        {/*
          Typable coordinates, which the design draws and which `TextField`'s
          `coordinate` variant was built for — clamping, decimal keypad, the MET
          hint — and then used nowhere, so the numbers under the map were
          read-only text. Pasting a coordinate from somewhere else was
          impossible; the only way in was to pan until the digits matched.
        */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextField
              theme={theme}
              variant="coordinate"
              label={t("add.lat")}
              // Suppressed on the boxes so the note appears once beneath the
              // pair; it is one fact about both of them, not two facts.
              hint=""
              value={String(centre.lat)}
              onChangeText={(v) => setCentre((c) => ({ ...c, lat: Number(v) || c.lat }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              theme={theme}
              variant="coordinate"
              label={t("add.lon")}
              hint=""
              value={String(centre.lon)}
              onChangeText={(v) => setCentre((c) => ({ ...c, lon: Number(v) || c.lon }))}
            />
          </View>
        </View>

        <Text className="text-ink3" style={{ fontFamily: MONO, fontSize: 10, lineHeight: 16 }}>
          {t("add.coordHint")}
        </Text>
      </Section>

      <Section title={t("add.howFar")}>
        <RadiusField value={radiusKm} onChange={setRadiusKm} />
      </Section>

      <Section title={t("add.nameIt")}>
        <TextField
          theme={theme}
          label={t("add.nameLabel")}
          value={name}
          onChangeText={setName}
          placeholder={t("add.namePlaceholder")}
          hint={t("add.nameHint")}
        />
      </Section>

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", paddingTop: 8 }}>
        <Button
          label={editing ? t("add.saveChanges") : t("add.save")}
          onPress={save}
          disabled={!canSave}
        />
        {/*
          Cancel is not the back caret in the bar, and both belong here. The
          caret is navigation — it means "I am done looking". Cancel is an
          answer to the form — it means "discard what I typed". They happen to
          go to the same place today, but a person who has half-filled a form
          looks for the second one, next to Save, and the bar is nowhere near
          the decision.
        */}
        <Button label={t("add.cancel")} variant="ghost" onPress={goBack} />
        {editing ? (
          <Button
            label={t("add.remove")}
            variant="secondary"
            hint={t("add.removeHint")}
            onPress={() => setConfirming(true)}
          />
        ) : null}
      </View>

      {copy ? (
        <ConfirmSheet
          open={confirming}
          title={copy.title}
          body={copy.body}
          detail={copy.detail}
          confirmLabel={copy.confirmLabel}
          cancelLabel={copy.cancelLabel}
          onConfirm={doRemove}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </Screen>
  );
}
