# Portugal — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study (`../../CONTEXT-DATA-COUNTRY-STUDY.md`, umbrella **L-511**;
> deep-dive **L-514**). Full analysed writeup: `../PORTUGAL-CONTEXT-DEEP-DIVE.md`.
> **Endpoints NOT live-probed this session** — everything below is *per founder deep-dive, verify
> live before relying on it*. Items are marked **UNVERIFIED** accordingly.

- **Target LOD:** Tier B — footprint + DGT-LiDAR nDSM height; **Lisbon municipal exception** = CML
  council 3D model (LOD2/3-ish).
- **Source(s):** Carta Cadastral (parcels) · OSM/Overture (footprints) · DGT LiDAR (height) · Lisbon CML.

## Parcels — Carta Cadastral / SNIC / DGT (the biggest PT update)
Historically Portugal had **NO Catastro equivalent** (matriz predial + registo predial = tax +
ownership, **no open geometry**). **Now:** the **Carta Cadastral** under **Decreto-Lei 72/2023
(21 Nov 2023)**, part of **SNIC**, run by **DGT** — every **prédio** gets a unique **NIC** id +
geometry + area.
- **Access (UNVERIFIED):** per-parcel Shapefile/GeoPackage/DXF/GeoJSON download; INSPIRE WMS/WFS via
  SNIG; **OGC API planned 2025 — verify status**. EU **High-Value Dataset** (Reg 2023/138).
- **HONEST LIMITATION = coverage, not existence.** Built by converting two older regimes:
  - **CGPR** (rural cadastre, 1926 decree) — predominantly **S of the Tagus**, **127 munis**
    (118 mainland + 9 autonomous-region); **rural + only non-independent urban parcels, NOT city cores**.
  - **SiNErGIC/CPE** pilot — **7 munis**: Loulé, Oliveira do Hospital, Paredes, Penafiel,
    São Brás de Alportel, Seia, Tavira.
  - ⇒ **~134 munis**. **Do NOT assume Lisbon/Porto city centres have real parcel geometry — CHECK
    PER-MUNICIPALITY.**
- **Fallback (uncovered urban):** municipal PDM cartography (Lisbon), else OSM/Overture footprint
  proxy **badged approximation**. **BUPi is NOT a parcel-geometry source** (rural/mixed ownership
  registration only) — do not wire it expecting parcels.

## Buildings / LOD — the Lisbon exception
- **No national footprint / LOD dataset** exists (PT has neither national footprints nor national LOD).
- **Lisbon:** CML **"Modelo Tridimensional da Ocupação Superficial do Concelho de Lisboa"** — 1:1,000,
  extruded over the council MDT, includes **balconies, elevated volumes, setback faces, sidewalks,
  tunnel entrances, walls > 0.5 m**; Phase 2 adds tree-clusters @1:5,000. **Closer to LOD2/3 than
  ICGC LOD1.** **VERIFY open-redistribution terms** at `geodados-cml.hub.arcgis.com` — UNVERIFIED.
- **Elsewhere:** OSM/Overture footprint + DGT LiDAR nDSM, flat extrusion.

## Height — same nDSM method, PT inputs, ONE big caveat
- **DGT national LiDAR:** PRR-funded, flown **Apr 2024–Mar 2025**, **10 pts/m²**, classified LAZ +
  derived **DTM 50 cm / DSM 2 m**, **open** ("sem qualquer tipo de restrição"), **~90% continental
  coverage** (NW gap, rolling). Host `cdd.dgterritorio.gov.pt` + QGIS "DGT CDD Downloader". All UNVERIFIED.
- **Method identical to Spain** (`../../spain/SPAIN-HEIGHT-MEASUREMENT.md`): nDSM = `DSM − DTM`,
  per-footprint **90th-percentile** (not max), keep `max` + point count. **SAME shared nDSM module
  (L-511c / L-512b) — build once (ES+FR+PT).**
- **KEY DIFFERENCE vs Spain:**
  1. **NO national floor-count cross-check** (no Catastro-ALTURAS equivalent) → **LiDAR height stands
     ALONE**, lower confidence ceiling, no second field to flag disagreements against. **Even more
     acute** single-source case than L-512.
  2. **DGT has NOT published an RMSE-Z figure** (unlike PNOA) — **do NOT quote parity with PNOA's
     ~10 cm**; flag **"request DGT's formal accuracy spec."**

## 3D modeling method — BUILDINGS / HEIGHT (L-514)
```
1. Parcel resolve per-municipality: bbox → in Carta Cadastral coverage set (~134)?
   YES → real NIC parcel geometry.  NO → PDM cartography (Lisbon) / OSM-Overture proxy (approximation).
2. Footprint: OSM/Overture nationally; Lisbon → CML 3D model surface polygons.
3. Height (shared nDSM module = L-511c): tile-index DGT DTM 50cm + DSM 2m; nDSM = DSM - DTM;
   per footprint = 90th-pctile of nDSM (NOT max); store max + point count for confidence.
4. NO floor-count cross-check exists for PT → measured_height_m stands alone; height_confidence
   from point count ONLY; record "no floor-count field" rather than inventing one.
5. Roof: flat extrusion at nDSM height nationally; Lisbon CML carries surface detail (map more
   directly if licence permits); self-run RANSAC on classified LiDAR = "reconstructed" (Lisbon-first).
```

## Gate — buildings/height (per founder deep-dive; UNVERIFIED until live-probed)
| Q | Verdict | Evidence (NOT live-probed) |
|---|---|---|
| Real footprint / parcel? | **PARTIAL** | Carta Cadastral NIC geometry, ~134 munis only; NOT city cores; OSM/Overture baseline; Lisbon CML exception |
| Real height? | **YES (single-source)** | DGT LiDAR nDSM 90th-pctile; **no floor-count cross-check → stands alone**; **no published RMSE-Z** |
| Real roof shape? | **NO nationally / PARTIAL Lisbon** | no national LOD2; Lisbon CML LOD2/3-ish (licence TBV); RANSAC = "reconstructed" |
| Coverage gaps | ~134-muni parcel coverage (per-muni check); no national LOD outside Lisbon; DGT LiDAR NW gap (~90%); Lisbon licence + OGC-API status UNVERIFIED |
