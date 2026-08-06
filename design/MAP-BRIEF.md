# Brief for Claude Design — the map feature

Supersedes `RADAR-MAP-TRANSPORT.md`, which asked a narrower version of question 3.

Two map screens are built and working against live MET radar. One of them
(`RadarMap`) you designed; the other (`/map`) has no design at all and was built
from need. This brief describes what exists, what it cost to make it work, and
the decisions we would like you to make rather than us.

---

## 1. The question that matters most

`RadarMap.dc.html` states byge's position on maps, and states it firmly:

> phase 2, and a confirmation layer only: it shows WHY the sentence says what it
> says. Never the landing view, never a default tab, never the largest thing on
> the verdict screen.

We agree with that, and `/location/<id>/map` honours it exactly — you arrive
from a text link on the verdict, and the sentence is still the answer.

**Then we built `/map`, and it does not fit that position at all.** It is a
radar map with no place, no verdict, and no claim about you: you pan a country
and watch the weather move. It came from two things. The overlay turned out to
be useful beyond a saved coordinate — at sea especially, where the nautical
chart and the coverage boundary matter more than any single point — and once it
existed, it was obviously the most engaging thing in the app.

That last part is exactly why we want you to rule on it. A map that is the most
engaging screen tends to become the front door, and byge's whole argument is
that the answer is a sentence.

**Right now `/map` has no entry point.** Nothing links to it; you reach it by
typing the URL. That is not an oversight we want patched — it is the decision
we are asking you to make. Options as we see them:

- **a.** `/map` does not ship. The anchored map is the only map.
- **b.** It ships, reachable only from About or a footer — present, not promoted.
- **c.** It ships with a real entry point on the list screen, framed as a
  distinct tool ("look at the weather") rather than as byge's main view.
- **d.** Something else, including reframing it for a specific audience —
  the maritime case is genuinely strong and might deserve its own framing.

We have no preference we would defend. We would rather you decided.

---

## 2. What exists and works

Both screens are real, running on live data, and share components rather than
duplicating them.

### `/location/<id>/map` — the confirmation layer (your design)

Built as specified. Map, popup card, basemap switcher, legend bottom-right, and
the expanded `PrecipitationGraph` acting as the scrubber in a bottom bar with
the footnote. Reached from a "See why — radar map →" text link on the verdict,
which is a line of text and not a button, per the design.

Two things we added beyond the file, both marked in code as ours:

- **A dashed boundary around the fetched window.** The window is a fixed 51×51
  km rectangle, and everything outside it renders as untouched basemap — which
  is exactly how the layer draws OBSERVED DRY. A band continuing past the corner
  appeared to end there. The boundary and a footnote sentence say what it is:
  how much radar we asked for, not where the weather stops.
- **Play/pause.** See question 3.

### `/map` — the general map (no design)

Full-bleed map, basemap switcher, legend, zoom controls, playback, and a
tap-a-cell readout. Assembled from the same components. It works; it has never
been designed.

### Components in use

`MapCanvas`, `PrecipitationGraph` (expanded), `LocationCard` (popup),
`SegmentedControl`, `ZoomControl`, `RadarLegend`, `PlaybackControl`,
`CellReadout`, `NavBar`, `Screen`.

The last three have no design file.

---

## 3. Playback and a timeline

`RadarMap.dc.html` wires exactly one time control — the graph, via `onFrame` —
and no transport of any kind. Given how firmly the same file positions the
screen, that reads as deliberate rather than forgotten.

We built **play/pause** anyway, as the smallest thing that adds motion without a
second timeline. Two decisions inside it we would like confirmed or overruled:

- **It stops at the horizon rather than looping.** Every other radar map loops.
  Looping turns a two-hour forecast into wallpaper and hides the moment that
  matters most — the end, where the data runs out and byge starts saying "no end
  in sight". Stopping leaves the reader at that edge. At the end the control
  becomes REPLAY.
