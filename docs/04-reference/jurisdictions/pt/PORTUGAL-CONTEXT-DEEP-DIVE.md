# Portugal — 3D Context Data: full deep-dive (L-514)

Part of the context-data study — umbrella **L-511**, deep-dive **L-514**
(`../../V1-LAUNCH-READINESS-AUDIT.md`). Source: **founder deep-dive 2026-07-21**. Unlike the Spain
pass (L-512), **Portugal endpoints were NOT live-probed this session** — everything below is
"per founder deep-dive, endpoints NOT yet live-probed". Every URL, coverage figure, licence term
and class code marked **UNVERIFIED** must be re-probed live before Phase-2 relies on it (project
discipline: *ship the probe before the fix*).

## 0. The single most important reframing
Portugal is **NOT uniformly "the weakest of the 7."** Two things changed the picture:
1. Portugal now has a **genuinely new (2023–2025) national parcel cadastre** — the **Carta
   Cadastral** under **Decreto-Lei 72/2023** — where historically it had none. This is a bigger
   structural upgrade than any single Spain source delivered.
2. **Lisbon has a materially RICHER municipal 3D dataset** (CML's council-wide 3D model, incl.
   modelled **pedestrian infrastructure**) than any single Spain municipal source.

The real Portugal weakness is **the COMBINATION** of (a) patchy parcel coverage outside
~134 municipalities and (b) no nationwide LOD/building dataset outside Lisbon — not an absence of
authoritative data per se. Target the honest badge per-site, per-layer; never flatten to "PT = OSM".

---

## 1. Parcels — the biggest update (Carta Cadastral / SNIC / DGT)
**Historically:** Portugal had NO Catastro equivalent. Property was recorded in the **matriz
predial** (tax register) + **registo predial** (legal ownership register) — **no open parcel
geometry**. This is the fact most external sources still repeat.

**Now:** the **Carta Cadastral** under **Decreto-Lei 72/2023 (21 Nov 2023)**, part of **SNIC**
(Sistema Nacional de Informação Cadastral), operated by **DGT** (Direção-Geral do Território).
- Every **prédio** (property) receives a unique **NIC** identifier + **geometry** + **area**.
- **Access (UNVERIFIED URLs/formats):** per-parcel download in **Shapefile / GeoPackage / DXF /
  GeoJSON**; **INSPIRE WMS/WFS via SNIG**; an **OGC API planned for 2025 — VERIFY status** (may or
  may not be live).
- Designated an EU **High-Value Dataset** (Reg. 2023/138) → strong open-access mandate.

**HONEST LIMITATION = coverage, not existence.** The Carta Cadastral is built by converting two
older regimes, so it does NOT yet cover the whole country and, critically, **does NOT reliably cover
built-up city cores**:
- **CGPR** (Cadastro Geométrico da Propriedade Rústica; 1926 decree) — the rural cadastre,
  predominantly **SOUTH of the Tagus**, **127 municipalities** (118 mainland + 9 in the autonomous
  regions). It is **rural + only non-independent urban parcels** — **NOT the built-up urban cores**.
- **SiNErGIC / CPE** pilot — **7 municipalities**: **Loulé, Oliveira do Hospital, Paredes,
  Penafiel, São Brás de Alportel, Seia, Tavira**.
- ⇒ roughly **~134 municipalities** covered. **Do NOT assume Lisbon / Porto city centres have real
  parcel geometry — CHECK PER-MUNICIPALITY.**

