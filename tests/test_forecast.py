"""
Pure-logic tests for the verdict layer. No network -- these run in milliseconds
and are the ones that guard the project's central promise.

byge exists to be *honest* about rain. Most of what follows tests that honesty
mechanically: that a spell outliving the forecast reports a lower bound rather
than a number, and that confidence tracks the claim being made rather than the
current moment.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

import forecast
import radar
import scale

HORIZON = (radar.NFRAMES - 1) * radar.STEP_S // 60   # 115 minutes


def frames(coverages: list[float], rate: float = 2.0) -> list[radar.Frame]:
    """Synthetic frame series. `coverages` is one value per 5-minute step."""
    t0 = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    out = []
    for i, cov in enumerate(coverages):
        out.append(radar.Frame(
            time=t0,
            minutes=i * 5,
            max_rate=rate if cov > 0 else 0.0,
            mean_rate=rate if cov > 0 else 0.0,
            coverage=cov,
        ))
    return out


WET, DRY = 1.0, 0.0


def verdict_from(coverages: list[float], rate: float = 2.0) -> forecast.Verdict:
    fs = frames(coverages, rate)
    spells = forecast._spells(fs)
    current = spells[0] if spells and spells[0].start_min == 0 else None
    nxt = next((s for s in spells if s.start_min > 0), None)
    return forecast.Verdict(
        raining_now=current is not None,
        now_rate=fs[0].max_rate if current else 0.0,
        current=current,
        next=nxt,
        horizon_min=fs[-1].minutes,
        analysis_age_min=3.0,
        frames=fs,
    )


# --------------------------------------------------------------------------
# The honesty invariants
# --------------------------------------------------------------------------

def test_spell_running_at_horizon_has_no_end():
    """The single most important assertion in the suite.

    If rain is still falling at the last frame we do not know when it stops.
    Substituting the horizon would turn 'at least 40 min' into '40 min'.
    """
    v = verdict_from([WET] * radar.NFRAMES)
    assert v.raining_now
    assert v.current.end_min is None
    assert v.current.open_ended


def test_open_ended_duration_is_a_lower_bound():
    v = verdict_from([DRY] * 4 + [WET] * (radar.NFRAMES - 4))
    s = v.next
    assert s.open_ended
    # Reports the visible portion only, never an invented end.
    assert s.duration_min(v.horizon_min) == v.horizon_min - s.start_min


def test_closed_spell_reports_a_real_end():
    v = verdict_from([WET] * 6 + [DRY] * (radar.NFRAMES - 6))
    assert v.current.end_min == 30
    assert not v.current.open_ended


def test_describe_says_at_least_for_open_ended_spells():
    v = verdict_from([DRY] * 4 + [WET] * (radar.NFRAMES - 4))
    text = forecast.describe(v)
    assert "at least" in text
    assert "isn't visible" in text or "not visible" in text


def test_unobserved_is_never_reported_as_dry():
    """The most confident wrong answer this program could give.

    A location outside radar coverage has no observation. Saying "dry" there
    claims we looked and saw nothing falling, when in fact we cannot look at
    all. Before this was fixed, a fully-blind disc reported the exact same
    sentence as genuinely-dry Oslo.
    """
    fs = frames([DRY] * radar.NFRAMES)
    for f in fs:
        f.observed = 0.0
    v = forecast.Verdict(raining_now=False, now_rate=0.0, current=None, next=None,
                         horizon_min=HORIZON, analysis_age_min=3.0, frames=fs,
                         observed=0.0)
    assert v.blind
    text = forecast.describe(v)
    assert "no radar coverage" in text.lower()
    assert "not the same as dry" in text.lower()
    assert "nothing approaching" not in text.lower()


def test_blind_frames_are_neither_wet_nor_dry():
    fs = frames([WET] * radar.NFRAMES)
    for f in fs:
        f.observed = 0.0
    assert not any(forecast.is_wet(f) for f in fs)
    assert forecast._spells(fs) == []


def test_partial_coverage_is_disclosed():
    """Half a circle outside the mosaic must not silently shrink the answer."""
    fs = frames([DRY] * radar.NFRAMES)
    for f in fs:
        f.observed = 0.6
    v = forecast.Verdict(raining_now=False, now_rate=0.0, current=None, next=None,
                         horizon_min=HORIZON, analysis_age_min=3.0, frames=fs,
                         observed=0.6)
    assert not v.blind
    assert "60%" in forecast.describe(v)


# --------------------------------------------------------------------------
# Second spell -- rain that stops and comes back
# --------------------------------------------------------------------------

def test_second_spell_is_reported_when_already_raining():
    """"Clears at 6" is true and the wrong thing to plan around if more follows."""
    v = verdict_from([WET] * 4 + [DRY] * 6 + [WET] * 6 + [DRY] * 8)
    assert v.raining_now
    assert v.current.end_min == 20
    assert v.next is not None and v.next.start_min == 50
    text = forecast.describe(v)
    assert "Stops in about 20 min" in text
    assert "Then more from about 50 min" in text


def test_second_spell_open_ended_is_flagged_as_such():
    v = verdict_from([WET] * 4 + [DRY] * 6 + [WET] * 14)
    assert v.next.open_ended
    assert "does not clear again" in forecast.describe(v)


def test_no_second_spell_sentence_when_there_is_none():
    v = verdict_from([WET] * 4 + [DRY] * 20)
    assert "Then more" not in forecast.describe(v)


def test_describe_never_claims_a_duration_it_cannot_see():
    """Guards against a regression where the horizon leaks out as a fact."""
    v = verdict_from([WET] * radar.NFRAMES)
    text = forecast.describe(v)
    assert "Stops in about" not in text
    assert "no end within the forecast" in text.lower()


# --------------------------------------------------------------------------
# Confidence tracks the claim, not the clock
# --------------------------------------------------------------------------

def test_end_min_is_the_first_observed_dry_frame():
    """Convention: `end_min` is when we first *see* dryness, not the last wet frame.

    21 wet frames cover minutes 0-100, each frame standing for the 5 minutes
    that follow it, so the rain occupies 105 minutes and clears at T+105.
    Conservative in the honest direction -- we never claim it stopped earlier
    than observed.
    """
    v = verdict_from([WET] * 21 + [DRY] * 3)
    assert v.current.end_min == 105
    assert v.current.duration_min(v.horizon_min) == 105


def test_lead_time_for_raining_now_uses_the_end_not_zero():
    """'Raining now, stops in 105 min' is a 105-minute claim.

    Keying confidence off 'it is raining right now' would label it high.
    """
    v = verdict_from([WET] * 21 + [DRY] * 3)
    assert v.raining_now
    assert v.lead_min == 105
    assert v.confidence == "low"


def test_open_ended_spell_is_high_confidence():
    """"It is raining on you" is an observation, and observations are certain.

    Only the *end* is unknown, and that is hedged in the prose rather than by
    discrediting the whole verdict. Labelling this `low` would be absurd.
    """
    v = verdict_from([WET] * radar.NFRAMES)
    assert v.current.open_ended
    assert v.lead_min == 0
    assert v.confidence == "high"


def test_nothing_approaching_is_high_confidence():
    """The field being clear right now is observed, not predicted."""
    v = verdict_from([DRY] * radar.NFRAMES)
    assert v.confidence == "high"
    # ...but the far end of "nothing for 115 min" still has to be hedged.
    assert "indicative only" in forecast.describe(v)


def test_short_spell_while_raining_is_high_confidence():
    v = verdict_from([WET] * 4 + [DRY] * (radar.NFRAMES - 4))
    assert v.lead_min == 20
    assert v.confidence == "high"


def test_distant_arrival_is_low_confidence():
    v = verdict_from([DRY] * 18 + [WET] * (radar.NFRAMES - 18))
    assert v.lead_min == 90
    assert v.confidence == "low"


@pytest.mark.parametrize("lead_frames,expected", [(4, "high"), (10, "moderate"), (18, "low")])
def test_confidence_buckets(lead_frames, expected):
    v = verdict_from([DRY] * lead_frames + [WET] * (radar.NFRAMES - lead_frames))
    assert v.confidence == expected


# --------------------------------------------------------------------------
# Spell detection
# --------------------------------------------------------------------------

def test_all_dry_yields_no_spells():
    v = verdict_from([DRY] * radar.NFRAMES)
    assert not v.raining_now
    assert v.current is None and v.next is None


def test_short_dry_gap_is_bridged():
    """One dry frame mid-shower is drizzle flicker, not the end of the rain.

    Without bridging the app would announce 'stops in 15 min' and then rain.
    """
    v = verdict_from([WET] * 3 + [DRY] + [WET] * 4 + [DRY] * (radar.NFRAMES - 8))
    assert v.raining_now
    assert v.current.end_min == 40, "gap should have been bridged into one spell"
    assert v.next is None


def test_long_dry_gap_splits_into_two_spells():
    """A genuine break must survive -- the second band is real information."""
    v = verdict_from([WET] * 3 + [DRY] * 6 + [WET] * 4 + [DRY] * (radar.NFRAMES - 13))
    assert v.raining_now
    assert v.current.end_min == 15
    assert v.next is not None
    assert v.next.start_min == 45


def test_any_rain_touching_the_radius_counts():
    """One wet cell inside the circle is rain at that location.

    The radius is the area the user cares about. An earlier rule (">= 25 % of
    the disc") inverted itself: with rain falling on you, widening the radius
    diluted the fraction and flipped the verdict to dry.
    """
    v = verdict_from([0.02] * radar.NFRAMES)   # 2 % of the disc wet
    assert v.raining_now


def test_widening_the_radius_never_turns_rain_into_dry():
    """Monotonicity: a wider circle can only ever see more rain, never less."""
    tiny = verdict_from([0.02] * radar.NFRAMES)
    broad = verdict_from([0.9] * radar.NFRAMES)
    assert tiny.raining_now and broad.raining_now


def test_zero_coverage_is_dry():
    v = verdict_from([0.0] * radar.NFRAMES)
    assert not v.raining_now


def test_dry_now_then_rain_populates_next_not_current():
    v = verdict_from([DRY] * 6 + [WET] * 4 + [DRY] * (radar.NFRAMES - 10))
    assert not v.raining_now
    assert v.current is None
    assert v.next.start_min == 30
    assert v.next.end_min == 50


# --------------------------------------------------------------------------
# Scale
# --------------------------------------------------------------------------

def test_bands_ascend():
    floors = [b.floor for b in scale.BANDS]
    assert floors == sorted(floors)


@pytest.mark.parametrize("rate,label", [
    (0.0, "dry"),
    (0.04, "trace"),
    (0.1, "drizzle"),
    (0.5, "light rain"),
    (3.0, "moderate rain"),
    (10.0, "heavy rain"),
    (50.0, "torrential"),
])
def test_band_labels(rate, label):
    assert scale.band_of(rate).label == label


def test_band_boundaries_are_inclusive_at_the_floor():
    for b in scale.BANDS[1:]:
        assert scale.band_of(b.floor).index == b.index


def test_noticeable_is_band_three():
    """Bands 1-2 are radar seeing moisture nobody would call rain."""
    assert scale.NOTICEABLE == scale.BANDS[3].floor
    assert scale.band_of(scale.NOTICEABLE).label == "light rain"


def test_palette_matches_bands():
    assert len(scale.PALETTE) == len(scale.BANDS)
    assert scale.PALETTE == tuple(b.rgb for b in scale.BANDS)


def test_legend_covers_every_band_except_dry():
    rows = scale.legend()
    assert len(rows) == len(scale.BANDS) - 1
    assert rows[-1]["to"] is None, "top band must be open-ended"
