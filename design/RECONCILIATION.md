# Design ↔ build reconciliation

What the Claude Design project holds, what this repository holds, and where the
two disagree. Written 2026-08-05 against design project
`6bbabebb-8532-4f16-b84d-6f68d8bcf3d5`.

`Library.dc.html` is the authoritative inventory on the design side — 28
components in five groups plus seven screen entries, each tagged MVP, phase 2 or
phase 3. This file reconciles that list against `components/`, `screens/` and
`layouts/`, and then asks the separate question of whether the unbuilt parts are
*viable* against the data we can actually get from MET.

Companion to [`SCREEN-NOTES.md`](./SCREEN-NOTES.md), which records the screen
composition decisions. Same reason for existing: the design files are not
checked in, so what they settle has to be written down somewhere that is.

## The headline

**Nothing MVP-phase is missing.** Every MVP component and screen in the design
exists here, with tests. The gaps are deferred phases or deliberate structural
choices, and there is exactly one MVP-scope *feature* not built (clock times).

## Inventory

### In the design, not here

| Design file | Phase | Status |
|---|---|---|
| `RadarMap` | 2 | Genuinely absent. Radar layer over `MapCanvas`, basemap switcher, palette legend, scrubber. |
| `RadarMapScreen` | 2 | Genuinely absent. Nav bar + `RadarMap` inside the app shell. |
| `SettingsScreen` | 3 | Genuinely absent — and intentionally. Library: "the MVP build omits the screen and its entry point entirely." |
| `DropdownMenu` | MVP | **Not a gap.** See below. |

`DropdownMenu` needs no work. The design splits the menu three ways —
`MoreButton` (trigger), `DropdownMenu` (popover), `OverflowMenu` (composer) — so
that a trigger is reusable without a menu and vice versa. Here `MoreButton` is
its own file and `OverflowMenu` folds the popover in: it owns the open state,
Escape, focus return to the trigger, and roving focus between rows. Same
behaviour and the same guarantees, in two files rather than three. Worth
knowing when reading a design file that references three.

### Here, not in the design

Design has never drawn these, so it has never reviewed them.

| Local file | What it is |
|---|---|
| `components/Location.tsx` | One place's *identity* — name, place, coordinates — with `variant: "row" \| "header" \| "popup"`. The design folds identity into `LocationCard`; splitting it out is what stops the same place being named two different ways on two screens. |
| `components/LocationsList.tsx` | The list plus its empty-state slot. The design keeps this composition inside `LocationsScreen`. |
| `layouts/Screen.tsx`, `Section.tsx`, `TwoPane.tsx` | The phone/tablet/desktop switch. The design covers this only as prose inside its `byge (app shell)` entry — there is no `TwoPane` design file, even though two-pane behaviour is specified in detail (deletion re-points the detail pane; the cleared state fills both panes). |

### In the design, correctly absent here

Documentation and harness tier, not app code: `Library`, `Specimen-Foundation`,
`Specimen-InContext`, `Specimen-Precipitation`, `byge`, `byge-v1`,
`foundation.js`, `ios-frame.jsx`, `support.js`, `github.md`, `screenshots/`.

`foundation.js` is worth one note: it is the design's single source for the
bands and the fixtures, and our `lib/scale.ts` + `lib/forecast.ts` are the
independent implementations of the same rules. They agree today, including the
late band-6 dark fix (`#E8BCF4`, not the `#C77BD6` that reintroduced a
luminance inversion at the top of the scale). Nothing enforces that they keep
agreeing.

## Feature alignment

### Already aligned

Verified in the source, not assumed:

- `Frame.coverage` is §7's wet-share — bar height encodes coverage, not rate.
- `Frame.observed` is the separate radar-visibility fraction. The two are never
  conflated.
- `edgeOnly` / `nearestKm` / `centreRate` implement §4.3's "Rain within 8 km".
- The second spell is subordinate, with the dry gap named explicitly.
- `PrecipitationGraph` carries both densities, the expanded one including
  observed history at negative minutes — the scrubber's data path already
  exists.
