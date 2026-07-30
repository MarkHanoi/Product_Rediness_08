# England — jurisdiction profile (FULL)

**Constituent country:** England · **Parent:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
**Registry:** HM Land Registry (ownership, general boundaries) · **Planning:** NPPF + per-LPA Local
Plans · **Mapping:** Ordnance Survey (GB-wide) · **CRS:** OSGB36 / British National Grid (EPSG:27700) ·
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **status: unprobed** (OS not wired in PRYZM;
EA LIDAR DTM terrain probe is the sole wired GB service — see `../gb-eng/E12000007-london/`)

> **Confidence: CONVERGENT-SECONDARY throughout.** England's *physical* mapping (OS) is world-class in
> the literature, but **not wired or live-probed in PRYZM**. Nothing here moves a `RATE.md` cell.
> **⚠ HMLR title polygons / INSPIRE Index Polygons are OWNERSHIP with GENERAL boundaries (s.60 LRA
> 2002) — NEVER survey-grade / a legal parcel edge.** Empty and failed are the same value.

England is the fullest UK jurisdiction: it anchors the shared GB pipeline (OS, UPRN, BNG) and carries
the reference implementation of every context layer. Scotland / Wales / NI reuse this structure with
their own registry / LiDAR / heritage / planning adapters.

---

## 1 — Responsible authorities

| Domain | Authority |
|---|---|
| Topographic mapping | **Ordnance Survey (OS)** — GB-wide, incl. OS Data Hub / OS NGD |
| Land ownership | **HM Land Registry (HMLR)** — titles, title plans, INSPIRE Index Polygons |
| Address / property spine | **GeoPlace** (OS + local authorities) — AddressBase / **UPRN** |
| Terrain + LiDAR | **Environment Agency (EA)** — National LIDAR Programme, Composite DTM/DSM |
| Planning policy (national) | **MHCLG** (Dept for Housing, Communities & Local Govt) — **NPPF** |
| Planning (local) | **~330 Local Planning Authorities (LPAs)** — Local Plans, Policies Maps |
| Heritage | **Historic England** — Listed Buildings, Conservation Areas, Scheduled Monuments |
| Nature / green | **Natural England** — SSSIs, National Parks, AONBs, priority habitats |
| Roads (strategic) | **National Highways** (motorways + A-roads); LAs for local roads |
| Water / flood | **Environment Agency** — Flood Map, rivers, coastal |
| Forest | **Forestry Commission / Forest Research** — National Forest Inventory (GB) |

---

## 2 — CRS

Native **OSGB36 / British National Grid (EPSG:27700)** — the single clean national projected grid.
Height datum **ODN (Ordnance Datum Newlyn)**. Transform chain: BNG → WGS84 → ENU. Web ingest via
EPSG:4326.

---

## 3 — Parcels — HMLR (ownership, general boundaries) + INSPIRE — the structural gap ★★★☆☆

**England has NO survey cadastre.** The nearest layers are ownership extents drawn on the OS base map:

- **HM Land Registry title plans** — the extent of a registered ownership interest. Governed by the
  **general boundaries rule (s.60 Land Registration Act 2002)**: the red-line edge shows the *general
  position*, **not** the exact legal / surveyed boundary. **NOT survey-grade; NOT a cadastral parcel.**
- **INSPIRE Index Polygons** — free, national, machine-readable index of **freehold** registered
  extents (ownership), general boundaries. Downloadable under **OGL** per LPA. This is the practical
  "parcel-like" national layer — but it is **ownership**, not survey, and covers freehold index
  extents only (not the full register, not ownership identity).
- **OS MasterMap Topography** — the *topographic* base (physical features), NOT ownership. OS ≠ HMLR.

**Provenance tier:** REAL only for **ownership extent (general boundary)**; there is no REAL
survey-grade parcel edge tier in England. This is the key structural gap vs FR/ES/DE.

**re-probe before prod:** INSPIRE Index Polygon endpoints/format + OGL redistribution; whether the
general-boundary extents are usable as a footprint-fallback routing source.

---

## 4 — Buildings — OS MasterMap / OS Open Buildings ★★★★★

National, world-class, continuously updated:

- **OS MasterMap Topography Layer** (licensed) / **OS NGD (National Geographic Database)** — the
  authoritative building polygons, feature-classified.
- **OS Open Buildings** (open) / **OS OpenMap – Local** — free national footprints.
- **OSM = fallback only** — OS footprints are authoritative.

**Provenance tier:** REAL = OS MasterMap / OS Open Buildings; DERIVED = imagery-repaired footprints;
ESTIMATED = OSM.

**re-probe before prod:** OS Open Buildings schema; OS MasterMap licence/redistribution terms
(the licensed products are the redistribution trap).

