# France (`fr`) — Geospatial Data Inventory (IGN Géoplateforme platform)

> **What this file is.** A single-table inventory of the national geospatial layers PRYZM would
> consume for France, folded from the captured expert study of 2026-07-30
> (*France Geospatial + Context Deep-Dive, L-515*). It catalogues **who owns each layer, how it is
> accessed, its licence, and whether it is production-ready** — the geospatial (data-availability)
> axis, NOT the buildable-rule axis (`RATE.md`) and NOT the per-city LOD/height physical-model axis.
> Never conflate the three. **This file changes NO RATE % cell.**
>
> **Confidence discipline (§CONTEXT-DATA-HONESTY).** France's physical layers are **`VERIFIED-STRONG`**
> — IGN is a single authoritative national provider, several endpoints were live-probed 2026-07-23
> (BD TOPO `hauteur` non-null, GPU WFS live), and the FR data-source audit scored DATA-SOURCES ≈ 80%.
> But **VERIFIED-strong is not permission to ship**: coverage, formats, redistribution licences and
> classification schemes drift, and only a subset was probed. **Every row carries a `re-probe before
> prod` flag; a doc claiming a source is available is not a wired-and-current source.** The physical
> rows are strong national data (parcels/buildings/terrain/LiDAR); the **planning row is PDF-based**
> and the **height row is DERIVED** (no national building-height attribute). The probe items in
> §Probe steps are what would, once RE-PROBED + WIRED, become a Phase-3 PLAN — they raise no RATE
> cell here.
>
> **Session date:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** captured, VERIFIED-strong / re-probe-before-prod.

---

## Headline (from the study)

**France's weakness is NOT geospatial.** Parcels, buildings, terrain and LiDAR are all national,
single-provider (IGN), open-licensed and among the strongest in Europe — France is *Spain-tier* for
physical data and removes Portugal's biggest weakness (patchy parcel coverage) outright. The single
bottleneck is **planning-rule extraction: numeric PLU parameters live inside municipal règlement
PDFs** — the **GPU portal returns zoning polygons + PDF links, not machine-readable rules**. The
investment for France is therefore (a) reuse the shared ES/FR/PT geometry + height modules and
(b) build a scalable **PLU OCR** pipeline — **never reconstruct already-authoritative national data.**

France is **two systems**: a physical world (parcels / buildings / terrain / imagery / LiDAR) that is
national and strong, and a planning-regulation world that is decentralised into ~34,900 communes'
PDFs. Do not let the planning weakness contaminate the physical-data confidence, or vice-versa.