**Fallback where the Carta Cadastral is absent (uncovered urban):**
1. **Municipal PDM cartography** (e.g. Lisbon's PDM plan cartography) where the council publishes it.
2. **OSM / Overture building-footprint proxy** — badge explicitly as an **approximation**, not a
   legal parcel.

**BUPi is NOT a parcel-geometry source.** BUPi (Balcão Único do Prédio) is a rural/mixed **ownership
registration** initiative — it does not produce the authoritative parcel geometry layer. Call this
out explicitly so nobody wires BUPi expecting parcels.

---

## 2. Buildings / LOD — the Lisbon exception
**No national building-footprint or LOD dataset exists** for Portugal (the same gap as Spain, minus
Catastro's national footprints — Portugal has neither national footprints nor national LOD).

**Lisbon is the exception, and it is strong.** CML (Câmara Municipal de Lisboa) publishes the
**"Modelo Tridimensional da Ocupação Superficial do Concelho de Lisboa"** — a council-wide 3D model:
- **1:1,000** scale, **extruded over the council MDT** (municipal terrain model).
- Includes **balconies, elevated volumes, setback faces, sidewalks, tunnel entrances, and walls
  > 0.5 m** — i.e. genuine surface-occupation detail, closer to **LOD2/3** than ICGC's LOD1 blocks.
- **Phase 2 adds tree-clusters @ 1:5,000.**
- **VERIFY open-redistribution terms** at **geodados-cml.hub.arcgis.com** before treating it as
  integrable — the licence is **UNVERIFIED**; do not assume it permits redistribution inside PRYZM.

**Elsewhere in Portugal:** OSM / Overture footprint + **DGT LiDAR nDSM**, flat extrusion (Tier-B).

---

## 3. Height — same nDSM method, PT inputs, ONE big caveat
Portugal now has **national LiDAR** from **DGT**:
- **PRR-funded**, flown **Apr 2024 – Mar 2025**, **10 pts/m²**.
- **Classified LAZ** + derived **DTM 50 cm / DSM 2 m**.
- **Open** — "sem qualquer tipo de restrição" (no restriction of any kind).
- **~90% continental coverage** (a gap in the NW; rolling completion) — **UNVERIFIED figure**.
- Host: **`cdd.dgterritorio.gov.pt`** + a **QGIS "DGT CDD Downloader"** plugin.

**Method is identical to Spain** (see `../../spain/SPAIN-HEIGHT-MEASUREMENT.md`): nDSM = `DSM − DTM`,
per-footprint **90th-percentile** (not max — antennas/HVAC inflate max), keep `max` + point count
for confidence. **This is the SAME shared nDSM module (L-511c / L-512b) — build once (ES+FR+PT), do
NOT one-off it per country.**

**KEY DIFFERENCE vs Spain — two lower-confidence facts:**
1. **NO national floor-count cross-check.** Spain cross-checks LiDAR height against Catastro
   `ALTURAS` (floor count). Portugal has **no Catastro-ALTURAS equivalent** → **LiDAR height stands
   ALONE**, with a **lower confidence ceiling** and no second field to flag disagreements against.
   This makes Portugal an **even more acute case** of the single-source-height provenance gap logged
   under L-512.
2. **DGT has NOT published an RMSE-Z figure** (unlike PNOA's cycle-by-cycle specs). **Do NOT quote
   parity with PNOA's ~10 cm.** Flag: **"request DGT's formal accuracy spec"** before badging any
   confidence number.

---

## 4. Trees
- **Lisbon (Tier-A):** CML **"Arvoredo"** per-tree dataset (via **Lisboa Aberta** + **dados.gov.pt**),
  a **legally-mandated register** (Regulamento Municipal do Arvoredo) → **actively maintained**. Plus
  the **1:5,000 tree-cluster** layer in the municipal 3D model (Phase 2).
- **Elsewhere:** DGT LiDAR **veg-class CHM** → **local-maxima** → **watershed** (same technique as
  Spain trees). **VERIFY DGT's LiDAR class codes vs ASPRS first** — do not assume ASPRS 3/4/5 map
  cleanly; DGT's classification scheme is **UNVERIFIED**.
- **Fallback:** procedural placement along **OSM / COS** polygons (labelled procedural, not measured).

---

## 5. Roads
- **Baseline:** OSM / Overture.
- **Lisbon:** CML **"Rede Viária"** + roads are **already volumetrically extruded** in the municipal
  3D model (best case).
- **National (UNVERIFIED):** **Infraestruturas de Portugal (IP)** likely holds the national road
  network — **VERIFY open-data status** (unconfirmed; may not be openly licensed).
- **Method identical to Spain:** centreline → width-per-class → buffer → junction-fill → drape on the
  **DGT 50 cm DTM** (finer than PNOA's grid — an advantage for street grade on Lisbon's hills).

---

## 6. Pedestrian
- **Lisbon best case:** sidewalks are **already modelled** in the municipal 3D dataset (verify terms
  — same UNVERIFIED CML licence as §2).
- **Elsewhere:** the same **3-tier ladder as Spain** — (1) municipal 1:1,000–1:2,000 topo base where
  published; (2) **orthophoto segmentation** from **DGT aerial** imagery; (3) geometric gap-inference
  between road surface and building footprints.
- **No crossing dataset identified** (unlike Barcelona's "passos de vianants") → **procedural
  crosswalks** only.

---

## 7. Water
- **Sources:** **SNIRH** (Sistema Nacional de Informação de Recursos Hídricos — national
  water-resources system) + **DGT hydrography** via SNIG / INSPIRE.
- **Same rule as Spain:** **NEVER derive water surfaces from raw LiDAR** (NIR is absorbed/reflected;
  returns are noisy/missing over water). Flatten to authoritative reference elevations: flat DTM-
  sampled elevation for lakes; longitudinal gradient sampled along centreline for rivers; a **fixed
  MSL plane** for the **Atlantic coast**.

---

## 8. Parks
- **Sources:** **COS** (Carta de Uso e Ocupação do Solo — DGT national land-cover, multiple years) +
  the newer **COSc** (SMOS initiative, AI/ML-derived, more frequent updates).
- **Same caveat as Spain's SIOSE:** national land-cover is **too coarse for individual park
  boundaries** — use as **fallback / district-scale context only**, not per-park precision.
- **Lisbon:** the dedicated **"jardins-parques-urbanos"** municipal dataset is preferred where
  available.
- **Ground cover = texture, trees = the only 3D veg volume** (same Cityweft/Forma principle as Spain).

---

## 9. Per-layer three-tier badging matrix (the honesty structure)
Every context layer resolves to a DIFFERENT tier; nothing collapses to one flat REAL/ESTIMATED toggle.

| Layer | REAL tier | Reconstructed / derived tier | ESTIMATED tier |
|---|---|---|---|
| **Parcels** | Carta Cadastral (NIC + geometry) where covered (~134 munis) | — | PDM cartography, or OSM/Overture footprint proxy (approximation) |
| **Buildings/height** | Lisbon CML 3D model (LOD2/3-ish); DGT LiDAR nDSM 90th-pctile elsewhere | RANSAC roof reconstruction from LiDAR | OSM `building:levels` |
| **Trees** | Lisbon CML "Arvoredo" per-tree | DGT LiDAR CHM-detected (treetop+crown) | procedural along OSM/COS |
| **Roads** | Lisbon CML "Rede Viária" (extruded) | centreline + inferred width, 50 cm-DTM-draped | class-default width, no local data |
| **Pedestrian** | Lisbon CML modelled sidewalks (licence TBV) | orthophoto-segmented sidewalks | inferred gap-fill / procedural crosswalks |
| **Water** | SNIRH / DGT hydrography shape + DTM-sampled flat elevation | — | raw OSM polygon, no elevation correction |
| **Parks** | Lisbon "jardins-parques-urbanos" municipal | — | COS/COSc composite @site-scale, or OSM |

---

## 10. UNVERIFIED items — the live-probe checklist for Phase 1
These are asserted in the founder deep-dive but **were NOT live-probed this session** — treat each as
a spike gate before relying on it:
1. **Lisbon CML 3D-model + Arvoredo + Rede Viária licence** (open redistribution?) at
   geodados-cml.hub.arcgis.com.
2. **Carta Cadastral OGC API** — planned 2025; is it live? which formats actually download?
3. **Per-municipality parcel coverage** — the concrete list beyond the 127 CGPR + 7 SiNErGIC; is
   Lisbon / Porto covered? (assume NOT until proven).
4. **DGT LiDAR RMSE-Z** — no published accuracy spec; request DGT's formal figure.
5. **DGT LiDAR class codes vs ASPRS** — confirm before wiring the CHM veg extraction.
6. **Infraestruturas de Portugal (IP)** national road network — open-data status unconfirmed.
7. **DGT LiDAR ~90% continental coverage + NW gap** — verify current rolling-completion state.
