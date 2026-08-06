# Prompt for Claude Design — the `byge` GUI

Paste this into Claude Design, pointed at this repository. `README.md` has the
data model and `AGENTS.md` has the working conventions; this file is the brief
for the interface specifically.

---

## What you're building

A **React PWA** called **byge** (Norwegian for *a passing shower*). It answers
one question, glanceably:

> **Do I need a jacket, and for how long?**

The user opens it wondering whether to hang laundry, walk the dog, or cycle home.
They should have their answer in **under a second**, without interpreting a map
or a chart. Everything else is secondary to that.

This is deliberately *not* a weather app. It shows no map, no temperature, no
week ahead, no weather symbols. It answers three questions about rain and stops.

## The three questions

1. **Is it raining here right now?**
2. If yes — **when does it stop?**
3. If no — **will it start, and if the end is visible, how long will it last?**

## Data model

The app calls a local module that returns a `Verdict` per saved location. No
backend — it fetches MET Norway's radar grid directly from the browser.

```ts
type Verdict = {
  raining_now: boolean
  now_rate: number            // mm/h
  current: Spell | null       // the spell you're standing in
  next: Spell | null          // the next one to arrive
  lead_min: number            // how far out the predicted event is
  confidence: 'high' | 'moderate' | 'low'
  horizon_min: number         // always 115
  analysis_age_min: number    // how old the radar reading is
  frames: Frame[]             // 24 steps, 5 min apart
}

type Spell = {
  start_min: number
  end_min: number | null      // null => still raining at the horizon
  peak_rate: number           // mm/h
  mean_rate: number
}

type Frame = {
  minutes: number             // 0, 5, 10 … 115
  coverage: number            // 0..1, fraction of the area that is wet
  mean_rate: number
  max_rate: number
}
```

## The states you must design

Do not collapse these. Each is a genuinely different answer.

| # | situation | the answer |
|---|---|---|
| 1 | raining, `current.end_min` set | *"Raining. Stops in about 25 min."* |
| 2 | raining, `current.end_min === null` | *"Raining. No end in sight within the next 2 hours."* |
| 3 | dry, `next` arrives, end visible | *"Dry. Rain in 40 min, lasting about 25 min."* |
| 4 | dry, `next` arrives, `end_min === null` | *"Dry. Rain in 40 min, lasting at least 75 min — end not visible."* |
| 5 | dry, `next === null` | *"Dry, and nothing approaching."* |
| 6 | outside radar coverage | say so plainly; don't fake a forecast |
| 7 | cached data, refresh in flight | show the cached answer, indicate it's updating |

**States 2 and 4 are the ones that matter most.** `end_min === null` means the
rain outlives our 115-minute forecast, so the duration is a **lower bound**, not
a measurement. Design these as visibly distinct from 1 and 3 — an open-ended
spell should *look* open-ended. Never render "at least 75 min" as "75 min".

## Honesty is the product

This app's whole reason to exist is being trustworthy about rain when the map
makes you guess. Two mechanics carry that:

**`confidence`** — `high` / `moderate` / `low`, derived from how far out the
predicted event is. The underlying forecast is advection-only: it slides the
current rain pattern along measured motion vectors without letting cells grow or
decay. So a 20-minute prediction is strong and a 100-minute one is weak, and the
UI should carry that difference rather than presenting all numbers as equal.

**`analysis_age_min`** — how old the radar reading is (typically 0–11 min). Worth
surfacing quietly. It's reassurance, not an error condition.

Both should be *present and legible* without shouting. Prefer honest hedging
words — "about", "at least" — over false precision. Never show a countdown to the
second.

## Intensity scale

Reuse yr.no's palette so anyone who knows the yr map reads this for free. These
boundaries were fitted against 33 836 samples of yr's own rendered tiles — don't
change them.

| swatch | range | label | feels like |
|---|---|---|---|
| `#91E4FF` | 0.03–0.055 mm/h | trace | barely detectable |
| `#5ED7FF` | 0.055–0.195 mm/h | drizzle | mist on your glasses |
| `#00AAFF` | 0.195–1 mm/h | light rain | umbrella optional |
| `#0080FF` | 1–5.7 mm/h | moderate rain | you'll want a jacket |
| `#0055FF` | 5.7–23.7 mm/h | heavy rain | soaked in minutes |
| `#7A0087` | 23.7+ mm/h | torrential | seek shelter |

The **"feels like"** column is the human anchor — "6 mm/h" means nothing to most
people, "soaked in minutes" means everything. Lead with the plain-language label
and keep the number available but secondary.

## Timeline

The `frames` array is 24 points, 5 minutes apart, covering the next ~2 hours.
A compact intensity-over-time strip using the palette above would show *shape*
— rain easing, a gap, a second band arriving — which the headline sentence can't.

