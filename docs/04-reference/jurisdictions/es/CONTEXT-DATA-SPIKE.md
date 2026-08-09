# Spain — 3D Context Data spike (build-order #6, **SHIP-FIRST priority**)

Part of the country study — umbrella **L-511** (`../ISSUE-LOG.md`).
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
2. **nDSM module is shared infra** (ES + FR + PT). Build once: tile-index PNOA DTM+DSM → sample the
   **90th-percentile** of `(DSM−DTM)` inside each footprint polygon (NOT max — antennas/HVAC inflate
   max; see `SPAIN-HEIGHT-MEASUREMENT.md` §1.2) → per-building height. Do NOT one-off it per country.
3. **`numberOfFloorsAboveGround` stopgap** ships day-1 value before nDSM: real footprint + floor-count
   height, badged `REAL — Catastro (floors×3m est.)`, upgraded to `REAL — Catastro + PNOA nDSM` later.
4. **Foral cadastres** (País Vasco, Navarra) → `regions/pais-vasco-separate-cadastre/`,
   `regions/navarra-separate-cadastre/`. Same blocker already logged for zoning; solve once.
5. **License:** Catastro free/open; PNOA-LiDAR **CC BY 4.0** → attribution in the disclosure panel.
6. Roads/water/parks/trees: keep the current Overpass pipeline, badged ESTIMATED. Trees: no national
   registry; Barcelona *does* publish a municipal tree cadastre — candidate special-case later.

---

## Per-layer three-tier badging matrix (L-512 — the honesty structure)
Every context layer resolves to a DIFFERENT tier; nothing collapses to one flat REAL/ESTIMATED toggle.
This is the same graded model as building height (`SPAIN-HEIGHT-MEASUREMENT.md` §3) and drives the
**C23 provenance extension** (coverage gap logged in `MISSING-CONTRACTS-AUDIT-2026-06-01.md`).

| Layer | REAL tier | Reconstructed / derived tier | ESTIMATED tier |
|---|---|---|---|
| **Buildings/height** | Catastro footprint + LiDAR nDSM 90th-pctile (cycle-tagged) | RANSAC roof reconstruction from LiDAR | Catastro `ALTURAS`×3 m, or OSM levels |
| **Trees** | Barcelona Arbrat per-tree | LiDAR CHM-detected (treetop+crown) | procedural placement, no detection |
| **Roads** | — (no ES surface-polygon dataset exists) | centerline + inferred width, DTM-draped | class-default width, no local data |
| **Pedestrian** | municipal 1:1,000 curb polygons where published | orthophoto-segmented sidewalks | inferred gap-fill, or omitted |
| **Water** | BTN25/IGR shape + DTM-sampled flat elevation | — | raw OSM polygon, no elevation correction |
| **Parks** | BTN25 discrete polygon | — | SIOSE composite @site-scale, or OSM |

**Modeling methods** for each layer are documented in `topics/*.md` (§"3D modeling method"):
tree CHM + local-maxima + watershed; road centerline→buffer→junction-fill→drape; pedestrian 3-option
ladder + Barcelona crosswalk dataset; water flatten-don't-nDSM; parks BTN25-primary / SIOSE-coarse-fallback.
Raw founder source preserved at `SOURCE-founder-deep-dives-raw.md`.
