import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type Verdict, verdictFrom } from "../lib/forecast";
import type { Frame } from "../lib/radar";
import { NOTICEABLE } from "../lib/scale";
import {
  headlineOf,
  LocationStatusText,
  type LocationStatusTextProps,
  statusLine,
} from "./LocationStatusText";

/**
 * Verdicts are built by running rate arrays through the SHIPPED model rather
 * than by hand-writing Spell objects. That is the point of the fixtures: if the
 * copy says "25 min" it is because `verdictFrom` derived 25 from the frames, so
 * a change to spell detection breaks these tests instead of silently making the
 * headline lie. It is also the exact trap FEEDBACK-01 §2 caught in the comps —
 * a duration that sat beside its data instead of coming from it.
 */
function framesOf(rates: number[], over: Partial<Frame> = {}): Frame[] {
  return rates.map((r, i) => ({
    time: new Date(0),
    minutes: i * 5,
    maxRate: r,
    meanRate: r,
    coverage: r >= NOTICEABLE ? 1 : 0,
    observed: 1,
    centreRate: r,
    nearestKm: r >= NOTICEABLE ? 0 : null,
    ...over,
  }));
}

const Z = (n: number) => new Array(n).fill(0);
const V = (rates: number[], over: Partial<Frame> = {}) => verdictFrom(framesOf(rates, over), 4);

// state 1 — wet through index 4, dry at index 5 => ends at T+25.
const raining = V([6.0, 5.6, 5.0, 4.1, 2.7, 0.12].concat(Z(18)));
// state 2 — never stops inside the horizon.
const rainingOpen = V(new Array(24).fill(2.4));
// state 3 — wet 8..12, first dry frame is 13 => 40..65, duration 25.
const incoming = V(Z(8).concat([0.8, 2.4, 3.1, 1.6, 0.9], Z(11)));
// state 4 — starts at 40 and outlives the horizon => at least 115-40 = 75.
const incomingOpen = V(Z(8).concat(new Array(16).fill(2.8)));
// state 5 — a trace of moisture, all below NOTICEABLE.
const clear = V(Z(15).concat([0.04, 0.045, 0.038], Z(6)));
// state 6 — the radar cannot see here at all.
const blind = V(Z(24), { observed: 0 });
// state 7 — wet cells in the disc, nothing on the coordinate.
const edgeOnly = V(new Array(24).fill(3.0), { centreRate: 0, nearestKm: 8.2 });
// state 8 — a real dry gap: 3 frames, one more than BRIDGE_MIN can bridge.
const twoSpells = V([3, 3, 3, 3, 3, 0, 0, 0, 3, 3, 3].concat(Z(13)));

const text = (el: Element | null) => el?.textContent ?? "";

/**
 * Queries scoped to this render's own container.
 *
 * testing-library binds its default queries to `document.body`, so two renders
 * inside one test make every `getByTestId` ambiguous — and several tests here
 * exist precisely to compare two states side by side.
 */
function view(v: Verdict, props: Partial<LocationStatusTextProps> = {}) {
  const { container } = render(<LocationStatusText verdict={v} theme="light" {...props} />);
  return { container, ...within(container) };
}

const headline = (v: Verdict) => text(view(v).getByTestId("status-headline"));

describe("fixtures really do derive from the model", () => {
  it("produces the spells the copy is about", () => {
    expect(raining.current).toMatchObject({ startMin: 0, endMin: 25 });
    expect(rainingOpen.current?.endMin).toBeNull();
    expect(incoming.next).toMatchObject({ startMin: 40, endMin: 65 });
    expect(incomingOpen.next).toMatchObject({ startMin: 40, endMin: null });
    expect(clear.next).toBeNull();
    expect(blind.observed).toBe(0);
    expect(edgeOnly.edgeOnly).toBe(true);
    expect(twoSpells.current?.endMin).toBe(25);
    expect(twoSpells.next).toMatchObject({ startMin: 40, endMin: 55 });
  });
});

