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

## Explicitly out of scope

Don't build these, and don't leave placeholders for them:

- **No radar map.** The point of byge is not having to read one.
- **No push notifications.** Deliberate — it would require a backend.
- **No live geolocation.** Manually saved locations only. (A "use my position"
  button is a likely later addition, so don't structure the code to make it
  impossible — just don't build it now.)
- No accounts, no settings screen, no onboarding flow, no dark/light toggle
  (follow the system).

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
