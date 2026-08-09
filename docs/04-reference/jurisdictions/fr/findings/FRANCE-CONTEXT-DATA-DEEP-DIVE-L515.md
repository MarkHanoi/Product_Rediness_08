# France — 3D Context Data: full deep-dive (L-515)

Part of the context-data study — umbrella **L-511**, deep-dive **L-515**
(`../../../ISSUE-LOG.md`; sibling to Spain **L-512** and Portugal **L-514**).
Source: **captured founder study 2026-07-30** (*France Geospatial + Context Deep-Dive*).

**Confidence discipline (§CONTEXT-DATA-HONESTY).** France's physical layers are **VERIFIED-STRONG**
— IGN is one authoritative national provider, several endpoints were live-probed 2026-07-23 (BD TOPO
`hauteur` non-null; GPU WFS live with `apikey=gpu`), and the FR audit scored DATA-SOURCES ≈ 80%. This
is *stronger* than the Spain (L-512) or Portugal (L-514) starting position on physical data — but it
is **not permission to ship**. Every layer below is flagged **`re-probe before prod`**: coverage
(LiDAR HD is progressive), formats, redistribution licences and classification codes drift, and only
a subset was probed. **A doc claiming a source is available is not a wired, current source.** Nothing
here changes any RATE % cell.

---

## 0. The single most important reframing

**France is two systems.**

1. **The physical world** — parcels, buildings, terrain, imagery, LiDAR — is among Europe's strongest
   and is **national, single-provider (IGN), open-licensed**. France is **Spain-tier** for physical
   data and **removes Portugal's biggest weakness** (patchy parcel coverage) outright: PCI Express is
   national with stable cadastral ids.
2. **Planning regulation** — the numeric buildable rules (hauteur, emprise au sol, retraits) — is
   **decentralised into ~34,900 communes' PLU règlement PDFs**. The national GPU portal returns
   **zoning polygons + document PDF links + metadata**, but **not machine-readable rules**.

**Therefore France's weakness is NOT geospatial — it is PLU rule extraction (OCR).** The correct
investment is (a) reuse the shared ES/FR/PT geometry + height modules against IGN inputs, and (b)
build a scalable PLU-PDF OCR pipeline. **Do not reconstruct already-authoritative national data.**
Target the honest badge **per-site, per-layer**; never flatten to "FR = strong" or "FR = OSM".

---

## 1. Parcels — the removed-weakness (PCI Express / DGFiP / IGN)

**National, strong.** Every parcel in France carries a cadastral reference in the same structure —
département + commune (INSEE) + section (1–2 letters) + parcel number — regardless of region.

- **Source:** IGN **Parcellaire Express (PCI)**, compiled from the DGFiP cadastre.
- **Access:** IGN Géoplateforme WFS `data.geopf.fr/wfs`; OGC API; **API Carto — module cadastre**
  `apicarto.ign.fr/api/cadastre`. Formats: GeoPackage / SHP / GeoJSON. Alt: Etalab
  `cadastre.data.gouv.fr` (bulk per commune, ODbL).
- **Cadence:** semi-annual; explicitly recommended over the discontinued BD Parcellaire (2018).
- **Provenance tier:** **REAL** (VERIFIED-STRONG).

**HONEST LIMITATION — precision, not existence.** Parcel boundaries are **not survey-precise** — an
imprecise graphic representation predating high-precision aerial photography. Nationwide property;
carry as a standing caveat on all France geometry (same caveat class as Spanish refcat geometry).
This *removes* Portugal's coverage weakness — France has no ~134-municipality gap — but the graphic-
precision caveat still applies. **re-probe before prod:** confirm endpoints/formats + redistribution
licence.

---

## 2. Buildings — BD TOPO® (national footprints + classification)

**National, strong.** IGN **BD TOPO®** feature type `BDTOPO_V3:batiment` provides national building
footprints **plus a usage classification** (residential / industrial / commercial / agricultural /
public), compiled from cadastre + photogrammetry + survey + LiDAR + ortho.

- **Access:** WFS `data.geopf.fr/wfs?...TYPENAMES=BDTOPO_V3:batiment` with `apikey=essentiels`.
  Full `batiment` schema (live-probed 2026-07-23) includes `cleabs`, `nature`, `usage_1/2`,
  `nombre_d_etages`, **`hauteur`**, `altitude_minimale_sol`, `altitude_*_toit`, etc.
- **OSM = fallback only** — the national footprints are authoritative.
- **Provenance tier:** **REAL** (VERIFIED-STRONG; `hauteur` live-probed non-null, Paris 8th arr 5/5,
  values 9.5 m / 21 m / 9.6 m).