describe("state 1 — raining, end visible", () => {
  it("gives a number and a full stop", () => {
    expect(headlineOf(raining).state).toBe("raining");
    const h = headline(raining);
    expect(h).toContain("Raining.");
    expect(h).toContain("Stops in about 25 min.");
  });

  it("derives the number from the frames, not a constant", () => {
    // Same shape, rain lasting one frame longer.
    const later = V([6.0, 5.6, 5.0, 4.1, 2.7, 2.0, 0.1].concat(Z(17)));
    expect(headline(later)).toContain("Stops in about 30 min.");
  });

  it("renders no open-ended treatment", () => {
    const v = view(raining);
    expect(v.queryByTestId("status-bound")).toBeNull();
    expect(v.queryByTestId("status-bound-mark")).toBeNull();
    expect(v.queryByTestId("status-note")).toBeNull();
  });
});

describe("state 2 — raining, end unknown", () => {
  it("swaps the grammar instead of reusing state 1's sentence", () => {
    expect(headlineOf(rainingOpen).state).toBe("raining-open");
    const h = headline(rainingOpen);
    expect(h).toContain("No end in sight");
    expect(h).toContain("within the next 2 hours");
    expect(h).not.toContain("Stops in");
  });

  it("NEVER states an end or a duration", () => {
    // The horizon is not a duration. Substituting it — "stops in 115 min" — is
    // the single most tempting wrong answer this component can give. The only
    // number allowed in this headline is the window we could NOT see the end
    // within ("2 hours"), which is a bound on our sight, not on the rain.
    const h = headline(rainingOpen);
    expect(h).not.toMatch(/\d+\s*min/);
    expect(h).not.toMatch(/stops|ends|clears|lasting/i);
    // The bound itself is pure grammar — no quantity at all.
    expect(text(view(rainingOpen).getByTestId("status-bound"))).not.toMatch(/\d/);
  });

  it("underlines the bound with dots and marks it with a superscript arrow", () => {
    const v = view(rainingOpen);
    const bound = v.getByTestId("status-bound");
    expect(text(bound)).toBe("No end in sight");
    // react-native-web expands the border shorthand to longhands.
    expect(bound.style.borderBottomWidth).toBe("2px");
    expect(bound.style.borderBottomStyle).toBe("dotted");

    const mark = v.getByTestId("status-bound-mark");
    expect(text(mark)).toContain("→");
    // The words carry it for a screen reader; the glyph is redundancy for eyes.
    expect(mark.getAttribute("aria-hidden")).toBe("true");
  });

  it("footnotes why the end is invisible, with the real horizon", () => {
    const note = text(view(rainingOpen).getByTestId("status-note"));
    expect(note).toContain("115-minute horizon");
    expect(note).toMatch(/cannot tell you when it stops/i);
  });
});

describe("states 1 and 2 are unmistakably different", () => {
  it("differ in grammar, in numbers, and in what is rendered at all", () => {
    const closed = view(raining);
    const open = view(rainingOpen);

    const a = text(closed.getByTestId("status-headline"));
    const b = text(open.getByTestId("status-headline"));

    expect(a).not.toBe(b);
    // Not merely a different value in the same sentence.
    expect(a).toMatch(/Stops in about \d+ min/);
    expect(b).not.toMatch(/Stops in/);
    expect(b).toMatch(/No end in sight/);

    // Three structural signals present in one and absent in the other.
    expect(closed.queryByTestId("status-bound")).toBeNull();
    expect(closed.queryByTestId("status-bound-mark")).toBeNull();
    expect(closed.queryByTestId("status-note")).toBeNull();
    expect(open.queryByTestId("status-bound")).not.toBeNull();
    expect(open.queryByTestId("status-bound-mark")).not.toBeNull();
    expect(open.queryByTestId("status-note")).not.toBeNull();
  });
});

describe("state 3 — dry, rain arriving, end visible", () => {
  it("states the lead and the duration, both derived", () => {
    expect(headlineOf(incoming).state).toBe("incoming");
    const h = headline(incoming);
    expect(h).toContain("Dry.");
    expect(h).toContain("Rain in about 40 min, lasting about 25 min.");
  });

  it("has no bound and no arrow — the end is known", () => {
    const v = view(incoming);
    expect(v.queryByTestId("status-bound")).toBeNull();
    expect(v.queryByTestId("status-bound-mark")).toBeNull();
  });
});

