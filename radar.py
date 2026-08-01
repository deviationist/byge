"""
Realtime radar patch tracking against a point + radius.

Data source: MET Norway "MET Radar Nowcasting" on thredds.met.no — the
`yrwms-nordic` product, which is the layer yr.no's own radar map renders.

Each file is one 5-minute analysis containing:
  lwe_precipitation_rate[24][2134][1694]   mm/h, T+0..T+115min forecast
  rev_u_displacement / rev_v_displacement  metres, MET's optical-flow field
  projection_lambert                       LCC lat_0=63 lon_0=15 R=6371km
Grid is 1 km. Yc descends (row 0 = north).

We never download a full grid (347 MB); everything is an OPeNDAP subset
around the point of interest.
"""

from __future__ import annotations

import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
from pyproj import CRS, Transformer

CATALOG = "https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.xml"
DODS = "https://thredds.met.no/thredds/dodsC/"
UA = "yr-but-smart/0.1 secret.registry@pm.me"

# Filenames are fully deterministic on 5-minute marks, so we can probe for the
# newest file directly instead of pulling the 277 KB catalogue (which carries no
# ETag or Last-Modified, and so cannot be cached).
STEM = ("radarnowcasting/yrwms-nordic.mos.pcappi-0-rr."
        "noclass-clfilter-novpr-clcorr-block.nordiclcc-1000.{}.nc")
STEP_S = 300          # analyses are published every 5 minutes
NFRAMES = 24          # T+0 .. T+115 min
MAX_LOOKBACK = 8      # give up after 40 min of missing files

# Grid constants, read once from the dataset and pinned here.
PROJ4 = "+proj=lcc +lat_0=63 +lon_0=15 +lat_1=63 +lat_2=63 +no_defs +R=6.371e+06"
X0, DX, NX = -796_000.0, 1000.0, 1694
Y0, DY, NY = 1_125_000.0, -1000.0, 2134

_TF = Transformer.from_crs(CRS.from_epsg(4326), CRS.from_proj4(PROJ4), always_xy=True)


def _get(url: str, timeout: int = 90) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf8", "replace")


def latest_dataset() -> tuple[str, datetime]:
    """Newest 5-minute analysis: (opendap_base_url, valid_time)."""
    xml = _get(CATALOG)
    names = re.findall(r'urlPath="(radarnowcasting/[^"]+\.nc)"', xml)
    if not names:
        raise RuntimeError("no datasets in radarnowcasting catalog")
    best = max(names, key=lambda n: re.search(r"(\d{8}T\d{6}Z)", n).group(1))
    stamp = re.search(r"(\d{8}T\d{6}Z)", best).group(1)
    t = datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    return DODS + best, t


def _ascii(base: str, query: str) -> np.ndarray:
    """Fetch an OPeNDAP ascii subset and parse the numeric payload."""
    url = f"{base}.ascii?{urllib.parse.quote(query, safe='[]:,')}"
    body = _get(url)
    # Payload follows the dashed separator; skip the per-array header lines.
    tail = body.split("-" * 20, 1)[-1]
    nums: list[float] = []
    for line in tail.splitlines():
        line = line.strip()
        if not line or "[" in line and "]" in line and "," not in line:
            continue
        for tok in line.split(","):
            tok = tok.strip()
            if not tok:
                continue
            try:
                nums.append(float(tok))
            except ValueError:
                pass  # array-name / index prefix token
    return np.array(nums, dtype=float)


def cell_of(lat: float, lon: float) -> tuple[int, int]:
    """lat/lon -> (row, col) on the LCC grid."""
    x, y = _TF.transform(lon, lat)
    col = int(round((x - X0) / DX))
    row = int(round((y - Y0) / DY))
    if not (0 <= col < NX and 0 <= row < NY):
        raise ValueError(f"({lat},{lon}) is outside the Nordic radar grid")
    return row, col


@dataclass
class Frame:
    time: datetime
    minutes: int
    max_rate: float      # mm/h, strongest cell within radius
    mean_rate: float     # mm/h, averaged over wet cells only
    coverage: float      # fraction of the disc with rate >= threshold


