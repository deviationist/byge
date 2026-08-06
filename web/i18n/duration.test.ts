import { describe, expect, it } from "vitest";
import { durationLong, durationShort } from "./duration";

/**
 * The bug this exists to prevent: "110 min". Every case below is a way of
 * silently regressing to arithmetic homework, or of producing a phrase that is
 * technically assembled correctly and reads like a machine wrote it.
 */

describe("durationLong", () => {
  it("says hours and minutes rather than a minute count", () => {
    // The reported defect, verbatim.
    expect(durationLong(110)).toBe("1 hour and 50 min");
  });

  it("stays in minutes below the hour, where minutes are how people think", () => {
    expect(durationLong(50)).toBe("50 min");
    expect(durationLong(5)).toBe("5 min");
  });

  it("does not say 'and 0 min' on the hour", () => {
    expect(durationLong(60)).toBe("1 hour");
    expect(durationLong(120)).toBe("2 hours");
  });

  it("pluralises the hour", () => {
    expect(durationLong(65)).toBe("1 hour and 5 min");
    expect(durationLong(125)).toBe("2 hours and 5 min");
  });

  it("never renders a negative or fractional duration", () => {
    // durationMin() clamps, but a lower bound arriving as -0.4 would otherwise
    // print "-0 min" — a plausible-looking value that is not a duration.
    expect(durationLong(-5)).toBe("0 min");
    expect(durationLong(89.6)).toBe("1 hour and 30 min");
  });
});

describe("durationShort", () => {
  it("fits a list row", () => {
    expect(durationShort(110)).toBe("1h50m");
    expect(durationShort(25)).toBe("25m");
    expect(durationShort(120)).toBe("2h");
  });

  it("omits the minutes rather than writing 1h0m", () => {
    expect(durationShort(60)).toBe("1h");
  });
});

describe("the two registers agree", () => {
  it("describes the same duration, only tighter", () => {
    // A drift between them would put two different answers on one screen: the
    // list row and the headline it opens are rendered from the same verdict.
    for (const min of [0, 1, 59, 60, 61, 110, 119, 120, 185]) {
      const hours = Math.floor(min / 60);
      const mins = min % 60;
      expect(durationShort(min)).toContain(String(hours || mins));
      expect(durationLong(min)).toContain(String(hours || mins));
    }
  });
});
