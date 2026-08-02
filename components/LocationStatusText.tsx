import { Text, View } from "react-native";
import { durationMin, isBlindVerdict, isOpenEnded, type Verdict } from "../lib/forecast";
import type { Theme } from "../theme/useTheme";

/**
 * The headline. This is where byge's honesty lives.
 *
 * yr.no's map makes you guess; the whole point of this project is to answer
 * "will it rain on me" without over-claiming. Every state below exists because
 * collapsing it into a neighbouring one would state something we cannot see.
 *
 * The rule that governs the whole file: **an unknown end never becomes a
 * number.** A spell still raining at the last frame has `endMin === null`, and
 * `durationMin()` for it is a LOWER BOUND. So an open-ended spell gets a
 * different *grammar*, not a different adjective — "at least 75 min", never
 * "75 min"; "No end in sight", never "stops in 115 min".
 *
 * Open-endedness is carried by FOUR redundant signals, because no one of them
 * survives every reader:
 *
 *   1. the grammar swap    ("at least" / "no end in sight")
 *   2. a dotted underline on the bound
 *   3. a superscript arrow, decorative and aria-hidden
 *   4. a footnote saying why we cannot see the end
 *
 * A screen-reader user gets (1) and (4); a colour-blind user gets all four;
 * someone skimming gets (2) and (3). Deleting any one is a downgrade, not a
 * simplification.
 */

export type HeadlineState =
  /** observed === 0 — outside radar coverage. NOT dry. */
  | "blind"
  /** rain inside the radius but not on the coordinate */
  | "edge-only"
  /** raining, end visible */
  | "raining"
  /** raining, end unknown */
  | "raining-open"
  /** dry, rain arriving, end visible */
  | "incoming"
  /** dry, rain arriving, end unknown */
  | "incoming-open"
  /** dry, nothing approaching */
  | "clear";

export type Headline = {
  state: HeadlineState;
  /** The verdict itself. Always a complete sentence. */
  lead: string;
  /** Detail, up to the open-ended bound. May be "". */
  body: string;
  /**
   * The uncertain quantity, rendered with the dotted underline and the arrow.
   * Non-null IFF the spell is open-ended — this is the single switch the whole
   * open-ended treatment hangs off, so it can never drift out of sync with the
   * grammar sitting in `body`.
   */
  bound: string | null;
  /** Detail after the bound. */
  tail: string;
  /** A second spell, deliberately subordinate — never equal billing. */
  secondary: string | null;
  /** Why we cannot say more. */
  note: string | null;
};

/**
 * "2 hours" reads better than "115 min" in a headline, and the exact horizon is
 * always restated in the footnote — so the prose can round without the claim
 * getting looser than the data. Only rounds when it is within 10 min of a whole
 * hour; otherwise it stays in minutes rather than inventing a tidy number.
 */
