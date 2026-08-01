"""
Contract tests for the primary data source: MET Norway's `yrwms-nordic` radar
nowcast on thredds.met.no.

This matters more than the tile tests -- the tiles are a nice-to-have overlay,
this is where every verdict comes from. The grid constants in radar.py are
*pinned* rather than read at runtime (that's what makes a probe one request
instead of four), so these tests are what stops the pinned values drifting away
from reality without anyone noticing.

Network tests by design. A failure is information.
"""

from __future__ import annotations

import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

import radar

UA = {"User-Agent": "byge-tests/0.1 secret.registry@pm.me"}

pytestmark = pytest.mark.network


def _text(url: str, timeout: int = 60) -> str:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read().decode("utf8", "replace")


@pytest.fixture(scope="module")
def base() -> str:
    url, _ = radar.latest_dataset()
    return url


@pytest.fixture(scope="module")
def dds(base) -> str:
    return _text(base + ".dds")


@pytest.fixture(scope="module")
def das(base) -> str:
    return _text(base + ".das")


# --------------------------------------------------------------------------
# Availability and freshness
# --------------------------------------------------------------------------

def test_latest_dataset_resolves():
    url, t = radar.latest_dataset()
    assert url.startswith(radar.DODS)
    assert t.tzinfo is not None


def test_publication_lag_is_sane():
    """Observed lag drifts 0-11 min. Much beyond that means MET is behind."""
    _, t = radar.latest_dataset()
    age = (datetime.now(timezone.utc) - t).total_seconds() / 60
    assert 0 <= age < 30, f"newest analysis is {age:.0f} min old"


def test_filenames_are_deterministic():
    """We skip the 277 KB catalogue by predicting filenames on 5-min marks.

    If MET changes the naming or the cadence, that shortcut breaks -- and it
    breaks silently, by always falling back to older files.
    """
    _, t = radar.latest_dataset()
    assert t.second == 0
    assert t.minute % 5 == 0, f"analysis not on a 5-minute mark: {t}"


def test_unpublished_future_file_404s_cleanly():
    """The resolver walks back from 'now' and relies on a clean 404.

    A soft error page or a 200-with-junk would make it accept a bad URL.
    """
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    stamp = future.strftime("%Y%m%dT%H%M%SZ")
    url = radar.DODS + radar.STEM.format(stamp) + ".dds"
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20)
    assert e.value.code == 404


def test_cors_allows_browser_fetch(base):
    """The no-backend architecture depends on this."""
    req = urllib.request.Request(base + ".dds",
                                 headers={**UA, "Origin": "https://byge.app"})
    with urllib.request.urlopen(req, timeout=30) as r:
        assert r.headers.get("Access-Control-Allow-Origin") == "*"


# --------------------------------------------------------------------------
# Variable contract
# --------------------------------------------------------------------------

def test_precipitation_variable_present(dds):
    assert "lwe_precipitation_rate" in dds


def test_grid_dimensions_match_pinned_constants(dds):
    """radar.NX / NY are pinned. Drift here silently corrupts every lookup."""
    assert f"Xc = {radar.NX}" in dds, "grid width changed"
    assert f"Yc = {radar.NY}" in dds, "grid height changed"


def test_frame_count_matches_pinned_constant(dds):
    assert f"time = {radar.NFRAMES}" in dds, "forecast horizon changed"


def test_units_are_mm_per_hour(das):
    """scale.py's boundaries are in mm/h. A unit change invalidates all of them."""
    i = das.index("lwe_precipitation_rate")
    assert 'String units "mm/h"' in das[i:i + 500]


def test_projection_matches_pinned_proj4(das):
    """cell_of() transforms with a hard-coded proj4 string."""
    assert "+proj=lcc" in das
    for token in ("+lat_0=63", "+lon_0=15", "+R=6.371e+06"):
        assert token in das, f"projection changed: {token} missing"


def test_motion_field_present(das):
    """Not used by the verdict layer yet, but planned for closest-approach."""
    assert "rev_u_displacement" in das
    assert "rev_v_displacement" in das


# --------------------------------------------------------------------------
# Grid geometry -- the pinned extents
# --------------------------------------------------------------------------

def test_grid_origin_and_spacing(base):
    """X0/Y0/DX/DY are pinned so we never fetch the axes. Verify them for real.

    Yc descends (row 0 is north). Getting that backwards mirrors the field
    without raising anything, so it is worth an explicit assertion.
    """
    xc = radar._ascii(base, "Xc[0:1:1]")
    yc = radar._ascii(base, "Yc[0:1:1]")
    assert xc[0] == pytest.approx(radar.X0, abs=1)
    assert (xc[1] - xc[0]) == pytest.approx(radar.DX, abs=1)
    assert yc[0] == pytest.approx(radar.Y0, abs=1)
    assert (yc[1] - yc[0]) == pytest.approx(radar.DY, abs=1)
    assert radar.DY < 0, "Yc must descend -- row 0 is north"


def test_time_axis_is_derivable_from_filename(base):
    """We compute frame times from the stamp instead of fetching `time`."""
    times = radar._ascii(base, "time").astype(np.int64)
    assert len(times) == radar.NFRAMES
    steps = set(np.diff(times).tolist())
    assert steps == {radar.STEP_S}


def test_known_coordinate_maps_into_grid():
    row, col = radar.cell_of(59.9110, 10.7500)   # Oslo
    assert 0 <= row < radar.NY
    assert 0 <= col < radar.NX


def test_coordinate_outside_nordics_is_rejected():
    """Better a clear error than a silently clamped lookup."""
    with pytest.raises(ValueError):
        radar.cell_of(0.0, 0.0)


# --------------------------------------------------------------------------
# End to end
# --------------------------------------------------------------------------

def test_probe_returns_full_frame_series():
    p = radar.probe(59.9110, 10.7500, radius_km=3)
    assert len(p.frames) == radar.NFRAMES
    assert p.frames[0].minutes == 0
    assert p.frames[-1].minutes == (radar.NFRAMES - 1) * radar.STEP_S // 60
    for f in p.frames:
        assert 0.0 <= f.coverage <= 1.0
        assert f.max_rate >= 0.0
