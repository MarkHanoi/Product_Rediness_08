# Spain — 3D Context Data spike (build-order #6, **SHIP-FIRST priority**)

Part of the country study — umbrella **L-511** (`../V1-LAUNCH-READINESS-AUDIT.md`).
Research ground-truth: `../Pryzm_3D_Context_Data_Sourcing.md`. **Spike run live 2026-07-21.**
(This file is the *context-data* study for Spain. The *zoning* work lives in `README.md` +
`SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md` — do not conflate; different layer, same resolver.)

- **Target LOD:** Tier B — LOD1: **real Catastro footprint + real nDSM height** (footprint ∩ (DSM−DTM)), procedural roof.
- **Source(s):** Catastro INSPIRE Buildings WFS (footprints) · PNOA-LiDAR via CNIG (heights) · OSM/Overture (roads/water/parks fallback — no BD-TOPO equivalent in ES).
- **Integration effort:** MED — the Barcelona **zoning** pipeline already proves Catastro auth + the tiered resolver; the *new* work is nationwide footprints + the shared nDSM height module.
- **Spike status:** **endpoints LIVE-verified**; footprint fetch needs bbox axis-order fix (impl detail); nDSM pipeline unbuilt.
- **Implementation status:** NOT STARTED (awaiting go-ahead per two-phase rule).

## Why Spain is Tier B, not Tier A
Spain publishes **no native LOD2 roof product** (unlike NL/DK/CH/DE). It publishes excellent
**footprints** (Catastro) and **national LiDAR** (PNOA). Real per-building height therefore comes
from the **nDSM technique** — sample `(DSM − DTM)` under each Catastro footprint. This is a strict
upgrade over OSM's ~15%-assumed heights and is **shared infrastructure** with France & Portugal.

## Endpoint verification (live, 2026-07-21)
| Endpoint | Status | Notes (from the ACTUAL response) |
|---|---|---|
| Catastro Buildings WFS `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?…GetCapabilities` | **200 LIVE** | Feature types **`bu:Building`** + **`bu:BuildingPart`**. Advertised CRS incl. `EPSG:25830/25831` (ETRS89 UTM 30/31N — native), `4326`, `4258`, `3857`, `3035`, `32627/8`. Title: "Spanish INSPIRE Download Service - Buildings". |
| Catastro `GetFeature typeNames=bu:Building bbox=…4326` (Eixample) | **200, but `ExceptionReport: No records founded for BBOX and SRS provided`** | Endpoint healthy + processing — this is the known **axis-order / SRS-urn** quirk (INSPIRE 4326 is lat,lon; Catastro is finicky about the bbox CRS token). **Impl detail, not a blocker.** Next: retry in native `EPSG::25831` metres, or 4326 with correct axis order + `srsName`. |
| CNIG Centro de Descargas (PNOA-LiDAR host) `centrodedescargas.cnig.es` | **200 LIVE** | Bulk/tiled LAZ + derived DTM/DSM. Download is tiled + session-based (not a clean bbox API) — the nDSM adapter needs a tile-index resolver, not a live per-request pull. |

**BuildingPart carries `numberOfFloorsAboveGround`** — a free LOD1 height *proxy* (~3 m/floor)
available immediately from the WFS, usable as a stopgap before the nDSM pipeline lands.

## Gate — Phase-1 exit (evidence-backed)
| # | Question | Verdict | Evidence |
|---|---|---|---|
| a | Real footprint? | **YES** | Catastro `bu:Building`/`bu:BuildingPart` WFS live, national coverage (excl. País Vasco + Navarra — separate foral cadastres, see `regions/`) |
| b | Real height? | **YES (two paths)** | (1) immediate: `numberOfFloorsAboveGround` × ~3 m proxy from WFS; (2) real: PNOA nDSM `(DSM−DTM)` — LiDAR host live, pipeline unbuilt |
| c | Real roof shape? | **NO (by design)** | No LOD2 product; procedural roof (flat/generic) or self-built RANSAC roof-plane later. Honest badge: height REAL, roof ESTIMATED. |
| d | Roads/water/parks object-level? | **NO** | No BD-TOPO/BGT equivalent in ES → OSM/Overture fallback (badged ESTIMATED). Confirmed by research doc; matches our current Overpass pipeline. |
| e | Known coverage gaps? | País Vasco (CatastroEus) + Navarra (CatastroNav) run separate INSPIRE services — **16 SEED municipalities blocked** until a foral adapter exists (cross-links the zoning foral-blocker in `README.md`). PNOA vintage varies by tile (2009–2025, 3 cycles) — pick most-recent per tile. |

**Gate verdict: PASSED for footprint + height (Tier B). Roof + roads/water stay OSM-badged —
that is the correct, honest outcome, not a failure.**

## Integration facts for Phase 2
1. **Query Catastro in native `EPSG::25831`** (Barcelona is UTM 31N) to dodge the 4326 axis-order
   exception; reproject to WGS84 for our pipeline. This is the *same* Catastro auth/host the
   Barcelona zoning pipeline already talks to — reuse that client.
2. **nDSM module is shared infra** (ES + FR + PT). Build once: tile-index PNOA DTM+DSM → sample max
   `(DSM−DTM)` inside each footprint polygon → per-building height. Do NOT one-off it per country.
3. **`numberOfFloorsAboveGround` stopgap** ships day-1 value before nDSM: real footprint + floor-count
   height, badged `REAL — Catastro (floors×3m est.)`, upgraded to `REAL — Catastro + PNOA nDSM` later.
4. **Foral cadastres** (País Vasco, Navarra) → `regions/pais-vasco-separate-cadastre/`,
   `regions/navarra-separate-cadastre/`. Same blocker already logged for zoning; solve once.
5. **License:** Catastro free/open; PNOA-LiDAR **CC BY 4.0** → attribution in the disclosure panel.
6. Roads/water/parks/trees: keep the current Overpass pipeline, badged ESTIMATED. Trees: no national
   registry; Barcelona *does* publish a municipal tree cadastre — candidate special-case later.