**re-probe before prod:** re-confirm the `batiment` schema and `hauteur` non-null rate against a live
response — do not rely on the 2026-07-23 snapshot indefinitely.

---

## 3. Height — DERIVED (shared nDSM module), higher ceiling than PT

**There is no single guaranteed-complete national building-height attribute.** BD TOPO `hauteur`
exists and probed non-null, but national completeness is unverified — so height is **DERIVED**, not
REAL, at the scene level.

- **Primary method — shared nDSM module (reuse ES/FR/PT, NEVER fork):** `nDSM = DSM − DTM` from
  **LiDAR HD** (LAS/LAZ + DSM + DTM), per-footprint **90th percentile** (not max — antennas/HVAC
  inflate max), keeping `max` + point count + confidence. This is the **same module** as Spain
  (`../../es/`) and Portugal (`../pt/`, L-511c / L-512b) — **build once (ES+FR+PT), do NOT one-off per
  country.**
- **Cross-check — BD TOPO `hauteur`**: France has a second field to flag disagreements against, which
  Portugal lacks (PT LiDAR height stands alone). Combined with authoritative footprints and high
  LiDAR quality, this gives France a **higher height-confidence ceiling than Portugal**.

**Provenance tiers:** REAL = LiDAR-HD nDSM (P90); DERIVED = LiDAR roof reconstruction / BD TOPO
`hauteur`; ESTIMATED = OSM `building:levels`.

**re-probe before prod:** (1) verify LiDAR HD **department coverage** (progressive — see §11);
(2) do NOT quote an RMSE-Z / accuracy figure until measured against known buildings.

---

## 4. Trees — municipal-first, no national per-tree DB

**No single national per-tree database.** Provenance hierarchy:

1. **REAL — municipal inventories:** Paris, Lyon, Bordeaux, Nantes, Toulouse, Strasbourg, Rennes
   publish per-tree datasets (species / height / DBH / planting year / health). Rich in these cities,
   **absent elsewhere**.
2. **DERIVED — LiDAR HD CHM:** veg-class canopy-height model → local-maxima → watershed (the shared
   **CHM trees module**, same technique as ES/PT). **Verify IGN LiDAR class codes vs ASPRS first** —
   do not assume ASPRS 3/4/5 map cleanly.
3. **ESTIMATED — procedural** placement along OSM / OCS-GE polygons (labelled procedural, not measured).

**re-probe before prod:** municipal tree-dataset **licences differ** (Licence Ouverte / ODbL / custom)
— confirm redistribution per city; confirm IGN LiDAR classification scheme.

---

## 5. Roads — BD TOPO Transport (national, shared road module)

**National, strong.** IGN **BD TOPO Transport** provides national road centrelines + class (motorway /
national / departmental / local) + junctions.

- **Method — shared buffered-road + terrain-drape module (reuse ES/FR/PT):** centreline → width-by-class
  buffer → junction-fill → drape on the IGN DTM (RGE Alti / LiDAR HD DTM).
- **Access:** WFS `data.geopf.fr/wfs` (`troncon_de_route`); API Carto.
- **Provenance tiers:** REAL = BD TOPO Transport centreline + class; DERIVED = width-by-class buffer,
  terrain-draped; ESTIMATED = class-default widths where no local data.

**re-probe before prod:** re-confirm the road attribute schema and class enumeration live.

---

## 6. Pedestrian — municipal → ortho-segmentation → procedural

**No national sidewalk database.** Provenance hierarchy:

1. **REAL — municipal:** Paris / Lyon / Bordeaux publish sidewalk layers where available.
2. **DERIVED — orthophoto segmentation:** the shared **ortho-sidewalk-segmentation module** (same as
   ES/PT) segments IGN aerial imagery into sidewalk polygons where no municipal layer exists.
3. **ESTIMATED — geometric gap-inference** between road surface and building footprints.
4. **Crossings:** procedural unless a municipal crossing dataset exists.

**re-probe before prod:** municipal licence terms; ortho imagery redistribution.

---

## 7. Water — IGN / Sandre / OFB (national)

**National, strong.** Rivers, canals, lakes, reservoirs and coastline (Atlantic + Mediterranean +
Channel) via IGN **BD TOPO Hydrographie** + **Sandre** + **OFB** (Office Français de la Biodiversité).

- **Provenance tiers:** REAL = IGN/Sandre/OFB hydrography shape; DERIVED = terrain-plane / longitudinal-
  gradient / MSL elevation; ESTIMATED = raw OSM polygon with no elevation correction.
