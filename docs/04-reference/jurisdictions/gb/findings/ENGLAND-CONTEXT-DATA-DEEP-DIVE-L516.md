# England / UK — 3D Context Data: full deep-dive (L-516)

Part of the context-data study — umbrella **L-511**, deep-dive **L-516**
(`../../../ISSUE-LOG.md`; sibling to Spain **L-512**, Portugal **L-514**, France
**L-515**). Source: **captured founder study 2026-07-30** (*UK / England Geospatial + Context
Deep-Dive*).

**Confidence discipline (§CONTEXT-DATA-HONESTY).** Every layer below is **CONVERGENT-SECONDARY** —
Ordnance Survey and the constituent-country services are **NOT yet wired or live-probed in PRYZM**
(the audit scored `gb` ≈ 51%). The one exception is the **EA LIDAR Composite DTM** terrain probe used
by the Greater London bake (VERIFIED-LIVE, 2026-07-25). Everything else is flagged
**`probe before prod`**: a doc claiming a source is available is not a wired, current source.
**Nothing here changes any RATE % cell.**

> **⚠ CRITICAL HONESTY POINT — HMLR ≠ cadastre.** HM Land Registry title polygons and the INSPIRE
> Index Polygons are **OWNERSHIP extents with GENERAL boundaries** (s.60 Land Registration Act 2002).
> They are **NOT survey-grade / a legal parcel edge / an engineering cadastre**. This discipline
> governs every "parcel" claim below. The UK has **no national cadastre**.

---

## 0. The single most important reframing

**The UK is two systems, and the split is the opposite of Portugal's.**

1. **The physical world** — buildings, roads, water, greenspace, terrain, addresses — is served by
   **Ordnance Survey**, arguably **the best national topographic mapping in the world**: national,
   continuous, feature-rich, consistent. The **UPRN / AddressBase** ecosystem is a national property
   spine with no continental equal. On physical mapping the UK is **top-tier**.
2. **Ownership + regulation** — the legal parcel edge and the numeric buildable rules — is the
   weakness. There is **no national cadastre** (HMLR = ownership, general boundaries), and planning is
   **discretionary**, decided per-LPA against Local Plan policy text + PDF, with no national numeric
   envelope feed.

**Therefore the UK's weakness is NOT geospatial — it is (a) the absence of a survey cadastre and (b)
LPA-fragmented, PDF-based, discretionary planning.** The correct investment is (a) wire OS into the
shared ES/FR/PT/UK geometry + height modules, and (b) badge ownership as ownership-general-boundary,
never as a cadastral edge. **Do not reconstruct already-authoritative OS data; do not overstate HMLR.**
Target the honest badge **per-site, per-layer**; never flatten to "UK = strong" or "UK = OSM".

---

## 1. Parcels — HMLR ownership + INSPIRE (the structural gap) ★★★☆☆

**National ownership, NO survey cadastre.** The nearest layers are ownership extents on the OS base
map:

- **HM Land Registry title plans** — the extent of a registered **ownership** interest. **General
  boundaries rule (s.60 LRA 2002):** the red-line shows the *general position*, **not** the exact
  surveyed boundary.
- **INSPIRE Index Polygons** — free, national, machine-readable index of **freehold** registered
  extents (ownership, general boundaries), **OGL** per LPA. The practical national "parcel-like"
  layer — but ownership, freehold-index only.
- **OS MasterMap Topography** = the *topographic* base, NOT ownership. OS ≠ HMLR.

**Provenance tier:** REAL only for **ownership extent (general boundary)** — there is no REAL
survey-grade parcel edge tier. This is the key structural gap vs FR (PCI id), ES (Catastro),
DE (ALKIS).

**HONEST LIMITATION:** ⚠ NEVER call HMLR/INSPIRE polygons survey-precise, boundary-determined, or a
legal parcel edge. Carry the general-boundary caveat as a standing flag on all UK "parcel" geometry
(analogous to — but weaker than — the FR PCI graphic-precision caveat, because HMLR is *ownership*,
not even a topographic parcel).