- **It never autoplays**, and `prefers-reduced-motion` slows it to 900 ms a
  frame rather than removing it — stepping through frames is how the screen is
  read, so removing the control would take away the point rather than the
  motion.

**We did not build a slider**, because it duplicates the graph's job: two
controls for one quantity, with the graph demoted to a passive readout. Our
read is that the request for one was really a request for AFFORDANCE — nothing
about the graph says "you can drag me", so it reads as a chart that happens to
respond to clicks. A playhead and a drag target on the graph itself would say
it. Your call.

---

## 4. What has no design at all

In rough order of how much we think it matters:

1. **`/map` as a whole** — layout, what chrome belongs on it, how it is framed.
2. **`CellReadout`.** Tap a cell and a card appears bottom-left with the band,
   what it feels like, the exact mm/h, the coordinate and the frame time. It
   deliberately reports a READING, not a verdict — no radius, no spell
   segmentation — because a verdict is a claim about somewhere you care about,
   and inventing one for a point somebody tapped would be byge answering a
   question nobody asked. Is a card right? Should it anchor to the tapped cell
   rather than to a corner?
3. **`PlaybackControl`** — currently a 44 px button and a mono time readout.
4. **The legend at map scale.** `RadarLegend` floats bottom-right with the six
   bands plus no-coverage and dry. On a phone it covers a lot of map.
5. **Loading and partial states.** The map paints a still in ~0.5 s and the
   animation arrives behind it; right now a mono line says "1 km · loading the
   rest of the run…". Also: what a cold, failed, or offline map looks like.
6. **404 and a generic error page.** Neither exists in the design or the build.
   Deep links are real here — `/location/<id>/map` for a deleted place, a
   mistyped URL, a shared link to something gone.
7. **Phone.** Both screens work but neither was designed for it. The bottom bar,
   the floating legend and the readout card all compete for a small screen.

---

## 5. Constraints worth designing around

These come from the data and are not negotiable, but they are also useful —
several are the most honest thing on the screen.

**The grid is 1 km, 24 frames, five minutes apart, 0 to +115 min.** Every square
you see is a real measurement cell. We render at full resolution at every zoom;
a map that quietly coarsens as you zoom out shows a different instrument than
the one it names.

**Three states, never two.** Rain has six bands; but "observed dry" and "no
radar coverage" are different claims and must never be collapsed. Dry is drawn
as untouched basemap. No-coverage is drawn as a distinct fill and named in the
legend. This is the reason we send band symbols rather than rendered tiles —
in a PNG those two are colours, and telling them apart means trusting an RGB
triple to survive a re-encode.

**The radar footprint is far bigger than Norway.** It reaches Denmark, Sweden,
Finland, Germany, the Baltics and as far as St Petersburg. Our basemap is
Kartverket, which stops at the Norwegian border — so panning east currently puts
real radar over blank ground. We are looking for basemaps that cover the whole
footprint; if that changes what the basemap switcher should offer, say so.

**Basemaps available today:** Muted (greyscale topo, the default), Terrain,
Detailed (scanned 1:50 000), Nautical (official sea charts). **There is no
satellite or aerial layer** — Norge i bilder needs a signed agreement, and the
open gateways are dead or keyed. The design file's `satellite` and `hybrid`
options are not features we skipped; they are unavailable.

**Dark mode.** MET renders the radar palette for a light background and has no
dark equivalent. Per your earlier note, the map stays a lit window inside dark
chrome rather than a tinted version of someone else's data. Still true.

**Speed, so nobody designs around a problem we fixed.** Warm, the map paints in
about 150 ms from navigation and holds the full 115 minutes at 1 km for under a
megabyte. Cold, a still appears in about half a second and the animation fills
in behind it. Panning is a memory slice.

---

## 6. What we are not asking

The honesty rules are settled and we would rather they were not reopened:
unobserved is never drawn as an intensity, dry is never a wash, an unknown end
never becomes a number, and the map never autoplays on arrival.

Everything else — layout, framing, whether `/map` ships at all — is yours.