describe("state 4 — dry, rain arriving, end unknown", () => {
  it('renders "at least 75 min" and never a bare "75 min"', () => {
    expect(headlineOf(incomingOpen).state).toBe("incoming-open");
    const h = headline(incomingOpen);
    expect(h).toContain("at least 75 min");
    // The floor must never be readable as a forecast. Anything matching
    // "lasting 75 min" or "about 75 min" would do exactly that.
    expect(h).not.toMatch(/(?:lasting|about|for)\s+75 min/);
  });

  it("puts the floor inside the underlined bound, not loose in the sentence", () => {
    const v = view(incomingOpen);
    expect(text(v.getByTestId("status-bound"))).toBe("at least 75 min");
    expect(v.getByTestId("status-bound").style.borderBottomStyle).toBe("dotted");
  });

  it("derives the floor from horizon minus start", () => {
    // Same shape, arriving 20 min later => a 55 min floor.
    const later = V(Z(12).concat(new Array(12).fill(2.8)));
    expect(headline(later)).toContain("at least 55 min");
  });

  it("footnotes that the floor is a floor", () => {
    const note = text(view(incomingOpen).getByTestId("status-note"));
    expect(note).toContain("75 min is a floor, not a forecast");
    expect(note).toContain("It could be twice that.");
  });
});

describe("state 5 — dry, nothing approaching", () => {
  it("says so plainly", () => {
    expect(headlineOf(clear).state).toBe("clear");
    const h = headline(clear);
    expect(h).toContain("Dry.");
    expect(h).toContain("Nothing approaching.");
  });

  it("splits the claim in two: the near term is confident, the tail is not", () => {
    // "No rain for 115 min" is two claims of very different strength. The badge
    // stays high because the OBSERVATION is certain, so the decay has to live
    // in the prose or it lives nowhere.
    const note = text(view(clear).getByTestId("status-note"));
    expect(note).toMatch(/next ~30 min are a confident call/i);
    expect(note).toMatch(/indicative only/i);
    expect(note).toContain("+115 min");
    // Two sentences, not one collapsed assertion.
    expect(note.split(". ").length).toBeGreaterThanOrEqual(2);
  });
});

describe("state 6 — no radar coverage", () => {
  it("reports absence of observation, not dryness", () => {
    expect(headlineOf(blind).state).toBe("blind");
    const h = headline(blind);
    expect(h).toContain("No radar here.");
    expect(h).not.toMatch(/\bDry\b/);
  });

  it("spends a whole sentence insisting this is not dry", () => {
    const note = text(view(blind).getByTestId("status-note"));
    expect(note).toContain('This is not "dry"');
    expect(note).toMatch(/no observation at all/i);
    expect(note).toMatch(/Dry means we looked and saw nothing falling/i);
  });

  it("beats every other state — blind is checked first", () => {
    // A blind verdict with rain-shaped frames must still read as blind; falling
    // through would state the one thing we most need not to state.
    const v = verdictFrom(framesOf(new Array(24).fill(4), { observed: 0 }), 4);
    expect(headlineOf(v).state).toBe("blind");
  });
});

describe("state 7 — rain inside the radius but not on you", () => {
  it("states the distance", () => {
    expect(headlineOf(edgeOnly).state).toBe("edge-only");
    expect(headline(edgeOnly)).toContain("Rain within 8 km — not on you yet.");
  });

  it('never says "the edge of your circle"', () => {
    // Only true when the rain is near the rim. At 2 km inside a 20 km circle it
    // is the same true-but-misleading sentence we exist to avoid, so the
    // phrasing is banned outright rather than used conditionally.
    const near = verdictFrom(
      framesOf(new Array(24).fill(3), { centreRate: 0, nearestKm: 2 }),
      4,
      20,
    );
    const v = view(near);
    expect(text(v.container)).not.toMatch(/edge of your circle/i);
    expect(text(v.container)).toContain("Rain within 2 km");
  });

  it("does not claim a bare 'Raining.'", () => {
    expect(headline(edgeOnly)).not.toMatch(/^Raining\./);
  });

  it("explains that the coordinate itself is dry, and why it still counts", () => {
    const note = text(view(edgeOnly).getByTestId("status-note"));
    expect(note).toContain("Nothing is falling at your coordinate");
    expect(note).toContain("8 km off");
    expect(note).toContain("3 km circle");
  });

  it("keeps the open-ended treatment when the edge spell has no end", () => {
    // edge-only and open-ended are orthogonal; one must not swallow the other.
    expect(text(view(edgeOnly).getByTestId("status-bound"))).toBe("No end in sight");
  });
});

