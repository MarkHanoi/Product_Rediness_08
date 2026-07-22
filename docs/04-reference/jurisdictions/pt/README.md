# Portugal — 3D Context Data spike (build-order #7)

Part of the country study — umbrella **L-511**, deep-dive **L-514**
(`../../V1-LAUNCH-READINESS-AUDIT.md`). Research ground-truth: `../../Pryzm_3D_Context_Data_Sourcing.md`
+ the founder deep-dive. Full analysed writeup: `PORTUGAL-CONTEXT-DEEP-DIVE.md`.

> **Verification status — READ THIS FIRST.** Unlike the Spain spike (live-probed 2026-07-21), the
> Portugal endpoints were **NOT live-probed this session**. Everything here is **per founder
> deep-dive, endpoints NOT yet live-probed** — every URL, coverage figure, licence and class code
> is a **spike lead to re-verify live**, not a confirmed fact. Items are marked **UNVERIFIED** where
> the founder deep-dive asserts them without a live probe.

- **Target LOD:** Tier B — footprint (OSM/Overture; Carta Cadastral parcel where covered) + **real
  DGT-LiDAR nDSM height**, procedural roof. **Lisbon municipal exception:** CML's council-wide 3D
  model is LOD2/3-ish (map more directly, licence permitting).
- **Source(s):** OSM/Overture (footprint/roads/water/parks baseline) · **DGT national LiDAR**
  (heights, nDSM) · **Carta Cadastral / SNIC** (parcels, ~134 munis) · **Lisbon CML** municipal 3D
  model + Arvoredo + Rede Viária (municipal exception) · SNIRH/DGT (water) · COS/COSc (land-cover).
- **Integration effort:** **HIGH** — patchy parcel coverage + no national LOD/building layer outside
  Lisbon means a per-municipality resolver + a Lisbon special-case, on top of the shared nDSM module.
- **Spike status:** **NOT STARTED (endpoints NOT live-probed this session)** — Gate below is filled
  from the founder deep-dive and flagged UNVERIFIED; must be re-probed live to exit Phase 1.
- **Implementation status:** NOT STARTED (two-phase rule — no impl before the Gate is evidence-passed
  live + founder go-ahead). **Portugal is curation/coverage-gated**, not endpoint-blocked.

## Why Portugal is Tier B (with a Lisbon exception), not uniformly "the weakest"
Portugal is **not** uniformly the weakest of the 7. It gained a **genuinely new (2023–2025) national
parcel cadastre** (Carta Cadastral, DL 72/2023) where it had none, and **Lisbon** publishes a
council-wide 3D model **richer** than any single Spain municipal source (incl. modelled pedestrian
infra). The real weakness is the **COMBINATION** of patchy parcel coverage outside **~134
municipalities** and **no nationwide LOD/building dataset outside Lisbon** — so the honest badge must
be resolved **per-site, per-layer, per-municipality**, never flattened to "PT = OSM".

Height comes from the **nDSM technique** (`DSM − DTM`, 90th-percentile) on **DGT national LiDAR** —
the **same shared module** as Spain + France (L-511c / L-512b). **The key difference vs Spain: no
national floor-count exists to cross-check the LiDAR height**, so PT height stands alone at a lower
confidence ceiling.

## Endpoint leads (NOT probed this session — verify live in Phase 1)
| Endpoint / dataset | Claimed status | Notes (per founder deep-dive — UNVERIFIED) |
|---|---|---|
| Carta Cadastral / SNIC (DGT) | **NOT PROBED** | Per-parcel Shapefile/GeoPackage/DXF/GeoJSON + INSPIRE WMS/WFS via SNIG; **OGC API planned 2025 — verify if live**. EU High-Value Dataset (Reg 2023/138). NIC id + geometry + area per prédio. |
| DGT national LiDAR `cdd.dgterritorio.gov.pt` | **NOT PROBED** | PRR-funded, flown Apr 2024–Mar 2025, 10 pts/m², classified LAZ + DTM 50cm / DSM 2m, open ("sem qualquer tipo de restrição"), **~90% continental coverage** (NW gap, rolling). QGIS "DGT CDD Downloader". **NO published RMSE-Z.** |
| Lisbon CML 3D model `geodados-cml.hub.arcgis.com` | **NOT PROBED** | "Modelo Tridimensional da Ocupação Superficial do Concelho de Lisboa", 1:1,000 over council MDT; balconies/setbacks/sidewalks/tunnels/walls >0.5m; Phase 2 tree-clusters @1:5,000. **Open-redistribution terms UNVERIFIED.** |
| SNIRH + DGT hydrography (via SNIG/INSPIRE) | **NOT PROBED** | National water-resources system + hydrography. |
| COS / COSc (DGT land-cover) | **NOT PROBED** | National land-cover, multiple years; COSc = SMOS AI/ML, more frequent. Too coarse for individual parks (SIOSE-class caveat). |
| Infraestruturas de Portugal (IP) roads | **NOT PROBED** | Likely holds national road network — **open-data status unconfirmed**. |

