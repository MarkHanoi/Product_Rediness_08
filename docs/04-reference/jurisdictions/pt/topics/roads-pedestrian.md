# Portugal — Roads & Pedestrian Infrastructure (context layer)

> Umbrella **L-511**, deep-dive **L-514**. Full writeup: `../PORTUGAL-CONTEXT-DEEP-DIVE.md`.
> **Endpoints NOT live-probed this session** — *per founder deep-dive, verify live before relying.*
> Items marked **UNVERIFIED** accordingly.

## Roads
- **Baseline:** OSM / Overture.
- **Lisbon:** CML **"Rede Viária"** + roads **already volumetrically extruded** in the municipal 3D
  model (best case). Licence UNVERIFIED (same CML terms as buildings).
- **National (UNVERIFIED):** **Infraestruturas de Portugal (IP)** likely holds the national road
  network — **verify open-data status** (unconfirmed).
- **Method identical to Spain:** centreline → width-per-class → buffer → junction-fill → drape on the
  **DGT 50 cm DTM** (finer than PNOA's grid — better street grade on Lisbon's hills).

## Pedestrian
- **Lisbon best case:** sidewalks are **already modelled** in the municipal 3D dataset (verify terms).
- **Elsewhere:** same **3-tier ladder as Spain** — (1) municipal 1:1,000–1:2,000 topo base where
  published; (2) orthophoto segmentation from **DGT aerial** imagery; (3) geometric gap-inference
  between road surface and building footprints.
- **No crossing dataset identified** (unlike Barcelona's "passos de vianants") → **procedural
  crosswalks** only.

## 3D modeling method — ROADS (centreline → surface → drape) (L-514)
```
1. Classify each segment by type (OSM/Overture, or CML Rede Viária class in Lisbon).
2. Assign width per class; where unpublished, defensible per-class defaults by urban fabric.
   STORE AS AN EXPLICIT PER-SEGMENT ASSUMPTION, badged like ESTIMATED — never a silent constant.
3. Buffer centreline by half-width each side → surface polygon.
4. Junction fill: union incoming segment polygons at each node + non-convex-hull trim.
5. Drape polygon onto DGT 50 cm DTM → real street grade/slope. FINER grid than PNOA;
   still not fine enough for curb reveal / camber (needs site survey).
   Lisbon: roads already extruded in the CML 3D model — map directly if licence permits.
```

## 3D modeling method — PEDESTRIAN (hardest layer) (L-514)
Same 3-option ladder as Spain, by fidelity:
```
1. Municipal topo / CML 3D model — Lisbon HAS modelled sidewalks (highest fidelity; licence TBV).
2. Orthophoto semantic segmentation — DGT aerial imagery; separate sidewalk / roadway / unpaved
   (model-training investment, not a data pull).
3. Geometric inference (fallback): sidewalk strip = gap between road-surface polygon and adjacent
   footprints, inset a small margin. Always-available; not survey-accurate.
- Crosswalks: NO crossing dataset identified for PT → procedural stripe placement only.
```

## Gate (per founder deep-dive; UNVERIFIED until live-probed)
| Question | Answer | Evidence (NOT live-probed) |
|---|---|---|
| Object-level polygons/lines available? | **YES Lisbon / NO nationally** | Lisbon CML Rede Viária (extruded) + modelled sidewalks; elsewhere OSM/Overture + IP (unconfirmed) |
| CRS | ETRS89 / PT-TM06 expected; verify per source | UNVERIFIED |
| License (verbatim) | Lisbon CML UNVERIFIED; IP roads UNVERIFIED | verify at geodados-cml.hub.arcgis.com / IP |
| Fallback condition | OSM/Overture where no municipal/national source wired; procedural crosswalks always | |