function horizonPhrase(min: number): string {
  const h = Math.round(min / 60);
  if (h >= 1 && Math.abs(min - h * 60) <= 10) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${min} min`;
}

/**
 * Distance to the nearest rain.
 *
 * Falls back to the radius when `nearestKm` is missing, because that is the
 * furthest it could be and still count — erring in the direction of "further
 * away than you think", which is the safe direction for this sentence.
 */
function nearestKmOf(v: Verdict): number {
  return v.nearestKm === null ? v.radiusKm : Math.round(v.nearestKm);
}

/**
 * The second spell.
 *
 * Dropping it turns "clears at 6, more at 6:30" into "clears at 6" — true, and
 * the wrong thing to plan around. But it is not the thing being acted on
 * either, so it gets a subordinate line rather than a share of the headline.
 * The dry GAP is stated explicitly: that gap is the whole reason the second
 * spell matters.
 */
function secondaryOf(v: Verdict): string | null {
  const cur = v.current;
  const n = v.next;
  if (!v.rainingNow || !cur || !n) return null;

  const tail = isOpenEnded(n)
    ? // Still no number. The second spell can outlive the horizon too.
      "and no end in sight after that"
    : `lasting about ${durationMin(n, v.horizonMin)} min`;

  const gap = cur.endMin === null ? null : n.startMin - cur.endMin;
  const between = gap !== null && gap > 0 ? ` — about ${gap} min of dry in between` : "";
  return `Then more from about ${n.startMin} min${between}, ${tail}.`;
}

/** Every number below is derived from the Verdict. Nothing here is a constant. */
export function headlineOf(v: Verdict): Headline {
  if (isBlindVerdict(v)) {
    // Saying "dry" here would be the most confident wrong answer this program
    // is capable of producing, so the copy spends a whole sentence on the
    // difference rather than trusting the phrase "no radar" to carry it.
    return {
      state: "blind",
      lead: "No radar here.",
      body: "We cannot see this place.",
      bound: null,
      tail: "",
      secondary: null,
      note:
        'This is not "dry". We have no observation at all for this coordinate — so byge ' +
        "makes no claim. Dry means we looked and saw nothing falling.",
    };
  }

  const secondary = secondaryOf(v);

  if (v.rainingNow && v.current) {
    const s = v.current;

    // A bare "Raining." is true and misleading when the wet cell is inside the
    // circle but not overhead. Note we state the DISTANCE, not "the edge of
    // your circle" — the latter is only true when the rain is near the rim, and
    // is exactly the species of true-but-misleading sentence we exist to avoid
    // at 2 km inside a 20 km circle.
    const km = nearestKmOf(v);
    const edge = v.edgeOnly;
    const lead = edge ? `Rain within ${km} km — not on you yet.` : "Raining.";
    const edgeNote = edge
      ? `Nothing is falling at your coordinate; the nearest cell is ${km} km off. It counts ` +
        `because any rain touching the ${v.radiusKm} km circle you drew counts.`
      : null;

    if (isOpenEnded(s)) {
      const openNote =
        `Still raining at the last frame we have. The spell outlives our ${v.horizonMin}-minute ` +
        "horizon, so we cannot tell you when it stops — only that it has not by then.";
      return {
        state: edge ? "edge-only" : "raining-open",
        lead,
        // Deliberately empty: state 2 must not read as a variation on state 1's
        // sentence. The grammar changes, not just the value.
        body: "",
        bound: "No end in sight",
        tail: ` within the next ${horizonPhrase(v.horizonMin)}.`,
        secondary,
        note: edgeNote ? `${edgeNote} ${openNote}` : openNote,
      };
    }

    return {
      state: edge ? "edge-only" : "raining",
      lead,
      body: `Stops in about ${s.endMin} min.`,
      bound: null,
      tail: "",
      secondary,
      note: edgeNote,
    };
  }

  if (v.next) {
    const s = v.next;
    const dur = durationMin(s, v.horizonMin);

    if (isOpenEnded(s)) {
      return {
        state: "incoming-open",
        lead: "Dry.",
        body: `Rain in about ${s.startMin} min, lasting `,
        // "at least N min" — the ONLY form this may take. Rendering the same
        // number bare would turn a floor into a forecast.
        bound: `at least ${dur} min`,
        tail: ".",
        secondary: null,
        note:
          `${dur} min is a floor, not a forecast: the band is still overhead when our ` +
          `${horizonPhrase(v.horizonMin)} view ends. It could be twice that.`,
      };
    }

    return {
      state: "incoming",
      lead: "Dry.",
      body: `Rain in about ${s.startMin} min, lasting about ${dur} min.`,
      bound: null,
      tail: "",
      secondary: null,
      note: null,
    };
  }

  return {
    state: "clear",
    lead: "Dry.",
    body: "Nothing approaching.",
    bound: null,
    tail: "",
    secondary: null,
    // Two claims of very different strength, kept as two sentences on purpose.
    // "No rain for 115 min" collapses an observation and an extrapolation into
    // one flat assertion; the near term is solid, the tail is indicative. The
    // confidence badge stays high because the OBSERVATION is certain — so the
    // decay has to be carried here, in the prose, or it is carried nowhere.
    note:
      "The next ~30 min are a confident call. " +
      `Radar sees no rain through +${v.horizonMin} min, but that far out is indicative only.`,
  };
}

/**
 * One-line form, for list rows and the map popup.
 *
 * Derived from the same primitives as the headline so the two can never
 * disagree, and word-labelled throughout: a colour-blind reader gets the full
 * verdict from this string alone, with the swatch adding nothing they need.
 */
export function statusLine(v: Verdict): string {
  if (isBlindVerdict(v)) return "No radar coverage — we cannot see here";

  const parts: string[] = [];

  if (v.rainingNow && v.current) {
    const s = v.current;
    parts.push(v.edgeOnly ? `Rain within ${nearestKmOf(v)} km · not on you yet` : "Raining");
    // Still no number for an unknown end, even in the compact form.
    parts.push(isOpenEnded(s) ? "no end in sight →" : `stops in about ${s.endMin} min`);
    if (v.next) parts.push(`then more from about ${v.next.startMin} min`);
    return parts.join(" · ");
  }

  if (v.next) {
    const s = v.next;
    const dur = durationMin(s, v.horizonMin);
    parts.push("Dry");
    parts.push(
      isOpenEnded(s)
        ? `rain in about ${s.startMin} min, at least ${dur} min →`
        : `rain in about ${s.startMin} min, about ${dur} min`,
    );
    return parts.join(" · ");
  }

  return "Dry · nothing approaching";
}

export type LocationStatusTextProps = {
  verdict: Verdict;
  /**
   * Accepted for interface parity across components. Nothing here is a band
   * colour — every colour is a CSS var that already switches with the root
   * class — so this is not read. Keeping it in the signature means a caller
   * never has to remember which components need it.
   */
  theme: Theme;
  variant?: "headline" | "compact";
  /** Headline type size. Responsive sizing belongs to the screen, not here. */
  size?: number;
};

export function LocationStatusText({
  verdict,
  variant = "headline",
  size = 40,
}: LocationStatusTextProps) {
  const h = headlineOf(verdict);

  if (variant === "compact") {
    return (
      <Text
        testID="status-compact"
        style={{ fontSize: 13.5, lineHeight: 18, color: "var(--color-ink2)" }}
      >
        {statusLine(verdict)}
      </Text>
    );
  }

  const line = { fontSize: size, lineHeight: size * 1.04, letterSpacing: size * -0.015 };

  return (
    <View style={{ gap: 16 }}>
      <View testID="status-headline" accessibilityRole="header">
        <Text testID="status-lead" style={[line, { color: "var(--color-ink)" }]}>
          {h.lead}
        </Text>

        {h.body || h.bound ? (
          <Text testID="status-body" style={[line, { color: "var(--color-ink2)" }]}>
            {h.body}
            {h.bound ? (
              <Text
                testID="status-bound"
                style={{
                  color: "var(--color-ink)",
                  borderBottomWidth: 2,
                  borderStyle: "dotted",
                  borderColor: "var(--color-ink3)",
                }}
              >
                {h.bound}
              </Text>
            ) : null}
            {h.bound ? (
              // Decorative — the words already say it, and a screen reader
              // announcing "right arrow" mid-sentence is noise, not signal.
              <Text
                testID="status-bound-mark"
                aria-hidden
                style={[
                  { fontSize: Math.round(size * 0.3), color: "var(--color-ink3)" },
                  { verticalAlign: "super" } as object,
                ]}
              >
                {" →"}
              </Text>
            ) : null}
            {h.tail}
          </Text>
        ) : null}
      </View>

      {h.secondary ? (
        // Subordinate by size and colour, not hidden. See secondaryOf().
        <Text
          testID="status-secondary"
          style={{ fontSize: 15, lineHeight: 22, color: "var(--color-ink2)" }}
        >
          {h.secondary}
        </Text>
      ) : null}

      {h.note ? (
        <View testID="status-note" style={{ flexDirection: "row", gap: 10, maxWidth: 420 }}>
          <View
            style={{ width: 2, borderRadius: 1, backgroundColor: "var(--color-line2)" }}
            aria-hidden
          />
          <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 19, color: "var(--color-ink2)" }}>
            {h.note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
