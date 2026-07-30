# L-513 — Denmark 3D-Context-Data Deep-Dive (per-layer source hierarchies + 3-tier badging)

> **Status:** captured from the founder Danish geospatial + context deep-dive, 2026-07-30. Folds the
> per-layer source hierarchies, the REAL / DERIVED / ESTIMATED badging matrix, the shared reuse
> modules, and the Phase-1 probe checklist into the `dk/` tree. **Docs only — no code, no schema, no
> RATE cell.** Part of the country-by-country 3D-context-data study (umbrella **L-511**) and the
> static-tiles context strategy (**L-513** — context 3D = pre-baked tiles, not live Overpass).
>
> **Confidence convention (§CONTEXT-DATA-HONESTY).** Denmark is **`VERIFIED-PRIMARY` / benchmark**.
> The Planning layer is additionally **`VERIFIED-LIVE`** (Plandata.dk WFS, 2026-07-23 — `../sources/`).
> Every *context* layer below is documented from authoritative national sources + the reference
> architecture (`../DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`, L-383) but **not yet live-probed
> this pass** → **⚠ re-probe the endpoint before it gates prod.** A failed probe and an empty result
> are the same value; the badge is what distinguishes them. Ship the probe (§Probe checklist) before
> the fix.

---

## 0 — TL;DR (the reframing)

**Denmark's advantage is INTEGRATION, not reconstruction.** Every substrate a context engine needs —
parcel, building, address, planning, terrain, elevation, road, hydrography — has an **authoritative
national register with machine-readable records**, and planning is machine-readable too
(PLANDATA.dk, the sole audited country where it is). So the DK challenge is *integrating* clean
authoritative registers, where Spain/Portugal/Germany must *reconstruct* the missing rung from
scans, derivation, or estimation. This is why Denmark is the benchmark the other countries are
measured against, and why every layer below resolves to its **REAL** rung far more often than
elsewhere.

**The RATE context.** Denmark's RATE LEGISLATION / ENVELOPE axes read `not-assessed` **only because
the L-449 human-verification gate is unsigned per-city — NOT because data is absent.** PLANDATA.dk is
machine-readable, live, and gives a ≈96% national structured-fill prior. This doc, like the
inventory, moves **no RATE cell**; it records the data axis the gate would let the RATE reflect once
a Danish planner signs off the two legal items in `../sources/VERIFICATION.md`.

---

## 1 — Per-layer source hierarchies (best-first; each downgrade is a product badge)

Each layer lists its ordered fallback chain. **The primary rung is an authoritative national
register wherever the ★ says so; the chain degrades only when the register is silent, and every
downgrade must be badged in the product (never presented as authoritative).**

### 1.1 — Parcels ★★★★★
```
Matriklen (SDFI) — national, survey-quality, OGC-API/WFS/WMS/REST/bulk, GML/GeoJSON/SHP   [Tier-A REAL]
  → municipal cadastre                                                                     [rarely needed]
  → OSM footprint                                       [BADGE: approximate — not legal Matriklen]
```
Fallback to municipal / OSM is almost never exercised — Matriklen covers the country.

### 1.2 — Buildings / LOD ★★★★☆
```
BBR register (year/use/floors/floor-area/roof/units/energy) + GeoDanmark/Matriklen geometry   [REAL attrs + geometry]
  → "Danmark i 3D" national semantic LOD2 (per-building ID, roof surfaces)                      [REAL LOD2]
  → LiDAR + BBR → procedural LOD2 (high-confidence, roof via RANSAC)                            [DERIVED]
  → footprint × BBR floors extrusion (LOD1)                                                     [DERIVED]
  → OSM footprint × levels                                                                       [BADGE: estimated]
```
No *nationwide* semantic LOD3/BIM; municipal 3D city models exist for Copenhagen / Aarhus / Odense /
Aalborg (engineering-grade, per-municipality licence). But BBR's per-building attribute richness +
national LiDAR make procedural LOD2 high-confidence even without the semantic model.

### 1.3 — Height ★★★★★ (Denmark's strength — the BBR cross-validation)
```
National LiDAR → DSM − DTM (P90)  →  VALIDATED against BBR floor count (measured vs registered)   [REAL, cross-validated]
  → "Danmark i 3D" LOD2 measuredHeight                                                             [REAL LOD2]
  → BBR floors × storey height                                                                     [DERIVED from register]
  → OSM building:levels × 3.2 m                                                                     [BADGE: estimated]
  → fabricated 9 m                                                                                  [BADGE: fabricated — last resort]
```
**This BBR floor-count validation is unique to Denmark in the whole study.** LiDAR + BBR + DSM/DTM
all cross-validate one another; the measured nDSM is checked against the *registered* floor count,
not merely trusted. Roof reconstruction via RANSAC on the point cloud. Never present a raw-nDSM guess
as truth — the register grounds it. Confidence ★★★★★.

