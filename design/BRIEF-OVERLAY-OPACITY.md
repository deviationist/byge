# Brief for Claude Design — overlay opacity

For design project `6bbabebb-8532-4f16-b84d-6f68d8bcf3d5`. Written after the map
round; companion to `DESIGN-MAP-RESPONSE.md`, which this touches in two places.

## What is being asked for

A control that lets the reader change how opaque the precipitation overlay is.
It is fixed at `0.82` today. The reason people want it is concrete: at a glance
the radar hides the coastline, the fjord or the road they are using to locate
themselves, and they want to see through it without losing it.

## What changed underneath since your last round, because it matters here

**Every basemap now covers the whole radar footprint.** Kartverket's four layers
turned out not to be basemaps at all — their tiles are RGBA and fully
transparent wherever they do not apply (measured: 0 % opaque over Hamburg, 55–66 %
over Oslo, the rest being water). So they are overlays that had nothing beneath
them, which is why the map was white across most of the radar's range. There is
now a muted global layer (CARTO Positron, OpenStreetMap data) permanently
underneath, and the Norwegian sheets draw on top of it.

That is relevant to this brief because **the reason to lower the overlay is now
always a real map rather than sometimes blank paper.**

## Our recommendation, for you to accept or overturn

**Put it inside the existing basemap dropdown**, below the four layer rows and a
rule, rather than behind a new settings button.

1. It is adjusted WHILE LOOKING. The whole value is watching the effect, so a
   screen you navigate away to breaks the loop the control exists to serve.
2. It is the same decision as the basemap, in two parts. The reason to lower the
   overlay is to see what is underneath; the picker is what chooses what is
   underneath. "What is under the radar, and how much of it can I see" is one
   question.
3. It costs no new chrome. Your phone rule is one floating thing at a time, and
   the map already carries a header, a legend, a picker, zoom buttons and a
   transport bar. A fifth floating element holding a single control is the
   version of this we would regret.

Against a separate settings button: it would exist to hold one thing, and the
map is the only screen that has it, so it is not really "settings" — it is this
menu with an extra row.

## The honesty question, which is yours to rule on

**We think it must not reach zero.** A fully transparent overlay over a clean
basemap looks exactly like "no rain" — the app would be showing a confident,
legible, wrong answer, which is the one thing it is built not to do. Nothing on
screen would say the data had been hidden rather than being absent.

Options, in the order we would rank them:

- **Floor it** at something like 0.35, so the field is always at least faintly
  present. Simple, and nothing can ever read as dry when it is not.
- **Allow zero but say so** — the legend or the transport line states "radar
  hidden" while it is off. Honest, but it puts a warning on screen to license a
  state nobody needs.
- **Allow zero silently.** We think this is wrong and are not proposing it.

Related: should lowering opacity also affect the NO-COVERAGE hatch? Our instinct
is no — "we cannot see here" is not intensity data, and fading it makes
unobserved ground converge on observed-dry, which is the distinction the whole
app turns on. But that means the hatch stays put while the rain fades, and you
may have a better answer for how that looks.

## What we need from you

1. Placement — the dropdown row, or something else.
2. The control itself. We have no slider anywhere in the app yet: the closest
   things are `SegmentedControl` and `RadiusField`. A slider is a new primitive,
   and if three or four steps would do (`RadiusField`-style) that is one fewer
   thing to design, build and make keyboard-accessible.
3. The floor, per above.
4. Whether the setting persists. The map's centre and zoom now do, under
   `byge.map.view`. Opacity feels the same in kind — a property of how someone
   reads a map, not of a place.

## Not being asked

Nothing about the basemaps themselves, the legend, or the transport. This is one
control and where it lives.