- **HARD RULE (same as ES/PT):** **NEVER derive water-surface elevation from raw LiDAR** — NIR is
  absorbed/reflected over water, returns are noisy/missing. Flatten to authoritative reference
  elevations: flat DTM-sampled elevation for lakes; longitudinal gradient sampled along centreline for
  rivers; a fixed **MSL plane** for the coasts.

**re-probe before prod:** confirm Sandre / OFB endpoints + licence alongside the IGN layer.

---

## 8. Parks — OCS GE national land-cover, municipal override

- **DERIVED — national:** IGN **OCS GE** + BD TOPO land-cover give national green/land-cover polygons,
  but (same caveat as Spain's SIOSE / Portugal's COS) national land-cover is **too coarse for
  individual park boundaries** → use as **district-scale context / fallback only**.
- **REAL — municipal:** municipal park polygons override where published.
- **Ground cover = texture; trees = the only 3D veg volume** (same Cityweft/Forma principle as ES/PT).

**re-probe before prod:** OCS GE currency + municipal park-layer licences.

---

## 9. Planning — GPU zoning polygons + PDF links (the OCR bottleneck)

**This is the whole France weakness.** The **Géoportail de l'Urbanisme (GPU)** is a genuinely national
portal: since 1 Jan 2023, publication on it makes a PLU/SCoT legally executory (ordonnance n° 2021-1310).

- **What GPU DOES serve (national, queryable, REAL):** zoning **polygons** (`wfs_du:zone_urba`), the
  governing document's name + approval date, a **link to the written règlement PDF**, and SUP acts —
  via WFS `data.geopf.fr/wfs` (`apikey=gpu`, 5,000-object cap) or API Carto `apicarto.ign.fr/api/gpu`.
- **What GPU does NOT serve (the gap):** the **numeric rules** — hauteur maximale, emprise au sol,
  retraits — are **embedded in the règlement PDFs**. **GPU ≠ machine-readable rules.** Extracting them
  needs an **OCR pipeline** across ~34,900 communes' PDFs.
- Zone codes are **not national**: `UA` in one EPCI and `UA` in the next are independent local
  mnemonics — no cross-reference table. The three large metros (Paris / Lyon / Marseille) even use
  three *structurally different* height mechanisms (see `FRANCE-MASTER-DATA-SOURCE-STUDY.md`).

**Provenance tiers:** REAL = GPU zoning polygons + PDF links; the numeric rules behind them are
**PDF-BASED** (not yet a data tier — OCR-extracted, then citation-gated per L-449).

**re-probe before prod:** GPU auth / pagination / schema; PLU-download link stability (prefer GPU
document references over hot-linked PDFs).

---

## 10. Per-layer three-tier badging matrix (the honesty structure)

Every context layer resolves to a DIFFERENT tier; nothing collapses to one flat REAL/ESTIMATED toggle.

| Layer | REAL tier | DERIVED / reconstructed tier | ESTIMATED tier |
|---|---|---|---|
| **Parcels** | PCI Express / DGFiP (id + geometry) | — | OSM/Overture footprint proxy |
| **Buildings / height** | BD TOPO footprint; **LiDAR-HD nDSM (P90)** | LiDAR roof reconstruction (LOD2); BD TOPO `hauteur` | OSM `building:levels` |
| **Trees** | Municipal per-tree inventory (Paris/Lyon/…) | LiDAR-HD CHM (local-maxima + watershed) | procedural along OSM/OCS-GE |
| **Roads** | BD TOPO Transport centreline + class | width-by-class buffer, terrain-draped | class-default widths |
| **Pedestrian** | Municipal sidewalk layer (Paris/Lyon/Bordeaux) | orthophoto segmentation | geometric gap-inference / procedural crossings |
| **Water** | IGN / Sandre / OFB hydrography shape | terrain-plane / gradient / MSL elevation | raw OSM polygon, no elevation |
| **Parks** | Municipal park polygon | national OCS-GE / BD TOPO land-cover (district-scale) | OSM |

**Example — Paris:** parcels REAL, buildings REAL, **height DERIVED**, trees REAL (municipal),
footpaths DERIVED (ortho-seg). Never scene-wide badge.

---

## 11. Shared modules (reuse ES/FR/PT — NEVER fork per country)

| Module | Method | Reused by |
|---|---|---|
| **nDSM height** | DSM − DTM per footprint → **P90** (keep max + point-count for confidence) | ES, FR, PT (L-511c / L-512b) |
| **CHM trees** | veg-class canopy-height model → local-maxima + watershed | ES, FR, PT |
| **Buffered road + terrain drape** | centreline + class → width buffer → junction-fill → drape on DTM | ES, FR, PT |
| **Ortho-sidewalk segmentation** | aerial imagery segmentation → sidewalk polygons where no municipal layer | ES, FR, PT |