### 1.4 — Trees ★★★★☆
```
Municipal tree inventories (Copenhagen/Aarhus/Odense/Aalborg/Frederiksberg)   [REAL object-level]
  → national LiDAR CHM (canopy height model → local maxima → watershed crowns)  [DERIVED]
  → GeoDanmark vegetation                                                        [DERIVED]
  → land-cover → procedural scatter                                              [BADGE: estimated]
```

### 1.5 — Roads + cycle ★★★★★ (cycle = a DK differentiator)
```
GeoDanmark road centrelines + class + municipal engineering GIS   [REAL]
  → width-by-class buffer → terrain drape                          [DERIVED geometry]
  → OSM highway network                                            [BADGE: fallback]

CYCLE (segregated tracks / lanes / priority routes):
  Municipal engineering GIS (Copenhagen etc.)   [REAL — the DK differentiator]
    → ortho segmentation                          [DERIVED]
    → procedural along road class                 [BADGE: estimated]
```
Denmark's **exceptional cycle infrastructure** (segregated tracks, lanes, priority routes) is carried
in municipal engineering datasets — a genuine differentiator no other studied country matches.

### 1.6 — Pedestrian ★★★★☆
```
Municipal engineering datasets (sidewalks/plazas/crossings/kerbs/tactile/ramps/stairs)   [REAL]
  → ortho segmentation                                                                     [DERIVED]
  → procedural from road + buildings                                                       [BADGE: estimated]
```

### 1.7 — Water ★★★★★
```
GeoDanmark + Danish Environmental Portal (rivers/lakes/canals/coastline/wetlands/harbours)   [REAL]
  → land-cover water class                                                                     [DERIVED]
  → OSM water                                                                                   [BADGE: fallback]
```
**Never derive water-surface elevation from raw LiDAR** (returns are noisy on water) — use the
authoritative hydrography geometry + a flat surface at the mapped level.

### 1.8 — Parks ★★★★☆
```
Municipal park inventories + GeoDanmark + Environmental Portal (benches/playgrounds/fountains/sports/dog-parks)   [REAL object-level]
  → land-cover green class → procedural furnishing                                                                  [BADGE: estimated]
```

### 1.9 — Planning zones ★★★★★ (VERIFIED-LIVE — the benchmark layer)
```
PLANDATA.dk byggefelt / delområde / lokalplan / kommuneplanramme structured attrs   [REAL — VERIFIED-LIVE 2026-07-23]
  → municipal overlay                                                                 [DERIVED]
  → plan-PDF text extraction (doklink; ≈79% born-digital — L-611)                     [pipeline-extracted-unverified]
  → manual                                                                            [BADGE: manual]
```

---

## 2 — The 3-tier badging matrix (REAL / DERIVED / ESTIMATED)

**Same honesty structure as every country: every layer carries its own provenance badge; a
fallback value is NEVER presented as authoritative; empty ≠ failed ≠ estimated.** Denmark's
distinction is how often the *REAL* column is an authoritative national register.

| Layer | 🟢 REAL (authoritative) | 🟡 DERIVED (computed from real inputs) | 🔴 ESTIMATED (procedural / assumed) |
|---|---|---|---|
| **Parcels** | Matriklen jordstykke (SDFI) | — | OSM footprint |
| **Buildings / LOD** | BBR attrs + GeoDanmark geometry; "Danmark i 3D" LOD2 | LiDAR+BBR procedural LOD2; footprint×floors LOD1 | OSM footprint × levels |
| **Height** | LiDAR DSM−DTM; LOD2 measuredHeight | **nDSM (DSM−DTM P90) VALIDATED vs BBR floor-count** | BBR floors × storey h → OSM levels → fabricated 9 m |
| **Trees** | Municipal tree inventories | national LiDAR CHM; GeoDanmark veg | land-cover procedural scatter |
| **Roads** | GeoDanmark + municipal GIS | width-by-class buffer → drape | OSM fallback |
| **Cycle infrastructure** | **Municipal engineering GIS** (tracks/lanes/priority) | ortho segmentation | procedural along road class |
| **Pedestrian** | Municipal engineering (sidewalks/plazas/kerbs/tactile) | ortho segmentation | procedural from road+buildings |
| **Water** | GeoDanmark + Environmental Portal | land-cover water class | OSM water |
| **Parks** | Municipal + GeoDanmark + Env. Portal | — | land-cover green → procedural furnishing |
| **Planning zones** | **PLANDATA.dk structured attrs (VERIFIED-LIVE)** | municipal overlay; plan-PDF born-digital text-pull | manual |

**Reading the matrix:** the badge shown in-product is the *rung actually resolved for that
feature*, not the best rung available. A DERIVED nDSM height is badged DERIVED even though a REAL
LiDAR return exists elsewhere; an ESTIMATED procedural tree is badged ESTIMATED. The point of the
matrix is that the honest badge travels with the value.

---

## 3 — Shared reuse modules (ES / FR / PT / DK)

