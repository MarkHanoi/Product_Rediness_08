# Portugal (`pt`) — Geospatial Data Inventory (DGT OGC API platform)

> **What this file is.** A single-table inventory of the national geospatial layers PRYZM would
> consume for Portugal, folded from the founder-supplied expert review of 2026-07-30
> (*Portugal Geospatial Infrastructure Review*). It catalogues **who owns each layer, how it is
> accessed, its licence, and whether it is production-ready** — the geospatial (data-availability)
> axis, NOT the buildable-rule axis (`RATE.md`) and NOT the LOD/height physical-model axis
> (`LOD-RATE.md`). Never conflate the three.
>
> **Confidence discipline (§CONTEXT-DATA-HONESTY).** Every claim in this file is
> **`CONVERGENT-SECONDARY`** — sourced from an expert review that cites authoritative providers but
> was **NOT live-probed** this pass. A doc claiming a source is available is **not** a wired or
> probed source. **Each row must be confirmed by direct probe before it gates a production decision
> or raises any RATE / LOD-RATE cell.** This file changes NO RATE % cell; the probe items in
> §Probe steps are what would, once PROBED + WIRED, become the Phase-3 PLAN that raises Portugal.
>
> **Session date:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** captured, pending-probe.

---

## Headline (from the review)

Portugal's national geospatial infrastructure is delivered largely through the **DGT OGC API
platform** (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`) and, for geology, a modern **LNEG
OGC API**. The reviewer scored the **infrastructure 9/10** (EXCLUDING envelope/zoning rules ≈ 0%
and building heights, which are the weak axes). The review reports the DGT platform layers as
**CC BY 4.0** — but this, like every claim here, is `CONVERGENT-SECONDARY` and pending direct
probe.

- **CAOP** (admin boundaries) is the reviewer's "easiest win" — the jurisdiction-routing analogue
  of Germany's AGS and France's INSEE lookup.
- **Building height is the biggest unknown**: there is **no national building-height raster**
  (unlike Spain's CNIG MDS Edificación). Height is derivable as **nDSM = DSM − DTM** from DGT
  LiDAR (~90% continental); there is no national floor-count attribute and RMSE-Z is unpublished.
- **Copernicus DEM (~30 m)** is a **terrain fallback** for the NW-mainland gap outside DGT LiDAR —
  terrain, NOT building height. Do not conflate.

---

## The inventory

| Layer | Authority | Access | API | Download | Licence | CRS | National | Production-ready | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| **CAOP** — administrative boundaries (distrito + concelho + freguesia) | DGT | DGT OGC API platform (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`) | OGC API (Features) — *base URL + FeatureType names pending-probe* | GeoPackage / Shapefile via SNIG | CC BY 4.0 *(reported; pending-probe)* | pending-probe (likely ETRS89 / PT-TM06, EPSG:3763 continental) | Yes | **Reviewer ★★★★★ "easiest win"** — but pending-probe | `CONVERGENT-SECONDARY` |
| **Cadastro Predial (Continente)** — parcel geometry + NIC | DGT (SNIC — Autoridade Nacional de Cadastro Predial) | DGT OGC API / SNIG WMS/WFS | OGC API — *pending-probe* | Shapefile / GeoPackage / DXF / GeoJSON per parcel | Open (EU HVD, Reg. 2023/138); CC BY 4.0 *(reported; pending-probe)* | pending-probe (EPSG:3763 continental) | **Mainland only**; coverage varies (CGPR/SiNErGIC ~134 munis; NOT confirmed for Lisbon/Porto cores — see §2.1 README) | ★★★★☆ **coverage-limited** — pending-probe | `CONVERGENT-SECONDARY` |
| **CRUS** — Classificação e Uso do Solo (territorial classification) | DGT | DGT OGC API platform | OGC API — *collection name pending-probe* | GeoPackage / Shapefile via SNIG | CC BY 4.0 *(reported; pending-probe)* | pending-probe | Yes | ★★★★★ — pending-probe | `CONVERGENT-SECONDARY` |
| **COS** — Carta de Ocupação do Solo (land cover) | DGT | DGT OGC API platform | **OGC API** *(review upgrades from prior WMS/WFS lead)* | GeoPackage / Shapefile via SNIG | **CC BY 4.0** *(review upgrades from "Open")* | pending-probe | Yes | ★★★★★ — pending-probe (too coarse for individual park boundaries; district-scale context only) | `CONVERGENT-SECONDARY` |
| **Orthophotos** — 30 cm national imagery | DGT | DGT OGC API platform (analogue of Spain's PNOA) | OGC API / tiled imagery — *pending-probe* | Tiled orthoimagery via SNIG | CC BY 4.0 *(reported; pending-probe)* | pending-probe | Yes | ★★★★★ — pending-probe | `CONVERGENT-SECONDARY` |
| **Geology (LNEG)** — geological mapping | **LNEG** (Laboratório Nacional de Energia e Geologia — energy + geology lab) | LNEG geoportal | **Modern OGC API** *(review upgrade)* | via LNEG geoportal | *pending-probe* | pending-probe | Yes | ★★★★★ — pending-probe. **DISTINCT from LNEC** (civil-eng lab, geotech) — do NOT conflate | `CONVERGENT-SECONDARY` |
| **DGT LiDAR → nDSM** — derived building height | DGT (PRR campaign, flown Apr 2024 – Mar 2025) | `cdd.dgterritorio.gov.pt` (Centro de Dados do Território) | tile grid / QGIS "DGT CDD Downloader" plugin | LAZ 10 pts/m² · DTM 50 cm · DSM 2 m GeoTIFF | "sem qualquer tipo de restrição" *(pending-probe)* | pending-probe | **~90% continental** (NW gap, rolling) | **★★★☆☆ — biggest unknown.** No national height raster; **height = nDSM (DSM − DTM)** in-module; no floor-count attribute; RMSE-Z unpublished | `CONVERGENT-SECONDARY` |
| **Copernicus DEM** — ~30 m terrain (fallback) | ESA / Copernicus | Copernicus Data Space | GLO-30 tiles | GeoTIFF | Copernicus open licence | EPSG:4326 (GLO-30) | Global (fills NW-mainland ~10% gap outside DGT LiDAR) | ★★★★★ as **terrain fallback** — **NOT a building-height source** | `CONVERGENT-SECONDARY` |
| **Building-height raster (national)** | — | — | — | — | — | — | **Does NOT exist** (unlike ES CNIG MDS Edificación) | **N/A — the biggest gap.** Derive via DGT-LiDAR nDSM module | `CONVERGENT-SECONDARY` (negative) |
| **Environmental (REN / RAN / Natura 2000 / Protected / Flood)** | APA / LNEG / CCDR (scattered) | Multiple portals (no single portal) | mixed | mixed | Open *(pending-probe)* | pending-probe | Yes, but fragmented | ★★★★☆ — **available but scattered**; no single catalogue | `CONVERGENT-SECONDARY` |

**Ranked building-height sources (review, best-first):** (1) **DGT LiDAR → nDSM** [our shared
ES/FR/PT module]; (2) **municipal LiDAR** (e.g. Lisbon CML 3D, licence TBV); (3) **Copernicus DEM
~30 m** [terrain fallback, NOT height]; (4) **derived DSM** (compute-heavy). Note (3) is terrain,
listed only to rank it below the true height sources.

---

## Strategy note (from the review)

> "Litehaus = catalogue; trace every layer to its authoritative provider (DGT / APA / LNEG /
> Copernicus)." Depend on **stable public services**, not an aggregator. The DGT OGC API platform,
> the LNEG OGC API, and Copernicus are the authoritative anchors; an aggregator/catalogue is a
> convenience index, never the source of record.

