"""
The decision layer: three questions, honestly answered.

  1. Is it raining here right now?
  2. If yes  -> when does it stop?
  3. If no   -> will it start, and if we can see the end, how long does it last?

Everything comes from one 5-minute radar analysis covering T+0..T+115 min.
Because the horizon is finite, a spell that is still going at the last frame
has an *unknown* end -- we say so rather than inventing one.
"""

from __future__ import annotations

from dataclasses import dataclass

import radar
import scale

# "Raining on you" starts at yr's band 3 (0.195 mm/h) -- the first level a
# person actually notices. Bands 1-2 are radar seeing moisture you would not
# call rain. See scale.py for how these were fitted.
WET = scale.NOTICEABLE

# A dry gap shorter than this is drizzle flicker, not the end of the rain.
BRIDGE_MIN = 10


def is_wet(f: radar.Frame) -> bool:
    """Any rain touching the radius counts as rain at that location.

    The radius is the area the user cares about, so one wet cell inside it is
    rain there. This also keeps the control monotonic: widening the radius is
    always *more* sensitive, never less. The earlier rule (">= 25 % of the disc
    wet") inverted itself -- with rain falling on you, widening the radius
    diluted the fraction and flipped the verdict to dry.

    A blind frame is neither wet nor dry, and must never be reported as dry.
    """
    return not f.blind and f.coverage > 0


def intensity(rate: float) -> str:
    """Human label for a rate, on yr's own colour scale."""
    return scale.band_of(rate).label


@dataclass
class Spell:
    """A contiguous run of wet frames."""
    start_min: int
    end_min: int | None      # None => still raining at the forecast horizon
    peak_rate: float
    mean_rate: float

    @property
    def open_ended(self) -> bool:
        return self.end_min is None

    def duration_min(self, horizon: int) -> int:
        """Minutes of rain. For an open-ended spell this is a lower bound."""
        return (self.end_min if self.end_min is not None else horizon) - self.start_min


@dataclass
class Verdict:
    raining_now: bool
    now_rate: float
    current: Spell | None    # the spell you are standing in
    next: Spell | None       # the next one to arrive
    horizon_min: int
    analysis_age_min: float
    frames: list[radar.Frame]
    observed: float = 1.0    # fraction of the radius the radar can see

    @property
    def blind(self) -> bool:
        """Outside radar coverage. Not dry -- unobserved. Never conflate them."""
        return self.observed == 0.0

    @property
    def lead_min(self) -> int:
        """How far out the *predicted* part of the claim sits.

        Not zero just because it is raining now: "stops in 100 min" is a
        100-minute-lead claim and deserves to be labelled as one.

        Open-ended and no-rain verdicts have no predicted moment at all -- what
        they assert is an *observation* -- so they report 0 and let `confidence`
        treat them as certain. Their forecast half is hedged in the prose
        instead ("no end in sight", "that far out is indicative only").
        """
        if self.raining_now:
            s = self.current
            return 0 if s.open_ended else s.end_min
        if self.next is not None:
            return self.next.start_min
        return 0

    @property
    def confidence(self) -> str:
        """How much to trust this.

        Observations are certain; only forecast leads decay, and advection
        nowcasts decay fast. So "it is raining on you" is high confidence even
        when we cannot see the end -- labelling that `low` would be absurd.
        """
        lead = self.lead_min
        if lead <= 30:
            return "high"
        if lead <= 60:
            return "moderate"
        return "low"


