# Screen composition notes

Taken from the Claude Design component library (project
`6bbabebb-8532-4f16-b84d-6f68d8bcf3d5`). The design files are not checked in and
**DesignSync is not reachable from agent worktrees** — so the decisions that
shape the screens are recorded here.

## VerdictScreen

**The order is the argument:**

1. answer (`LocationStatusText`)
2. what it feels like (`PrecipitationLevelCard`)
3. how sure we are (`PrecipitationConfidence`)
4. the shape of the next 2 hours (`PrecipitationGraph`)
5. only then a small text link to the map

The headline stays typographically dominant at every size. On desktop the extra
width goes to whitespace and the measure is capped, so a verdict sentence is
never set across 1400 px. The screen renders complete with no map present — the
link is a line of text, not a hole.

**Per-place actions live behind one `⋯` menu, not as bare buttons in the bar.**
Design's reasoning, which is better than putting Edit/Remove inline:

> the bar is for navigation, and a destructive verb should not be one stray tap
> from the answer.

Still a real menu: 44 px trigger, 44 px rows, keyboard reachable, Escape closes.
Never swipe-only.

**Sizes**

| | phone | tablet | desktop |
|---|---|---|---|
| headline | 38 | 46 | 54 |
| measure | 100% | 620 px | 620 px |
| strip height | 46 | 56 | 56 |
| gap after head | 26 | 36 | 36 |

Padding is `14/30/48 px + safe-area-inset-top` on top. The background fills the
screen; only the *content* clears the status bar. The app is standalone, so
nothing else reserves that space.

**Coverage notice** shows when `blind || partial`. `hasReading` is `!blind` —
a blind location gets no badge, no strip and no confidence, because there is no
claim to rate.

## Remove copy

> This deletes the place and its last saved answer from this device. byge has no
> account and no sync, so there is nothing to restore it from.

Detail line: `place · coords · radius km`. Confirm label: `Remove <name>`.
