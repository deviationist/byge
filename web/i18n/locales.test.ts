import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import nb from "./locales/nb.json";

/**
 * A half-translated bundle falls back per key, which puts two languages on one
 * screen — worse to read than either alone, and invisible until someone with
 * that locale opens the app. These are the checks that catch it in CI instead.
 */

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = `${prefix}${k}`;
    if (typeof v === "string") out.set(key, v);
    else for (const [ck, cv] of flatten(v, `${key}.`)) out.set(ck, cv);
  }
  return out;
}

const E = flatten(en as Tree);
const N = flatten(nb as Tree);

/** `{{name}}`, `{{count}}` — the values the sentence is built around. */
const slotsOf = (s: string) =>
  new Set(s.match(/\{\{\s*[\w]+\s*\}\}/g)?.map((m) => m.replace(/\s/g, "")) ?? []);

describe("locale bundles", () => {
  it("translates every key", () => {
    expect([...E.keys()].filter((k) => !N.has(k))).toEqual([]);
  });

  it("has no key the source does not", () => {
    // An orphan is copy nobody sees — usually a rename that only landed on one
    // side, which means the English one silently went missing too.
    expect([...N.keys()].filter((k) => !E.has(k))).toEqual([]);
  });

  it("keeps the same interpolation slots in both languages", () => {
    // The failure this prevents is specific: a translated sentence that drops
    // `{{dur}}` renders as fluent, confident copy with the number missing.
    // Nothing throws, and it reads like a finished sentence.
    const drift = [...E].filter(([k, v]) => {
      const want = slotsOf(v);
      const got = slotsOf(N.get(k) ?? "");
      return want.size !== got.size || [...want].some((s) => !got.has(s));
    });
    expect(drift.map(([k]) => k)).toEqual([]);
  });

  it("translates every plural form, not just the singular", () => {
    // i18next resolves `_one` and `_other` separately, so a bundle with only
    // one of them falls back to English on exactly the counts it lacks.
    const plurals = [...E.keys()].filter((k) => k.endsWith("_one") || k.endsWith("_other"));
    expect(plurals.length).toBeGreaterThan(0);
    expect(plurals.filter((k) => !N.get(k))).toEqual([]);
  });

  it("leaves no Norwegian PROSE identical to its English source", () => {
    // The check is about sentences, not strings. Plenty of entries are
    // legitimately identical in both languages — "{{km}} km" and "." are pure
    // formatting, and "min" is the same unit in Norwegian — so the rule is:
    // strip the placeholders, and if what remains contains actual words, it is
    // prose and must have been translated. An untranslated sentence is a
    // copy-paste that was never finished, and it is invisible until a Norwegian
    // speaker opens that screen.
    const prose = (v: string) => {
      const bare = v.replace(/\{\{[^}]*\}\}/g, " ").trim();
      // Two letters or more in a row, ignoring shared units and symbols.
      const words = bare.match(/\p{L}{2,}/gu) ?? [];
      return words.filter((w) => !["min", "km", "mm"].includes(w.toLowerCase()));
    };

    const untranslated = [...E]
      .filter(([k, v]) => N.get(k) === v && prose(v).length > 0)
      .map(([k]) => k)
      // Proper nouns, licence names and the © line are the same in both.
      .filter((k) => !k.startsWith("attribution."))
      .filter(
        (k) =>
          !["appearance.system", "language.system", "about.data", "map.attribution"].includes(
            k,
          ),
      );

    expect(untranslated).toEqual([]);
  });
});