**probe before prod:** INSPIRE endpoints/format + OGL redistribution; usability as a footprint-fallback
routing source.

---

## 2. Buildings — OS MasterMap / OS Open Buildings ★★★★★

**National, world-class, continuously updated.** OS **MasterMap Topography** / **OS NGD**
(authoritative, licensed) + **OS Open Buildings** / **OpenMap Local** (free, OGL). Feature-classified.
**OSM = fallback only.**

**Provenance tier:** REAL = OS MasterMap / OS Open Buildings; DERIVED = imagery-repaired footprints;
ESTIMATED = OSM.

**probe before prod:** OS Open Buildings schema; OS MasterMap licence/redistribution (licensed = the
redistribution trap).

---

## 3. Height — DERIVED (shared nDSM module), no national attribute ★★★★☆

**No guaranteed-complete national building-height attribute** (OS Building Heights is a *commercial*
attribute, deliberately skipped). Height is **DERIVED**:

- **Primary — shared nDSM module (reuse ES/FR/PT/UK, NEVER fork):** `nDSM = DSM − DTM` from **EA
  LIDAR Composite DSM 1 m − DTM 1 m**, per-footprint **90th percentile** (not max — antennas/HVAC
  inflate max), keep max + point count + confidence. **Same module** as Spain / France / Portugal.
- **LiDAR is MULTI-AGENCY / project-based:** Environment Agency (primary) + Historic England + LAs +
  National Parks; and per-jurisdiction SRSP (Scotland) / NRW (Wales) / DAERA (NI). Varying resolution
  / year / density → **every source carries acquisition metadata**.

**Provenance tiers:** REAL = LiDAR-nDSM (P90); DERIVED = LiDAR roof reconstruction; ESTIMATED = OSM
`building:levels`.

**probe before prod:** (1) EA LIDAR Composite **DSM** 1 m GetCoverage route — the wired London probe
covered the **DTM** sibling only; (2) LiDAR classification — record actual class codes, do NOT assume
ASPRS; (3) do NOT quote an RMSE-Z figure until measured against surveyed buildings.

---

## 4. Trees — LA inventories → NFI → LiDAR CHM → procedural

**No single national per-tree database.** Provenance hierarchy:

1. **REAL — LA inventories:** London boroughs, Bristol, Birmingham, Manchester, Leeds, Nottingham,
   Sheffield, Cambridge (species/height/DBH), plus **TPO** references. Rich in these cities, absent
   elsewhere.
2. **DERIVED — National Forest Inventory (NFI):** woodland **extent** only (not per-tree) → context.
3. **DERIVED — LiDAR CHM:** veg-class canopy-height model → local-maxima → watershed (shared CHM
   module, same as ES/FR/PT). **Verify LiDAR class codes vs ASPRS first.**
4. **ESTIMATED — procedural** along OS Open Greenspace / OSM polygons.

**probe before prod:** LA tree-dataset licences (OGL / custom); NFI licence; LiDAR class codes.

---

## 5. Roads — OS MasterMap Highways / OS Open Roads ★★★★★

**National, strong**, full class hierarchy: Motorway / A-road / B-road / Classified Unnumbered /
Local / Private / Service. **OS MasterMap Highways** (licensed) / **OS Open Roads** (OGL) /
**National Street Gazetteer** / **National Highways** (strategic network).

- **Method — shared buffered-road + terrain-drape module (reuse ES/FR/PT/UK):** centreline →
  width-by-class buffer → junction-fill → drape on the EA DTM.

**Provenance tiers:** REAL = OS Highways centreline + class; DERIVED = width-by-class buffer,
terrain-draped; ESTIMATED = class-default widths.

**probe before prod:** OS Open Roads schema + class enumeration; National Street Gazetteer access.

---

## 6. Pedestrian — OS paths → ortho-segmentation → procedural

