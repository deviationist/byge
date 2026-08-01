# byge

> *byge* (Norwegian) — a passing shower or squall. The patch of rain that moves over you and away again.

Answers three questions about a coordinate, and nothing else:

1. **Is it raining here right now?**
2. If yes — **when does it stop?**
3. If no — **will it start, and if we can see the end, how long does it last?**

yr.no shows you a beautiful radar map and leaves you to eyeball whether that blue
blob is heading your way. `byge` answers the question directly, for your exact
position rather than the nearest named place.

## Why not just read yr.no's map

The map is a *rendering*. Underneath it is a gridded numerical field, published
by MET Norway, and that is what `byge` reads — so it works with real mm/h values
at native resolution instead of colour buckets.

We verified this is the same source by decoding yr's own tiles and comparing them
against the grid at matching coordinates and valid times. See
[Verified facts](#verified-facts).

## Data source

**`yrwms-nordic`** on [thredds.met.no](https://thredds.met.no/thredds/catalog/radarnowcasting/catalog.html)
— MET Norway's radar nowcasting product, and the layer yr.no's own map renders.

Each file is one 5-minute analysis:

| variable | meaning |
|---|---|
| `lwe_precipitation_rate[24][2134][1694]` | mm/h, **T+0 … T+115 min** forecast |
| `rev_u_displacement` / `rev_v_displacement` | MET's optical-flow motion field |
| `projection_lambert` | LCC `lat_0=63 lon_0=15 R=6371km`, 1 km grid |

Coverage is the Nordic radar mosaic — 34 nodes across Norway, Sweden and Finland.
Files are retained ~48 h.

The forecast frames are **advection-only**: MET measures how the field moved
between recent frames and slides it forward. Cells do not grow, decay, or spawn.
Frontal rain extrapolates well; convective showers are born and die faster than
they translate, so late frames in shower conditions are weak. This is why
`Verdict.confidence` keys off lead time.

## Modules

| file | role |
|---|---|
| `radar.py` | grid geometry, dataset resolution, OPeNDAP subsetting → `probe()` |
| `forecast.py` | spell detection and the three-question verdict → `verdict()`, `describe()` |
| `scale.py` | intensity bands matched to yr.no's colour scheme |

```python
import forecast
v = forecast.verdict(59.98, 9.20)      # lat, lon
print(forecast.describe(v))
```

```
Yes — raining now: 6.0 mm/h — heavy rain (soaked in minutes).
Stops in about 25 min.
Confidence high · radar 7 min old.
```

### The verdict shape

```
Verdict
  raining_now   bool
  now_rate      float            mm/h
  current       Spell | None     the spell you are standing in
  next          Spell | None     the next one to arrive
  lead_min      int              how far out the predicted event is
  confidence    "high" | "moderate" | "low"
  horizon_min   int              115
  frames        list[Frame]      coverage / mean / max per 5-min step

Spell
  start_min     int
  end_min       int | None       None => still raining at the horizon
  peak_rate     float
  mean_rate     float
```

**`end_min is None` is load-bearing.** A spell still going at the last frame has
an *unknown* end, so every duration derived from it is a lower bound. Presenting
that as a definite figure would make the app quietly dishonest, and the type
system is what stops us.

## Intensity scale

Fitted against **33 836 paired samples** of (our mm/h, yr's rendered tile colour)
at matching coordinates and valid time — the threshold per band chosen to best
separate it. Accuracy 94.9 % on the faintest band rising to 99.8 % on the
heaviest. Reusing yr's palette means anyone who knows the yr map reads ours for
free.

| swatch | range | label | feels like |
|---|---|---|---|
| `#91E4FF` | 0.03–0.055 mm/h | trace | barely detectable |
| `#5ED7FF` | 0.055–0.195 mm/h | drizzle | mist on your glasses |
| `#00AAFF` | 0.195–1 mm/h | light rain | umbrella optional |
| `#0080FF` | 1–5.7 mm/h | moderate rain | you'll want a jacket |
| `#0055FF` | 5.7–23.7 mm/h | heavy rain | soaked in minutes |
| `#7A0087` | 23.7+ mm/h | torrential | seek shelter |

"Raining on you" starts at **band 3 (0.195 mm/h)** — the first level a person
actually notices. Bands 1–2 are radar seeing moisture you would not call rain.

## Verified facts

Everything here was measured against the live service, not assumed.

- **Same source as yr.no.** Their colour bands map monotonically onto our mm/h
  values; wet/dry agreement peaks at **93.8 %**. Residual disagreement is edge
  pixels — their 1.22 km Web Mercator pixels don't align with our 1.0 km LCC
  cells.
- **The squares on yr's map are z6 tile pixels.** Their tiles cap at zoom 6 and
  the client overzooms, so each visible square is one source pixel — 1224 m at
  60°N, ≈1.5 km². Our grid is 1.0 km, so we work at finer resolution than the map.
- **yr's own wet threshold is ~0.02–0.03 mm/h**, well below anything a person
  would call rain.
- **CORS is open** (`Access-Control-Allow-Origin: *`) on both `thredds.met.no`
  and `api.met.no` — a browser can fetch the data directly, so no backend is
  required.
- **Filenames are deterministic** on 5-minute marks. Probing one costs ~25 ms and
  404s cleanly before publication, so the 277 KB catalogue (which carries **no
  ETag, no Last-Modified, no Cache-Control**) is unnecessary.
- **Publication lag drifts 0–11 min** while spacing stays exactly 5 min. Never
  poll on wall-clock — probe the next expected filename instead.
- **Cost is network-bound, not CPU-bound.** Spell detection runs in 0.0044 ms.
  Five locations fetch in parallel in **1.7 s / 44 KB**; serially it's 6.8 s.

## Architecture

**No backend.** The PWA fetches MET directly. This was measured, not assumed —
see CORS and cost above.

The only thing a backend would genuinely unlock is **push notifications**
("rain in 20 minutes" while the app is closed), which is explicitly out of scope.
Note that a PWA cannot poll in the background on iOS regardless — Periodic
Background Sync is Chrome/Android only — so "a backend saves battery" solves a
problem that largely cannot occur.

**Stale-while-revalidate.** A forecast degrades gracefully rather than expiring:
a file from 10 minutes ago still answers "is it raining now" via its T+10 frame.
So always index by **valid time, never by frame 0**, render the cached verdict
instantly, and refresh in place. The app never needs a blocking spinner.

## Scope

**In:** the three questions, for saved locations, on demand.

**Out (for now):** push notifications; live geolocation while moving; radar
imagery. Showing the map would be nice, but the point of `byge` is to not have to
read one.

## Status

Python prototype — the data and decision layers work end to end. The GUI (React
PWA) is not built yet. See `AGENTS.md` for working conventions and the known
rough edges.

## Attribution

Data from **MET Norway** ([met.no](https://www.met.no/)), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Not affiliated with
MET Norway or NRK. Identify yourself in the `User-Agent` when calling their
services — see [MET's terms](https://api.met.no/doc/TermsOfService).
