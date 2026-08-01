# Feedback to Claude Design — round 1

Sent after importing `byge.dc.html` and checking every scenario against the real
model in `forecast.py` / `scale.py`.

---

This is very good. Before the corrections, the things that must survive the next
revision — I'd rather over-specify what to keep than have it regress:

- **The four-signal treatment of open-ended spells.** Grammar swap, dotted
  underline on the bound, the superscript `→`, the monospace footnote, and the
  strip running off its own right edge with `+115 ⇥`. That is exactly right.
  Redundancy is the point — no single one of those carries it alone.
- **The dark palette.** Inverting the luminance ramp so intensity rises with
  brightness on dark is the correct solve, and your own note names the failure
  mode precisely. Don't touch the values.
- **No-data as hatched white everywhere it appears**, and the Svalbard copy —
  *"This is not 'dry'. We have no observation at all."* Keep that sentence.
- **The maskable icon redrawn at 68% inset rather than padded.** Most designs
  fake this. Yours doesn't.
- The map reachable only via "See why", the 620px measure cap, the two couplings
  labelled in situ, and the non-endorsement line.

Now the corrections. We've verified these against the live data and the shipped
model, so treat the numbers below as authoritative.

## 1. You were right about confidence — we're changing our code

Your scenarios 2 and 5 label confidence `high` where our `forecast.py` computes
`low`. We checked, and **your reading is the correct one**. Labelling *"it is
raining on you right now"* as low-confidence is absurd. We're changing the model
to match you.

The rule we're implementing, so you can rely on it:

> **Confidence describes the weakest link in what we are actually asserting.
> Observations are certain; only forecast *leads* decay.**

| verdict | confidence keys off | typical |
|---|---|---|
| raining, end visible | the predicted end (`end_min`) | high if soon, low if 100 min out |
| raining, open-ended | the observation — it *is* raining | **high** |
| dry, rain incoming | the predicted arrival (`start_min`) | scales with lead |
| dry, nothing approaching | the observation — the field *is* clear | **high** |
| no coverage | not shown at all | — |

One consequence to design for: when confidence is `high` because the
*observation* is certain, **the forecast half of the claim still has to be hedged
somewhere.** For state 2 you already do this ("no end in sight" + footnote).
**State 5 currently doesn't.** Its note talks about the sub-threshold trace, which
is good, but nothing tells the reader that "nothing approaching" is a strong claim
for the next half hour and a weak one at +115.

Please add that to state 5 — two claims of different strength, not one flat
sentence. Something in the spirit of: near term confident, the far end
indicative only. The badge stays `high`; the prose carries the decay.

## 2. State 3's duration is wrong — it contradicts its own data

Your `s3` rates are `Z(8) + [0.8, 2.4, 3.1, 1.6, 0.1] + Z(11)`.

Threshold is `0.195 mm/h`. So indices 8–11 are wet and index 12 (`0.1`) is dry:

```
start = 8 × 5  = 40 min      ✅ matches your copy
end   = 12 × 5 = 60 min
duration = 60 − 40 = 20 min  ❌ your copy says 25
```

We ran your array through the shipped model to be sure. It returns
`next 40..60 (dur 20)`.

Either change the copy to **20 min**, or make index 12 wet (e.g. `0.9`) so the
duration really is 25. Prefer the latter if you like the roundness — but the
numbers must derive from the array, not sit beside it.

**The convention, so it's unambiguous:** `end_min` is the time of the **first
observed dry frame**, not the last wet one. Each frame stands for the five
minutes after it, so 21 wet frames occupy 105 minutes and clear at T+105. This
errs conservative in the honest direction — we never claim rain stopped earlier
than we saw it stop.

Also: `s4`'s status string hardcodes `at least 75 min`. It happens to be right
(115 − 40 = 75), but derive it, so it can't drift.

## 3. Missing state: rain that stops and then comes back

This is the significant gap, and it's a gap in **our** layer too — we're fixing
ours in parallel.

