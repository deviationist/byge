# RadarMap: does a timeline belong here?

A question for Claude Design, raised by the build. `RadarMap.dc.html` is
implemented and working against real MET data — this is about one thing the
design file does not cover.

## What the file specifies

Exactly one time control:

```html
<dc-import name="PrecipitationGraph" density="expanded"
           height="{{ scrubH }}" onFrame="{{ onFrame }}" showCaption="{{ false }}" …>
```

`onFrame(min)` sets `minutes`, and `frameIndex = round(minutes / 5)` drives the
map. No play control, no slider, no transport of any kind.

That reads as deliberate rather than omitted, because the same file is emphatic
about what the screen is:

> phase 2, and a confirmation layer only: it shows WHY the sentence says what it
> says. Never the landing view, never a default tab, never the largest thing on
> the verdict screen.

The graph-as-scrubber follows from that: one object is both the display and the
control, and the screen never grows a second timeline.

## What was asked for

Playback, and a slider to move through time in both directions.

## What was built, and why only half

**Play/pause: built.** It drives the frame the graph already selects. One
button, no second timeline, and the graph stays the display. Two decisions
inside it that are worth ruling on:

- **It stops at the horizon rather than looping.** Every other radar map loops.
  Looping turns a two-hour forecast into wallpaper, and it hides the moment that
  matters most — the end, where the data runs out and byge switches to "no end
  in sight". Stopping puts the reader at that edge and leaves them there.
- **It never autoplays**, and `prefers-reduced-motion` slows it to 900 ms a
  frame rather than removing the control. Stepping through frames is how this
  screen is read, so removing it would take away the screen's point rather than
  its motion.

**The slider: not built.** It duplicates the graph's job. Two controls for one
quantity sitting next to each other, and the graph demoted to a passive readout
of the slider — which loses the property that makes the current design tight.

## The question

Given the screen's stated position, which is right?

1. **A separate slider under the graph.** Explicit, conventional, and what was
   asked for. Costs the "one object" property and puts two time controls on a
   screen whose whole argument is restraint.

2. **Make the graph a real scrubber.** No new control: a visible playhead, drag
   anywhere on it, keyboard arrows. This is the design's own idea taken to its
   conclusion — the graph is already the timeline, it just does not currently
   *look* draggable, which may be the actual problem behind the request.

3. **Neither — playback is enough**, and the current click-a-bar scrub is the
   intended interaction.

Recommendation from the build side: **(2)**. The request for a slider is
plausibly a request for *affordance* rather than for a second control — nothing
about the graph currently says "you can drag me", so it reads as a chart that
happens to respond to clicks. A playhead and a drag target would say it.

## Not a question

The map is not becoming the landing view, and playback does not autoplay. Both
follow from the file and neither is up for negotiation from this side.
