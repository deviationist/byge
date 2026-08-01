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


def test_coverage_below_threshold_is_not_rain():
    """A few wet cells in a 3 km disc is not rain falling on you."""
    v = verdict_from([forecast.COVER / 2] * radar.NFRAMES)
    assert not v.raining_now


def test_coverage_at_threshold_counts():
    v = verdict_from([forecast.COVER] * radar.NFRAMES)
    assert v.raining_now


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
