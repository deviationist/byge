# Feedback to Claude Design — round 2: component extraction

`FEEDBACK-01.md` covers corrections to the design itself. This one is about
**structure**: breaking the single `byge.dc.html` into a component library, so
the build can consume it piece by piece rather than reading one 61 KB file.

## Why

We're building this as **Expo + React Native + Uniwind + expo-router**, static
SPA output. See `ARCHITECTURE.md` in the repo.

The rule shaping our folder structure is *no huge component files*. Our reference
project has three components and screens of 10–15 KB that inline everything, and
we're explicitly not doing that. Every screen is a **composition** that arranges
components and owns almost no markup of its own.

Right now the design is one file where every screen inlines its own markup — the
same shape we're trying to avoid, one layer earlier. If it stays that way, the
extraction happens by hand and the couplings we agreed on (`PrecipitationGraph`
↔ `PrecipitationTimeline`, `LocationCard` ↔ map popup, one palette source) get
re-implemented independently, which is exactly what designing ahead was meant to
prevent.

## What we'd like

Restructure into **one file per component**, each independently previewable, plus
thin page compositions:

```
components/     one file per component, previewable in isolation
layouts/        Screen, NavBar, TwoPane, Section
screens/        page compositions — arrange components, minimal own markup
foundation/     palette (light + dark), type scale, spacing, the icon set
```

Each component file should show its **variants and states together** — that's
what makes it reviewable. `Swatch` should render filled, outline and hatched side
by side in both themes; `LocationStatusText` should show all nine verdict states
at once.

## The components

Named as we'll build them, so the design and the code stay in step.

### Primitives

| component | what it is in your current file |
|---|---|
| `Button` | the Save / Add / Not-now buttons — primary, secondary, ghost |
| `TextField` | the search, coordinate and name inputs |
| `NavBar` | back button left, content slot right filling the remainder |
| `NavBarButton` | the `‹` caret button |
| `SegmentedControl` | theme choice **and** basemap choice — one component, two uses |
| `Swatch` | **filled / outline / hatched** — the list glyph |

**On `Swatch`:** it currently appears in four places with the logic duplicated
(list row, verdict badge, map popup, legend). It is one component. Also — please
reserve **"marker" for map pins**; the list glyph is a swatch. Once `MapField`
and `RadarMap` exist, "marker" is ambiguous.

### Precipitation

| component | notes |
|---|---|
| `PrecipitationGraph` | the "NEXT 2 HOURS" strip — 24 frames, non-interactive |
| `PrecipitationTimeline` | the scrub control — **the same component at expanded density**, 40 frames, interactive. Design them as one file with two densities, not two files. |
| `PrecipitationLevelCard` | the intensity badge — swatch + label + feels-like + rate |
| `PrecipitationConfidence` | the three bars + "high confidence · reading now" |
| `PrecipitationLegend` | the collapsed disclosure — see `FEEDBACK-01.md` §6 |
| `LocationStatusText` | **the headline.** Owns the open-ended treatment. |

`LocationStatusText` is the most important component in the app — the grammar
swap, the dotted underline, the superscript `→` and the footnote all live there.
Its file should show **every verdict state at once**, because the whole point is
that they look different from each other. That includes the two new ones from
`FEEDBACK-01.md` §3 (rain that stops and returns).

### Location

| component | notes |
|---|---|
| `Location` | one location's identity — name, place, coordinates. Reused in list rows, the verdict header, the map popup. |
| `LocationCard` | list row — **and the map marker popup**. One component, two placements. |
| `LocationsList` | the list plus its empty state |
| `MapField` | the add-a-place picker — centre-pinned, pan to set, radius circle, locate button |
| `RadiusField` | the radius control feeding that circle |
| `RadarMap` | phase 2 — overlay, basemap selector, legend. **Shares its map primitive with `MapField`.** |

### State and chrome