**No national sidewalk dataset.** Hierarchy: (1) **REAL** — OS MasterMap Paths / LA layers where
published; (2) **DERIVED** — orthophoto segmentation (shared ortho-sidewalk module, same as ES/FR/PT);
(3) **ESTIMATED** — geometric gap-inference + procedural crossings.

**probe before prod:** OS path-feature schema; ortho imagery redistribution.

---

## 7. Water — EA / OS Open Rivers / Canal & River Trust ★★★★★

**National, strong. Flood is a SEPARATE overlay, never permanent hydrography.**

- **REAL:** Environment Agency + **OS Open Rivers** + **Canal & River Trust** + Natural England.
- **Flood:** EA Flood Map = a discretionary refusal overlay, drawn separately.
- **HARD RULE (same as ES/FR/PT):** **NEVER derive water-surface elevation from raw LiDAR** (NIR
  absorbed over water; noisy/missing returns). Flatten to reference elevations: flat DTM elevation
  for lakes; longitudinal gradient along centreline for rivers; fixed MSL plane for coast.

**Provenance tiers:** REAL = EA / OS Open Rivers shape; DERIVED = terrain-plane / gradient / MSL;
ESTIMATED = raw OSM polygon.

**probe before prod:** EA + OS Open Rivers + CRT endpoints and licences.

---

## 8. Parks / greenspace — OS Open Greenspace ★★★★★

**Excellent national dataset.** **OS Open Greenspace** classifies parks, public gardens, playing
fields, sports facilities, cemeteries, allotments, play spaces — nationally. **REAL** = OS Open
Greenspace + LA + National Trust + Forestry England; **DERIVED** = national land-cover (district-scale
only); **ESTIMATED** = OSM. Ground cover = texture; **trees = the only 3D veg volume** (same
Cityweft/Forma principle as ES/FR).

**probe before prod:** OS Open Greenspace schema/classes.

---

## 9. Addresses — AddressBase / UPRN ★★★★★

**World-class national property spine.** **GeoPlace** maintains **AddressBase** on the **UPRN** —
a stable national identifier per addressable location, joinable to OS features, HMLR, LA planning
records. A genuine UK strength. (NI uses **Pointer** + UPRN.)

**probe before prod:** AddressBase licence tier (Open UPRN = OGL; Plus/Premium = licensed).

---

## 10. Planning — NPPF (policy) + per-LPA Local Plans (PDF) ★★☆☆☆

**This is the whole UK weakness — worse-shaped than France (no national zoning polygon feed).**
Planning is **discretionary**:

- **NPPF** — national **policy framework** (text, not numeric rules).
- **~330 LPAs** each publish a **Local Plan** (policy TEXT + Policies Map), SPDs, Design Codes,
  Conservation Areas, Article 4 Directions — mostly **PDF**, no cross-LPA rule taxonomy.
- **planning.data.gov.uk** is aggregating *some* boundary datasets, but the **numeric envelope rules
  remain in per-LPA PDFs**.
- Devolved frameworks differ: **NPF4** (Scotland), **PPW / Future Wales** (Wales), **SPPS** (NI).

**Provenance tier:** REAL = planning.data.gov.uk / LPA boundary polygons; the numeric envelope is
**PDF-BASED** (not a data tier — manual/OCR extraction, citation-gated).

**probe before prod:** planning.data.gov.uk coverage; a sample LPA Local Plan's machine-readability;
Historic England services for overlays.

---

## 11. Per-layer three-tier badging matrix (the honesty structure)

Every context layer resolves to a DIFFERENT tier; nothing collapses to one flat REAL/ESTIMATED toggle.