France plugs IGN inputs into these existing modules. **The only genuinely new France build is the PLU
OCR pipeline** — the geometry/height plumbing is shared.

---

## 12. Honest limitations

1. **Planning is PDF-based — GPU ≠ machine-readable rules.** The numeric PLU parameters need OCR. This
   is the France bottleneck, not spatial data.
2. **Height is DERIVED** — no guaranteed-complete national height attribute; nDSM is the robust path
   (BD TOPO `hauteur` is a cross-check, not a stand-alone truth).
3. **Municipal variance is large** — Paris ≫ rural for trees / sidewalks / park polygons.
4. **LiDAR HD is progressive** — ~80% metro end-2025, full national end-2026; verify department
   coverage before a site depends on it.
5. **Licence variance** — national IGN layers are Etalab 2.0, but municipal datasets vary (Licence
   Ouverte / ODbL / custom); check redistribution per municipal source.

---

## 13. FR vs ES vs PT comparison

| Layer | France | Spain | Portugal |
|---|---|---|---|
| **Parcels** | ★★★★★ PCI Express (national, stable id) | ★★★★★ Catastro refcat | ★★☆☆☆ Carta Cadastral (patchy) |
| **Buildings** | ★★★★★ BD TOPO (+ classification) | ★★★★★ Catastro footprints | ★★☆☆☆ Lisbon only |
| **LiDAR** | ★★★★★ LiDAR HD 10 pts/m² (progressive) | ★★★★★ PNOA-LiDAR | ★★★★☆ DGT LiDAR ~90% |
| **Roads** | ★★★★★ BD TOPO Transport | ★★★★★ IGN-ES / municipal | ★★★☆☆ OSM + IP (unverified) |
| **Planning** | ★★☆☆☆ GPU polygons + **PDF rules (OCR)** | ★★☆☆☆ municipal PGOU PDFs | ★☆☆☆☆ weakest |

**Reading:** France matches Spain on every physical row and **beats Portugal on parcels + buildings**.
All three share the planning weakness (numeric rules in municipal PDFs); France's is ★★ because GPU at
least serves national zoning polygons + PDF links uniformly.

---

## 14. Phase-1 probe checklist (re-probe before prod)

Asserted in the captured study; VERIFIED-strong but **not all live-probed this session** — treat each
as a spike gate before Phase-2 relies on it:

1. **IGN Géoplateforme OGC API** — landing / `collections` / Features / Tiles / Maps; canonical base URL.
2. **PCI Express** — endpoints, formats, redistribution licence.
3. **BD TOPO schema** — re-confirm building (`batiment.hauteur`) + road (`troncon_de_route` class)
   attributes live.
4. **LiDAR HD department coverage** — dept-by-dept table; confirm target-city departments flown.
5. **IGN LiDAR classification** — record actual class codes; **do NOT assume ASPRS** before CHM veg.
6. **Municipal tree licences** — Paris/Lyon/Bordeaux/Nantes/Toulouse/Strasbourg/Rennes.
7. **GPU WFS / API** — auth (`apikey=gpu`), pagination cap, zone-urba + document schema.
8. **PLU download stability** — prefer GPU document references over hot-linked PDFs.
9. **Redistribution licences** — BD TOPO / PCI / LiDAR / ortho all permit redistribution inside PRYZM.
10. **Building-height RMSE** — nDSM vs known-building ground truth; do NOT quote accuracy until measured.

**Honesty gate:** until a layer is re-probed live it stays VERIFIED-strong / re-probe-before-prod here
and `null`/unchanged in every RATE and LOD cell. **Ship the probe before the fix.**

---

## Cross-references

- `../FRANCE-GEOSPATIAL-DATA-INVENTORY.md` — the single-table [Layer|Authority|Access|…] inventory.
- `FRANCE-MASTER-DATA-SOURCE-STUDY.md` — the rule-mechanism study (Paris/Lyon/Marseille height kinds).
- `../sources/SOURCES.md` — per-field national data-source citations (this study folded into §A).
- `../README.md §2–§4` — national data-source narrative + ABF/PSMV/SUP overlay-risk.
- Sibling deep-dives: `../../pt/PORTUGAL-CONTEXT-DEEP-DIVE.md` (L-514), `../../es/CONTEXT-DATA-SPIKE.md`
  (L-512).

---

*Last updated: 2026-07-30. Physical layers VERIFIED-STRONG (IGN, national; several live-probed
2026-07-23) but flagged `re-probe before prod`; height DERIVED (no complete national attribute);
planning PDF-based (GPU ≠ machine-readable rules → OCR). Changes NO RATE % cell. Maintainer: UNASSIGNED.*
</content>
