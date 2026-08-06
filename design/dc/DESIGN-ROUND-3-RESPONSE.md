# Round 3 — decisions, drawn

Reply to `DESIGN-ROUND-3.md`. Everything below is in the design files beside
this one; this is the summary, not the source.

---

## 1 · Clock times — treatment

Agreed: relative primary, clock secondary. The treatment:

**Own line, at every breakpoint. Never inline.** Three reasons, in weight order:

1. Inline would put the clock in the same line as the open-ended bound — two
   subordinate treatments in one line, which is exactly where the open-ended
   signal starts to blur. That line belongs to the bound.
2. Inline needs a third ink level to stay subordinate inside the `ink2` body
   span. On its own line, `ink2` is already subordinate to the `ink` lead.
3. It is one rule that survives all eleven states and translation. Norwegian
   relative phrases run longer and an inline clock would wrap first.

**Sizes** — extend the `SCREEN-NOTES.md` table with:

| | phone | tablet | desktop |
|---|---|---|---|
| headline | 38 | 46 | 54 |
| clock line | **11** | **13** | **15** |
| second spell | 17 | 21 | 25 |
| second spell clock | **11** | **13** | **15** |
| mono footnote | 10 | 11 | 13 |

Clock is `0.28 × headline`, floored at 11 px, `ink2`, mono, `tabular-nums`,
`margin-top: 0.26 × headline`. The old value was `0.22×` floored at 9.5 px —
caption-sized for something people plan around.

**One clock size per breakpoint.** The second spell's clock is the same size as
the primary's, because it is the same class of information.

**Two consequences worth noting:**

- **An open-ended spell renders no clock line at all**, and that absence is now
  load-bearing — a fifth redundant signal that we cannot name an end. Do not
  synthesise a clock for `end_min === null`.
- **The second spell's wording changed** to match the convention. It used to
  lead with the clock (`"Then more from 19:15 (+100)"`); it now reads
  `"Then more in about 100 min"` with `"19:15–19:40"` beneath. `describe()`
  returns a new `secondClock` field. This is a string-table change.

## 2 · Bar height as coverage — **closed, it stays**

Confirmed. Delete the question from the reconciliation; `PrecipitationGraph` is
no longer provisional. Height is coverage, colour is intensity band, and the
caption under the strip states both. It is the only arrangement where the two
channels carry two different quantities, and coverage is bounded at 1.0 by
definition, which is what removed the saturation problem above 6 mm/h.

## 3 · Two-pane — **in the MVP. Wire it.**

Reasoning, since it is a scope call: the original brief makes tablet and desktop
real targets rather than afterthoughts, and two-pane is the only part of the
design that delivers something phone cannot — comparing two places with no
navigation at all. It is also built and tested. Shipping it later means shipping
a second navigation model later, which is the exact coupling this whole
design-ahead exercise exists to avoid.

`Specimen-Mutations.dc.html` is now the design file for it — the pane contract
is spelled out there (selection invariant, re-point rule, 620 px measure cap, no
back button in the detail pane).

## 4 · The divergence — **phone returns to the list**

Not the neighbour's verdict. The build's argument is real, but it loses on two
counts:

- It shows an answer about a place the person did not ask about. That is the one
  thing byge must never do.
- It hides the only evidence the removal worked, because the list is where the
  change is visible.

It also silently turns a destructive action into navigation: a mis-tap leaves
someone reading Work while believing they are on Cabin.

**The notice stays**, and is drawn at both breakpoints:

- phone — `"Removed Cabin."`
- two-pane — `"Removed Cabin. Showing Work."`

Two-pane names both facts because both changed. Phone names one because one
changed. The notice sits above the list, in the same slot for every mutation
(`"Saved Cabin."`, `"Cabin now covers 15 km."`), and **never offers undo** —
there is none, the confirmation happened before the deletion, and a dead
"Undo" is worse than no undo.

`LocationsScreen` already takes the `notice` prop.

**One case that was not in round 2:** after an **edit**, phone lands on that
place's **verdict**, not the list — an edit changes the answer, and widening a
radius from 3 km to 15 km can turn "Dry" into "Rain within 8 km". Landing on
the list would hide the consequence of the edit.

## 5 · Native constraints

Thank you for the hatch and the licence links — both were real defects, not
ports.

**The scrubber's focus ring was load-bearing, and is now redrawn.** Without it
the scrubber has no visible position, so "no focus indicator on native" was not
acceptable. It no longer uses CSS `outline`: the selected frame gets a 2 px ink
cap above the bar plus a `--sunk` column tint, both of which port directly.

**`box-shadow`, two verdicts, not one:**

- `DropdownMenu` — **decorative, drop it.** The boundary is the 1 px `--line2`
  border; the shadow only adds lift, and it opens over app chrome. Do not
  substitute an elevation that changes the surface colour.
- `LocationCard placement="popup"` — **load-bearing, needs an equivalent.** It
  sits over live radar colour rather than a flat surface, so a pale border
  against a pale band leaves it looking like part of the map. Draw a 1 px
  `--line2` border plus a 2 px `--bg` outer ring. The halo is what separates it
  from the imagery, not the shadow.

**Convention adopted:** any file depending on a CSS-only capability now carries
a `CSS DEPENDENCY —` comment naming the property, whether it is decorative or
load-bearing, and the native equivalent if it is. Present in `DropdownMenu`,
`LocationCard`, `PrecipitationGraph` and `foundation.js`.

`foundation.js` now exports `HATCH_GEOMETRY` (angle 45°, 1.5 px stroke, 5 px
period, grey `.42`) and builds the gradient string from it, so the web and
native renderings derive from one set of numbers rather than agreeing by hand.

## 6 · Things we never drew

- **`Location.tsx` splitting identity out of `LocationCard` is right** — keep
  it. One place named one way on every screen is worth a file, and it is what
  makes the row/header/popup variants provably consistent rather than
  coincidentally so.
- **`LocationsList.tsx` as its own component** — also right, and it is what let
  the cleared empty state be a slot rather than a branch inside the screen.
- **`layouts/*`** — now specified, see item 3.

No objection to any of the three. They are the kind of split that only becomes
visible once something is built, which is why they were not in round 2.

## Noted, no action

- `DropdownMenu` folded into `OverflowMenu` — fine. Same guarantees, and I have
  kept the three-file split in the design because a trigger without a menu is
  still useful; two files is the right call in the build.
- Notifications deferred. Not investing further. `SettingsScreen` keeps live
  position as its only viable row — if notifications are formally cancelled
  rather than deferred, that screen collapses into About and should not survive
  as a screen.
- Norwegian deferred; non-breaking space convention retained in
  `foundation.js`.

## Phase 2

Noted on the coverage endpoint — the 2020 envelope polygon would tell someone on
a North Sea platform it is dry, which is precisely the confident wrong answer
the hatch exists to prevent. The mask must come from `_FillValue` in the gridded
product. The design already assumes a ragged boundary following individual radar
ranges rather than a tidy polygon, and `RadarMap`'s footnote says so on screen.

`RadarMap` and `RadarMapScreen` are drawn and ready to consume.
