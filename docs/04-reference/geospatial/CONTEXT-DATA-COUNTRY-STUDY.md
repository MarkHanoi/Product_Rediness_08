# 3D Context Data — Country-by-Country Sourcing Study

**Umbrella item:** L-511 (`ISSUE-LOG.md`)
**Research ground-truth:** `Pryzm_3D_Context_Data_Sourcing.md` — treat as a *lead list*, not fact;
every endpoint is re-verified live before we rely on it (project discipline: *ship the probe
before the fix*).

## Goal
Move each 3D-Site context layer (buildings/LOD/height, roads, pedestrian paths, water, parks/trees)
from **OSM-only** quality (footprints + ~15% self-reported heights, flat LOD1 blocks, no roof shape)
up to **national-authoritative** quality, country-by-country, behind the **same tiered per-country
resolver** already proven for Barcelona *zoning* (Catastro + MUC + PGM → real; else honest ESTIMATED).

```
Tier A — Authoritative LOD2 (NL, DK, CH, DE): native roofs, map directly to internal mesh.
Tier B — Authoritative footprint + LiDAR nDSM height (ES, FR, PT): real footprint + real height,
         procedural roof.  nDSM (footprint ∩ (DSM−DTM)) built ONCE as shared infra.
Tier C — OSM/Overture fallback (everywhere else): current behaviour, badged ESTIMATED.
```

## Build order (priority)
Founder directive 2026-07-21: **Spain/Barcelona is the highest priority** (buildings, LOD, height,
roads, pedestrians, water, trees). Netherlands is spiked first only as the *cleanest reference
implementation* that proves the resolver pattern end-to-end; Spain is spiked in the same pass
because it is the one we ship first.

1. **Netherlands** — 3DBAG + BGT + AHN4 · reference pattern · effort LOW
2. **Denmark** — Danmark i 3D + GeoDanmark + DHM · effort LOW
3. **Switzerland** — swissBUILDINGS3D 2.0/3.0β + swissTLM3D · effort LOW-MED
4. **France** — BD TOPO (+ LiDAR HD) · effort LOW-MED
5. **Germany** — 16 state geoportals (state router) · effort MED-HIGH
6. **Spain** — Catastro INSPIRE + PNOA-LiDAR nDSM · **SHIP-FIRST priority** · effort MED
7. **Portugal** — OSM/Overture + DGT LiDAR · effort HIGH

## Folder layout (this study)
```
04-reference/
  CONTEXT-DATA-COUNTRY-STUDY.md      ← you are here (index + method + gates)
  <country>/
    README.md                        ← country spike report + Gate table
    topics/                          ← one file per layer
      buildings-lod-height.md
      roads-pedestrian.md
      water.md
      parks-trees.md
    regions/                         ← per-region endpoint/licence notes (state router / cantons / CCAA)
```
(`spain/` already carried the zoning-verification work; its `regions/` + `topics/` now also hold the
context-data study. The zoning files `SPAIN-ZONING-LIVE-VERIFICATION-*.md`, `*.csv` are untouched.)

## Method — two phases, gated
- **Phase 1 (Spike):** hit the real endpoint, pull one dense-urban sample, inspect actual CRS +
  license text on *that* response, do a 5-building height/roof spot check, enumerate coverage gaps.
  Exit only when the Gate table is answered **with evidence**. Report; wait for go-ahead.
- **Phase 2 (Implementation):** self-contained adapter behind the existing resolver; native LOD2
  mapped directly (Tier A) or shared nDSM module (Tier B); every rendered feature carries a
  provenance badge (`REAL — <source>` vs `ESTIMATED`) exactly like the zoning "Why these numbers?"
  panel; re-run the spike's 5-building spot check against integrated output before "done".

**No implementation ticket is "done" while its paired spike is not "done." No spike is "done"
without an evidence-backed Gate.**

## Live-probe log (2026-07-21, this environment)
| Endpoint | Result |
|---|---|
| 3DBAG `api.3dbag.nl/collections/pand` | **200 · LIVE.** CRS **EPSG:7415** (RD New + NAP), CC BY 4.0, data v2023.10.08, API v0.1β |
| 3DBAG `/items?bbox=…&bbox-crs=7415` (Amsterdam) | **200.** Real CityJSON LOD2.2, `b3_dak_type`, ridge/max heights, AHN5 provenance, sub-m RMSE |
| PDOK BGT `api.pdok.nl/lv/bgt/ogc/v1/collections` | **HTTP 000 (unreachable from spike env)** — FLAGGED, not substituted. Re-verify. |
| Catastro Buildings WFS `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` GetCapabilities | **200 · LIVE.** `bu:Building` + `bu:BuildingPart`, CRS 25830/25831/4326/4258/3857 |
| Catastro `GetFeature` bbox (Barcelona) | **200 but `No records founded for BBOX and SRS`** — bbox axis-order/SRS-urn tuning needed (impl detail), endpoint healthy |
| CNIG Centro de Descargas (PNOA-LiDAR host) | **200 · LIVE** |

See `netherlands/README.md` and `spain/README.md` for the full Gate tables.
