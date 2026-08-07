repo: deviationist/byge
branch: main

## Last sync
date: 2026-08-01T19:56:32Z

### Updated in this project
- Folded in the late finding in `design/FEEDBACK-02.md`: band 6 dark is now `#E8BCF4`, so both ramps are monotonic across all six bands.
- Added a measured relative-luminance chart for both ramps to the foundation specimen.
- Palette ships as explicit values in `foundation.js` — read from JS for canvas/SVG fills, so it must not be inferred from usage.

## Screen map
| project file | repo files |
|---|---|
| foundation.js | scale.py, forecast.py, README.md |
| LocationStatusText.dc.html | DESIGN_PROMPT.md (states), design/FEEDBACK-01.md §1–3 |
| PrecipitationGraph.dc.html | design/FEEDBACK-01.md §7, GUI_PLAN.md (couplings) |
| PrecipitationLevelCard / Confidence / Legend | scale.py, design/FEEDBACK-01.md §1 §6 |
| Swatch / LocationCard / LocationsScreen | GUI_PLAN.md, design/FEEDBACK-01.md §6 |
| MapCanvas / MapField / RadiusField | design/FEEDBACK-01.md §4, GUI_PLAN.md (tiles, coverage) |
| RadarMap.dc.html | GUI_PLAN.md (radar overlay, no-data), radar.py |
| CoverageNotice.dc.html | design/FEEDBACK-01.md §9, scale.py NO_DATA |
| RefreshControl / StaleBanner / ErrorState | README.md (stale-while-revalidate), FEEDBACK-01 §7 §8 |
| AboutScreen / Attribution | README.md, GUI_PLAN.md (MET terms), FEEDBACK-01 §5 |
| SettingsScreen.dc.html | GUI_PLAN.md (phase 3) |
| Specimen-Foundation.dc.html | scale.py, DESIGN_PROMPT.md (PWA) |
| Library.dc.html | design/FEEDBACK-02.md |
| byge.dc.html | all of the above |

## Sync history
- 2026-08-01T19:35:00Z — read `design/FEEDBACK-01.md` and `-02.md`; split the single comp into one file per component plus thin screen compositions; added states 8–11; unified palette, spell model and copy in `foundation.js`.
- 2026-08-01T18:20:00Z — first import: full app designed as a single comp (`byge-v1.dc.html`).
