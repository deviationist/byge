# Brief for Claude Design — round 3

For design project `6bbabebb-8532-4f16-b84d-6f68d8bcf3d5`. Round 2 is
`Library.dc.html` and the component files beside it; this is the response to it
from the build, plus the decisions round 2 left open.

Written 2026-08-06. Companion to [`RECONCILIATION.md`](./RECONCILIATION.md),
which has the full inventory comparison and the data-viability notes.

## Where the build actually is

**Every MVP component and screen in round 2 exists, with tests.** The
reconciliation found no missing MVP component. What is absent is phase 2
(`RadarMap`, `RadarMapScreen`) and phase 3 (`SettingsScreen`), both
deliberately.

Two things have changed since round 2 that affect what you design next.

**1 · The app now targets iOS and Android as well as web.** This is the big one
and it is covered in its own section below, because it changes what a design
file is allowed to assume.

**2 · Copy now lives in a string table**, not in the markup. Anything you
reword lands in `i18n/locales/en.json` as a JSON edit rather than a component
change, so copy revisions are cheap. English first; Norwegian is deferred — see
below.

## Decisions we need from you

### 1 · Clock times — decided, needs drawing

Round 2's open list asked whether clock times read well in Norwegian, "where
the relative form may be the natural one and the clock the redundant half".

**The answer is neither of the two options you offered.** byge operates over a
two-hour horizon, so relative time is the primary form — "stops in about 25
min" is what a person acts on. But the clock is what they *plan* around, which
your own §3 note already argues ("it'll clear at six" is exactly the sentence
someone plans around).

So: **relative primary, clock secondary at a reduced size.** Not an either/or.

What we need from you is the treatment, not the decision: size relationship,
placement relative to `LocationStatusText`'s bound and secondary line, and
whether the clock sits inline or on its own line at each breakpoint. The
existing sizes table in `SCREEN-NOTES.md` is the one to extend.

### 2 · Bar height as coverage — confirm or revert

Round 2 changed bar height from rate to coverage (§7) and then left it open:
"If you would rather the strip stay a pure intensity shape, say so — it is one
function in `foundation.js`."

It is implemented on both sides and has been since the component layer landed.
We are not asking to change it; we are asking you to **close it**, so
`PrecipitationGraph` stops being provisional. If it stays, say so and we will
delete the question from the reconciliation.

### 3 · Two-pane: in the MVP or not?

`layouts/TwoPane.tsx` is built and tested and **imported by nothing**. Round 2
specifies two-pane behaviour in real detail — deletion re-points the detail
pane, the cleared state fills both panes, "Removed Cabin. Showing Work." — and
none of it is wired.

That is a scope question only you can settle. Either it is MVP and we wire it,
or it is not and we should say so rather than carrying a tested orphan.

## A divergence to resolve

**Phone behaviour after removing a place that is not your last one.**

Round 2's mutations table says: *"Back to the list, one row shorter, with
'Removed Cabin.' above it."*

The build navigates to the **neighbour's verdict** instead — which is the
*two-pane* behaviour from the same row, applied to phone. And the "Removed
Cabin." notice above the list does not exist at all; only the empty-state case
does.

Two things to decide:

- Does phone return to the list, or follow to the neighbour? The build's
  current behaviour has an argument in its favour (you were reading a verdict;
  you get another verdict), but it is not what the spec says.
- The notice above the list is unbuilt either way. If it stays in the design,
  it needs drawing at both breakpoints — including the two-pane variant that
  names both facts, "Removed Cabin. Showing Work."

Related, and already fixed: the **cleared** empty state was unreachable in the
build until 2026-08-05 — removing your last place showed the first-run welcome
instead. Wired now, and it behaves as round 2 describes.

## The native constraint — please read before drawing

The app compiles to iOS and Android as well as web. React Native has no CSS, so
a design that leans on a browser-only affordance either has to be redrawn or has
to be marked web-only. Two from round 2 have already bitten:

- **The hatch.** `HATCH` is a `repeating-linear-gradient` applied through
  `backgroundImage`, and **React Native has no `backgroundImage` property at
  all**. On native the "not observed" fill would have flattened to a plain pale
  square — which reads as a band, or as dry, the two things it must never be
  mistaken for. Fixed by composing it from rotated views, with both renderings
  now derived from one set of numbers.
- **The licence links.** They relied on react-native-web rendering a `Text`
  with `href` as an anchor. On native that is inert text, so MET Norway, NLOD
  and CC BY simply would not have opened. Fixed.

Still web-only and currently accepted as cosmetic: `box-shadow` (the overflow
menu's and the map popup's lift) and CSS `outline` (the focus ring on the
scrubber). **If either is load-bearing rather than decorative, say so** and we
will draw a native equivalent; otherwise menus render flat and the scrubber has
no focus indicator on native.

The general request: when a specimen depends on a CSS-only capability —
gradients, shadows, outlines, blend modes, `backdrop-filter` — flag it in the
file so we catch it at design time instead of at port time.

## Things you have never drawn

These exist in the build and have never been through design review. Not a
complaint — we built them — but you should know they are there, because they
carry decisions:

| Build file | What it is |
|---|---|
| `components/Location.tsx` | One place's *identity* — name, place, coordinates — with a `variant` of row / header / popup. Round 2 folds identity into `LocationCard`; splitting it is what stops a place being named two different ways on two screens. |
| `components/LocationsList.tsx` | The list plus its empty-state slot. Round 2 keeps this inside `LocationsScreen`. |
| `layouts/Screen`, `Section`, `TwoPane` | The phone/tablet/desktop switch. Round 2 covers it as prose inside the `byge (app shell)` entry; there is no `TwoPane` design file despite the behaviour being specified. |

## Informational — no action needed

- **`DropdownMenu` is folded into `OverflowMenu`.** Round 2 splits the menu
  three ways (trigger / popover / composer) so a trigger is reusable without a
  menu. The build has `MoreButton` separate and the popover inside
  `OverflowMenu` — same behaviour, same guarantees (44px rows, Escape, focus
  returns to trigger, roving focus), two files instead of three. Mentioned only
  so the file maps line up.
- **Notifications are deferred, so do not invest further in them.** Web Push is
  the only mechanism that works on iOS, and it structurally requires a server —
  the push service delivers messages, it does not originate them, so something
  must poll MET on a schedule. There is no backend and no appetite for one. The
  *other* half of `SettingsScreen`, live position, remains viable.
- **Norwegian copy is deferred**, not cancelled. When it happens, please keep
  the non-breaking space convention already in `foundation.js` (`about min`)
  so units never orphan after translation.

## If you have capacity: phase 2

`RadarMap` and `RadarMapScreen` are the next real design consumers. Two notes
from the build side before that work starts:

- The map is described in round 2 as "a styled stand-in for MapLibre +
  Kartverket" — layer order, pan model, mask and legend are the design, the
  tiles are not. That still holds.
- **The coverage mask cannot come from MET's coverage endpoint.**
  `/weatherapi/nowcast/2.0/coverage` returns a 2020 service-area envelope
  polygon, and `meta.radar_coverage` returns `ok` anywhere inside it — either
  would tell someone on a North Sea platform that it is dry. The real boundary
  comes from `_FillValue` in the gridded product and is ragged, following
  individual radar ranges rather than any tidy polygon. The hatched mask has to
  be drawn from that shape.