| Layer | REAL tier | DERIVED / reconstructed tier | ESTIMATED tier |
|---|---|---|---|
| **Parcels** | HMLR / INSPIRE **ownership extent** (⚠ general boundary — NOT survey) | OS-inferred topographic footprint (topo, not ownership) | OSM footprint proxy |
| **Buildings** | OS MasterMap / OS Open Buildings | imagery-repaired footprints | OSM |
| **Height** | **LiDAR-nDSM (P90)** (EA/SRSP/NRW/DAERA) | LiDAR roof reconstruction | OSM `building:levels` |
| **Trees** | LA inventory (London/Bristol/Manchester/Leeds/…) | LiDAR CHM (local-maxima + watershed) | procedural along OS/OSM |
| **Roads** | OS MasterMap Highways / OS Open Roads + class | width-by-class buffer, terrain-draped | class-default widths |
| **Pedestrian** | OS MasterMap Paths / LA layer | orthophoto segmentation | geometric gap-inference / procedural crossings |
| **Water** | EA / OS Open Rivers / CRT shape | terrain-plane / gradient / MSL elevation | raw OSM polygon, no elevation |
| **Parks** | OS Open Greenspace / LA | national land-cover (district-scale) | OSM |

**Example — central London:** buildings REAL (OS), **height DERIVED** (EA LiDAR nDSM), trees REAL
(borough inventory), parcels **ownership-general-boundary** (HMLR — never "cadastre"), water REAL (EA).
Never a scene-wide badge.

---

## 12. Shared modules (reuse ES/FR/PT/UK — NEVER fork per country)

| Module | Method | Reused by |
|---|---|---|
| **nDSM height** | DSM − DTM per footprint → **P90** (keep max + point-count for confidence) | ES, FR, PT, **UK** |
| **CHM trees** | veg-class canopy-height model → local-maxima + watershed | ES, FR, PT, **UK** |
| **Buffered road + terrain drape** | centreline + class → width buffer → junction-fill → drape on DTM | ES, FR, PT, **UK** |
| **Ortho-sidewalk segmentation** | aerial imagery segmentation → sidewalk polygons where no OS/LA layer | ES, FR, PT, **UK** |

The UK plugs OS + EA-LiDAR inputs into these existing modules. **There is no new geometry build** —
the only genuinely UK-specific work is (a) the ownership-general-boundary badging discipline and
(b) the per-LPA planning-PDF extraction.

---

## 13. Honest limitations

1. **NO national cadastre.** HMLR / INSPIRE = ownership, general boundaries — never a survey edge.
   This is the single most important caveat; do not overstate it, ever.
2. **Planning is per-LPA, PDF, discretionary.** No national numeric envelope feed; worse-shaped than
   France (which at least serves national zoning polygons).
3. **Height is DERIVED** — no guaranteed-complete national height attribute (OS Building Heights is
   commercial, skipped); nDSM is the robust path.
4. **LiDAR is multi-agency / project-based** (EA / SRSP / NRW / DAERA + Historic England + LAs +
   National Parks) — varying resolution / year / density; carry acquisition metadata on every source.
5. **Municipal / LA quality varies** — London / Manchester / Bristol / Leeds are data-rich (tree
   inventories, LA layers); rural England and much of Scotland / Wales / NI are sparse.

---

## 14. UK vs FR vs ES vs PT comparison

| Layer | UK | France | Spain | Portugal |
|---|---|---|---|---|
| **Parcels** | ★★★☆☆ HMLR/INSPIRE **ownership, general bdy (NOT cadastre)** | ★★★★★ PCI Express (national id) | ★★★★★ Catastro refcat | ★★☆☆☆ Carta Cadastral (patchy) |
| **Buildings** | ★★★★★ OS MasterMap / Open Buildings | ★★★★★ BD TOPO (+ classification) | ★★★★★ Catastro footprints | ★★☆☆☆ Lisbon only |
| **Height** | ★★★★☆ EA LiDAR nDSM (multi-agency) | ★★★★☆ LiDAR-HD nDSM | ★★★★☆ PNOA-LiDAR | ★★★★☆ DGT LiDAR |
| **Roads** | ★★★★★ OS Highways / Open Roads | ★★★★★ BD TOPO Transport | ★★★★★ IGN-ES / municipal | ★★★☆☆ OSM + IP |
| **Parks** | ★★★★★ OS Open Greenspace | ★★★★☆ OCS-GE / municipal | ★★★★☆ SIOSE / municipal | ★★★☆☆ municipal |
| **Planning** | ★★☆☆☆ NPPF + per-LPA **PDF** (no polygon feed) | ★★☆☆☆ GPU polygons + PDF rules (OCR) | ★★☆☆☆ municipal PGOU PDFs | ★☆☆☆☆ weakest |

