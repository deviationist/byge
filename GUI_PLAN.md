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

## Radar overlay — three options

Phase 2 needs precipitation rendered on a map. Ranked by robustness:

**A. Render our own canvas overlay from the NetCDF.** We already fetch the
gridded field. Extend the subset from a 3 km disc to a viewport-sized box, apply
the palette client-side, draw to canvas, and reproject onto the map. *Pros:* no
third-party dependency, full control, exact agreement with the headline verdict
since it's literally the same numbers. *Cons:* more bandwidth (a viewport box is
much larger than a disc), and reprojection work (LCC → Web Mercator).
**Recommended** — it's the only option where map and verdict cannot disagree.

**B. Use yr's tiles (`tiles.yr.no`).** Ready-made, 5-minute cadence, both
observations and nowcast, CORS open. *Pros:* trivial to implement, looks exactly
like yr. *Cons:* **undocumented infrastructure** — no robots.txt, not mentioned
in MET's ToS. It's NRK's internal CDN for yr.no, and can change or start blocking
without notice. Also z0–6 only, so it blurs when overzoomed (which is why the
squares are visible). Acceptable for a prototype; a fragile production dependency.

**C. MET's radar image API** (`api.met.no/weatherapi/radar/2.0`). Documented and
covered by the ToS. *Cons:* whole-area rendered PNGs with **no georeferencing
metadata** and no tile scheme — awkward to place on a slippy map. Not really
built for this.

Design should not assume which one wins — the overlay is a raster layer either
way, and the visual result is similar. But **the legend must be driven by our
palette constants**, not by whatever colours arrive in a tile.

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
