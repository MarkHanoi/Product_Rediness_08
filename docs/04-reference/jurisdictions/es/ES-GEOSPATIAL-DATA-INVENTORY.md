# Spain (`es`) — Geospatial Data Inventory (CNIG / IGN / DG Catastro national platform)

> **What this file is.** A single-table inventory of the national geospatial layers PRYZM consumes
> for Spain, folded from the founder-supplied *Spain Geospatial + Context Deep-Dive* (L-512,
> 2026-07-30). It catalogues **who owns each layer, how it is accessed, its licence, CRS, and whether
> it is production-ready** — the geospatial (data-availability) axis, NOT the buildable-rule axis
> ([`RATE.md`](./RATE.md)) and NOT the LOD/height physical-model axis ([`LOD-RATE.md`](./LOD-RATE.md)).
> Never conflate the three.
>
> **Confidence discipline (§CONTEXT-DATA-HONESTY).** Spain is the reference country — Barcelona ships
> on exactly this stack, and the MDS Edificación / Catastro / PNOA endpoints were live-verified during
> the zoning and context spikes (2026-07-20/21/26). Every row is therefore **`VERIFIED-PRIMARY`**, not
> the aspirational `CONVERGENT-SECONDARY` that PT/DE/IT/US carry. **BUT** the individual endpoints in
> this inventory were captured from a deep-dive, not re-hit this session, so each row is tagged
> **"VERIFIED-PRIMARY · captured, re-probe before prod."** A doc claiming a source is live is not the
> same as a source hit in a Network tab this pass. **Ship the (re-)probe before the fix.** This file
> changes **NO RATE % cell** (that is the audit's job, C63 §1.1).
>
> **Session date:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** captured, pending re-probe.

---

## Headline (from the deep-dive)

Spain's strength is **not any single hero dataset — it is the COMBINATION of national programmes**
that interlock into a complete geospatial base: **DG Catastro** (parcels + footprints + use/floors/
year attributes) + **IGN/CNIG** (admin boundaries, MDT/MDS terrain, BTN hydrography/roads/rail/coast) +
**PNOA** (national LiDAR + 25 cm orthophotos) + **MDS Edificación** (a national building-height
raster — the edge no other country in the set has) + **CartoCiudad** (addresses/reverse-geocode) +
**SIOSE** (land cover) + **MITECO** (protected areas / flood) + **IGME-CSIC** (geology). Infra
maturity scored ~9.5–10/10. **Remaining work is INTEGRATION, not discovery** — the sources exist, are
open, and are national; the job is wiring and per-city baking, not sourcing.

- **Owners of record:** DG Catastro · IGN · CNIG · MITECO · IGME-CSIC · INE. Third-party portals
  (Litehaus-style aggregators) are **discovery only, never authoritative** — trace every layer back to
  its owning programme.
- **The height edge:** the **CNIG MDS Edificación** raster (`mdsn_e025`, 2.5 m) is a *national
  building-height nDSM already isolated to the building class* — pixel value IS height above ground,
  no per-site DSM−DTM subtraction needed. Spain has **three** independent cross-validating height
  sources (MDS Edificación → PNOA LiDAR nDSM → Catastro floor-count) versus PT's one.
- **CRS:** ETRS89 national grid (EPSG:25828–25831 UTM 28–31N; MDS on EPSG:3042 UTM30N single-zone).
  CartoCiudad REST returns WGS84. Reproject at the edge.
- **Weaknesses (honest):** **no national LOD2/LOD3** roof model (footprint + height only; roofs are
  self-reconstructed RANSAC, badged "reconstructed"); **municipal planning fragmented** across CCAA /
  municipios (the LEGISLATION/ENVELOPE cap — see [`RATE.md`](./RATE.md)); environmental layers **split
  across ministries** (no single catalogue).

---

## The inventory (21 rows)

Licence **CC BY 4.0** and CRS **ETRS89 (EPSG:25828–31)** unless a cell says otherwise. Confidence is
**`VERIFIED-PRIMARY`** for every row (Spain = reference country); the "captured, re-probe" caveat in
the header applies to all.

| # | Layer | Authority | Access | Download | Licence | CRS | National | Prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Admin boundaries** (CCAA / provincia / municipio) | IGN / CNIG | WMS · WFS · ATOM | Shapefile / GML | CC BY 4.0 | ETRS89 | Yes | ★★★★★ | VERIFIED-PRIMARY |
| 2 | **INE municipality codes** (jurisdiction routing) | INE | REST / table | CSV / table | Open | n/a (code) | Yes | ★★★★★ — the AGS/INSEE-analogue routing key | VERIFIED-PRIMARY |
| 3 | **Catastro parcels** (parcela catastral + refcat + area) | DG Catastro | INSPIRE WMS / WFS / ATOM | GML | Open (Catastro free) | ETRS89 UTM 28–31N | Yes (excl. País Vasco + Navarra foral) | ★★★★★ **Tier-A parcel country** — live-verified | VERIFIED-PRIMARY |
| 4 | **Building footprints** (Construcciones / `bu:Building`+`BuildingPart`) | DG Catastro | INSPIRE WFS / ATOM | GML | Open | ETRS89 | Yes (excl. foral) | ★★★★★ — WFS live 200; footprints in the cadastral model, no OSM reconstruction | VERIFIED-PRIMARY |
| 5 | **Building attributes** (use / `ALTURAS` floor-count / year built+renov) | DG Catastro | INSPIRE WFS · FXCC `CONSTRU` | GML / shapefile | Open | ETRS89 | Yes (excl. foral) | ★★★★★ — `ALTURAS` = real floor count (**not** a measured height) | VERIFIED-PRIMARY |
| 6 | **MDS Edificación** — national building-height raster (`mdsn_e025`, 2.5 m) | IGN / PNOA (CNIG) | **WCS 2.0.1** (`wcs-mds.idee.es/mds`, keyless) | GeoTIFF | CC BY 4.0 | **EPSG:3042** (ETRS89 UTM30N, single-zone all-Spain) | Yes | ★★★★★ — **the height edge**; pixel = building nDSM; LIVE-VERIFIED 2026-07-26 | VERIFIED-PRIMARY |
| 7 | **MDT terrain** (bare-earth DEM) | IGN / PNOA (CNIG) | WCS · download | GeoTIFF / ASCII | CC BY 4.0 | ETRS89 | Yes | ★★★★★ — terrain drape + DTM half of nDSM | VERIFIED-PRIMARY |
| 8 | **MDS surface** (first-return surface DEM) | IGN / PNOA (CNIG) | WCS · download | GeoTIFF | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ — DSM half of nDSM (superseded by MDS Edif for buildings) | VERIFIED-PRIMARY |
| 9 | **PNOA LiDAR** (classified point cloud) | IGN / PNOA (CNIG) | Centro de Descargas (tiled, session) | LAZ (0.5–5 pt/m²) | CC BY 4.0 | ETRS89 | **~complete** (3 cycles 2009–2025, rolling) | ★★★★☆ — tile-index resolver, not a bbox API; cycle-tag every height | VERIFIED-PRIMARY |
| 10 | **PNOA orthophotos** (25 cm imagery) | IGN / PNOA (CNIG) | WMTS · WMS | JP2 / GeoTIFF | CC BY 4.0 | ETRS89 | Yes | ★★★★★ — imagery base (analogue of PT 30 cm ortho) | VERIFIED-PRIMARY |
| 11 | **SIOSE** — land cover | IGN / CNIG | WMS · WFS · download | GML / shapefile | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ — district-scale context; too coarse for individual park boundaries | VERIFIED-PRIMARY |
| 12 | **BTN100 / BTN25 hydrography** (rivers, water bodies) | IGN / CNIG | WFS · download | GML / shapefile | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ — flatten to constant/MSL, never inherit raw LiDAR | VERIFIED-PRIMARY |
| 13 | **Road network** (centrelines) | IGN / CNIG (BTN100 / BTN25) | WFS · download | GML / shapefile | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ — centreline → class → width-buffer → drape | VERIFIED-PRIMARY |
| 14 | **Railways** | IGN / CNIG (BTN) | WFS · download | GML / shapefile | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ — L-642 CONTEXT add | VERIFIED-PRIMARY |
| 15 | **Coastline** | IGN / CNIG (BTN) | WFS · download | GML / shapefile | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ — dominant-coast close + land-guard (L-642) | VERIFIED-PRIMARY |
| 16 | **Protected areas** (Red Natura 2000) | MITECO | WMS · WFS · download | shapefile | CC BY 4.0 | ETRS89 | Yes | ★★★★☆ (reviewer) — overlay layer | VERIFIED-PRIMARY |
| 17 | **Flood zones** (SNCZI) | MITECO | WMS · download | shapefile | Open | ETRS89 | Yes | ★★★★☆ — overlay/constraint | VERIFIED-PRIMARY |
| 18 | **Geology** (GEODE) | IGME-CSIC | WMS · download | shapefile / GeoTIFF | Open | ETRS89 | Yes | ★★★★☆ — geotechnical context; IGME ≠ any civil-lab | VERIFIED-PRIMARY |
| 19 | **Forestry** (Mapa Forestal / Inventario) | MITECO | WMS · download | shapefile | Open | ETRS89 | Yes | ★★★☆☆ — tree *extent* only, never per-tree | VERIFIED-PRIMARY |
| 20 | **Heritage** (Bienes de Interés Cultural, BIC) | Min. Cultura | WMS · registry | table / shapefile | Open | ETRS89 | Yes | ★★★★☆ — heritage-regime overlay | VERIFIED-PRIMARY |
| 21 | **CartoCiudad addresses** (geocode + reverse-geocode) | IGN | **REST** | JSON | CC BY 4.0 | **WGS84** | Yes | ★★★★★ — address/road-name base (the `url_abs`-analogue lookup) | VERIFIED-PRIMARY |

**Ranked building-height sources (best-first):** (1) **MDS Edificación** raster `mdsn_e025` [national,
building-isolated, no subtraction — Spain's edge]; (2) **PNOA LiDAR nDSM** = DSM−DTM 90th-pctile
[our shared ES/FR/PT module]; (3) **municipal LiDAR** (ICGC Catalonia — denser/newer, preferred for
Barcelona); (4) **Catastro floor-count** (`ALTURAS` × ~3–3.2 m) — **VALIDATION only** (plausibility /
anomaly flag), never the primary measured height. Store `max` + point-count + confidence separately.

---

## Strategy note (from the deep-dive)

> Aggregators/catalogues (Litehaus-style) are a **convenience index, never the source of record**.
> Trace every layer to its owning national programme (Catastro / IGN / CNIG / PNOA / MITECO / IGME /
> INE). Depend on the stable public services, not the aggregator.

Because the sources are national, open, and already proven for Barcelona, this inventory does **not**
by itself raise Spain's rate — it documents what Spain HAS (mostly real), and defines the re-probe
queue that keeps each row honest before a production decision leans on it.

---

## §Probe steps (the re-probe queue — keep each row honest)

These live re-probes keep the rows above at `VERIFIED-PRIMARY · confirmed` rather than
`VERIFIED-PRIMARY · captured`. They mirror the deep-dive's live-probe checklist. See also
[§Phase-3 in `RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md).

1. **CNIG OGC API** — landing / `/collections` / advertised CRS list (anchors the IGN rows).
2. **Catastro INSPIRE WFS** — parcel + building + `BuildingPart` (`ALTURAS`) schema; confirm native
   `EPSG::25830/25831` query dodges the 4326 axis-order exception (CONTEXT-DATA-SPIKE §"Integration").
3. **MDS Edificación WCS** — `GetCoverage COVERAGEID=mdsn_e025`; confirm publication/update cadence +
   validate-vs-LiDAR agreement; re-sample the ready-bbox cities.
4. **PNOA LiDAR** — campaign/density/date per target tile (cycle tag drives the height confidence).
5. **CartoCiudad REST** — geocode + reverse-geocode round-trip.
6. **BTN25 / BTN100** — roads / hydro / rail / coast / bridges FeatureType names + widths.
7. **SIOSE** — release + classification schema.
8. **MITECO** — Natura 2000 / flood (SNCZI) endpoints.
9. **IGME** — GEODE geology endpoint.
10. **Municipal** (BCN / Madrid / Valencia / Bilbao / Zaragoza / Málaga / Sevilla) — licensing +
    CityGML / tree-cadastre / curb-polygon availability (the Tier-A municipal exceptions).

**Honesty gate:** a row stays `VERIFIED-PRIMARY · captured` until re-hit, and never raises a RATE /
LOD-RATE cell on the strength of this file alone. Ship the probe before the fix.

---

## Cross-references

- [`findings/SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md`](./findings/SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md) —
  the per-layer source hierarchies, the 3-tier REAL/DERIVED/ESTIMATED badging matrix, the shared
  reconstruction modules, and the probe checklist.
- [`CONTEXT-DATA-SPIKE.md`](./CONTEXT-DATA-SPIKE.md) — the live endpoint verification (2026-07-21) +
  the Phase-1 gate.
- [`topics/buildings-lod-height.md`](./topics/buildings-lod-height.md) ·
  [`topics/roads-pedestrian.md`](./topics/roads-pedestrian.md) ·
  [`topics/water.md`](./topics/water.md) · [`topics/parks-trees.md`](./topics/parks-trees.md) — the
  per-layer 3D-modelling methods (do not duplicate; this inventory is the source catalogue, those are
  the reconstruction recipes).
- [`SPAIN-HEIGHT-MEASUREMENT.md`](./SPAIN-HEIGHT-MEASUREMENT.md) — the nDSM method + PNOA accuracy by
  cycle + the three-field height badge.
- [`LOD-RATE.md`](./LOD-RATE.md) — the physical-model (height/parcel) axis.
- [`SPAIN-GEODATA-SOURCE-COVERAGE.md`](./SPAIN-GEODATA-SOURCE-COVERAGE.md) — the coverage/strategy
  narrative.
- `../../standards/GEO-DATA-SOURCING-MASTER.md` — the per-country terrain+heights map.

---

*Last updated: 2026-07-30. All rows `VERIFIED-PRIMARY` (Spain = reference country; Barcelona ships on
this stack) but **captured, not re-hit this session** — re-probe before any row gates a production
decision or raises a RATE / LOD-RATE cell. Maintainer: UNASSIGNED. §CONTEXT-DATA-HONESTY.*
