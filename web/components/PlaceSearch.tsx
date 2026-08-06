import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import { type Place, searchPlaces } from "../lib/search";
import { MONO, PLACEHOLDER } from "../theme/tokens";
import type { Theme } from "../theme/useTheme";

/**
 * Search a place by name, and centre the map on it.
 *
 * ONE OF THREE WAYS IN, never the only one. The map beneath it and the
 * coordinate boxes below both still work, which is why every failure here —
 * offline, no hits, a name Kartverket does not carry — degrades to an empty
 * list and nothing else. It never blocks, never disables Save, and never grows
 * an error state of its own.
 *
 * IT SETS THE MAP, IT DOES NOT SAVE. Choosing a hit pans the map to it; the
 * pin, the radius and the name are all still yours to adjust, and Save is still
 * a separate act. A search result is a good guess at where you meant, not a
 * decision — Kartverket's representasjonspunkt for a bydel is a point somewhere
 * inside it, not your street.
 */
export type PlaceSearchProps = {
  onPick: (place: Place) => void;
  theme: Theme;
};

/** Long enough that typing a word does not fire four queries. */
const DEBOUNCE_MS = 350;

export function PlaceSearch({ onPick, theme }: PlaceSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const listId = useId();

  // Guards against an old response landing after a newer one. Without it,
  // typing "Ber" then "Bergen" can end with the results for "Ber" on screen —
  // a list that looks authoritative and answers a question nobody asked.
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    const seq = ++latest.current;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void searchPlaces(q, { signal: ac.signal }).then((found) => {
        if (seq !== latest.current) return;
        setHits(found);
        setSearched(true);
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query]);

  function pick(place: Place) {
    onPick(place);
    // Cleared, because the field has done its job. Leaving the query in place
    // would leave a list of alternatives open beneath a map that has already
    // moved, which reads as "not applied yet".
    setQuery("");
    setHits([]);
    setSearched(false);
  }

  return (
    <View style={{ gap: 9 }}>
      <TextInput
        testID="place-search"
        accessibilityLabel={t("search.label")}
        // A combobox owns a list; announcing that is what tells a screen-reader
        // user results may appear below rather than leaving them to discover it.
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={hits.length > 0 ? listId : undefined}
        value={query}
        onChangeText={setQuery}
        placeholder={t("search.placeholder")}
        placeholderTextColor={PLACEHOLDER[theme]}
        autoCapitalize="words"
        autoCorrect={false}
        className="bg-surface text-ink border-line2"
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 15,
          paddingVertical: 12,
          fontSize: 15,
        }}
      />

      {hits.length > 0 ? (
        <View
          nativeID={listId}
          testID="search-hits"
          accessibilityRole="list"
          className="bg-surface border-line"
          // Clipped, so the first and last rows highlight corner to corner.
          style={{ borderWidth: 1, borderRadius: 10, overflow: "hidden" }}
        >
          {hits.map((h, i) => (
            <Pressable
              key={`${h.name}-${h.lat}-${h.lon}`}
              accessibilityRole="button"
              // The whole row, because "Sandnes" alone does not distinguish the
              // two of them and a screen reader user gets no column layout.
              accessibilityLabel={`${h.name}. ${h.detail}`}
              onPress={() => pick(h)}
              className={i > 0 ? "border-t-line" : undefined}
              style={({ pressed }) => ({
                borderTopWidth: i > 0 ? 1 : 0,
                minHeight: 44,
                paddingHorizontal: 15,
                paddingVertical: 11,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text className="text-ink" style={{ fontSize: 14, flexShrink: 1 }}>
                {h.name}
              </Text>
              <Text
                className="text-ink3"
                style={{ fontFamily: MONO, fontSize: 10, flexShrink: 0 }}
              >
                {h.detail}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {searched && hits.length === 0 ? (
        // Says what to do instead, because the other two ways in are right
        // there and a bare "no results" would read as a dead end.
        <Text testID="search-empty" className="text-ink3" style={{ fontSize: 11.5 }}>
          {t("search.none")}
        </Text>
      ) : null}
    </View>
  );
}