- `RefreshControl` has all three outcomes, including "already-latest".
- Band 6 dark is the corrected value.

### Not built

**1 · Clock times — the only MVP-scope feature gap.**

The design emits a clock alongside every relative time: `around 18:15`,
`17:55–18:20`, and for a second spell `Then more from 19:15 (+85)`. We emit
relative only — `Then more from about 40 min — about 15 min of dry in between`.
Design's argument is that the clock is the load-bearing half, because "it clears
around 19:15" is the sentence people plan around.

*Viability: free.* No new data — `Frame.time` is already a `Date`, so this is a
formatting function over what we hold.

*But:* Library's own STILL OPEN list questions whether it survives translation —
in Norwegian the relative form may be the natural one and the clock the
redundant half. Decide the copy before building the function.

**2 · RadarMap + RadarMapScreen (phase 2).**

*Viability: strong, and the scaffolding was staged for it.* `lib/opendap.ts`
already reads the gridded radar product. `lib/coverage.ts` says in its own
header that it exists *for the map* — a single location gets its coverage free
inside the verdict's subset, and that module is for the whole boundary. The
expanded graph density exists to drive the scrubber.

*The gotcha to carry into that work:* both of MET's obvious coverage sources are
wrong for this. `/weatherapi/nowcast/2.0/coverage` returns a 2020 service-area
envelope polygon, and Nowcast 2.0's `meta.radar_coverage` returns `ok` anywhere
inside it — either would tell someone on a North Sea platform that it is dry.
The real boundary comes from `_FillValue` in the gridded product, and it is
ragged, following individual radar ranges rather than any tidy polygon. The
design's hatched mask has to be drawn from that. This is already documented at
the top of `lib/coverage.ts`; it is repeated here because it is the kind of
thing a map task rediscovers the expensive way.

The design also notes the map is a styled stand-in for MapLibre + Kartverket:
layer order, the pan model, the mask and the legend are the design; the tiles
are not.

**3 · SettingsScreen (phase 3) — half of it is not viable.**

*Live position* — viable. Browser geolocation, and `MapField` already has a
one-shot locate.

*Notifications* — **not viable on iOS without something running off-device.**
The blocker is not MET's data, which is free and adequate, and it is not the
service worker, which already exists. It is that nothing can run the periodic
check.

Two false leads worth killing in writing, because both look like solutions:

**"Build a service worker."** There is one — `public/sw.js`, registered by
`hooks/useServiceWorker.ts` in production only. It is not the missing piece. A
service worker is event-driven and killed aggressively; it is not a background
timer. It can *display* a notification via `registration.showNotification()`,
but something has to wake it first, and there are only three candidates:

| Wake-up | Needs a server? | Works on iOS? |
|---|---|---|
| Web Push (`PushManager.subscribe`) | **Yes** | Yes — iOS 16.4+, installed PWAs only |
| Periodic Background Sync | No | **No** — Chromium only |
| Notification Triggers (`TimestampTrigger`) | No | No — never shipped broadly, do not rely on it |

Web Push is the only iOS-viable one, and it structurally requires a server: the
push service is a delivery pipe, not a scheduler. It cannot poll MET on our
behalf. Periodic Background Sync *would* give a genuinely serverless version,
but it is Chromium-only — and this design is conspicuously iOS-shaped (the
specimen is entirely iPhone frames, and `scripts/postexport.mjs` injects the
`apple-touch-icon` and `apple-mobile-web-app-*` set), so an Android-only
notification feature is probably not the feature.

**"Just poll every five minutes."** The app already does —
`hooks/useVerdict.ts:25` and `:53` set `refetchInterval: FIVE_MIN`, matching
MET's publish cadence. That is why `RefreshControl` has an "already-latest"
outcome at all. But polling only runs while the app runs:

- *Foreground* — works, already built.
- *Backgrounded tab* — unreliable even with `refetchIntervalInBackground` on
  (it defaults to `false`, deliberately: polling an unfocused tab burns battery
  and MET requests for an answer nobody is reading). Chrome throttles hidden
  tabs intensively after ~5 min on battery; iOS Safari suspends them.
- *App closed* — no JS runs at all.

That last row is the whole feature. "Tell me before it rains" matters precisely
when you are *not* looking at a rain app, which is the state where no
client-side timer exists to fire. Polling keeps an open answer fresh; push
reaches a closed app. Neither substitutes for the other.

**What the backend would be** is small: store `{push endpoint, lat, lon,
radius}`, run a job every few minutes reusing the nowcast logic already in
`lib/`, push when a spell crosses the threshold. A cron and a table.

**The real cost is the promise, not the hosting.** `ConfirmSheet` currently
tells users that byge has no account and no sync, so there is nothing to restore
a deleted place from. Notifications mean a server holds the coordinates of your
home and your cabin. That changes what byge *is*, and Design would have to
rewrite copy that currently reads as a selling point. Two things soften it:

- **Subscription-scoped, not account-scoped** — store the push endpoint plus
  coordinates, no identity, no login. The endpoint is the key; deleting it
  deletes everything.
- **Coarsen the stored coordinates** — already clamped to 4 decimals for MET,
  and the radius is 2–25 km, so a notify job never needs better than ~1 km. The
  server need not hold a precise home address.

**Without any backend at all**, the only serverless path on iOS is an iOS
Shortcuts personal automation: it runs on the phone, can fetch MET's *point*
nowcast (`/weatherapi/nowcast/2.0/complete?lat=&lon=`, plain JSON, no OPeNDAP)
and post a local notification. But its triggers are contextual — leaving or
arriving at a location, a time of day, opening an app — never a five-minute
loop. Two things to test before trusting it: MET requires a User-Agent naming
the application and Shortcuts sends its own, and background automations are
reliable-ish rather than guaranteed.

Arguably that fits the question byge asks. "Do I need a jacket" is asked at a
moment, usually on the way out; a check triggered on leaving home serves it
better than continuous monitoring, and with a 2-hour horizon very little is
lost.

> **Decided 2026-08-05: deferred.** No backend wanted, and Shortcuts is the only
> serverless path — so notifications stay unbuilt. The other half of
> `SettingsScreen`, live position, is unaffected and remains viable.

Worth relaying to Design explicitly. They have drawn the rows as a shell, and
none of this is visible from their side.

## Open decisions

Both from Library's own STILL OPEN list, both touching code that already exists.

1. **Bar height as coverage (§7).** Implemented on both sides, still listed as
   open: "If you would rather the strip stay a pure intensity shape, say so — it
   is one function in `foundation.js`." Aligning here means confirming the
   decision, not doing work. Worth closing so it stops being open.
2. **Norwegian copy is unwritten.** The strings live in the model rather than the
   markup, so it is a string table rather than a rewrite — but nothing here is
   set up for it yet, and it gates the clock-times decision above.

## Specimens as QA

`Specimen-InContext.dc.html` was reviewed on 2026-08-05 and deliberately not
ported. It is a design artifact — iPhone bezels, a mock home screen, and prose
aimed at a reviewer — so it does not belong in the PWA bundle. It is kept as an
*acceptance reference*: four verdict states at true phone size, both themes,
which is the right view for checking that the two raining states read as
different and that the dark ramp brightens with intensity.

Same applies to `Specimen-Precipitation.dc.html` (all eleven states) and
`Specimen-Foundation.dc.html` (palette, type, install kit).

When that QA pass happens, the fixtures are the cheap part: `foundation.js`
carries only the frame arrays, and `lib/forecast.ts` already derives verdicts
from frames. A harness is a fixtures file plus an iOS frame, not a rebuild of
the screens.