Denmark reuses — and in the height case, *strengthens* — the same context modules as the other
European jurisdictions. Building four national pipelines once, not per-country:

| Module | Pipeline | DK specialisation |
|---|---|---|
| **Height** | DSM − DTM → P90 → **BBR validate** | The BBR floor-count cross-check is the DK addition to the shared module — validate the measured nDSM against a registered floor count. |
| **Road** | centreline → class → width → buffer → terrain drape | + cycle-track sub-layer from municipal engineering GIS. |
| **Tree** | LiDAR → CHM → local maxima → watershed crowns | + municipal tree inventories as the REAL rung. |
| **Pedestrian** | ortho + road + buildings → segmentation | + municipal sidewalk/kerb/tactile datasets as the REAL rung. |

The shared modules mean a new European jurisdiction is an adapter that emits the same canonical
GeoJSON (WGS84) + feeds the same four modules — the core is untouched (see the reference
architecture §4.1, GeoJSON-canonical rule).

---

## 4 — Production readiness

Every layer is production-capable at ★★★★★ for the substrate quartet, including the two that no
other studied country reaches at ★★★★★:

- **Planning (PLANDATA.dk) ★★★★★** — the ONLY country in the study with machine-readable national
  planning. VERIFIED-LIVE.
- **Addresses (DAR) ★★★★★** — authoritative national address register with reverse-geocode.
- **Cycle infrastructure ★★★★★** — municipal engineering GIS, a DK differentiator.
- **Height ★★★★★** — the BBR-validated nDSM, cross-checked, not guessed.

**Honest weaknesses:** no nationwide semantic BIM / LOD3; some municipal engineering data is local
(cycle/pedestrian/parks/trees resolve to municipal, not a single national feed); utilities are
fragmented. None of these blocks the core parcel → building → height → planning path.

---

## 5 — §Probe checklist (Phase-1 — re-probe before prod, even for the benchmark)

Each item upgrades a `VERIFIED-PRIMARY` (⚠ re-probe) row to `VERIFIED-LIVE`. Run before any context
layer gates a production decision.

1. **Dataforsyningen OGC API** — landing page / `collections` list / declared CRS / paging + result
   limits.
2. **Matriklen** — parcel (jordstykke) schema, stable ids, update cadence.
3. **GeoDanmark** — buildings / roads / hydro / rail / vegetation / coast / bridges feature types +
   attributes.
4. **BBR** — point lookup; confirm floors / construction year / use / roof / building id fields.
5. **DAR** — address query + reverse-geocode → kommunekode.
6. **National LiDAR** — acquisition date / point density / classification scheme / tile grid.
7. **DTM / DSM** — resolution / CRS / refresh schedule (the height module's inputs).
8. **PLANDATA.dk** — Lokalplaner / Kommuneplan / zoning status / restrictions / **licence string**
   (already VERIFIED-LIVE 2026-07-23 — re-confirm the licence + field set before prod).
9. **Environmental Portal (Miljøportal)** — Natura2000 / §3-protected / wetland / flood.
10. **Municipal** (Copenhagen / Aarhus / Odense / Aalborg / Frederiksberg / Esbjerg) — engineering
    GIS / tree inventory / parks / 3D city model / **per-municipality licence** (the REAL rung for
    cycle / pedestrian / parks / trees).

**Honesty gate:** until re-probed live, a context row stays `VERIFIED-PRIMARY` (⚠ re-probe) in the
inventory and unchanged in every RATE / LOD-RATE cell.

---

## 6 — Cross-references

- `../DENMARK-GEOSPATIAL-DATA-INVENTORY.md` — the single-table [Layer|Authority|Access|API|Licence|
  CRS|National|prod-ready|Confidence] inventory this deep-dive expands.
- `../DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` — L-383 toolchain validation + the end-to-end
  parcel → zoning → LOD2 → terrain reference implementation.
- `../sources/SOURCES.md` — PLANDATA.dk per-field citations + the SDFI/Datafordeler anchors.
- `../sources/VERIFICATION.md` — the L-449 human sign-off gate (§USABLE-FALLBACK + byggefelt
  bindingness PENDING a Danish planner).
- `L-609/L-610/L-611` — the byzone fill measurement, byggefelt wiring, and the OCR-addressable-gap +
  coverage-path spec (the planning-axis depth).
- `../topics/` — the per-layer context-data spike stubs (buildings-lod-height, roads-pedestrian,
  water, parks-trees) this deep-dive supersedes for source hierarchy; fill their spike-evidence
  tables during the Phase-1 probe.

---

*Last updated: 2026-07-30. Denmark = benchmark (10/10): the ONLY country with machine-readable
national planning (PLANDATA.dk). Planning `VERIFIED-LIVE`; all context layers `VERIFIED-PRIMARY`
(⚠ re-probe before prod). No RATE cell touched. Maintainer: UNASSIGNED.*