describe("state 8 — a second spell", () => {
  it("gets a secondary line, not a share of the headline", () => {
    const v = view(twoSpells);
    const head = text(v.getByTestId("status-headline"));
    const second = text(v.getByTestId("status-secondary"));

    // The headline is still about the spell you are standing in.
    expect(head).toContain("Raining.");
    expect(head).toContain("Stops in about 25 min.");
    expect(head).not.toContain("Then more");
    expect(second).toContain("Then more from about 40 min");
  });

  it("makes the gap visible — that is what people plan around", () => {
    // "It'll clear at six" is the sentence someone acts on, so the dry window
    // between the spells has to be a number on the screen.
    expect(text(view(twoSpells).container)).toContain("about 15 min of dry in between");
  });

  it("is subordinate in size to the headline", () => {
    const v = view(twoSpells, { size: 40 });
    const lead = Number.parseFloat(v.getByTestId("status-lead").style.fontSize);
    const second = Number.parseFloat(v.getByTestId("status-secondary").style.fontSize);
    expect(second).toBeLessThan(lead);
  });

  it("keeps the second spell open-ended when it is", () => {
    const second = text(
      view(V([3, 3, 3, 3, 3, 0, 0, 0].concat(new Array(16).fill(3)))).getByTestId(
        "status-secondary",
      ),
    );
    expect(second).toContain("no end in sight after that");
    expect(second).not.toMatch(/lasting about \d+ min/);
  });

  it("is absent when there is only one spell", () => {
    expect(view(raining).queryByTestId("status-secondary")).toBeNull();
  });
});

describe("compact variant", () => {
  it("is word-labelled for every state", () => {
    const cases: [Verdict, RegExp][] = [
      [raining, /Raining · stops in about 25 min/],
      [rainingOpen, /Raining · no end in sight/],
      [incoming, /Dry · rain in about 40 min, about 25 min/],
      [incomingOpen, /Dry · rain in about 40 min, at least 75 min/],
      [clear, /Dry · nothing approaching/],
      [blind, /No radar coverage — we cannot see here/],
      [edgeOnly, /Rain within 8 km · not on you yet/],
      [twoSpells, /then more from about 40 min/],
    ];
    for (const [v, re] of cases) {
      expect(statusLine(v)).toMatch(re);
    }
  });

  it("does not collapse an unknown end into a number, even when short", () => {
    expect(statusLine(rainingOpen)).not.toMatch(/\d+ min/);
    expect(statusLine(incomingOpen)).toContain("at least 75 min");
    expect(statusLine(incomingOpen)).not.toMatch(/about 75 min/);
  });

  it("renders as a single line of text", () => {
    const v = view(raining, { variant: "compact" });
    expect(text(v.getByTestId("status-compact"))).toBe(statusLine(raining));
  });
});

describe("presentation", () => {
  it("uses only theme tokens, never a literal colour", () => {
    const { container } = render(<LocationStatusText verdict={rainingOpen} theme="dark" />);
    const scoped = within(container);
    for (const id of ["status-lead", "status-body", "status-bound"]) {
      expect(scoped.getByTestId(id).style.color).toContain("var(--color-");
    }
  });

  it("scales the arrow with the headline so it stays a superscript", () => {
    const px = (size: number) =>
      Number.parseFloat(
        view(rainingOpen, { size }).getByTestId("status-bound-mark").style.fontSize,
      );
    expect(px(60)).toBeGreaterThan(px(24));
  });

  it("announces the headline as a heading", () => {
    const el = view(raining).getByTestId("status-headline");
    const heading = /^h[1-6]$/i.test(el.tagName) || el.getAttribute("role") === "heading";
    expect(heading).toBe(true);
  });

  it("renders every state in both themes without throwing", () => {
    const all = [
      raining,
      rainingOpen,
      incoming,
      incomingOpen,
      clear,
      blind,
      edgeOnly,
      twoSpells,
    ];
    for (const v of all) {
      for (const theme of ["light", "dark"] as const) {
        expect(() => render(<LocationStatusText verdict={v} theme={theme} />)).not.toThrow();
      }
    }
  });
});
