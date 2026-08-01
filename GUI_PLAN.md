# GUI plan — full-featured byge

The strategy: have Claude Design lay out the **whole** app, then build only the
MVP by extracting its components. Designing the MVP alone and bolting features on
later produces two incompatible time components, two location representations,
and a palette applied three different ways. Designing the whole thing first means
the MVP inherits a coherent system.

This document is the plan. `DESIGN_PROMPT.md` is the brief handed to Design.

## The thesis, and the risk

byge exists because **yr.no's map makes you guess**. You see a blue blob and
squint at whether it's heading your way. byge answers instead of showing.

The risk in designing the full app is obvious: add a map and it becomes the
centrepiece, and we've rebuilt the thing we were reacting to.

**Resolution: the map is a confirmation layer, never the answer.** The sentence
comes first, always. The map is a drill-down for when you want to see *why* —
"rain in 40 min" is the answer, and the map shows you the band out west that
justifies it. If a user has to open the map to learn whether it will rain, the
design has failed.

Concretely: the map is never the landing view, never the default tab, and never
the largest element on the verdict screen.

## Phases

| phase | features |
|---|---|
| **MVP** | three-question verdict · saved locations · manual location entry · compact timeline strip · stale/offline handling |
| **2** | map view with radar overlay · time scrubber across the full 200-min window · basemap switching |
| **3** | live geolocation ("use my position") · push notifications (requires a backend) |
| **maybe** | route/commute-aware forecasts · dry-window finder · widgets |

Design covers all of it. We build MVP.

## Screens

```
Locations  ──tap──▶  Verdict  ──tap map──▶  Map
   (MVP)              (MVP)                 (phase 2)
     │
     └──▶ Add location (MVP)          Settings (phase 3)
```

On tablet/desktop, Locations and Verdict are a two-pane layout rather than
separate screens. The map becomes a third pane or an overlay on the verdict
pane — worth Design exploring, since desktop has room to show map and answer
simultaneously without the map dominating.

## Component inventory

Marked by phase. The **shared-state** column is the important one — those are the
components that must be designed as one thing with two forms, not as two
components.

| component | phase | shared state / notes |
|---|---|---|
| `VerdictHeadline` | MVP | the sentence. Typographically dominant at every viewport. |
| `IntensityBadge` | MVP | label + "feels like" + palette colour. Same colour source as timeline and map legend. |
| `ConfidenceChip` | MVP | high/moderate/low. Present, legible, not shouting. |
| `RadarAge` | MVP | quiet reassurance, not an error state. |
| `TimelineStrip` | MVP | **compact form of `TimeScrubber`.** Design as one component, two densities. |
| `TimeScrubber` | 2 | expanded form — drives both the strip and the map frame. |
| `LocationCard` | MVP | **also the map marker popup in phase 2.** One representation. |
| `LocationList` | MVP | scannable: which of my places is wet now? |
| `AddLocation` | MVP | search or coordinates. |
| `StaleBanner` | MVP | cached data + age. Offline is the same component. |
| `EmptyState` | MVP | no locations saved yet. |
| `NoCoverage` | MVP | outside the Nordic radar mosaic. Say so; don't fake a forecast. |
| `MapView` | 2 | MapLibre/Mapbox canvas. Never the landing view. |
| `RadarOverlay` | 2 | tile or canvas layer — see options below. |
| `BasemapSwitcher` | 2 | terrain / street / satellite / hybrid. |
| `MapLegend` | 2 | **same palette source as `IntensityBadge`.** |
| `LocateMe` | 3 | geolocation permission flow. |
| `NotificationSettings` | 3 | requires backend. |

### The three couplings that justify this exercise

1. **`TimelineStrip` ↔ `TimeScrubber`.** MVP needs a compact 24-frame strip;
   phase 2 needs a scrubbable 40-frame control (85 min back + 115 forward) that
   drives the map. If designed separately you get two incompatible time
   components and a rewrite. Design one component with a compact and an expanded
   density.

2. **`LocationCard` ↔ map marker.** A saved location appears as a list row in MVP
   and as a map marker with a popup in phase 2. Same data, same visual language,
   same intensity colour. One representation with two placements.

3. **The palette.** Used by the intensity badge, the timeline, and the map legend.
   One source of truth (`scale.py` today, a shared TS constant in the app).
   Three independent implementations is how the map ends up disagreeing with the
   headline.

## Radar overlay — decided: yr's tiles

**Decision: use `tiles.yr.no` directly, and monitor it with tests.**

The alternatives were considered and set aside:

