# Architecture

## Stack

**Expo (SPA web output) + React Native + Uniwind + expo-router**, matching the
conventions in `~/code/ping/apps/field`.

| concern | choice |
|---|---|
| framework | Expo `~56`, React Native `0.85`, `react-native-web` |
| routing | `expo-router` — file-based, `main: expo-router/entry` |
| styling | **Uniwind** `^1.9` + `tailwindcss` `^4`, tokens in `global.css` |
| data | `@tanstack/react-query` for fetch/cache/revalidate |
| build | `expo export -p web` → static SPA |
| tests | `vitest` (unit/component) + `playwright` (e2e) |

`expo export -p web` produces exactly the shape deployed at
`/var/www/app.ping.mnmt.no` — `index.html`, `_expo/`, `manifest.json`, `sw.js`,
`icons/`. Static hosting, which is what the no-backend decision requires.

React Native rather than plain React is a deliberate option on native later. It
costs little now and the component boundaries below are the same either way.

## The rule that shapes the folder structure

**No huge component files.** `ping/apps/field` is the cautionary example: three
components in `components/`, and screens of 10–15 KB that inline everything.

Every screen here is a **composition** — it arranges components from
`components/` and owns almost no markup of its own. If a screen file is growing
past ~150 lines, something in it wants extracting.

```
app/                    expo-router routes — thin, route + params only
  _layout.tsx
  index.tsx             → LocationsScreen
  location/[id].tsx     → VerdictScreen
  add.tsx               → AddLocationScreen
  map/[id].tsx          → RadarMapScreen        (phase 2)
  about.tsx             → AboutScreen

screens/                one folder per page; composition only
  locations/
  verdict/
  add/
  map/
  about/

components/             reusable, presentational, no data fetching
layouts/                Screen, NavBar, TwoPane, Section
lib/                    the ported data layer — see below
theme/                  tokens, colour scheme, the precipitation palette
hooks/                  useVerdict, useLocations, useRefresh, useColorScheme
```

Colocate tests: `LocationCard.tsx` next to `LocationCard.test.tsx`.

## Component inventory

Presentational, no fetching. Data arrives as props so every one is renderable in
isolation and in both themes.

### Primitives

| component | notes |
|---|---|
| `Button` | primary / secondary / ghost. 44×44 minimum hit area. |
| `TextField` | label, value, hint, error. |
| `NavBar` | back button left, content slot right filling the remainder. |
| `NavBarButton` | the caret back button. |
| `SegmentedControl` | theme choice, basemap choice. One component, two uses. |
| `Swatch` | **filled / outline / hatched.** The whole visual language of raining-now vs on-the-way vs not-observed. Used by `LocationCard`, `PrecipitationLevelCard`, the map popup and the legend — so it must be one component, not four implementations. |

### Precipitation

| component | notes |
|---|---|
| `PrecipitationGraph` | the "NEXT 2 HOURS" strip. 24 frames. Non-interactive. |
| `PrecipitationTimeline` | the scrub control — **same component, expanded density**, 40 frames, interactive, drives the map. Build `PrecipitationGraph` first and let this extend it; do not write two. |
| `PrecipitationLevelCard` | the intensity badge — swatch + label + "feels like" + rate. |
| `PrecipitationConfidence` | the three bars + "high confidence · reading now". |
| `PrecipitationLegend` | collapsed disclosure below the locations list — swatch states + intensity ramp + what "not observed" means. Safe to collapse because nothing is explained *only* here; every swatch is word-labelled where it appears. In position, not a corner icon; labelled "Reading the list" — avoid "marker", which means map pin once `MapField`/`RadarMap` exist. |
| `LocationStatusText` | **the headline.** Owns the open-ended treatment: grammar swap, dotted underline on the bound, superscript `→`, and the footnote. This is the most important component in the app — the honesty lives here. |

### Location

| component | notes |
|---|---|
| `Location` | one location's identity — name, place, coordinates. Used in list rows, the verdict header and the map popup. |
| `LocationCard` | list row: swatch + name + status + chevron. **Also the map marker popup.** One component, two placements. |
| `LocationsList` | the list, plus its empty state. |
| `MapField` | the add-a-place picker — centre-pinned marker, pan to set, radius circle, "use my location". |
| `RadiusField` | the radius control. Feeds the circle in `MapField`. |
| `RadarMap` | phase 2 — precipitation overlay, basemap selector, legend. Shares its map primitive with `MapField`. |

### State and chrome

