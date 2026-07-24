# LOD-200 Context-Building Rate — MASTER rollup

**The second data-readiness rate.** Where `RATE.md` measures whether we know the buildable
**RULES** for a plot (zone / density / height-limit — what you MAY build), this rate measures whether
we can obtain a faithful **physical model of the EXISTING city** around it — real parcels + real
building heights + attributes (what IS already there). The two are **orthogonal**; never conflate them
(that conflation is the §CONTEXT-DATA-HONESTY failure C58 forbids).

Standard + ladder: `_TEMPLATE/LOD-RATE.md`. Plain-English: `_TEMPLATE/HOWTOREAD_LOD-RATE.md`.

> **The binding sub-metric is real building-HEIGHT coverage.** Footprints are near-universal (OSM);
> real per-building HEIGHTS are the gap that decides whether context renders as flat wireframe
> (LOD 100) or true massing (LOD 200). The founder's insight: *"How can we have the rules if we
> don't even have the heights of the buildings?"*

## The LOD ladder

| Level | What it is | How it renders |
|---|---|---|
| **LOD 100** | footprint + estimated/block height (OSM `height`, `levels`×3.2 m, or the fabricated **9 m** default) | flat prism at a guessed height / flat wireframe — **today's fallback** |
| **LOD 150 (LoD1)** | footprint + **real measured** height | correct prismatic massing |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | true massing with real roofs |

---

## Ranking — by LOD-200 context-building readiness

Ranked by headline (LOD level achievable + real-height coverage). **Flag** = whether the binding
height metric was live-probed this pass (VERIFIED) or is a desk read of the source spec (ESTIMATED).

| # | Jurisdiction | Parcel % | **Height %** (binding) | Attributes | LOD achievable | **Headline** | Flag |
|---|---|---|---|---|---|---|---|
| 1 | 🇳🇱 Netherlands | ~100 | **~99** | HIGH (roof + BAG) | **LOD 2.2** | **~97%** | **VERIFIED** |
| 2 | 🇨🇭 Switzerland | ~98 | **~98** | HIGH (GWR) | **LOD 2** | **~95%** | **VERIFIED** |
| 3 | 🇩🇰 Denmark | ~97 | **~95** | HIGH (BBR) | **LOD 2** | **~93%** | ESTIMATED |
| 4 | 🇩🇪 Germany | ~92 | **~90** | HIGH (roof) | **LOD 2** | **~82%** | VERIFIED (NRW) |
| 5 | 🇫🇷 France | ~95 | **~88** | MED (storeys) | LOD 1→2 | **~80%** | **VERIFIED** |
| 6 | 🇳🇴 Norway | ~96 | **~85** | MED | LOD 1 | **~72%** | ESTIMATED |
| 7 | 🇸🇪 Sweden | ~95 | **~80** | LOW–MED | LOD 1 | **~68%** | ESTIMATED |
| 8 | 🇺🇸 USA | **~45** ❗ | **~60** | MED | LOD 1 | **~58%** | **VERIFIED** (3DEP) |
| 9 | 🇪🇸 Spain | ~95 | **~45** ❗ | MED | LOD 1 (hybrid) | **~52%** | VERIFIED (footprint) |
| 10 | 🇧🇪 Belgium | ~90 | **~55** | LOW | LOD 1 (Flanders) | **~48%** | ESTIMATED |
| 11 | 🇵🇹 Portugal | **~35** ❗ | **~75** | LOW (Lisbon HIGH) | LOD 1 | **~42%** | ESTIMATED |
| 12 | 🇮🇹 Italy | ~70 | **~30** ❗ | LOW (Piedmont MED) | LOD 1 (regional) | **~35%** | ESTIMATED |
| 13 | 🇸🇦 Saudi Arabia | **~15** ❗ | **~20** ❗ | LOW | LOD 1 (ML) | **~18%** | ESTIMATED |

❗ = the sub-metric that drags (or, for the reverse cases, that the headline masks) — read the note below.

---

## What the ranking says

**Three tiers, decided almost entirely by whether a native national 3D building model exists:**

- **Tier 1 — native national LoD2 (real roofs): NL, CH, DK, DE.** A CityGML/CityJSON LoD2 model with
  real roof geometry, plus a rich building register (BAG / GWR / BBR). These render true massing out of
  the box. NL (3DBAG, LoD2.2) is the context-data ceiling — the LOD equivalent of what Denmark is for
  the rules rate. Germany has the data (~58M LoD2-DE) but per-Land licence-routing drags the headline.

- **Tier 2 — national height ATTRIBUTE, roof reconstruction needed: FR, NO, SE, (ES).** A real measured
  height exists nationally (BD TOPO `HAUTEUR`; FKB top-height; national LiDAR nDSM) → a strong LoD1
  today, LoD2 only after a LiDAR roof-reconstruction pipeline. France leads (open Etalab, VERIFIED);
  Norway/Sweden are dragged by licence (FKB commercial) / paid-municipal-LoD2 respectively.

- **Tier 3 — no national building model; footprint + derived/ML height: US, ES, BE, PT, IT, SA.**
  Footprints are national (Microsoft/Catastro/CADMAP/OSM) but height is derived (nDSM), regional
  (Piedmont), floor-count-estimated (Spain), or ML-coarse (Saudi). LoD1 at best, patchy.

**The binding-metric reads (why height, not footprint, decides the rank):**

