# Portugal — Parks / Green space & Trees (context layer)

> Umbrella **L-511**, deep-dive **L-514**. Full writeup: `../PORTUGAL-CONTEXT-DEEP-DIVE.md`.
> **Endpoints NOT live-probed this session** — *per founder deep-dive, verify live before relying.*
> Items marked **UNVERIFIED**.

## Parks / green — COS / COSc (national land-cover) + Lisbon municipal
- **COS** (Carta de Uso e Ocupação do Solo — DGT national land-cover, multiple years) + the newer
  **COSc** (SMOS initiative, AI/ML-derived, more frequent updates).
- **Same caveat as Spain's SIOSE:** national land-cover is **too coarse for individual park
  boundaries** — use as **fallback / district-scale context only**.
- **Lisbon:** the dedicated **"jardins-parques-urbanos"** municipal dataset is preferred where
  available (licence same UNVERIFIED CML terms).

## Trees — Lisbon is a real Tier-A exception; procedural/CHM elsewhere
- **Lisbon (Tier-A):** CML **"Arvoredo"** per-tree dataset (via **Lisboa Aberta** + **dados.gov.pt**),
  a **legally-mandated register** (Regulamento Municipal do Arvoredo) → **actively maintained**. Plus
  the **1:5,000 tree-cluster** layer in the municipal 3D model (Phase 2).
- **Elsewhere:** DGT LiDAR **veg-class CHM** → local-maxima → watershed (same technique as Spain).
  **VERIFY DGT's LiDAR class codes vs ASPRS first** — DGT's classification scheme is **UNVERIFIED**;
  do not assume ASPRS 3/4/5 map cleanly.
- **Fallback:** procedural placement along OSM / COS polygons (labelled procedural, not measured).

## 3D modeling method — TREES (L-514)
Mirrors the building nDSM technique but on vegetation classes:
```
1. From classified LAZ: DTM = ground class; Veg surface = highest return among veg classes.
   VERIFY DGT class codes vs ASPRS before wiring — do not hard-code 3/4/5 on trust.
2. CHM (Canopy Height Model) = Veg surface - DTM.
3. Individual tree detection: local-maxima filter over CHM → one candidate treetop per peak.
4. Crown delineation: watershed seeded at each treetop → crown polygon + diameter per tree.
5. Place a scaled procedural asset (canopy height + crown diameter). Do NOT model leaves/branches
   or low groundcover as geometry (that is ground texture, see parks).
- Lisbon (Tier-A real): CML "Arvoredo" per-tree points → map species to a small archetype library;
  size by species avg OR by DGT LiDAR CHM value at that exact point for real height.
- Elsewhere (derived): CHM treetop + crown-diameter → scaled generic asset; where veg classification
  is unreliable → procedural along OSM/COS (labelled procedural, NOT measured).
```

## 3D modeling method — PARKS / GREEN (L-514)
- **Primary (Lisbon):** the "jardins-parques-urbanos" municipal dataset (per-site precision).
- **National fallback: COS / COSc** — a composite land-cover polygon; **too coarse for an individual
  park/plaza** (SIOSE-class caveat). Use as fallback / district-scale green-ratio context ONLY.
- **Ground cover = texture, not geometry:** render green polygons as flat DTM-draped surface + grass
  texture; reserve 3D volume for the individually-detected trees only (Cityweft/Forma principle).

## Gate (per founder deep-dive; UNVERIFIED until live-probed)
| Question | Answer | Evidence (NOT live-probed) |
|---|---|---|
| Parks object-level? | **YES Lisbon / coarse nationally** | Lisbon jardins-parques municipal; COS/COSc national (too coarse for individual parks) |
| Trees per-tree? | **Lisbon YES** (CML Arvoredo, legally-mandated register) · elsewhere CHM/procedural | verify Arvoredo resource id + DGT class codes before wiring |
| License | Lisbon CML UNVERIFIED; COS/COSc via DGT/SNIG | verify |
| Fallback condition | COS/COSc + OSM where no municipal source; procedural trees where veg-class unreliable | |