Keep it **supporting, not primary**. It should not become the thing the user has
to interpret. If it competes with the headline for attention, shrink it.

## Multiple locations

The user saves a handful of places — home, work, cabin, parents'. All fetch in
parallel and render as a list, each showing its own verdict.

- The list should be scannable: which of my places is wet right now?
- Tapping one expands to the full detail and timeline.
- Adding a location is manual entry (search or coordinates) for now.
- No reordering, grouping, or folders. Keep it flat.

## Scope — design the whole app, we ship the MVP

**Design all three phases.** We will build only the MVP, extracting its
components from your full design. This is deliberate: designing the MVP in
isolation and bolting features on later produces two incompatible time
components and a palette applied three different ways.

Read **`GUI_PLAN.md`** for the full component inventory and phasing. The short
version:

| phase | features |
|---|---|
| **MVP** | verdict · saved locations · manual entry · compact timeline · stale/offline |
| **2** | map view with radar overlay · time scrubber over the full 200-min window · basemap switching (terrain/street/satellite/hybrid) |
| **3** | live geolocation · push notifications |

**The map is a confirmation layer, never the answer.** byge exists because
yr.no's map makes you guess whether that blue blob is heading your way. If a user
must open the map to learn whether it will rain, the design has failed. The map
is a drill-down for seeing *why* — never the landing view, never the default tab,
never the largest element on the verdict screen.

Three couplings that are the whole reason we're designing ahead:

1. **`TimelineStrip` and `TimeScrubber` are one component, two densities** —
   compact and non-interactive in MVP, scrubbable and driving the map in phase 2.
2. **A `LocationCard` is also the map marker popup** — one representation, two
   placements.
3. **One palette source** feeds the intensity badge, the timeline, and the map
   legend. Three implementations is how the map ends up disagreeing with the
   headline.

For the MVP extraction to be clean:

- No MVP component may depend on a phase 2/3 component. The verdict screen must
  render as visually complete with no map present — not with a map-shaped hole.
- `TimelineStrip` must read as finished in MVP, not as a disabled scrubber.
- Phase 3 entry points should be **absent from the MVP, not disabled**. Design
  them in the full comp; the MVP build simply omits them. No greyed-out "use my
  location", no dead notification toggle.

Still out entirely: accounts, onboarding flow.

## Dark and light mode

**Both themes are first-class.** Not a filter applied to one — design each
properly. Default to following the system (`prefers-color-scheme`), with a
manual override available in the MVP. Keep the override small and out of the
way; it is not a feature to show off.

**yr has no dark palette to copy.** Their site darkens its chrome, but the
precipitation tiles are server-rendered PNGs with a single palette and their tile
server offers only one basemap style (`basic` — `dark`/`night` 404). So they
sidestepped this rather than solving it, and we are on our own.

A knock-on for phase 2: if the map renders yr's tiles, **the map stays light even
in dark mode**. Design around that deliberately — a light map panel inside a dark
app needs framing, not an accident.

The hard part is the palette. **The precipitation blues are the app's semantic
colour** — they carry intensity meaning and they were fitted against yr's light
map. In dark mode they must keep:

- **Perceived intensity ordering.** Light rain must still read as lighter than
  heavy rain. The faintest bands (`#91E4FF`, `#5ED7FF`) are pale-on-white by
  design; on a dark background they can appear *brighter* than the mid bands and
  invert the scale. Solve this deliberately rather than letting the hex values
  ride.
- **Distinguishability between adjacent bands**, especially bands 1–3 which sit
  close together.
- **Recognisability.** The point of borrowing yr's palette is that their users
  read ours for free, so the dark variant should still feel like the same scale,
  not a different one.

If dark mode needs adjusted hex values, that is fine and expected — but they must
map one-to-one onto the six bands, stay ordered, and be defined as a *second
named set* rather than computed at render time. The band boundaries in `scale.py`
never change; only their presentation does.

Also theme-dependent:

- **No-data vs dry.** In light mode yr uses white for no-coverage and black for
  dry. Both need dark-mode equivalents that stay clearly distinct from each other
  *and* from the precipitation bands.
- **`theme_color`** in the manifest, and the `<meta name="theme-color">` tags,
  need a variant per scheme so the browser chrome matches.
- Test the verdict screen in both themes at every viewport. The headline is
  typographic, so contrast on the sentence matters more than anywhere else.

## PWA deliverables

The app must be genuinely installable, not merely responsive. Produce everything
required:

**Icon set.** Design the byge mark first — it should work at 16 px. The name
means *a passing shower*, so there is an obvious visual idea (a shower cell, a
band of rain moving through) but don't feel bound to a raincloud cliché; a
distinctive abstract mark would age better. Deliver:

