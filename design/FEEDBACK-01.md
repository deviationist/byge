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

**The fix — two radii, one visible.** We're restructuring the model so that:

- **"Is it raining on me"** is answered by a **fixed inner core of ~2 km**, which
  is roughly the limit of radar positional accuracy anyway. It does not change
  when the user changes their radius.
- **The user's radius is a watch area** — "the place I care about", a garden or a
  whole valley. It drives *approach*: how early we see a band coming, and how far
  out "nothing approaching" is claiming.

So a bigger radius makes byge **see further ahead**, never less certain about
right now. That matches what someone means when they drag it wider.

For the design this means the circle on the map wants a legible two-part
reading — a small solid centre (what's falling on you) inside a larger soft ring
(what we're watching). Worth exploring whether both are drawn or only the outer.

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

## 6. States you haven't designed

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

## What we're changing on our side

So you're not designing against a moving target:

- `confidence` moves to the observation-vs-forecast rule in §1.
- `describe()` gains the second-spell sentence from §3 — it currently drops
  `next` entirely when it's already raining, which is the same bug.
- Nothing else. The `Verdict` / `Spell` shapes in `README.md` are unchanged, and
  `scale.py`'s boundaries stay as fitted.