---

## 5 — Height — DERIVED (no national attribute) via nDSM, EA LiDAR multi-year ★★★★☆

**No guaranteed-complete national building-height attribute** (OS Building Heights is a *commercial*
attribute, deliberately skipped in the wired London bake). Height is therefore **DERIVED**:

- **Primary — shared nDSM module (reuse ES/FR/PT/UK, NEVER fork):** `nDSM = DSM − DTM` from **EA
  LIDAR Composite DSM 1 m − DTM 1 m**, per-footprint **90th percentile** (not max — antennas/HVAC
  inflate max), keep max + point count + confidence.
- **LiDAR is multi-agency / project-based:** Environment Agency National LIDAR Programme is the
  primary source; also Historic England, LAs, National Parks. Varying resolution / year / density →
  **every source carries acquisition metadata**.

**Provenance tiers:** REAL = LiDAR-nDSM (P90); DERIVED = LiDAR roof reconstruction; ESTIMATED = OSM
`building:levels` × storey-height.

**re-probe before prod:** (1) EA LIDAR Composite **DSM** 1 m GetCoverage route (the wired London
probe covered the **DTM** sibling only); (2) LiDAR classification — record actual class codes, do
NOT assume ASPRS; (3) do NOT quote an RMSE-Z figure until measured against surveyed buildings.

---

## 6 — Trees — LA inventories → NFI → LiDAR CHM → procedural

**No single national per-tree database.** Provenance hierarchy:

1. **REAL — LA inventories:** London boroughs, Bristol, Birmingham, Manchester, Leeds, Nottingham,
   Sheffield, Cambridge publish per-tree datasets (species/height/DBH), plus **TPO** (Tree
   Preservation Order) references. Rich in these cities, absent elsewhere.
2. **DERIVED — National Forest Inventory (NFI, Forest Research):** woodland **extent** only (not
   per-tree) → context/fallback.
3. **DERIVED — LiDAR CHM:** veg-class canopy-height model → local-maxima → watershed (shared CHM
   module, same as ES/FR/PT).
4. **ESTIMATED — procedural** placement along OS greenspace / OSM polygons.

**re-probe before prod:** LA tree-dataset licences (OGL / custom); NFI licence; LiDAR class codes.

---

## 7 — Roads — OS MasterMap Highways / OS Open Roads ★★★★★

National, strong, with a full class hierarchy:

- **OS MasterMap Highways** (licensed) / **OS Open Roads** (open) / **National Street Gazetteer** /
  **National Highways** (strategic network).
- **Class hierarchy:** Motorway / A-road / B-road / Classified Unnumbered / Local / Private / Service.
- **Method — shared buffered-road + terrain-drape module (reuse ES/FR/PT/UK):** centreline →
  width-by-class buffer → junction-fill → drape on the EA DTM.

**Provenance tiers:** REAL = OS Highways centreline + class; DERIVED = width-by-class buffer,
terrain-draped; ESTIMATED = class-default widths.

**re-probe before prod:** OS Open Roads schema + class enumeration; National Street Gazetteer access.

---

## 8 — Pedestrian — OS paths → ortho-segmentation → procedural

**No national sidewalk dataset.** Hierarchy:

1. **REAL — OS MasterMap Paths / LA layers** where published.
2. **DERIVED — orthophoto segmentation** (shared ortho-sidewalk module, same as ES/FR/PT) where no
   OS/LA path layer exists.
3. **ESTIMATED — geometric gap-inference** between road surface and building footprints; procedural
   crossings.

**re-probe before prod:** OS path-feature schema; ortho imagery redistribution.

---

## 9 — Water — EA / OS Open Rivers / Canal & River Trust ★★★★★

National, strong. **Flood is a SEPARATE overlay, never permanent hydrography.**

- **REAL:** Environment Agency hydrography + **OS Open Rivers** + **Canal & River Trust** + Natural
  England water bodies.
- **Flood:** EA Flood Map = a discretionary refusal overlay, drawn separately — never treated as a
  permanent water surface.
- **HARD RULE (same as ES/FR/PT):** **NEVER derive water-surface elevation from raw LiDAR** (NIR is
  absorbed over water; returns noisy/missing). Flatten to reference elevations: flat DTM-sampled
  elevation for lakes; longitudinal gradient along centreline for rivers; fixed MSL plane for coast.

**Provenance tiers:** REAL = EA / OS Open Rivers shape; DERIVED = terrain-plane / gradient / MSL;
ESTIMATED = raw OSM polygon.

**re-probe before prod:** EA + OS Open Rivers + CRT endpoints and licences.

---

## 10 — Parks / greenspace — OS Open Greenspace ★★★★★