def _spells(frames: list[radar.Frame]) -> list[Spell]:
    wet = [is_wet(f) for f in frames]
    step = frames[1].minutes - frames[0].minutes if len(frames) > 1 else 5

    # Bridge short dry gaps so drizzle flicker doesn't split one spell in two.
    bridged = wet[:]
    gap_frames = max(1, BRIDGE_MIN // step)
    i = 0
    while i < len(bridged):
        if bridged[i]:
            i += 1
            continue
        j = i
        while j < len(bridged) and not bridged[j]:
            j += 1
        if 0 < i and j < len(bridged) and (j - i) <= gap_frames:
            for k in range(i, j):
                bridged[k] = True
        i = j

    out: list[Spell] = []
    i = 0
    while i < len(bridged):
        if not bridged[i]:
            i += 1
            continue
        j = i
        while j < len(bridged) and bridged[j]:
            j += 1
        run = frames[i:j]
        rates = [f.max_rate for f in run]
        means = [f.mean_rate for f in run if f.mean_rate > 0]
        out.append(Spell(
            start_min=run[0].minutes,
            # j == len(frames) means the rain outlives our forecast.
            end_min=None if j >= len(bridged) else frames[j].minutes,
            peak_rate=max(rates) if rates else 0.0,
            mean_rate=(sum(means) / len(means)) if means else 0.0,
        ))
        i = j
    return out


def verdict(lat: float, lon: float, radius_km: float = 3.0,
            threshold: float = WET) -> Verdict:
    """Answer the three questions for one location."""
    from datetime import datetime, timezone

    try:
        p = radar.probe(lat, lon, radius_km=radius_km, threshold=threshold)
    except ValueError:
        # Outside the Nordic grid entirely. That is a coverage answer, not an
        # error -- the caller asked a fair question about a real place.
        return Verdict(raining_now=False, now_rate=0.0, current=None, next=None,
                       horizon_min=(radar.NFRAMES - 1) * radar.STEP_S // 60,
                       analysis_age_min=0.0, frames=[], observed=0.0)

    sp = _spells(p.frames)
    horizon = p.frames[-1].minutes

    current = sp[0] if sp and sp[0].start_min == 0 else None
    nxt = next((s for s in sp if s.start_min > 0), None)
    age = (datetime.now(timezone.utc) - p.analysis).total_seconds() / 60.0

    return Verdict(
        raining_now=current is not None,
        now_rate=p.frames[0].max_rate if current else 0.0,
        current=current,
        next=nxt,
        horizon_min=horizon,
        analysis_age_min=age,
        frames=p.frames,
        observed=p.frames[0].observed,
    )


def describe(v: Verdict) -> str:
    """Plain-language answer -- the string a PWA would show."""
    lines: list[str] = []

    if v.blind:
        # Not dry. Unobserved. Saying "dry" here would be the most confident
        # wrong answer this program is capable of producing.
        lines.append("No radar coverage here — we cannot see this place.")
        lines.append("That is not the same as dry: we have no observation at all, "
                     "so byge makes no claim either way.")
        return "\n".join(lines)

    if v.raining_now:
        s = v.current
        lines.append(f"Yes — raining now: {scale.describe_rate(v.now_rate)}.")
        if s.open_ended:
            lines.append(
                f"Still raining {v.horizon_min} min from now — no end within the forecast."
            )
        else:
            lines.append(f"Stops in about {s.end_min} min.")
            if v.next is not None:
                # Dropping the second spell turns "clears at 6, more at 6:30"
                # into "clears at 6" -- true, and the wrong thing to plan around.
                n = v.next
                tail = ("and does not clear again within the forecast"
                        if n.open_ended
                        else f"lasting about {n.duration_min(v.horizon_min)} min")
                lines.append(f"Then more from about {n.start_min} min — {tail}.")
    else:
        if v.next is None:
            # "Dry for the next 115 min" is really two claims of very different
            # strength. The near term is observed; the tail is extrapolation.
            # Say both rather than averaging them into one flat sentence.
            lines.append("No — dry now, and nothing approaching.")
            lines.append(f"The next ~30 min are a confident call; radar sees no rain "
                         f"through {v.horizon_min} min, but that far out is indicative only.")
        else:
            s = v.next
            lines.append(f"No — dry now, but rain arrives in about {s.start_min} min "
                         f"({intensity(s.peak_rate)}).")
            if s.open_ended:
                lines.append(
                    f"It is still raining when the forecast runs out, so it lasts at "
                    f"least {s.duration_min(v.horizon_min)} min — the end isn't visible yet."
                )
            else:
                lines.append(f"It should last about {s.duration_min(v.horizon_min)} min, "
                             f"clearing around {s.end_min} min from now.")

    if v.observed < 1.0:
        lines.append(f"Radar sees only {v.observed:.0%} of your area — the rest is "
                     f"outside coverage and not included either way.")

    lines.append(f"Confidence {v.confidence} · radar {v.analysis_age_min:.0f} min old.")
    return "\n".join(lines)
