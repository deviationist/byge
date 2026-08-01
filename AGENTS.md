# AGENTS.md

Working notes for agents on `byge`. Read `README.md` first for what the project
is and what the data source looks like.

## The one rule that matters

**Never state a forecast more confidently than the data supports.** The whole
point of this project is answering "will it rain on me" honestly, and every
temptation to round off uncertainty makes it worse:

- A spell still raining at the last frame has `end_min = None`. Its duration is a
  **lower bound**. Do not substitute the horizon and present it as a duration.
- `confidence` keys off **`lead_min`** — the lead time of the thing being
  *predicted*, not the current moment. "Stops in 100 min" is a 100-minute claim
  even though the rain is happening right now.
- "No rain for 115 min" is two claims of very different strength. The near term
  is solid; the tail is indicative. `describe()` splits them deliberately — don't
  collapse it back into one sentence.

If you find yourself adding a fallback that turns "unknown" into a number, stop.

## Data-source gotchas

These cost real time to discover. Don't rediscover them.

- **`Yc` descends.** Row 0 is *north*. `DY` is `-1000.0`. Getting this backwards
  silently mirrors the field.
- **`rev_u/rev_v` have a wrong `units` attribute.** They say `"m"`; the values are
  ~2–4 and are actually **grid cells per timestep** (km per 5 min on this grid).
  Treating them as metres flattens speed to zero.
- **Don't fetch the catalogue.** 277 KB, no `ETag`, no `Last-Modified`, no
  `Cache-Control`. Filenames are deterministic 5-minute marks — probe
  `<stem>.<YYYYMMDD>T<HHMM>00Z.nc.dds` and walk back on 404. ~25 ms.
- **Publication lag drifts 0–11 min**, spacing is exactly 5 min. Never assume
  `now - 5min` exists.
- **`forecast_reference_time == time[0] ==` the filename stamp**, and steps are
  300 s. So the time axis is derivable from the filename — fetching `time` is a
  wasted request.
- **NCSS (NetcdfSubset) returns 503** — not available. OPeNDAP is the path.
- Files are retained **~48 h**.

## Conventions

- **Index by valid time, never by frame 0.** An older analysis is still useful:
  its T+10 frame answers "now". This is what makes stale-while-revalidate work
  and why a missed poll costs accuracy, not correctness.
- **One request per location.** Merging locations into a shared bounding box only
  wins if they're within ~4 km of each other; otherwise the box balloons. Run the
  per-location fetches **in parallel** instead — 5 locations go 6.8 s → 1.7 s.
- **Subset, never bulk.** A full grid is 347 MB. A 3 km disc across all 24 frames
  is 8.3 KB.
- **Send a real `User-Agent`.** MET's terms require identification.
- Thresholds and band boundaries live in `scale.py`. They were **fitted against
  33 836 samples**, not chosen. If you change them, refit — don't guess.

## Known rough edges

Listed honestly rather than hidden:

1. **`radar._ascii()` is a regex scrape** of OPeNDAP's ASCII response. It works
   but is fragile, and it has to be ported to JS for the PWA. Worth replacing
   with typed parsing before it grows. `netCDF4` is installed with DAP support if
   a cleaner Python path is wanted.
2. **`radar._drift()` sign convention is unvalidated.** The magnitude fix is
   sound (~41 km/h is plausible), but `Yc` descends while projection `+y` is
   north, so the `v` sign may be inverted — the bearing could be 180° off. It is
   **currently unused** by the verdict layer. Validate it by cross-correlating
   two consecutive frames, or delete it.
3. **`confidence` is a heuristic, not a measurement.** Lead-time buckets
   (≤30 high, ≤60 moderate, else low). Defensible, since advection skill really
   does decay that way, but not derived from the actual situation. The fix is a
   **lagged ensemble**: the last ~6 analyses each forecast the same valid time,
   so their agreement *measures* confidence. Cheap, and the highest-value
   improvement available.
4. **`radar.latest_dataset()` still uses the catalogue.** The deterministic
   constants (`STEM`, `STEP_S`, `NFRAMES`, `MAX_LOOKBACK`) are in place but the
   function was not switched over.
5. **No multi-location helper yet.** See the parallelism note above.
6. **No tests.**

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install pyproj numpy netCDF4 Pillow
.venv/bin/python -c "import forecast; print(forecast.describe(forecast.verdict(59.98, 9.20)))"
```

`Pillow` is only needed for tile-comparison research (verifying we match yr.no),
not for normal operation.

## Verifying against yr.no

If you need to re-confirm we're reading the same field yr renders:

1. `https://tiles.yr.no/api/precipitation-nowcast/available.json` lists 24 frames
   with tile URL templates. `precipitation-observations` has 18 frames of
   lookback (85 min).
2. Tiles are z0–6, 256 px, 7 flat colours (see `scale.PALETTE`).
3. Decode a tile, map each pixel to lat/lon via Web Mercator, then to our grid,
   and compare. Expect ~94 % wet/dry agreement — residual disagreement is
   subpixel misalignment between their 1.22 km Mercator pixels and our 1.0 km
   LCC cells, and is *expected*, not a bug.

## Testing locations

Weather moves, so hardcoded coordinates go stale. To find live test cases, sweep
a strided subset of T+0 and T+12 and pick cells that are wet-now, dry-then-wet,
or dry-throughout. Cover all four verdict shapes:

- raining now, ends within horizon
- raining now, open-ended
- dry now, rain arriving, end visible
- dry now, nothing approaching
