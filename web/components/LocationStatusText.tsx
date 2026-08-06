import i18next from "i18next";
import { Text, type TextStyle, View } from "react-native";
import { durationLong, durationShort } from "../i18n/duration";
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
  /**
   * Clock time for the primary spell's boundary — "around 18:15", "17:55-18:20".
   *
   * NULL FOR AN OPEN-ENDED SPELL, and that absence is load-bearing: it is the
   * fifth redundant signal that we cannot name an end, alongside the grammar
   * swap, the dotted bound, the arrow and the footnote. Never synthesise one
   * from the horizon — that would put a time on the thing we are saying we
   * cannot time.
   */
  clock: string | null;
  /** A second spell, deliberately subordinate — never equal billing. */
  secondary: string | null;
  /** Clock time for the second spell. Same rule: null when it is open-ended. */
  secondClock: string | null;
  /** Why we cannot say more. */
  note: string | null;
};

/**
 * Where the data stops, said out loud.
 *
 * THE ONE THING BYGE CANNOT SEE. MET's nowcast runs 115 minutes and is
 * advection-only: the measured field slid along measured motion, with cells
 * that neither grow nor die. Extending it would not be a bigger computation, it
 * would be a different and worse product — inventing weather past the end of
 * somebody else's measurement, which is the move this app exists to refuse.
 *
 * So a band four hours out is not a "no" we got wrong. It is a question we were
 * never in a position to answer, and somebody who scrolls the radar map can see
 * that band with their own eyes. Every sentence whose plain reading extends past
 * the horizon now names the horizon.
 */
function windowNote(v: Verdict): string {
  return i18next.t("status.windowNote", { horizon: horizonPhrase(v.horizonMin) });
}

/** Two notes, or whichever exists. Both are sentences, so a space is enough. */
function joinNotes(a: string | null, b: string | null): string | null {
  if (a && b) return `${a} ${b}`;
  return a ?? b;
}

/**
 * "2 hours" reads better than "115 min" in a headline, and the exact horizon is
 * always restated in the footnote — so the prose can round without the claim
 * getting looser than the data. Only rounds when it is within 10 min of a whole
 * hour; otherwise it stays in minutes rather than inventing a tidy number.
 */