The review **upgrades many prior `VERIFIED-LEAD` entries to `CONVERGENT-SECONDARY` pending probe**
— it corroborates them with an expert second source, but does not live-probe them. It therefore
does **not** raise Portugal above its current rate; it defines the probe queue that would.

---

## §Probe steps (the geospatial probe queue)

These are the exact live probes that would upgrade the rows above from `CONVERGENT-SECONDARY` to
`VERIFIED-LIVE` and, once WIRED, become Phase-3 PLAN items. Mirrors the review's NEXT §8 list. See
also `../NEXT.md`.

1. **Confirm the DGT OGC API base URL.** Navigate `dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`
   → locate the OGC API landing (`/collections`) → record the canonical base URL and whether it is
   OGC API Features / Tiles / Maps. This is the anchor every DGT row depends on.
2. **Probe CAOP OGC API.** From the OGC API landing, enumerate the CAOP FeatureType/collection →
   confirm it returns **distrito + concelho + freguesia** polygons with a **DICOFRE attribute**
   (the join key for every PT municipality folder). Record the exact attribute name.
3. **Probe CRUS collection.** Confirm the CRUS collection exists on the OGC API, returns
   territorial-classification polygons, and record the classification attribute schema.
4. **Probe LNEG OGC API.** Confirm the LNEG (geology) OGC API endpoint is live and distinct from
   any LNEC (civil-eng) service; record the base URL + one collection name. Do NOT conflate the two
   labs.
5. **Confirm COS + 30 cm ortho as OGC API + CC BY 4.0.** Verify COS is served via OGC API (not only
   WMS/WFS) and that the DGT platform licence string is genuinely CC BY 4.0 platform-wide (read the
   licence/attribution field, don't infer).
6. **Confirm Cadastro Predial OGC API + coverage.** Confirm the parcel OGC API is live, mainland-only,
   returns geometry + NIC, and check the CGPR/SiNErGIC coverage for Lisboa (1106) / Porto (1315) /
   Braga (0303) DICOFRE — the standing #1 blocker (README §2.1 / NEXT §3.1).
7. **Confirm Copernicus DEM fallback boundary.** Record which NW-mainland municipalities fall in the
   ~10% DGT-LiDAR gap that Copernicus GLO-30 backfills (terrain only).

**Honesty gate:** until a row is probed, it stays `CONVERGENT-SECONDARY` here and `null`/unchanged
in every RATE and LOD-RATE cell. Ship the probe before the fix.

---

## Cross-references

- `sources/SOURCES.md` — per-field national data-source citations (this review folded into §A.2).
- `findings/PORTUGAL-GEOSPATIAL-INFRASTRUCTURE-REVIEW.md` — the narrative source analysis + reviewer
  9/10 infrastructure score.
- `LOD-RATE.md` — the physical-model (height/parcel) axis; carries the "no national height raster;
  Copernicus DEM terrain fallback" note.
- `README.md §2` — national data-source narrative (parcels, SNIT, LiDAR, heritage, context).
- `NEXT.md §9` — the geospatial probe queue in resume-step form.

---

*Last updated: 2026-07-30. All rows `CONVERGENT-SECONDARY` (expert review, NOT live-probed).
Confirm by direct probe before any row gates production or raises a RATE / LOD-RATE cell.
Maintainer: UNASSIGNED.*