| component | notes |
|---|---|
| `RefreshControl` | manual update — pull-to-refresh **plus** a focusable button, since pull-to-refresh is unreachable by keyboard. Owns the three outcomes below. |
| `StaleBanner` | cached verdict + age. |
| `CoverageNotice` | **no coverage** and **partially observed** — see below. |
| `EmptyState` | no locations saved. The actual first impression. |
| `ErrorState` | request failed, distinct from offline-with-cache. |
| `InstallPrompt` | PWA install, dismissible, never over the verdict. |
| `Attribution` | "Data from MET Norway · NLOD 2.0 / CC BY 4.0". |
| `BrandMark` | the byge icon, sized. |

### Layouts

`Screen` (padding + the 620px measure cap + safe areas), `TwoPane` (list beside
detail on tablet/desktop), `Section`.

## Refresh

Two triggers, one path: a **5-minute auto-refresh** while the app is foregrounded,
and a **manual trigger** the user can pull or click. Both go through
`useRefresh()`, so there is one implementation and one set of outcomes.

The subtlety is that a manual refresh usually finds nothing. Analyses publish
every 5 minutes with **0–11 minutes of jitter**, so a user tapping refresh will
frequently get the file they already have. That is not a failure and must not be
dressed as a spinner that resolves into no visible change — which reads as
broken and trains people to distrust the button.

Three outcomes, all designed:

| outcome | behaviour |
|---|---|
| **newer analysis** | verdict updates in place, age resets. No layout jump. |
| **already latest** | say so plainly — *"Already the latest — radar 3 min old"*. Brief, self-dismissing. |
| **failed** | keep the existing verdict, note the refresh failed. This is `ErrorState`'s inline form, distinct from `StaleBanner`, which means offline-with-cache. |

Resolution is cheap: the newest filename is a deterministic 5-minute mark, and
probing one costs ~25 ms with a clean 404 before publication. So "is there
anything new" is answerable **before** fetching any data — check first, and only
pay the ~1.3 s subset fetch when the answer is yes.

Because a verdict degrades rather than expires — an analysis from 10 minutes ago
still answers "is it raining now" via its T+10 frame — a failed refresh is never
a dead end. Always index by **valid time**, never by frame 0.

## Data layer (`lib/`)

Ports of the Python spike. The spike does not ship; these do.

```
lib/
  scale.ts        bands, palette (light + dark), NO_DATA
  grid.ts         LCC projection, cell_of, pinned constants
  opendap.ts      dataset resolution + subset fetching + parsing
  radar.ts        probe() → frames
  forecast.ts     spells, verdict, the three questions
  coverage.ts     radar coverage mask (below)
```

Carry `tests/test_forecast.py` across as `forecast.test.ts` — it encodes the
honesty invariants and is the least replaceable thing in the repo.

Two hazards when porting, both of which fail silently:

- **`Yc` descends.** Row 0 is north, `DY` is `-1000`. Getting it backwards
  mirrors the field without erroring.
- **`_FillValue` is not zero.** Unobserved cells must never count as dry. See
  `AGENTS.md`.

## Radar coverage detection

We investigated three mechanisms. **Only one is accurate.**

### What does not work

**MET's coverage shapefile** (`/weatherapi/nowcast/2.0/coverage` → a zipped
`NordicNowcast.shp`) is a single WGS84 polygon from **2020**, spanning
−11.8→41.8°E, 52.3→73.9°N. It is a *service-area envelope*, not a radar mask: it
reports "covered" for a North Sea coordinate where the radar sees nothing at all.

**Nowcast 2.0's `meta.radar_coverage`** has the same flaw — it returns `"ok"` for
that same blind North Sea point. It does usefully return **HTTP 422** for
locations outside the service entirely (Svalbard, Paris), but inside the domain
it is not a coverage test.

Both would tell a user on an oil platform that it is dry.

### What works

**`_FillValue` in the gridded product**, which is what we already read. Cells the
mosaic cannot see come back as `9.969e36`. This is live, exact, per-cell, and
free — it arrives in the same subset the verdict already fetches. `Frame.observed`
is the fraction of the radius the radar can actually see, and `Verdict.blind` is
`observed == 0`.

### Drawing the boundary

For the map, derive the true mask from the grid rather than trusting the
shapefile. A strided full-grid read gives a coverage bitmask:

| stride | grid | fetch | gzipped |
|---|---|---|---|
| 20 km | 107×85 | 93 ms | **0.3 KB** |
| 10 km | 214×170 | 164 ms | **0.6 KB** |

Radar sees ~65 % of the domain. At 10 km resolution the mask is **0.6 KB
gzipped** — cheap enough to fetch on load and cache for hours, since it only
changes when a radar goes up or down. That is the layer that renders the
hatched no-data areas on `RadarMap`, and it lets `MapField` warn at *add* time
rather than after saving.