function horizonPhrase(min: number): string {
  const h = Math.round(min / 60);
  // i18next plural rules rather than an inline ternary: English needs two forms
  // here and other languages need more, which a `${n === 1 ? "" : "s"}` cannot
  // express at all.
  if (h >= 1 && Math.abs(min - h * 60) <= 10)
    return i18next.t("status.horizonHours", { count: h });
  // Not near a whole hour, so say it exactly — but still as hours and minutes
  // ("1 hour and 35 min"), not as a raw minute count.
  return durationLong(min);
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
 * Wall-clock time of a moment N minutes after the analysis.
 *
 * Derived from `frames[0].time` rather than `Date.now()`, so the clock agrees
 * with the data rather than with how long the page has been open. Formatted
 * through Intl in the active language and pinned to h23: "around 24:05" is not
 * a time anyone recognises, and a 12-hour clock would need am/pm to be
 * unambiguous, which is more words than the line can carry.
 */
function clockAt(v: Verdict, minutes: number): string | null {
  const base = v.frames[0]?.time;
  if (!base) return null;
  const at = new Date(base.getTime() + minutes * 60_000);
  return new Intl.DateTimeFormat(i18next.language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
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
function secondaryOf(v: Verdict): { text: string; clock: string | null } | null {
  const cur = v.current;
  const n = v.next;
  if (!v.rainingNow || !cur || !n) return null;

  const gap = cur.endMin === null ? null : n.startMin - cur.endMin;
  const hasGap = gap !== null && gap > 0;
  const open = isOpenEnded(n);
  // Four whole sentences rather than a stem glued to two tails and an optional
  // clause. Concatenating them would fix English word order into the table, and
  // Norwegian does not put the gap clause in the same place.
  const key = open
    ? hasGap
      ? "status.secondOpenGap"
      : "status.secondOpenNoGap"
    : hasGap
      ? "status.secondClosedGap"
      : "status.secondClosedNoGap";

  // Leads with the RELATIVE time, matching the primary spell. It used to lead
  // with the clock ("Then more from 19:15"), which made the second spell the
  // only place in the app where a time was absolute — the clock now sits
  // beneath, in the same treatment the primary uses.
  const text = i18next.t(key, {
    start: durationLong(n.startMin),
    gap: gap === null ? null : durationLong(gap),
    dur: durationLong(durationMin(n, v.horizonMin)),
  });
  const end = n.endMin;
  const clock =
    isOpenEnded(n) || end === null ? null : `${clockAt(v, n.startMin)}-${clockAt(v, end)}`;
  return { text, clock };
}

/** Every number below is derived from the Verdict. Nothing here is a constant. */
export function headlineOf(v: Verdict): Headline {
  if (isBlindVerdict(v)) {
    // Saying "dry" here would be the most confident wrong answer this program
    // is capable of producing, so the copy spends a whole sentence on the
    // difference rather than trusting the phrase "no radar" to carry it.
    return {
      state: "blind",
      lead: i18next.t("status.blindLead"),
      body: i18next.t("status.blindBody"),
      bound: null,
      tail: "",
      clock: null,
      secondary: null,
      secondClock: null,
      note: i18next.t("status.blindNote"),
    };
  }

  const second = secondaryOf(v);
  const secondary = second?.text ?? null;
  const secondClock = second?.clock ?? null;

  if (v.rainingNow && v.current) {
    const s = v.current;

    // A bare "Raining." is true and misleading when the wet cell is inside the
    // circle but not overhead. Note we state the DISTANCE, not "the edge of
    // your circle" — the latter is only true when the rain is near the rim, and
    // is exactly the species of true-but-misleading sentence we exist to avoid
    // at 2 km inside a 20 km circle.
    const km = nearestKmOf(v);
    const edge = v.edgeOnly;
    const lead = edge ? i18next.t("status.edgeLead", { km }) : i18next.t("status.rainingLead");
    const edgeNote = edge ? i18next.t("status.edgeNote", { km, radius: v.radiusKm }) : null;

    if (isOpenEnded(s)) {
      const openNote = i18next.t("status.rainingOpenNote", {
        horizon: durationLong(v.horizonMin),
      });
      return {
        state: edge ? "edge-only" : "raining-open",
        lead,
        // Deliberately empty: state 2 must not read as a variation on state 1's
        // sentence. The grammar changes, not just the value.
        body: "",
        bound: i18next.t("status.noEndBound"),
        tail: i18next.t("status.noEndTail", { horizon: horizonPhrase(v.horizonMin) }),
        // No clock. Naming a time here would contradict the sentence.
        clock: null,
        secondary,
        secondClock,
        note: edgeNote ? `${edgeNote} ${openNote}` : openNote,
      };
    }

    const end = s.endMin;
    return {
      state: edge ? "edge-only" : "raining",
      lead,
      body: end === null ? "" : i18next.t("status.stops", { duration: durationLong(end) }),
      bound: null,
      tail: "",
      clock: end === null ? null : i18next.t("status.clockAround", { time: clockAt(v, end) }),
      secondary,
      secondClock,
      // "Stops in about 25 min" is true, and on its own it reads as "and then
      // that is that". The claim is sound; the IMPLICATURE runs past the end of
      // the data. When nothing follows inside the window, say where the window
      // ends rather than letting silence stand in for "clear after".
      note: joinNotes(edgeNote, secondary ? null : windowNote(v)),
    };
  }

  if (v.next) {
    const s = v.next;
    const dur = durationMin(s, v.horizonMin);

    if (isOpenEnded(s)) {
      // A spell that STARTS in the last frame has a lower bound of zero, and
      // "lasting at least 0 min" is the worst sentence this file can produce:
      // it says nothing while wearing the costume of a measurement, and the
      // footnote then explains that 0 min is a floor rather than a forecast,
      // which is true and absurd. The rule the whole file turns on — an unknown
      // end never becomes a number — has to cover the case where the number is
      // zero, so the grammar changes again rather than the value going to print.
      if (dur <= 0) {
        return {
          state: "incoming-open",
          lead: i18next.t("status.dryLead"),
          body: i18next.t("status.incomingOpenBody", { start: durationLong(s.startMin) }),
          bound: i18next.t("status.incomingEdgeBound"),
          tail: i18next.t("status.incomingEdgeTail"),
          clock: null,
          secondary: null,
          secondClock: null,
          note: i18next.t("status.incomingEdgeNote"),
        };
      }

      return {
        state: "incoming-open",
        lead: i18next.t("status.dryLead"),
        body: i18next.t("status.incomingOpenBody", { start: durationLong(s.startMin) }),
        // "at least N min" — the ONLY form this may take. Rendering the same
        // number bare would turn a floor into a forecast.
        bound: i18next.t("status.incomingOpenBound", { dur: durationLong(dur) }),
        tail: i18next.t("status.incomingOpenTail"),
        clock: null,
        secondary: null,
        secondClock: null,
        note: i18next.t("status.incomingOpenNote", {
          dur: durationLong(dur),
          horizon: durationLong(v.horizonMin),
        }),
      };
    }

    return {
      state: "incoming",
      lead: i18next.t("status.dryLead"),
      body: i18next.t("status.incomingBody", {
        start: durationLong(s.startMin),
        dur: durationLong(dur),
      }),
      bound: null,
      tail: "",
      clock: s.endMin === null ? null : `${clockAt(v, s.startMin)}-${clockAt(v, s.endMin)}`,
      secondary: null,
      secondClock: null,
      // Same implicature as a closing spell above: "rain at 4, gone by 5" reads
      // as an account of the rest of the day. It is an account of 115 minutes.
      note: windowNote(v),
    };
  }

  return {
    state: "clear",
    lead: i18next.t("status.dryLead"),
    // NAMES THE WINDOW, because "Nothing approaching." was a claim about the
    // future and we only have 115 minutes of it. Someone looking at the map can
    // see a band that will plainly arrive in three hours; the sentence has to be
    // false for them, or bounded. Bounded is the only honest option, since
    // extending the forecast would mean inventing weather past the end of MET's
    // own product — see the note below on why that is not a compute problem.
    body: i18next.t("status.clearBody", { horizon: horizonPhrase(v.horizonMin) }),
    bound: null,
    tail: "",
    clock: null,
    secondary: null,
    secondClock: null,
    // Two claims of very different strength, kept as two sentences on purpose.
    // "No rain for 115 min" collapses an observation and an extrapolation into
    // one flat assertion; the near term is solid, the tail is indicative. The
    // confidence badge stays high because the OBSERVATION is certain — so the
    // decay has to be carried here, in the prose, or it is carried nowhere.
    note: i18next.t("status.clearNote", { horizon: durationLong(v.horizonMin) }),
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
  if (isBlindVerdict(v)) return i18next.t("compact.blind");
  const horizon = horizonPhrase(v.horizonMin);

  const parts: string[] = [];

  if (v.rainingNow && v.current) {
    const s = v.current;
    parts.push(
      v.edgeOnly
        ? i18next.t("compact.edge", { km: nearestKmOf(v) })
        : i18next.t("compact.raining"),
    );
    // Still no number for an unknown end, even in the compact form.
    parts.push(
      isOpenEnded(s)
        ? i18next.t("compact.noEnd")
        : i18next.t("compact.stops", { min: durationShort(s.endMin ?? 0) }),
    );
    if (v.next)
      parts.push(i18next.t("compact.thenMore", { start: durationShort(v.next.startMin) }));
    return parts.join(i18next.t("compact.separator"));
  }

  if (v.next) {
    const s = v.next;
    const dur = durationMin(s, v.horizonMin);
    parts.push(i18next.t("compact.dry"));
    parts.push(
      isOpenEnded(s)
        ? dur <= 0
          ? // Same rule in the compact register: no "at least 0m".
            i18next.t("compact.incomingEdge", { start: durationShort(s.startMin) })
          : i18next.t("compact.incomingOpen", {
              start: durationShort(s.startMin),
              dur: durationShort(dur),
            })
        : i18next.t("compact.incoming", {
            start: durationShort(s.startMin),
            dur: durationShort(dur),
          }),
    );
    return parts.join(i18next.t("compact.separator"));
  }

  // Bounded, in the compact register too. The list is where somebody decides
  // whether a place needs a look at all, so it is the last place a sentence
  // should quietly claim the rest of the day.
  return i18next.t("compact.clear", { horizon });
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
        className="text-ink2"
        style={{ fontSize: 13.5, lineHeight: 18 }}
      >
        {statusLine(verdict)}
      </Text>
    );
  }

  const line = {
    fontSize: size,
    lineHeight: size * 1.04,
    letterSpacing: size * -0.015,
    // Newsreader is loaded as a 200-400 variable face; without an explicit
    // weight it renders at 400 and the headline sits heavier than the design.
    fontWeight: "300" as const,
  };

  // Clock is 0.28x the headline, floored at 11 px. The floor matters: the old
  // 0.22x/9.5 px made it caption-sized, and this is something people plan
  // around. `tabular-nums` so a column of times does not jitter as digits
  // change width.
  const clockSize = Math.max(11, Math.round(size * 0.28));
  const clockStyle = {
    fontSize: clockSize,
    lineHeight: Math.round(clockSize * 1.35),
    marginTop: Math.round(size * 0.26),
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle;
  // Second spell is 0.46x, and its clock is the SAME size as the primary's:
  // it is the same class of information, so it does not shrink again.
  const secondSize = Math.max(13, Math.round(size * 0.46));

  return (
    <View style={{ gap: 16 }}>
      <View testID="status-headline" accessibilityRole="header">
        <Text testID="status-lead" className="text-ink font-display" style={line}>
          {h.lead}
        </Text>

        {h.body || h.bound ? (
          <Text testID="status-body" className="text-ink2 font-display" style={line}>
            {h.body}
            {h.bound ? (
              <Text
                testID="status-bound"
                className="text-ink border-ink3 font-display"
                style={{
                  borderBottomWidth: 2,
                  borderStyle: "dotted",
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
                className="text-ink3"
                style={[
                  { fontSize: Math.round(size * 0.3) },
                  { verticalAlign: "super" } as object,
                ]}
              >
                {" →"}
              </Text>
            ) : null}
            {h.tail}
          </Text>
        ) : null}

        {h.clock ? (
          // Own line at every breakpoint, never inline. Inline would put it in
          // the same line as the open-ended bound — two subordinate treatments
          // in one line is where the open-ended signal starts to blur — and it
          // would wrap first in Norwegian, whose relative phrases run longer.
          <Text testID="status-clock" className="text-ink2 font-mono" style={clockStyle}>
            {h.clock}
          </Text>
        ) : null}
      </View>

      {h.secondary ? (
        // Subordinate by size and colour, not hidden. See secondaryOf().
        <View>
          <Text
            testID="status-secondary"
            className="text-ink2 font-display"
            style={{ fontSize: secondSize, lineHeight: Math.round(secondSize * 1.45) }}
          >
            {h.secondary}
          </Text>
          {h.secondClock ? (
            <Text
              testID="status-second-clock"
              className="text-ink2 font-mono"
              style={{ ...clockStyle, marginTop: Math.round(clockSize * 0.5) }}
            >
              {h.secondClock}
            </Text>
          ) : null}
        </View>
      ) : null}

      {h.note ? (
        <View testID="status-note" style={{ flexDirection: "row", gap: 10, maxWidth: 420 }}>
          <View className="bg-line2" style={{ width: 2, borderRadius: 1 }} aria-hidden />
          <Text
            className="text-ink2 font-mono"
            style={{ flex: 1, fontSize: 11, lineHeight: 18 }}
          >
            {h.note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
