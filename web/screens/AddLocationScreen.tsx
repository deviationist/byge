import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "../components/Button";
import { ConfirmSheet, removeLocationCopy } from "../components/ConfirmSheet";
import { MapField } from "../components/MapField";
import { NavBar } from "../components/NavBar";
import { RadiusField } from "../components/RadiusField";
import { TextField } from "../components/TextField";
import { useLocations } from "../hooks/useLocations";
import { Screen } from "../layouts/Screen";
import { Section } from "../layouts/Section";
import { clampCoord } from "../lib/grid";
import { DEFAULT_RADIUS_KM } from "../lib/storage";
import { toast } from "../lib/toast";
import { useResolvedTheme } from "../theme/ThemeProvider";

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
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { byId, add, update, remove, neighbourOf } = useLocations();

  const existing = id ? byId(id) : undefined;
  const editing = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [centre, setCentre] = useState({
    lat: existing?.lat ?? DEFAULT_CENTRE.lat,
    lon: existing?.lon ?? DEFAULT_CENTRE.lon,
  });
  const [radiusKm, setRadiusKm] = useState(existing?.radiusKm ?? DEFAULT_RADIUS_KM);
  const [confirming, setConfirming] = useState(false);

  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    const payload = { name, lat: centre.lat, lon: centre.lon, radiusKm };
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
      <NavBar onBack={() => router.back()} backLabel="Back">
        <View />
      </NavBar>

      <Section title={editing ? t("add.titleEdit") : t("add.titleAdd")}>
        <MapField
          value={centre}
          onChange={(v) => setCentre({ lat: clampCoord(v.lat), lon: clampCoord(v.lon) })}
          radiusKm={radiusKm}
          theme={theme}
        />
      </Section>

      <Section title={t("add.howFar")}>
        <RadiusField value={radiusKm} onChange={setRadiusKm} />
      </Section>

      <Section title={t("add.nameIt")}>
        <TextField
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