## Gate — Phase-1 exit (from founder deep-dive; UNVERIFIED until live-probed)
| # | Question | Verdict | Evidence (per founder deep-dive — NOT live-probed) |
|---|---|---|---|
| a | Real footprint / parcel? | **PARTIAL** | **Carta Cadastral (DL 72/2023, SNIC, DGT)** gives real parcel geometry + NIC — but only **~134 munis** (127 CGPR rural, S of Tagus + 7 SiNErGIC pilots); **NOT built-up city cores → do NOT assume Lisbon/Porto covered**. Buildings: no national footprint layer; OSM/Overture baseline; Lisbon CML 3D model is the rich exception. **BUPi is NOT a parcel source.** |
| b | Real height? | **YES (single-source)** | **DGT national LiDAR nDSM** (`DSM−DTM`, 90th-pctile), 10 pts/m², open. **KEY DIFFERENCE vs ES: no Catastro-ALTURAS floor-count cross-check → LiDAR stands ALONE, lower confidence ceiling.** DGT has **not** published RMSE-Z — do NOT quote PNOA parity. |
| c | Real roof shape? | **NO nationally / PARTIAL Lisbon** | No national LOD2; procedural/flat elsewhere. **Lisbon CML 3D model** carries surface detail (balconies/setbacks/walls) closer to LOD2/3 — map more directly **if licence permits (UNVERIFIED)**. Self-run RANSAC from LiDAR = "reconstructed". |
| d | Roads/water/parks object-level? | **NO nationally / YES Lisbon** | Nationally OSM/Overture + SNIRH/DGT hydro (water) + COS/COSc (parks, coarse). **Lisbon:** Rede Viária (extruded), modelled sidewalks, jardins-parques dataset. IP national roads UNVERIFIED. |
| e | Known coverage gaps? | Parcel coverage limited to ~134 munis (per-municipality check REQUIRED); **no national LOD/building layer outside Lisbon**; DGT LiDAR NW gap (~90%, rolling); **no crossing dataset** (procedural crosswalks); Lisbon licence + IP roads + OGC-API status + DGT class-codes + DGT RMSE all **UNVERIFIED**. |

**Gate verdict: NOT yet exitable — leads documented, but endpoints must be live-probed before this
Gate can be marked PASSED. Portugal is curation/coverage-gated (per-municipality parcel coverage +
Lisbon licence verification), not endpoint-blocked.**

## Integration facts for Phase 2
1. **Parcels resolve per-municipality.** Route the site bbox → is the municipality in the Carta
   Cadastral coverage set (~134)? YES → real NIC parcel geometry. NO → PDM cartography (Lisbon) or
   OSM/Overture footprint proxy, **badged approximation**. Never assume city-core coverage.
2. **nDSM module is the SAME shared infra** (ES + FR + PT — L-511c / L-512b). Build once: tile-index
   DGT DTM 50cm + DSM 2m → sample the **90th-percentile** of `(DSM−DTM)` inside each footprint. Do
   NOT one-off it per country. PT feeds the SAME module with different inputs.
3. **PT height stands alone.** No floor-count cross-check field → carry `measured_height_m` +
   `height_confidence` (from LiDAR point count only), and flag the **missing second field** rather
   than inventing one. This is an even more acute case of the L-512 provenance gap.
4. **Lisbon is a first-class municipal special-case**, not a fallback — CML's council 3D model
   (buildings + sidewalks + roads + Arvoredo trees) is richer than the national baseline. **BLOCKER:
   verify open-redistribution licence at geodados-cml.hub.arcgis.com before integrating.**
5. **License (all UNVERIFIED this session):** DGT LiDAR = open ("sem restrição"); Carta Cadastral =
   EU High-Value Dataset (open mandate); **Lisbon CML = UNVERIFIED** (do not assume redistributable);
   IP roads = UNVERIFIED. Attribution in the disclosure panel where confirmed open.
6. Roads/water/parks/trees outside Lisbon: keep the current Overpass/OSM pipeline as the Tier-C
   fallback, badged ESTIMATED, upgraded per-layer where a PT source is confirmed live.

---

## Per-layer three-tier badging matrix (L-514 — the honesty structure)
Every context layer resolves to a DIFFERENT tier; nothing collapses to one flat REAL/ESTIMATED toggle.
Same graded model as Spain (`../../spain/CONTEXT-DATA-SPIKE.md`) and the **C23 provenance extension**
(coverage gap logged in `../../../02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md`, now noted as an
**even more acute** single-source case for PT).

| Layer | REAL tier | Reconstructed / derived tier | ESTIMATED tier |
|---|---|---|---|
| **Parcels** | Carta Cadastral (NIC + geometry) where covered (~134 munis) | — | PDM cartography, or OSM/Overture footprint proxy (approximation) |
| **Buildings/height** | Lisbon CML 3D model (LOD2/3-ish); DGT LiDAR nDSM 90th-pctile elsewhere | RANSAC roof reconstruction from LiDAR | OSM `building:levels` |
| **Trees** | Lisbon CML "Arvoredo" per-tree (legally-mandated register) | DGT LiDAR CHM-detected (treetop+crown) — verify class codes | procedural along OSM/COS |
| **Roads** | Lisbon CML "Rede Viária" (already extruded) | centreline + inferred width, 50 cm-DTM-draped | class-default width, no local data |
| **Pedestrian** | Lisbon CML modelled sidewalks (licence TBV) | orthophoto-segmented sidewalks (DGT aerial) | inferred gap-fill / procedural crosswalks (no crossing dataset) |
| **Water** | SNIRH / DGT hydrography shape + DTM-sampled flat elevation | — | raw OSM polygon, no elevation correction |
| **Parks** | Lisbon "jardins-parques-urbanos" municipal | — | COS/COSc composite @site-scale, or OSM |

**Modeling methods** for each layer are documented in `topics/*.md` (§"3D modeling method"):
tree CHM + local-maxima + watershed; road centreline→buffer→junction-fill→drape (on DGT 50cm DTM);
pedestrian 3-tier ladder + procedural crosswalks; water flatten-don't-nDSM; parks COS-coarse-fallback
/ Lisbon-municipal-primary. Full analysed writeup: `PORTUGAL-CONTEXT-DEEP-DIVE.md`.