@dataclass
class Probe:
    lat: float
    lon: float
    radius_km: float
    threshold: float
    analysis: datetime
    frames: list[Frame]
    drift_bearing: float | None   # degrees, direction precipitation comes FROM
    drift_speed_kmh: float | None

    @property
    def onset(self) -> Frame | None:
        """First frame where precipitation reaches the disc."""
        return next((f for f in self.frames if f.coverage > 0), None)

    @property
    def wet_now(self) -> bool:
        return bool(self.frames) and self.frames[0].coverage > 0


def probe(lat: float, lon: float, radius_km: float = 10.0,
          threshold: float = 0.1, base: str | None = None) -> Probe:
    """Track precipitation patches against a point + radius over T+0..T+115min."""
    if base is None:
        base, _ = latest_dataset()

    row, col = cell_of(lat, lon)
    r = max(1, int(round(radius_km)))  # 1 km grid => radius in cells
    r0, r1 = max(0, row - r), min(NY - 1, row + r)
    c0, c1 = max(0, col - r), min(NX - 1, col + r)

    times = _ascii(base, "time").astype(np.int64)
    n = len(times)

    flat = _ascii(base, f"lwe_precipitation_rate[0:1:{n-1}][{r0}:1:{r1}][{c0}:1:{c1}]")
    h, w = r1 - r0 + 1, c1 - c0 + 1
    # Trailing map vectors (time, Yc, Xc) come after the data block.
    cube = flat[: n * h * w].reshape(n, h, w)
    cube = np.where(cube > 1e30, np.nan, cube)

    yy, xx = np.ogrid[r0 : r1 + 1, c0 : c1 + 1]
    disc = ((yy - row) ** 2 + (xx - col) ** 2) <= r * r
    ncell = int(disc.sum())

    frames: list[Frame] = []
    for i in range(n):
        vals = np.where(disc, cube[i], np.nan)
        wet = vals >= threshold
        frames.append(Frame(
            time=datetime.fromtimestamp(int(times[i]), timezone.utc),
            minutes=int((times[i] - times[0]) // 60),
            max_rate=float(np.nanmax(vals)) if np.any(~np.isnan(vals)) else 0.0,
            mean_rate=float(np.nanmean(vals[wet])) if wet.any() else 0.0,
            coverage=float(wet.sum()) / ncell if ncell else 0.0,
        ))

    bearing, speed = _drift(base, row, col, times)
    return Probe(lat, lon, radius_km, threshold,
                 datetime.fromtimestamp(int(times[0]), timezone.utc),
                 frames, bearing, speed)


def _drift(base: str, row: int, col: int, times: np.ndarray) -> tuple[float | None, float | None]:
    """Motion from MET's reverse-displacement field, sampled near the point.

    The variable's `units = "m"` attribute is misleading: observed magnitudes
    are ~2-4, which as metres would be physically meaningless. They are grid
    cells per timestep, i.e. km per 5 minutes on this 1 km grid, giving
    plausible frontal speeds around 40 km/h.

    Sign convention is NOT yet validated. rev_* points back toward where the
    parcel came from, which read directly gives the meteorological "wind from"
    bearing -- but the array's Yc axis descends (row 0 = north) while the
    projection's +y is north, so the v sign may need flipping. Cross-check
    against observed frame-to-frame pattern motion before trusting the bearing.
    The coverage timeline in `frames` does not depend on this.
    """
    try:
        r0, r1 = max(0, row - 2), min(NY - 1, row + 2)
        c0, c1 = max(0, col - 2), min(NX - 1, col + 2)
        u = _ascii(base, f"rev_u_displacement[{r0}:1:{r1}][{c0}:1:{c1}]")
        v = _ascii(base, f"rev_v_displacement[{r0}:1:{r1}][{c0}:1:{c1}]")
        k = (r1 - r0 + 1) * (c1 - c0 + 1)
        u, v = u[:k], v[:k]
        u = np.nanmean(np.where(np.abs(u) > 1e30, np.nan, u))
        v = np.nanmean(np.where(np.abs(v) > 1e30, np.nan, v))
        if not np.isfinite(u) or not np.isfinite(v) or (u == 0 and v == 0):
            return None, None
        step_min = float(times[1] - times[0]) / 60.0 if len(times) > 1 else 5.0
        cells_per_step = float(np.hypot(u, v))          # cells == km on this grid
        speed_kmh = cells_per_step * (60.0 / step_min)
        bearing = (np.degrees(np.arctan2(u, v)) + 360.0) % 360.0
        return float(bearing), speed_kmh
    except Exception:
        return None, None