Our `Verdict` carries **two** spells: `current` (the one you're in) and `next`
(the one after). None of your six scenarios exercises both, so the design has no
answer for the single most common real pattern.

It isn't hypothetical. Here's a genuine reading we pulled off the radar for the
Trøndelag coast, disc coverage per 5-minute frame:

```
T+0    81% ████████████████
T+30   87% █████████████████
T+60   32% ██████
T+75    6% █
T+85    3%                  ← clears
T+100  16% ███
T+115  53% ██████████       ← and a second band arrives
```

"Raining, stops in about 85 min" is *true* and *misleading*. The useful answer is
**"Raining. Eases around 18:15 — then more from 18:30."**

Please add two scenarios:

- **State 8 — raining now, ends, second spell arrives before the horizon.**
  Both spells visible on the strip with the dry gap between them legible.
- **State 9 — dry, rain arrives, clears, and more follows.**

Design question we'd like your answer to: does the second spell get equal
billing in the headline, or a secondary line beneath it? Our instinct is
secondary — the first spell is what the user acts on — but the gap must not be
invisible, because "it'll clear at 6" is exactly the sentence someone plans
around.

Note we bridge dry gaps shorter than 10 minutes into a single spell (one dry
frame mid-shower is drizzle flicker, not the end of the rain). So a gap you draw
must be **at least three frames** to be real.

## 4. The Add-a-place flow gets a map, a locate button, and a radius

This is new scope and it moves the phase boundary, deliberately. Read §4.4 for
what that costs.

### 4.1 A map picker, centre-pinned

The place picker becomes a map with a **fixed marker at the centre of the
viewport**. The user pans the map; the marker stays put; the coordinate under it
is the selection. No dragging a pin — pan the world beneath a fixed crosshair.
It's steadier on a phone and it keeps the target under the thumb rather than
beneath it.

Search and manual coordinate entry stay. All three set the same value, so the map
should recentre when a search result is picked, and the coordinate readout should
live-update as the map moves.

Coordinates stay clamped to **4 decimals** (MET returns 403 above that). Keep
your existing note — it's good, and now it has somewhere to sit.

### 4.2 "Use my location"

A one-shot button that centres the map on the device position, then behaves
exactly like a pan. The user still confirms.

**Distinguish this clearly from the Phase 3 feature.** They are not the same
thing and shouldn't look the same:

- **MVP — "use my location":** a one-shot pick while adding a place. Permission
  requested at the moment it's tapped, never on load.
- **Phase 3 — "live position":** a continuously-updating verdict for wherever you
  are. Still absent from the MVP.

Design the permission-denied state. On iOS this is a dead end the user can't
resolve in-app, so the copy has to send them to Settings without being useless
about it.

### 4.3 Radius — and a modelling bug it exposes

Radius already exists in our model (`probe(lat, lon, radius_km)`); it has simply
never been exposed. Showing it as a circle on the map is right.

**But wiring the UI straight to the current model would ship a bug.** We tested
one real coordinate, changing only the radius:

```
 radius   coverage   verdict
   1 km      100%    Raining — 0.7 mm/h, light rain
   3 km      100%    Raining — 1.9 mm/h, moderate rain
   5 km       90%    Raining — 4.2 mm/h, moderate rain
  10 km       43%    Raining — 4.2 mm/h, moderate rain
  15 km       22%    DRY — rain arrives in about 25 min
  25 km       11%    DRY — nothing approaching
```

Rain is falling on this person. Widening their radius tells them it's dry. That's
because "raining" currently means *≥25 % of the disc is wet*, and a bigger disc
dilutes the same patch. The control would invert its own meaning.

**The rule we've decided on: if any rain touches the radius, it's raining for
that location.** One wet cell anywhere inside the circle counts. The 25 %
coverage gate goes away.

This is simple, it matches what someone means when they draw a circle round their
place, and it makes the control monotonic — wider is always *more* sensitive,
never less. Verified at the same coordinate:

```
 radius   coverage   OLD (≥25%)          NEW (any touch)
   3 km     100%     raining, ends +25   raining, ends +35
  10 km      43%     raining, ends +40   raining, no end in sight
  15 km      22%     DRY                 raining, no end in sight
  25 km      11%     DRY                 raining, no end in sight
```

**One consequence you should design around.** Because any single wet cell counts,
wide radii saturate: at 10 km and above this location becomes *"raining, no end
in sight"* for the whole horizon. In Norway, "some rain somewhere within 15 km in
the next two hours" is very nearly always true. The answer stops discriminating.

Two things follow:

1. **The 3 km default is load-bearing.** It's what keeps the verdict about *you*.
   The wide end of the control should feel like a deliberate choice — "watch this
   whole valley" — not a neutral slider position.
2. **Worth distinguishing where the rain is.** The boolean stays as decided, but
   the headline can still tell the difference between rain on the centre cell and
   rain only clipping the edge — *"Raining."* versus *"Rain within 8 km."* Same
   rule, more useful sentence. We'd like your take on whether that earns its
   complexity, or whether one flat "Raining." is better.

`coverage` remains in the data (fraction of the circle that's wet) and is now
purely expressive rather than a gate — it's the natural thing for the timeline
strip's bar heights to encode, since it says how much of *your* place is under
rain. See §7, which currently double-encodes rate instead.

For the map, the circle is a single ring at the chosen radius. No inner core
needed under this rule.

**Numbers for the control:**

- **Default 3 km.** Sensible for a home.
- **Cap at 25 km.** Beyond that payload gets silly — see below.
- Our grid is 1 km, so radius below ~2 km buys nothing real. Consider 2 km as the
  floor.

Fetch cost, measured live:

| radius | payload | fetch |
|---|---|---|
| 3 km | 7.9 KB | 1.3 s |
| 10 km | 57 KB | 1.3 s |
| 25 km | 350 KB | 1.3 s |
| 40 km | 995 KB | 1.4 s |

**Time is flat** — it's server latency, not transfer — so the only real cost is
bytes on a phone plan. That's the argument for the 25 km cap, and it's worth a
quiet word in the UI at the wide end rather than a hard stop with no explanation.

### 4.4 What this does to the phasing

A map picker pulls **MapLibre + a basemap into the MVP**, and "use my location"
pulls **the geolocation permission** in with it. Both were later phases.

The radar overlay, the time scrubber, and the full basemap switcher stay in
Phase 2 — the picker needs a basemap, not weather on it. But the map is now
MVP infrastructure, so please design the picker so it shares its map component
with the Phase 2 radar view rather than being a separate one-off. Same coupling
logic as `TimelineStrip`/`TimeScrubber`.

## 5. No, we don't want a Settings page in the MVP

We looked at what would actually be in it:

- **Theme** — the only genuinely global preference.
- **Radius** — per-location, so it belongs in Add/Edit, not Settings.
- **Position and notifications** — Phase 3, and absent by rule.

That leaves one control, which doesn't earn a screen. **Put Appearance in About**
and drop Settings from the MVP entirely. Keep your Settings design as the Phase 3
shell — it's good, it's just not shipping yet.

This also resolves the extraction violation: Appearance was trapped inside a
screen marked `PHASE 3`, while being MVP itself.

`System` still needs a designed selected-state — in the prototype it silently
resolves to `light`, so we can't see what following the system looks like.

## 6. The swatch key needs to become a real legend

`FILLED = RAINING NOW · OUTLINE = ON THE WAY · HATCHED = NOT OBSERVED` is doing
useful work — the swatch language is genuinely good, and non-colour encoding is
worth keeping — but as a line of 8.5px all-caps monospace above the list it reads
as debug output. It's also the first thing on the screen, which inverts its
importance: it explains the list before the user has seen the list.

Make it a **collapsed disclosure beneath the locations list** — a labelled row
that expands in place and remembers its state.

Avoid "marker" in the copy: once `MapField` and `RadarMap` exist it will mean
map pin. Our suggestion is **"Reading the list"** — it names what the disclosure
explains rather than the glyph, so it survives the swatch being redrawn. Keep
`Swatch` for the list glyph and `Marker` for map pins throughout, in code and in
copy.

Collapsed rather than always-visible because nothing in the app is explained
*only* by the legend: `PrecipitationLevelCard` shows swatch + label + feels-like
+ rate together, and list rows carry status text in words beside the swatch. The
colours and shapes are scanning aids, never the sole carrier. That makes the
legend one-time orientation, and one-time things can be collapsed.

But **a disclosure in position, not an icon in a corner.** A labelled row where
the legend would be is discoverable; a "?" in the nav bar is hidden, and nobody
taps it. Expanded, give it room — the three swatch states at real size with
sentence-case labels, not a caps string.

Consider folding the intensity ramp into the same legend, so there's one place
that explains the visual language rather than a swatch key on the list and a
colour ramp buried in the map. That legend is also the natural home for a plain
sentence about what "not observed" means, which currently only appears if you
happen to open the Svalbard state.

On the verdict screen it shouldn't appear at all — there's one swatch there and
the badge already labels it in words.

## 7. Manual refresh

Add a user-triggered update. Auto-refresh on a 5-minute cadence is right, but
someone standing under an awning watching the sky wants to force it.

- **Pull-to-refresh** on phone, plus a tappable affordance for desktop and for
  accessibility — pull-to-refresh alone is not reachable by keyboard.
- Design the **in-flight** state. A cold fetch is ~1.3 s, so it's visible.
  It should feel like a refresh of live content, not a page load — the existing
  verdict stays on screen and updates in place.
- **Design the "nothing new" outcome, and be honest about it.** Analyses publish
  every 5 minutes with 0–11 minutes of lag, so a manual refresh will often find
  *the same file it already has*. Do not fake a change. Something like
  *"Already the latest — radar 3 min old"* is the correct answer and needs a
  designed state, otherwise it will get implemented as a spinner that resolves
  into no visible change and reads as broken.
- Refresh failure while a cached verdict exists is the **error-vs-offline**
  distinction from §8 — the old verdict stays, with a note that the refresh
  failed.

## 8. States you haven't designed

The component inventory listed these; they aren't in the file:

- **`EmptyState`** — no locations saved yet. First run. This is the actual first
  impression of the app and currently doesn't exist.
- **First-fetch / cold load.** Stale-while-revalidate means we render cache
  instantly — but on first ever run there is no cache. What fills the verdict
  screen for those ~1.7 seconds? It must not be a spinner that looks like
  failure.
- **Error, as distinct from offline.** Your stale banner covers "we're offline,
  here's the old verdict". It does not cover "we're online, MET is down or the
  request failed, and we have nothing". Those are different messages, and the
  second one must not be dressed up as the first.

## 7. Timeline strip: height and colour disagree at the top end

Bar height is `sqrt(rate / 6) × 100`, which saturates at **6 mm/h**. But the
palette keeps climbing to 23.7+ (`heavy` → `torrential`).

So a 6 mm/h cell and a 20 mm/h cell are **the same height** while being visibly
different colours. Two encodings of one quantity that stop agreeing exactly where
the weather gets serious.

Either let height keep rising to the top of the scale (log or cube-root, so the
low end stays readable), or drop height as an intensity encoding and let it mean
something else. Our preference is the former — but they have to agree.

## 8. Smaller items

- **`theme_color` disagrees with itself.** The manifest says `#0B2A3A` (the
  icon's navy); the head tags say `#F6F4F0` light / `#0E1113` dark. Pick one
  story — we'd take the head tags' per-scheme pair and set the manifest's to the
  light value.
- **Manifest gaps:** no `scope`, no `id`, and the maskable icon entries are
  missing `"type": "image/png"`.
- **iOS splash:** you show one media query (430×932 @3x) and note "one per device
  class, light + dark". The deliverable needs the actual set — at minimum the
  current iPhone sizes in both schemes.
- **Touch targets.** The back button and harness chips are 30×30. Minimum 44×44
  for anything a thumb hits in the real app.
- **Install prompt timing.** It renders immediately on first load, which reads as
  nagging. Show it after a second visit, or after a location is saved.
- **State 5's badge reads `0.0 mm/h`** while its own note says radar sees a trace
  at +80. Not wrong — the trace is below the threshold — but the two sit next to
  each other and look contradictory. Consider `<0.1 mm/h` or wording that
  reconciles them.
- **Accessibility** isn't addressed anywhere. Intensity is carried by colour plus
  height, which is reasonable, and the filled/outline/hatched swatch language is
  genuinely good non-colour encoding — please extend that thinking to focus
  states and check contrast on the pale light-mode bands, which are the weakest
  point.

## 9. No-coverage detection — we had the bug you designed against

You asked the right question, so here's the honest answer: **we were not
detecting it.** Your state 6 was designed against a model that couldn't produce
it.

`_FillValue` cells — places the radar mosaic cannot see — were being counted as
*not wet*, which is to say, as dry. A location in the North Sea with **49 of 49
cells unobserved** returned:

```
"No — dry now, and nothing approaching."
```

Character-for-character identical to Oslo, which genuinely is dry and observed.
The most confident wrong answer the program was capable of producing, and it was
in the layer enforcing the principle everywhere else.

**Fixed.** There are now three coverage states, and the design needs the third:

| state | meaning | designed? |
|---|---|---|
| `observed = 1.0` | radar sees the whole circle | yes |
| `observed = 0.0` | **blind** — no observation at all | yes, your state 6 |
| `0 < observed < 1` | **partially seen** — part of the circle is off the mosaic | **no** |

The partial case is real and reachable: coastal and border locations with a wide
radius will straddle the mosaic edge. It matters because the answer is drawn from
less than the user asked for. We now say so —

> *"Radar sees only 60 % of your area — the rest is outside coverage and not
> included either way."*

— but it needs a designed treatment. Our suggestion: the radius circle on the map
renders the unobserved arc in the hatched no-data fill, so the shortfall is
visible in the same visual language as state 6 rather than only stated in words.

Two smaller notes:

- **Coordinates outside the Nordic grid entirely** (Svalbard, your state 6) used
  to raise an exception. It now returns a proper no-coverage verdict — a fair
  question about a real place deserves an answer, not a crash.
- **Confidence is not shown for blind locations**, which your design already gets
  right. Keep that.

## What we're changing on our side

So you're not designing against a moving target:

All of this is **already done and pushed** — 76 tests passing — so you're not
designing against a moving target:

- `confidence` now follows the observation-vs-forecast rule in §1. Open-ended and
  no-rain verdicts report `lead_min = 0` and read as `high`.
- `describe()` reports the **second spell** (§3). It previously dropped `next`
  entirely once it was already raining.
- The wet rule is **any rain touching the radius** (§4.3). `COVER` is gone.
- `Frame` gains `observed`; `Verdict` gains `observed` and `blind` (§9).
  Unobserved cells no longer count as dry.

Unchanged: the `Verdict` / `Spell` shapes in `README.md`, and `scale.py`'s fitted
boundaries.