**Reading:** the UK **matches or beats** FR/ES on buildings / roads / parks (OS is best-in-class) and
**ties** on height (all four use LiDAR nDSM), but **trails on parcels** — because HMLR is ownership
with general boundaries, not a survey cadastre, so it cannot claim the ★★★★★ that FR/ES cadastres do.
All four share the discretionary/PDF planning weakness; the UK's is ★★ and structurally the hardest
(no national zoning polygon feed at all).

---

## 15. Phase-1 probe checklist (probe before prod)

Asserted in the captured study; CONVERGENT-SECONDARY, **not live-probed in PRYZM** (except EA DTM
terrain) — treat each as a spike gate before Phase-2 relies on it:

1. **OS Data Hub APIs** — OGC API Features / Vector Tiles / Downloads; canonical base URL + auth.
2. **OS Open Buildings** — schema, coverage, OGL redistribution.
3. **OS MasterMap** — licence / redistribution terms (the licensed-product trap).
4. **EA LIDAR Composite DSM** — GetCoverage route (DSM sibling of the wired DTM); coverage / year /
   density.
5. **LiDAR classification** — record actual class codes for every agency; **do NOT assume ASPRS**.
6. **NFI** — licence + schema (woodland extent, not per-tree).
7. **OS Open Greenspace** — schema / classes.
8. **LPA planning** — planning.data.gov.uk coverage; a sample Local Plan's machine-readability.
9. **Historic England / Natural England** — service endpoints for Conservation Area / Listed Building
   / SSSI overlays.
10. **Building-height RMSE** — nDSM vs surveyed ground truth; do NOT quote accuracy until measured.
11. **INSPIRE Index Polygons** — usability as footprint-fallback routing (ownership, general bdy).
12. **AddressBase / UPRN** — licence tier for redistribution.

**Honesty gate:** until a layer is live-probed it stays CONVERGENT-SECONDARY / probe-before-prod here
and `null`/unchanged in every RATE and LOD cell. **Ship the probe before the fix.**

---

## Cross-references

- [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) — federation architecture (4 jurisdictions).
- [`../GEOSPATIAL-DATA-INVENTORY.md`](../GEOSPATIAL-DATA-INVENTORY.md) — single-table
  [Layer|Authority|Access|…] inventory.
- [`../JURISDICTIONS/ENGLAND.md`](../JURISDICTIONS/ENGLAND.md) — full England profile (+ Scotland /
  Wales / Northern-Ireland stubs).
- [`../gb-eng/E12000007-london/README.md`](../gb-eng/E12000007-london/README.md) — Greater London
  RATE dossier (linked, not edited).
- Sibling deep-dives: `../../fr/findings/FRANCE-CONTEXT-DATA-DEEP-DIVE-L515.md` (L-515),
  `../../pt/PORTUGAL-CONTEXT-DEEP-DIVE.md` (L-514), `../../es/CONTEXT-DATA-SPIKE.md` (L-512).

---

*Last updated: 2026-07-30. Physical mapping (OS) world-class but **NOT wired/live-probed in PRYZM**
(audit `gb` ≈ 51%); height DERIVED (no complete national attribute); planning per-LPA PDF
(discretionary, no polygon feed). ⚠ HMLR / INSPIRE = ownership, general boundaries — NEVER a survey
cadastre. Changes NO RATE % cell. Maintainer: UNASSIGNED.*