- **Parcels (PCI Express, DGFiP+IGN)** carry stable national ids (département + commune + section +
  parcel #) — the jurisdiction-key analogue of Spain's refcat.
- **Building height is DERIVED**: BD TOPO carries a `hauteur` attribute (live-probed non-null in
  Paris), but there is **no guaranteed-complete national height attribute** — the robust height path
  is **nDSM = LiDAR-HD DSM − DTM**, per-footprint P90. Same shared module as ES/PT.
- **LiDAR HD is progressive** (~80% metropolitan France end-2025, full national end-2026) — coverage
  must be verified department-by-department before it gates a site.

---

## The inventory

| Layer | Authority | Access | API | Licence | CRS | National | Production-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Parcels — PCI / Parcellaire Express** | DGFiP (source) + IGN (product) | IGN Géoplateforme; alt. Etalab `cadastre.data.gouv.fr` | WFS `data.geopf.fr/wfs`; OGC API; API Carto `apicarto.ign.fr/api/cadastre`; formats GeoPackage/SHP/GeoJSON | Open (Licence Ouverte / Etalab 2.0); alt. ODbL | Lambert-93 (EPSG:2154) native; WFS serves EPSG:4326 | Yes | ★★★★★ — stable ids (dépt+commune+section+parcel#). **Caveat: NOT survey-precise** (graphic representation). **re-probe before prod** | **VERIFIED-STRONG** (IGN; re-probe) |
| **Buildings — BD TOPO® `batiment`** | IGN | IGN Géoplateforme | WFS `data.geopf.fr/wfs?...TYPENAMES=BDTOPO_V3:batiment` `apikey=essentiels` | Open (Etalab 2.0) | EPSG:2154 / WFS 4326 | Yes | ★★★★★ — national footprints + classification (residential/industrial/commercial/agricultural/public); cadastre+photogrammetry+survey+LiDAR+ortho compiled. OSM = fallback only. **re-probe before prod** | **VERIFIED-STRONG** (IGN; `hauteur` live-probed 2026-07-23) |
| **Height (building)** | IGN (derived) | LiDAR HD DSM/DTM tiles + BD TOPO `hauteur` | nDSM = DSM − DTM per footprint → **P90** (+max+point-count+confidence); shared ES/FR/PT module | Open (Etalab 2.0) | EPSG:2154 | **No single national height attribute** → **DERIVED** | ★★★★☆ — higher ceiling than PT (authoritative footprints + high LiDAR quality). BD TOPO `hauteur` live-probed non-null (Paris 5/5) but completeness not nationally guaranteed. **re-probe before prod** | **DERIVED** (VERIFIED inputs) |
| **Terrain (DTM/DSM)** | IGN | RGE Alti + LiDAR HD | GeoTIFF tiles (50 cm / 5 m); `lidarhd.ign.fr`, `macarte.ign.fr` coverage | Open (Etalab 2.0) | EPSG:2154 | Yes (RGE Alti national; LiDAR HD progressive) | ★★★★★ — RGE Alti national; LiDAR HD DTM finer where flown. **re-probe before prod** | **VERIFIED-STRONG** (IGN) |
| **LiDAR HD (point cloud)** | IGN | `lidarhd.ign.fr` tile download; `macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD` coverage | LAS/LAZ 10 pts/m² + DSM + DTM, dept-by-dept | Etalab 2.0 (commercial use OK, attribution only) | EPSG:2154 | **~80% metro end-2025; full national end-2026** — **progressive** | ★★★★☆ — high quality; **verify dept coverage before use**; IGN classification (do NOT assume ASPRS). **re-probe before prod** | **VERIFIED-STRONG** (IGN; coverage rolling) |
| **Roads — BD TOPO Transport** | IGN | IGN Géoplateforme | WFS `data.geopf.fr/wfs` (`troncon_de_route`); API Carto | Open (Etalab 2.0) | EPSG:2154 / WFS 4326 | Yes | ★★★★★ — national centrelines + class (motorway/national/departmental/local) + junctions → width-by-class buffer → terrain drape (shared road module). **re-probe before prod** | **VERIFIED-STRONG** (IGN) |
| **Water** | IGN + **Sandre** + **OFB** | IGN Géoplateforme (BD TOPO Hydrographie) + Sandre / OFB portals | WFS / OGC API | Open | EPSG:2154 | Yes — rivers/canals/lakes/reservoirs/coastline (Atlantic+Med+Channel) | ★★★★★ — **NEVER derive water elevation from LiDAR** (flat/gradient/MSL plane instead). **re-probe before prod** | **VERIFIED-STRONG** (IGN/Sandre/OFB) |
| **Parks / green** | IGN (OCS GE) | IGN Géoplateforme (OCS GE + BD TOPO land-cover) | WFS / OGC API; municipal park polygons override | Open | EPSG:2154 | Yes (national land-cover); municipal polygons where richer | ★★★★☆ — national OCS GE too coarse for individual park boundaries → district-scale context; municipal park layer overrides. **re-probe before prod** | **VERIFIED-STRONG** (national) / CONVERGENT (municipal) |
| **Trees** | Municipal inventories (Paris/Lyon/Bordeaux/Nantes/Toulouse/Strasbourg/Rennes) | Municipal open-data portals; else LiDAR HD CHM | per-tree species/height/DBH/year/health; else CHM local-maxima+watershed | Municipal (Licence Ouverte / ODbL / custom — **varies**) | varies | **No single national per-tree DB** | ★★★☆☆ — rich in named cities, absent elsewhere → CHM-derived or procedural. Municipal licences differ. **re-probe before prod** | **CONVERGENT-MUNICIPAL** |
| **Pedestrian / sidewalks** | Municipal (Paris/Lyon/Bordeaux) | Municipal portals; else ortho segmentation | modelled sidewalks; else ortho-seg / gap-inference | Municipal (varies) | varies | **No national sidewalk DB** | ★★★☆☆ — municipal → ortho-segmentation → procedural gap-inference; crossings procedural unless municipal. **re-probe before prod** | **CONVERGENT-MUNICIPAL** / DERIVED |
| **Planning — GPU (zoning)** | IGN / Géoportail de l'Urbanisme | `data.geopf.fr/wfs` (`wfs_du:zone_urba` etc., `apikey=gpu`, 5,000-obj cap); API Carto `apicarto.ign.fr/api/gpu` | WFS / API Carto — returns zone code, document name+date, **PDF link**, SUP acts | Open | EPSG:4326 | Yes (national portal; PLU/PLUi/POS/carte communale/RNU) | ★★☆☆☆ — **zoning POLYGONS + PDF links are national and queryable**, but **numeric PLU rules are embedded in PDFs → GPU ≠ machine-readable rules → OCR needed**. **re-probe before prod** | **VERIFIED** (polygons) / **PDF-BASED** (rules) |

**Ranked building-height sources (best-first):** (1) **LiDAR-HD → nDSM** [shared ES/FR/PT module,
P90 per footprint]; (2) **BD TOPO `hauteur`** attribute (live-probed non-null; national completeness
unverified — cross-check, don't stand alone on it); (3) **LiDAR roof reconstruction** (LOD2, compute);
(4) **OSM `building:levels`** (ESTIMATED fallback). Note the physical footprints under (1)–(2) are
authoritative — France's height ceiling is higher than PT's because the footprints and LiDAR are both
strong.

---

## 3-tier badging matrix (§CONTEXT-DATA-HONESTY — every layer its own provenance)

Every context layer resolves to a DIFFERENT tier; nothing collapses to one flat scene-wide toggle.

| Layer | REAL tier | DERIVED / reconstructed tier | ESTIMATED tier |
|---|---|---|---|
| **Parcels** | PCI Express / DGFiP (stable id + geometry) | — | OSM/Overture footprint proxy (approximation) |
| **Buildings / height** | BD TOPO footprint; **LiDAR-HD nDSM (P90)** | LiDAR roof reconstruction (LOD2); BD TOPO `hauteur` | OSM `building:levels` |
| **Trees** | Municipal per-tree inventory (Paris/Lyon/…) | LiDAR-HD CHM (local-maxima + watershed) | procedural along OSM/OCS-GE |
| **Roads** | BD TOPO Transport centreline + class | width-by-class buffer, terrain-draped | class-default widths, no local data |
| **Pedestrian** | Municipal sidewalk layer (Paris/Lyon/Bordeaux) | orthophoto segmentation | geometric gap-inference / procedural crossings |
| **Water** | IGN / Sandre / OFB hydrography shape | terrain-plane / gradient / MSL elevation | raw OSM polygon, no elevation correction |
| **Parks** | Municipal park polygon | national OCS-GE / BD TOPO land-cover (district-scale) | OSM |

**Example — Paris:** parcels REAL, buildings REAL, height DERIVED, trees REAL (municipal inventory),
footpaths DERIVED (ortho-seg). **Never badge a scene REAL because one layer is** — badge per-site,
per-layer.

---

## Shared modules (reuse ES/FR/PT — NEVER fork per country)

| Module | Method | Reused by |
|---|---|---|
| **nDSM height** | DSM − DTM per footprint → **P90** (keep max + point-count for confidence) | ES, FR, PT (L-511c / L-512b) |
| **CHM trees** | veg-class canopy-height model → local-maxima + watershed | ES, FR, PT |
| **Buffered road + terrain drape** | centreline + class → width buffer → junction-fill → drape on DTM | ES, FR, PT |
| **Ortho-sidewalk segmentation** | aerial imagery segmentation → sidewalk polygons where no municipal layer | ES, FR, PT |

France's investment is to **wire these existing modules to IGN inputs**, not re-implement them.

---

## Honest limitations (the study's five)

1. **Planning is PDF-based.** GPU returns zoning polygons + document PDF links, **not** machine-readable
   numeric rules. Extracting hauteur / emprise / retraits needs an OCR pipeline — this is the whole
   France bottleneck.
2. **No national building-height attribute** that is guaranteed complete → height is **DERIVED**
   (nDSM). BD TOPO `hauteur` exists and probed non-null, but do not assume national completeness.
3. **Municipal richness varies hugely** — Paris ≫ rural. Trees, sidewalks, park polygons exist in a
   handful of large cities and are absent elsewhere.
4. **LiDAR HD is progressive** — ~80% metro end-2025, full national end-2026. **Verify department
   coverage** before a site relies on it.
5. **Municipal licences differ** (Licence Ouverte / ODbL / custom) — redistribution terms must be
   checked per municipal dataset, not assumed from the national Etalab 2.0 default.

---

## FR vs ES vs PT comparison (physical + planning, ★ = strength)

| Layer | France | Spain | Portugal |
|---|---|---|---|
| **Parcels** | ★★★★★ PCI Express (national, stable id) | ★★★★★ Catastro refcat | ★★☆☆☆ Carta Cadastral (patchy — ~134 munis) |
| **Buildings** | ★★★★★ BD TOPO (national + classification) | ★★★★★ Catastro footprints | ★★☆☆☆ Lisbon only, no national |
| **LiDAR** | ★★★★★ LiDAR HD 10 pts/m² (progressive) | ★★★★★ PNOA-LiDAR | ★★★★☆ DGT LiDAR ~90% continental |
| **Roads** | ★★★★★ BD TOPO Transport | ★★★★★ IGN-ES / municipal | ★★★☆☆ OSM + IP (unverified) |
| **Planning** | ★★☆☆☆ GPU polygons + **PDF rules (OCR)** | ★★☆☆☆ municipal PGOU PDFs | ★☆☆☆☆ weakest |

**Reading:** France is *Spain-tier* on every physical row and **beats Portugal on parcels + buildings**.
All three share the same planning weakness (numeric rules in municipal PDFs) — France's is ★★ because
GPU at least serves national zoning polygons + PDF links uniformly.

---

## §Probe steps (the Phase-1 geospatial probe queue)

These are the exact live probes that would upgrade the rows above from `VERIFIED-STRONG /
re-probe-before-prod` to `VERIFIED-LIVE (current)` and, once WIRED, become Phase-3 PLAN items.

1. **IGN Géoplateforme OGC API** — confirm landing / `collections` / Features / Tiles / Maps; record
   canonical base URL (`data.geopf.fr`).
2. **PCI Express** — confirm endpoints, formats (GeoPackage/SHP/GeoJSON/WFS/OGC-API) and redistribution
   licence.
3. **BD TOPO schema** — re-confirm building + road attributes (`batiment.hauteur`, `troncon_de_route`
   class) against a live response; do not rely on the 2026-07-23 snapshot indefinitely.
4. **LiDAR HD department coverage** — pull the current dept-by-dept coverage table; verify target-city
   departments are flown.
5. **IGN LiDAR classification** — record the actual class codes; **do NOT assume ASPRS** before wiring
   CHM veg extraction.
6. **Municipal tree licences** — Paris/Lyon/Bordeaux/Nantes/Toulouse/Strasbourg/Rennes redistribution
   terms (Licence Ouverte / ODbL / custom).
7. **GPU WFS / API** — confirm auth (`apikey=gpu`), pagination cap, and the zone-urba + document schema.
8. **PLU download stability** — prefer GPU-returned document references over hot-linking PDFs; verify
   link stability.
9. **Redistribution licences** — BD TOPO / PCI / LiDAR / ortho: confirm each permits redistribution
   inside PRYZM.
10. **Building-height RMSE** — compute nDSM vs known-building ground truth; do NOT quote an accuracy
    figure until measured.

**Honesty gate:** until a row is re-probed live, it stays `VERIFIED-STRONG / re-probe-before-prod`
here and `null`/unchanged in every RATE and LOD cell. **Ship the probe before the fix.**

---

## Cross-references

- `sources/SOURCES.md` — per-field national data-source citations (this study folded into §A).
- `findings/FRANCE-CONTEXT-DATA-DEEP-DIVE-L515.md` — the per-layer source hierarchies + badging matrix.
- `findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md` — the rule-mechanism study (Paris/Lyon/Marseille).
- `README.md §2–§4` — national data-source narrative + overlay-risk (ABF/PSMV/SUP).
- `NEXT.md` — blockers + resume steps.

---

*Last updated: 2026-07-30. Physical rows `VERIFIED-STRONG` (IGN, national; several live-probed
2026-07-23) but flagged `re-probe before prod`; height `DERIVED` (no complete national attribute);
planning `PDF-BASED` (GPU ≠ machine-readable rules). Changes NO RATE % cell. Maintainer: UNASSIGNED.*
</content>
