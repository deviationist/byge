"""
Contract tests for yr.no's tile service.

`tiles.yr.no` is undocumented infrastructure -- no robots.txt, absent from MET's
terms of service. We depend on it anyway (deliberate decision), so these tests
exist to turn an unmonitored dependency into a monitored one: if yr changes or
withdraws the service, CI goes red instead of the app going quietly wrong.

These hit the live network on purpose. A failure here is information, not flake.

The important test is `test_tiles_still_agree_with_our_grid`. Availability tests
only catch the service *disappearing*; that one catches it changing *meaning* --
a repalette or a rescaled band would leave every other test green while silently
invalidating the boundaries in scale.py.
"""

from __future__ import annotations

import io
import json
import math
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pytest
from PIL import Image

import radar
import scale

UA = {"User-Agent": "byge-tests/0.1 secret.registry@pm.me"}
NOWCAST = "https://tiles.yr.no/api/precipitation-nowcast/available.json"
OBSERVATIONS = "https://tiles.yr.no/api/precipitation-observations/available.json"

pytestmark = pytest.mark.network


def _get(url: str, timeout: int = 30) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


@pytest.fixture(scope="module")
def nowcast() -> dict:
    return json.loads(_get(NOWCAST))


@pytest.fixture(scope="module")
def observations() -> dict:
    return json.loads(_get(OBSERVATIONS))


# --------------------------------------------------------------------------
# Availability and shape
# --------------------------------------------------------------------------

def test_nowcast_endpoint_reachable(nowcast):
    assert nowcast["name"] == "precipitation-nowcast"


def test_observations_endpoint_reachable(observations):
    assert observations["name"] == "precipitation-observations"


@pytest.mark.parametrize("key", ["times", "bounds", "minzoom", "maxzoom", "scheme"])
def test_manifest_keys_present(nowcast, key):
    assert key in nowcast, f"yr dropped '{key}' from the manifest"


def test_tile_scheme_is_xyz(nowcast):
    """We compute tile coordinates with standard Web Mercator xyz maths."""
    assert nowcast["scheme"] == "xyz"


def test_max_zoom_is_six(nowcast):
    """Overzoom beyond z6 is why yr's map shows visible squares.

    If they raise maxzoom the tiles get finer than our 1 km grid and the
    'we work at finer resolution than the map' claim in README stops holding.
    """
    assert nowcast["maxzoom"] == 6


def test_tile_url_templates_present(nowcast):
    tiles = nowcast["times"][0]["tiles"]
    assert "png" in tiles
    for placeholder in ("{z}", "{x}", "{y}"):
        assert placeholder in tiles["png"]


# --------------------------------------------------------------------------
# Cadence -- the app's whole timeline assumes 5-minute steps
# --------------------------------------------------------------------------