**A. Render our own canvas overlay from the NetCDF.** We already fetch the
gridded field, so we could subset a viewport-sized box, apply the palette
client-side, and reproject LCC → Web Mercator ourselves. Strictly the most robust
— no third-party dependency, and map and verdict could never disagree. Rejected
for now on cost: far more bandwidth than a 3 km disc, plus real reprojection work.

**C. MET's radar image API** (`api.met.no/weatherapi/radar/2.0`). Documented and
covered by the ToS, but it serves whole-area rendered PNGs with **no
georeferencing metadata** and no tile scheme. Not built for a slippy map.

### The risk, and how it's handled

`tiles.yr.no` is **undocumented infrastructure** — no robots.txt, absent from
MET's terms. It's NRK's internal CDN for yr.no and could change or start blocking
without notice. It's also z0–6 only, so it blurs when overzoomed (which is why
the squares are visible on yr's own map).

Rather than avoid the dependency, we **monitor** it. `tests/test_tiles.py` is a
contract suite that fails loudly if the service moves: availability, manifest
shape, 5-minute cadence, CORS, zoom ceiling, and — most importantly — two
semantic checks that availability testing would miss:

- **`test_palette_unchanged`** — the fitted boundaries in `scale.py` describe
  *these exact colours*. A silent repalette would leave every availability test
  green while our intensity labels quietly went wrong.
- **`test_tiles_still_agree_with_our_grid`** — the rendered tiles must still
  match the NetCDF field we read directly (>85 % wet/dry agreement). Catches yr
  switching product or thresholds underneath us.

If those go red, fall back to option A.

### No-data is not dry

Decoding yr's tiles requires one distinction the palette alone doesn't give you:

- **black `(0,0,0)`** — dry, *and we can see that it's dry*
- **white `(255,255,255)`** — **outside radar coverage**, we cannot see at all

Verified: white pixels coincide with `_FillValue` in our own grid 97 % of the
time. This is `scale.NO_DATA`, deliberately kept out of `PALETTE`.

It matters for the UI too: the map must render no-coverage visibly differently
from dry. Painting unobserved ocean the same as observed-dry land is exactly the
confident-but-wrong answer byge exists to avoid, and it's the visual counterpart
of the `NoCoverage` state in the component inventory.

**The legend must be driven by our palette constants**, not by whatever colours
arrive in a tile.

## Basemap

Mapbox GL JS needs an access token and bills on usage. **MapLibre GL JS** is the
open-source fork, free, API-compatible for our purposes, and can consume multiple
tile sources. Satellite imagery specifically needs a commercial provider
(Mapbox, Esri, Bing) or a national source — for Norway, **Kartverket** publishes
excellent free topographic and aerial layers.

Recommendation: **MapLibre + Kartverket** for Norwegian coverage, with the
basemap switcher abstracted so the provider can change without touching the UI.
Design just needs to know there are four basemap modes: terrain, street,
satellite, hybrid.

## Constraints from MET's terms

These bind the real app, so Design should know them:

- **Never use "Yr" in the app name, and never use the Yr logo.** Both are
  trademarks. `byge` is fine. Reusing the colour palette is fine (the data is
  CC BY 4.0), but the UI must not imply endorsement by Yr or NRK.
- **Attribution is required**: MET Norway, CC BY 4.0, with a link. Needs a home
  in the design — a footer or an about sheet, not buried.
- **`User-Agent` must identify the app** with contact info.
- **Coordinates: max 4 decimals.** 5+ returns 403. Affects the add-location flow
  and any geolocation rounding.
- **20 requests/second per application**, not per client. Matters if this ever
  goes wide.
- **Background updates no more than once per 10 minutes** when not actively in
  use. Aligns with the 5-minute publication cadence anyway.

## Extracting the MVP

For the extraction to be clean, the design must satisfy:

1. **No MVP component depends on a phase 2/3 component.** The verdict screen must
   render fully with no map present — not with a map-shaped hole.
2. **The map is additive.** Removing it should leave the verdict screen visually
   complete, not obviously missing something.
3. **`TimelineStrip` stands alone.** In MVP it is not scrubbable and drives
   nothing. It must read as finished, not as a disabled scrubber.
4. **Phase 3 entry points are absent, not disabled.** No greyed-out "use my
   location" button, no notification toggle that does nothing. Design them,
   deliver them in the full comp, but the MVP build simply omits them.

That last point is the one to state explicitly to Design: **we want the full app
designed and the MVP shipped**, so components need clean seams rather than
placeholder states.
