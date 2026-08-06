import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
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
      router.replace(`/location/${existing.id}`);
    } else {
      const created = add(payload);
      router.replace(`/location/${created.id}`);
    }
  }

  function doRemove() {
    if (!existing) return;
    const next = neighbourOf(existing.id);
    remove(existing.id);
    setConfirming(false);
    // Same as the verdict screen: the last removal lands on the list, and the
    // name has to travel with it so the list confirms rather than welcomes.
    if (next) router.replace(`/location/${next.id}`);
    else router.replace({ pathname: "/", params: { removed: existing.name } });
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

      <Section title={editing ? "Edit place" : "Add a place"}>
        <MapField
          value={centre}
          onChange={(v) => setCentre({ lat: clampCoord(v.lat), lon: clampCoord(v.lon) })}
          radiusKm={radiusKm}
          theme={theme}
        />
      </Section>

      <Section title="How far to watch">
        <RadiusField value={radiusKm} onChange={setRadiusKm} />
      </Section>

      <Section title="Name it">
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Home"
          hint="Shown in your list of places."
        />
      </Section>

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", paddingTop: 8 }}>
        <Button
          label={editing ? "Save changes" : "Save place"}
          onPress={save}
          disabled={!canSave}
        />
        {editing ? (
          <Button
            label="Remove place"
            variant="secondary"
            hint="Cannot be undone"
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