def _times(manifest: dict) -> list[datetime]:
    return [
        datetime.strptime(t["time"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        for t in manifest["times"]
    ]


def test_nowcast_cadence_is_five_minutes(nowcast):
    ts = _times(nowcast)
    gaps = {int((b - a).total_seconds()) for a, b in zip(ts, ts[1:])}
    assert gaps == {radar.STEP_S}, f"expected uniform 5-min steps, got {sorted(gaps)}"


def test_observation_cadence_is_five_minutes(observations):
    ts = _times(observations)
    gaps = {int((b - a).total_seconds()) for a, b in zip(ts, ts[1:])}
    assert gaps == {radar.STEP_S}


def test_nowcast_horizon_matches_our_frame_count(nowcast):
    """Our Verdict horizon is derived from this; a change breaks the timeline."""
    assert len(nowcast["times"]) == radar.NFRAMES


def test_observations_reach_back_at_least_an_hour(observations):
    ts = _times(observations)
    span = (ts[-1] - ts[0]).total_seconds() / 60
    assert span >= 60, f"lookback shrank to {span:.0f} min"


def test_nowcast_is_not_stale(nowcast):
    """Publication lag drifts 0-11 min. Well past that means something is wrong."""
    newest = _times(nowcast)[0]
    age = (datetime.now(timezone.utc) - newest).total_seconds() / 60
    assert age < 30, f"newest nowcast frame is {age:.0f} min old"


# --------------------------------------------------------------------------
# CORS -- the no-backend architecture depends on this
# --------------------------------------------------------------------------

def test_cors_allows_browser_fetch():
    """The PWA fetches these directly. Without CORS the whole design changes."""
    req = urllib.request.Request(NOWCAST, headers={**UA, "Origin": "https://byge.app"})
    with urllib.request.urlopen(req, timeout=30) as r:
        assert r.headers.get("Access-Control-Allow-Origin") == "*"


# --------------------------------------------------------------------------
# Tiles themselves
# --------------------------------------------------------------------------

def _tile_xy(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y


def _fetch_tile(manifest: dict, index: int, lat: float, lon: float, z: int = 6):
    x, y = _tile_xy(lat, lon, z)
    url = (manifest["times"][index]["tiles"]["png"]
           .replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y)))
    return np.array(Image.open(io.BytesIO(_get(url))).convert("RGB")), x, y


def test_tile_fetches_and_decodes(nowcast):
    img, _, _ = _fetch_tile(nowcast, 0, 63.6, 9.9)
    assert img.shape == (256, 256, 3)


def test_palette_unchanged(nowcast):
    """Canary for a silent repalette.

    scale.py's boundaries were fitted against these exact colours. If yr
    reshades their map, our decoding breaks and the fitted thresholds no longer
    describe anything real -- so the palette is pinned rather than inferred.

    Sampled across several tiles because one tile need not contain every band.
    """
    seen: set[tuple[int, int, int]] = set()
    for lat, lon in [(63.6, 9.9), (65.9, 29.0), (60.0, 11.0), (62.0, 3.0)]:
        img, _, _ = _fetch_tile(nowcast, 0, lat, lon)
        seen |= {tuple(int(v) for v in c) for c in np.unique(img.reshape(-1, 3), axis=0)}

    allowed = set(scale.PALETTE) | {scale.NO_DATA}
    unknown = seen - allowed
    assert not unknown, (
        f"yr is rendering colours we don't know: {sorted(unknown)}. "
        "The palette changed -- scale.py's fitted boundaries need refitting."
    )


def test_no_data_is_not_an_intensity():
    """White means 'outside radar coverage', not 'dry'.

    Folding it into the palette would render "we cannot see here" as "it is dry
    here" -- a confident wrong answer, which is the failure mode this whole
    project is built to avoid.
    """
    assert scale.NO_DATA not in scale.PALETTE


def test_coverage_boundary_is_rendered(nowcast):
    """A tile straddling the mosaic edge should contain the no-data colour.

    If this stops holding, yr has either extended coverage or stopped
    distinguishing no-data from dry -- and in the latter case our decoding would
    start reading unobserved ocean as confidently dry.
    """
    img, _, _ = _fetch_tile(nowcast, 0, 62.0, 3.0)   # North Sea, west of coverage
    white = (img == 255).all(axis=2).mean()
    assert white > 0.01, "expected some no-data area west of the radar mosaic"


# --------------------------------------------------------------------------
# The one that catches a change in *meaning* rather than availability
# --------------------------------------------------------------------------

@pytest.mark.slow
def test_tiles_still_agree_with_our_grid(nowcast):
    """yr's rendered tiles must still match the NetCDF field we read directly.

    Both come from the same MET product, so they should agree. When the scale
    was fitted this gave ~94 % wet/dry agreement, the residual being subpixel
    misalignment between their 1.22 km Mercator pixels and our 1.0 km LCC cells.

    A real drop here means yr switched product, changed thresholds, or we are
    reading a different field than the map shows -- none of which any other test
    in this file would catch.
    """
    from pyproj import CRS, Transformer

    frame = nowcast["times"][0]
    valid = frame["time"]
    stamp = valid.replace("-", "").replace(":", "")
    base = radar.DODS + radar.STEM.format(stamp)

    lat0, lon0, z = 63.6, 9.9, 6
    tile, X, Y = _fetch_tile(nowcast, 0, lat0, lon0, z)

    n = 2 ** z
    lon_w, lon_e = X / n * 360 - 180, (X + 1) / n * 360 - 180
    lat_n = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * Y / n))))
    lat_s = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (Y + 1) / n))))

    corners = [(lat_s, lon_w), (lat_s, lon_e), (lat_n, lon_w), (lat_n, lon_e)]
    rc = [radar.cell_of(a, b) for a, b in corners]
    r0, r1 = min(r for r, _ in rc), max(r for r, _ in rc)
    c0, c1 = min(c for _, c in rc), max(c for _, c in rc)

    step = 4
    rows = list(range(r0, r1 + 1, step))
    cols = list(range(c0, c1 + 1, step))
    flat = radar._ascii(
        base, f"lwe_precipitation_rate[0:1:0][{r0}:{step}:{r1}][{c0}:{step}:{c1}]"
    )
    grid = np.where(flat[: len(rows) * len(cols)] > 1e30, np.nan,
                    flat[: len(rows) * len(cols)]).reshape(len(rows), len(cols))

    inv = Transformer.from_crs(CRS.from_proj4(radar.PROJ4),
                               CRS.from_epsg(4326), always_xy=True)
    lut = {c: i for i, c in enumerate(scale.PALETTE)}

    ours, theirs = [], []
    for i, R in enumerate(rows):
        for j, C in enumerate(cols):
            v = grid[i, j]
            if not np.isfinite(v):
                continue
            lon, lat = inv.transform(radar.X0 + C * radar.DX, radar.Y0 + R * radar.DY)
            px = ((lon + 180.0) / 360.0 * n - X) * 256.0
            py = ((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0
                  * n - Y) * 256.0
            if not (0 <= px < 256 and 0 <= py < 256):
                continue
            b = lut.get(tuple(tile[int(py), int(px)]))
            if b is None:
                continue
            ours.append(v >= scale.BANDS[1].floor)
            theirs.append(b > 0)

    assert len(ours) > 500, f"only {len(ours)} comparable cells -- sample too thin"
    agreement = np.mean(np.array(ours) == np.array(theirs))
    assert agreement > 0.85, (
        f"tiles and grid agree on only {agreement:.1%} of cells (expected >85%). "
        "yr may have changed product or thresholds."
    )