`RefreshControl` (see `FEEDBACK-01.md` §7 — three outcomes), `StaleBanner`,
`CoverageNotice` (blind **and** partially-observed), `EmptyState`, `ErrorState`,
`InstallPrompt`, `Attribution`, `BrandMark`.

### Layouts

`Screen` (padding, the 620 px measure cap, safe areas), `NavBar`, `TwoPane`,
`Section`.

### Foundation

The palette in **one place** — light and dark, six bands plus `NO_DATA` — because
it feeds the badge, the graph, the timeline and the map legend. Four
implementations is how the map ends up disagreeing with the headline. Plus the
type scale, spacing, and the icon set with its maskable and monochrome variants.

## Screens

Thin compositions: `LocationsScreen`, `VerdictScreen`, `AddLocationScreen`,
`AboutScreen` (now including Appearance — see `FEEDBACK-01.md` §5),
`RadarMapScreen` (phase 2), `SettingsScreen` (phase 3 shell, not built).

## Navigation: About has no real entry point

We audited every nav handler in the comp against where it's actually invoked.
Result:

| handler | reachable from |
|---|---|
| `goSettings` | **once**, in About's footer: *"Version 1.0 · offline-capable · settings"* |
| `goAbout` | **only** the attribution line: *"· NLOD 2.0 / CC BY 4.0 · about"* |

So all secondary navigation hangs off attribution text, and Settings sits three
hops deep behind two 9.5 px monospace links.

**This breaks `FEEDBACK-01.md` §5.** We moved Appearance into About on the
grounds that one control doesn't earn its own screen — but that assumed About was
reachable. As drawn, the theme switcher is buried behind a legal footnote.
Attribution is a legal obligation with a legal-sized affordance; it is not a
navigation entry point, and it shouldn't be doing double duty as one.

Please give **About a real entry point** — a `NavBar` action on the Locations
screen is the natural home, since that's the app-level surface. Keep the footer
link as well; attribution should be there regardless. About now holds Appearance,
so it is a functional destination, not just a colophon.

Settings stays out of the MVP entirely (§5). When it returns in Phase 3 it will
need its own entry point too — probably from About, but as a proper row rather
than a word in a version string.

## Splash screen

Yes please — and it needs designing properly rather than falling out of the
manifest, because iOS shows a **white flash** without `apple-touch-startup-image`
and that is the first thing anyone sees after installing.

Deliver:

- **The splash artwork itself** — mark on `background_color`, one composition
  that scales, in **light and dark**. iOS picks by media query, so both are real
  deliverables, not a tint of one.
- **The iOS `apple-touch-startup-image` set.** You showed one media query
  (430×932 @3×) and noted "one per device class". We need the actual set — the
  current iPhone sizes at minimum, each in both schemes. Generated from one
  template is fine; the template is the design.
- **Android/PWA**: what shows is `background_color` plus the icon, so those two
  must agree with the splash composition rather than being picked separately.

**The constraint that should shape it:** byge promises an answer in under a
second, and the app renders a cached verdict immediately on open. So the splash
must feel like a *doorway, not a wait* — the shortest possible held frame, no
animation that has to finish, no progress indicator, and never splash → spinner →
content. Splash straight into a rendered verdict.

That argues for something very quiet: the mark, centred, on the theme
background, and gone. If it looks like a brand moment it is already too long.

## One thing you can now design that you couldn't before

`RadarMap` needs to show **where radar cannot see**. We established that MET's
own coverage shapefile and their `radar_coverage` flag are both service-area
envelopes — they report "covered" for a North Sea point where the radar sees
nothing.

But we can derive the true mask from the gridded data: **10 km resolution, 0.6 KB
gzipped, 164 ms**. Radar sees about 65 % of the domain, and the boundary is
ragged — it follows individual radar ranges, not a tidy polygon.

So the hatched no-data fill on `RadarMap` is real and available, and the same
mask lets `MapField` warn at *add* time rather than after saving. Worth designing
both: a location placed outside coverage should be catchable before it's saved.