| asset | size | notes |
|---|---|---|
| `icon-192.png` | 192×192 | standard |
| `icon-512.png` | 512×512 | standard |
| `icon-maskable-192.png` | 192×192 | **safe zone**: keep the mark inside the central 80 % circle |
| `icon-maskable-512.png` | 512×512 | same |
| `apple-touch-icon.png` | 180×180 | iOS home screen, no transparency, no rounding (iOS masks it) |
| `favicon.svg` + `favicon.ico` | — | 32 and 16 px legible |
| monochrome variant | 512×512 | for OS themed-icon treatments |

Maskable icons are the one most often got wrong: Android crops them to arbitrary
shapes, so anything near the edge is lost. Design the maskable variant separately
rather than padding the standard one and hoping.

**Manifest** (`manifest.webmanifest`): `name` ("byge"), `short_name` ("byge"),
`description`, `start_url`, `scope`, `display: standalone`, `background_color`,
`theme_color`, `orientation: portrait-primary` (phone) with sensible desktop
behaviour, `categories: ["weather", "utilities"]`, and the full `icons` array
with correct `purpose` values (`any` vs `maskable`).

**iOS specifics**, since iOS Safari ignores much of the manifest:
`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
`apple-mobile-web-app-title`, and **`apple-touch-startup-image` splash screens**.
iOS needs one per device resolution and shows a white flash without them — a
generated set from a single template is fine, but the template needs designing.

**Install experience.** An install prompt/affordance that is present but not
nagging. It should never cover the verdict.

**Service worker**, for the stale-while-revalidate behaviour described under
Technical constraints — cache the shell, cache the last verdict per location,
render instantly on open, refresh in place.

**Offline state.** Installed apps get opened on the train. Show the last known
verdict with its age, clearly marked stale — never an error page, never an empty
screen. An old forecast is still a useful forecast.

## Legal constraints

- **Never use "Yr" in the app name and never use the Yr logo** — both are MET
  trademarks. The app is `byge`. Nothing may imply endorsement by Yr or NRK.
- **Attribution is required and needs a real home** in the design — a footer or
  about sheet, not buried. The data is **NLOD 2.0 + CC BY 4.0**, and the credit
  wording MET asks for is *"Data from MET Norway"* or *"Based on data from MET
  Norway"*, ideally linked.
- Reusing the precipitation palette is fine — the underlying data is CC BY 4.0
  and there is no public yr brand manual restricting it.
- **Yr's weather symbols are CC BY 4.0** ("© 2015 by Yr/NRK") and could legally
  be used. We don't want them — byge is not a weather app and symbols would pull
  it toward one — but the option exists if a location card ever needs an icon.
- **Coordinates are capped at 4 decimals** (5+ returns HTTP 403), which affects
  the add-location flow.

## Technical constraints

- **React PWA**, installable, and genuinely usable on **phone, tablet and
  desktop**. Phone is the primary case — that's where "should I cycle home now"
  gets asked — but the other two are real targets, not afterthoughts.

  Responsive here means the layout *changes*, not that it stretches. Specifically:

  | viewport | shape |
  |---|---|
  | phone | single column. The saved-locations list and the detail view are separate screens. |
  | tablet | two-pane — list beside detail, both visible at once. No navigation needed to compare places. |
  | desktop | same two-pane, but **constrain the reading measure**. A verdict sentence set across 1400 px is unreadable; cap the text column and let the extra width go to whitespace or the timeline, not the prose. |

  The headline verdict stays typographically dominant at every size. Don't let
  the desktop layout promote the timeline or the location list into the focal
  point just because there's room for them.
- **No backend.** MET Norway's endpoints send `Access-Control-Allow-Origin: *`,
  so the browser fetches them directly. Static hosting.
- **Stale-while-revalidate.** A cold fetch of 5 locations takes ~1.7 s. Render
  the last cached verdict *immediately*, refresh in the background, update in
  place. The app should never show a blocking spinner on open — an older
  forecast is still a useful forecast.
- Offline: show the last known verdict with its age, clearly marked stale.

## Aesthetic direction

Open to interpretation — iterate here. Some starting constraints:

- **Calm and Nordic**, not a dashboard. Lots of space, few elements, one clear
  focal point. Closer to a well-set page than to an instrument panel.
- The answer is **typographic first**. A sentence a person can read, not a gauge
  they must decode.
- Colour comes almost entirely from the precipitation palette. Let the rest stay
  quiet so the blues carry meaning.
- It should feel **honest and unhurried** — no urgency, no alarm styling, no
  animated weather. The rain is coming or it isn't.
- Norwegian-friendly typography; the name is Norwegian and the copy may be
  bilingual later. Don't hard-code English strings in a way that blocks that.

Start with the single-location view and get state 1 vs state 2 unmistakably
distinct. The multi-location list follows once that reads well.