**Excellent national dataset.** **OS Open Greenspace** classifies parks, public gardens, playing
fields, sports facilities, cemeteries, allotments, play spaces, religious grounds — nationally.

- **REAL:** OS Open Greenspace + LA park layers + National Trust + Forestry England.
- **DERIVED:** national land-cover (district-scale context / fallback only — too coarse for individual
  park boundaries).
- **ESTIMATED:** OSM.
- Ground cover = texture; **trees = the only 3D veg volume** (same Cityweft/Forma principle as ES/FR).

**re-probe before prod:** OS Open Greenspace schema/classes.

---

## 11 — Addresses — AddressBase / UPRN ★★★★★

**World-class national property spine.** **GeoPlace** (OS + local authorities) maintains **AddressBase**
keyed on the **UPRN (Unique Property Reference Number)** — a single stable national identifier per
addressable location, joinable to OS features, HMLR, and LA planning records. This is a genuine UK
strength with no continental equal in consistency.

**re-probe before prod:** AddressBase licence tier (AddressBase / Plus / Premium redistribution).

---

## 12 — Planning — NPPF (national policy) + per-LPA Local Plans (PDF) ★★☆☆☆

**This is England's weakness — the same shape as France's PLU problem, but worse (no national zoning
polygon feed).** Planning is **discretionary**:

- **NPPF** — national **policy framework** (MHCLG), text, not numeric rules.
- **~330 LPAs** each publish a **Local Plan** (policy TEXT + a Policies Map), **SPDs**, **Design
  Codes**, **Conservation Area** boundaries, **Article 4 Directions** — mostly **PDF**, not
  machine-readable, no cross-LPA rule taxonomy.
- The **planning.data.gov.uk** national platform is aggregating *some* boundary datasets (Conservation
  Areas, Article 4, listed buildings), but the **numeric envelope rules remain in per-LPA PDFs**.
- **Permitted Development Rights** are the narrow as-of-right exception (GPDO).

**Provenance tier:** REAL = LPA/planning.data.gov.uk boundary polygons; the numeric envelope is
**PDF-BASED** (not a data tier — manual/OCR extraction, citation-gated).

**re-probe before prod:** planning.data.gov.uk coverage; sample LPA Local Plan machine-readability;
Historic England services for Conservation Area / Listed Building overlays.

---

## 13 — Overlay / refusal risk

Conservation Areas (~10,000 in England), Listed Buildings (~400,000 UK-wide via Historic England),
Article 4 Directions (remove Permitted Development), Green Belt, National Parks / AONBs (Natural
England), and EA flood zones are **discretionary refusal overlays** — mandatory before any English
envelope could be shippable, none packed.

---

## 14 — Envelope feasibility

**HIGH complexity — legal, not technical.** The permitted envelope is an outcome of discretionary
determination against a Local Plan + NPPF + material considerations, not a numeric lookup. The
LEGISLATION + ENVELOPE axes cannot be filled from a national numeric source because none exists. See
the Greater London RATE dossier ([`../gb-eng/E12000007-london/`](../gb-eng/E12000007-london/README.md))
for the per-city derivation and the discretionary-planning risk analysis.

---

## 15 — Outstanding unknowns (probe items)

1. OS Data Hub / OS NGD API (OGC Features / Vector Tiles / Downloads) — auth, schema, redistribution.
2. OS Open Buildings + OS Open Roads + OS Open Greenspace schemas.
3. OS MasterMap (licensed) redistribution terms.
4. EA LIDAR Composite **DSM** 1 m GetCoverage (DSM sibling of the wired DTM); coverage/year/density.
5. LiDAR classification codes (do NOT assume ASPRS).
6. INSPIRE Index Polygons usability as a routing/footprint-fallback source (ownership, general bdy).
7. AddressBase / UPRN licence tier for redistribution.
8. planning.data.gov.uk coverage + a sample LPA Local Plan's machine-readability.
9. Historic England / Natural England service endpoints for overlays.
10. Building-height RMSE (nDSM vs surveyed) — do NOT quote accuracy until measured.

---

**Related:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) (federation architecture) ·
[`../GEOSPATIAL-DATA-INVENTORY.md`](../GEOSPATIAL-DATA-INVENTORY.md) (dataset tables) ·
[`../findings/ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md`](../findings/ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md)
(per-layer badging) · [`../gb-eng/E12000007-london/README.md`](../gb-eng/E12000007-london/README.md)
(Greater London RATE dossier — linked, not edited).

---

*Confidence: CONVERGENT-SECONDARY throughout (OS not wired in PRYZM). HMLR / INSPIRE = ownership,
general boundaries — NEVER survey-grade cadastre. Changes NO RATE % cell. Maintainer: UNASSIGNED.*
