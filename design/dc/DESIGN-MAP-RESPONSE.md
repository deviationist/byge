# Response — the map feature

Answers to `Brief for Claude Design — the map feature`. Drawn in
`Specimen-Map.dc.html`; the rulings are at the top of that file too.

---

## 1 · Does `/map` ship? Yes — (c), with (d)'s framing

It ships, with a real entry point on the list screen, framed as a separate
instrument.

Two reasons. It answers a question the anchored map cannot: *where is the
weather*, for someone whose place is moving. The maritime case is the strongest
version of that — a sea chart and a coverage boundary are exactly what that
reader needs, and a saved coordinate cannot serve them. And refusing to ship it
because it is engaging would be the wrong lesson from the right worry.

**The worry is real, so the guards are structural rather than tonal.** The risk
is not that the map exists; it is that the map becomes the front door.

- Never a tab bar, never the landing view, and the launcher always opens the
  list. **The app must not remember the map as "where I was."** If there is
  last-route restoration, exclude this route.
- The entry point is a line of text below the legend on the list screen —
  "Radar map · look at the weather, no place attached →" — the same weight as
  "See why — radar map →" on the verdict. Not a card, not an icon, not a tile.
  It sits *under* the places, so the places are still what that screen is about.
  Add a matching row in About.
- **The screen states its own limit.** The header reads *Radar*, and beneath it,
  "A reading of the radar. No place, so no verdict." A screen with no place
  cannot produce a verdict, and it should say so rather than let the absence be
  noticed.
- **The exit is the sentence.** Tapping a cell offers "Save this point as a
  place", which turns browsing into the thing byge does.

Not (b): About-only is hiding it out of nervousness rather than judgement. If it
ships it should be findable.

New file: `RadarBrowseScreen.dc.html`. Phone and desktop both drawn, plus the
maritime case on the nautical chart.

## 2 · Both additions to the anchored map were right

The dashed boundary around the fetched window is the same principle as the
coverage mask — unobserved must never render as observed-dry, and "we only asked
for 51 km" is exactly that. Keep it and keep the footnote.

## 3 · Playback

**Stopping at the horizon: confirmed.** Looping is the convention and the
convention is wrong here. It turns a two-hour forecast into wallpaper and erases
the single most important frame — where the data runs out. Stopping leaves the
reader at the same edge the sentence means by "no end in sight". REPLAY at the
end makes the stop a state rather than a failure. When the spell is open-ended,
the control now says so at the horizon in one line.

**No autoplay: confirmed.** Arriving into motion means the first frame a reader
sees is not the present, and the present is the frame the verdict is about.

**Reduced motion slowing rather than removing: confirmed.** 380 ms normally,
900 ms when the OS asks for less.

**No slider — your read was right, and it was an affordance problem.** A slider
would be two widgets for one quantity, with the graph demoted to a passive
readout. `PrecipitationGraph` expanded now carries a **playhead**: a full-height
rule, a 12 px knob, small ‹ › cues, and a pointer **drag across the whole
strip** rather than one click per column. One time control, and now it looks
like one.

New file: `PlaybackControl.dc.html`.

## 4 · What had no design

**`/map`** — `RadarBrowseScreen.dc.html`. Header names the screen and its limit;
transport and strip in a bottom bar; legend bottom-right; basemap switcher
bottom-left; exit to places top-right.

**One time component, not two.** The strip on `/map` is the same
`PrecipitationGraph`, expanded, with a new `subject="viewport"`: bar height is
the share of the **visible map** under rain. That is real and computable with no
saved circle, so the graph stays meaningful and no third control gets invented.
Same encoding, same two channels, different subject.

**`CellReadout`** — a card, **tethered to the tapped cell**, not parked in a
corner. A reading is a statement about one square kilometre; a corner card
leaves the reader to remember which square they hit, and on a running animation
that link is gone within two frames. It flips above the cell when the tap lands
low, tail and all.

It stays a reading, and your reasoning for that is the load-bearing part: no
duration, no bound, no radius, no spell segmentation. A verdict is a claim about
a place someone told us they care about. It carries the band, what it feels
like, the exact rate, the cell, the frame time, the resolution — plus one line
saying what it is not, and the save action.

**`MapLegend`** — new, separate from `PrecipitationLegend`, because a legend at
map scale is a different problem. Collapsed it keeps a six-band colour **spine**
and drops the band names; what it never drops is **"no radar" and "dry"**. The
ramp is learnable and anyone who knows yr's map reads it already. Those two are
not guessable — they look like absence, and absence is the thing this design
refuses to leave ambiguous. Density follows the MEASURED pane height rather than the device label — a full
legend is ~240 px, so on any pane under ~520 px it would push the floating stack
up into the header. Short pane, spine; tall pane, words.

**404 and errors** — `ErrorScreen.dc.html`, one component, four cases, because
they differ only in what they can honestly say: `deleted` (the only one that
names a cause, because it is the only one we know), `notFound` (shows the path —
a truncated shared link is the likely cause and the path is the evidence),
`offline` (nothing broken, nothing lost, so the tone is not failure), `crash`
(the one case we cannot explain, so it does not pretend to). Attribution rides
along; MET's licence does not lapse on an error page.

**Phone** — drawn for both map screens. The rule is one floating thing at a
time: when a readout opens, the basemap switcher yields. Legend compact, strip
shorter, switcher full-width.

**Loading and partial** — the mono line is right in kind. Put it in the bottom
bar beside the transport rather than over the map, so a still frame is never
overlaid by text about itself. Cold, failed and offline map states should use
`ErrorScreen` in the pane rather than an empty map with a message on it.

## 5 · Constraints

**Basemaps: four, muted first.** `satellite` and `hybrid` are removed from
`MapCanvas` and both switchers — an option we cannot serve is a promise we
cannot keep. **Muted is the default**: a basemap under a data overlay should
lose every argument with the data, and greyscale topo is the only one of the
four that reliably does.

**Beyond Kartverket.** Blank ground is itself a claim if it goes unnamed — it
reads as *the data ended*. `MapCanvas` now takes `offBasemapWidth` and draws
that region as a distinct neutral field labelled "no basemap here · radar still
valid". If you do find an international layer, it belongs in the switcher as a
fifth option rather than as a silent substitution, since the two do not agree on
detail.

**1 km at every zoom: agreed, and worth keeping.** The graticule in `MapCanvas`
now matches the radar cell pitch exactly, so a patch fills one square — the map
reads as sampled data on a fixed grid, which is what it is.

**Dark mode.** Still a lit window inside dark chrome. Unchanged.

## 6 · Not reopened

The honesty rules stand.

---

## Files

New: `RadarBrowseScreen`, `CellReadout`, `PlaybackControl`, `MapLegend`,
`ErrorScreen`, `Specimen-Map`.

Changed: `PrecipitationGraph` (playhead + drag + `subject`), `MapCanvas` (four
basemaps, off-basemap field, square cells matched to the graticule), `RadarMap`
(basemap options), `LocationsScreen` (radar entry row).