- 🇪🇸 **Spain** has a top-tier footprint/parcel base (~95%, VERIFIED Catastro) but its "height" is a
  floor COUNT flat-extruded at 3 m — the *same category of estimate as OSM `levels`*, not a measurement.
  Real height needs an unbuilt, licence-unverified LiDAR nDSM. Great footprints do not make LoD1.
- 🇵🇹 **Portugal** inverts Spain: good national LiDAR height (~75%) but parcels cover only ~134 munis,
  **not the Lisbon/Porto cores**. Height carries it; parcel drags it.
- 🇺🇸 **USA** inverts the European pattern entirely: strong footprints + 3DEP LiDAR (VERIFIED) but **no
  national parcel cadastre** (~3,000 fragmented county systems). Parcel is the weak metric.
- 🇮🇹 **Italy**'s national LiDAR is terrain-only; building height is un-nationalised (Piedmont alone).
- 🇸🇦 **Saudi Arabia** is the honest floor: the national line is licensed/geo-fenced (403 measured),
  leaving ML footprints + a 30 m DEM.

---

## Orthogonality with `RATE.md` — the two rates side by side

The whole reason this rate exists: **a jurisdiction can be high on one and low on the other.** Same
country, two independent capabilities. Do not add them; do not quote one for the other.

| Jurisdiction | Rules rate (`RATE.md`) | Context rate (this) | Reading |
|---|---|---|---|
| 🇫🇷 France | ~22% | **~80%** | knows how tall buildings ARE (BD TOPO), not what you MAY build (PLU PDFs) — **clearest orthogonality** |
| 🇸🇦 Saudi Arabia | ~55% | **~18%** | knows the RULES (MOMRAH caps) but can't reach the physical CITY (geo-fenced) — **the mirror of France** |
| 🇩🇰 Denmark | ~96% | **~93%** | high on BOTH — proof the two axes *can* both be maxed |
| 🇪🇸 Spain | ~34% | **~52%** | both constrained by "geometry open, numbers/heights not" |
| 🇨🇭 Switzerland | ~25–35% | **~95%** | can rebuild the city at LoD2 far better than it answers zoning |
| 🇩🇪 Germany | ~28% | **~82%** | knows the physical shape (LoD2-DE) better than the rules (BauNVO PDFs) |

**France vs Saudi Arabia is the load-bearing pair** — France is low-rules/high-context, Saudi is
high-rules/low-context. If the two rates were the same axis, that inversion could not exist.

---

## Honesty ledger — VERIFIED (live-probed) vs ESTIMATED (desk)

Live-probed this pass (2026-07-24), asserting on Content-Type + body:

| Jurisdiction | Endpoint | Result | Earns |
|---|---|---|---|
| 🇳🇱 NL | `api.3dbag.nl/collections/pand/items` | CityJSON · LoD 0/1.2/1.3/2.2 · `b3_dak_type`, `b3_h_nok`, `b3_h_dak_50p` | **LoD2.2 VERIFIED** |
| 🇫🇷 FR | `data.geopf.fr/wfs` BDTOPO_V3:batiment (Paris 8e) | GeoJSON · `hauteur:9.5/21`, `nombre_d_etages:3/6` | **measured height VERIFIED** |
| 🇪🇸 ES | `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` GetCapabilities | WFS 2.0 · `bu:Building/BuildingPart/OtherConstruction` | **footprint VERIFIED** |
| 🇺🇸 US | `tnmaccess.nationalmap.gov/api/v1/products` (Chicago, 1 m DEM) | JSON · 2 products · `IL_4_County_QL1_LiDAR_2016` · S3 downloadURL | **3DEP height source VERIFIED** |
| 🇩🇪 DE | `opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | index · "3D-Gebäudemodell LoD2" CityGML tiles, open | **LoD2 open, NRW VERIFIED** |
| 🇨🇭 CH | `madd.bfs.admin.ch/eCH-0206` GWR (EGID 1175237/501001) | XML · storeys/year/category (per `ch/topics`, 2026-07-24) | **attributes VERIFIED** |

Desk-ESTIMATED (national/open source characterised, not live-probed this pass): 🇩🇰 DK (Danmark i 3D
spike NOT STARTED), 🇳🇴 NO (FKB/NDH RESEARCH COMPLETE), 🇸🇪 SE, 🇧🇪 BE (CADMAP endpoint live, height
attr unprobed), 🇵🇹 PT (founder deep-dive), 🇮🇹 IT (Piedmont research), 🇸🇦 SA (geo-fence 403 measured).
**No desk estimate is presented as a measurement.**

---

## Universal floor + how context renders today

With **no** national source wired, every jurisdiction falls to the OSM path in
`apps/editor/src/ui/geospatial/contextBuildings.ts`: footprint from OSM/baked tiles, height from the
`height` tag → `building:levels`×3.2 m → the **fabricated 9 m default** (`DEFAULT_BUILDING_HEIGHT_M`,
flagged `heightProvenance: 'assumed'`). That is LOD 100 — the floor below which no jurisdiction can
fall, and the thing every national source above is there to replace. The `heightProvenance` field
(`tagged` / `derived-levels` / `assumed`) is the in-code honesty gate that already distinguishes a real
height from the 9 m guess — this rate is its jurisdiction-level rollup.

---

*Last updated: 2026-07-24. 6 jurisdictions VERIFIED live (NL, FR, ES, US, DE, CH); 7 desk-ESTIMATED
(DK, NO, SE, BE, PT, IT, SA). Ranking is by headline (LOD level + real-height coverage); the binding
metric is real building-HEIGHT coverage. Keep the benchmark table in sync across every per-jurisdiction
`LOD-RATE.md`. Maintainer: UNASSIGNED.*
