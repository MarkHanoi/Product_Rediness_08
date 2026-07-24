# Switzerland — Master Data Source Study

**Scope:** 3D context-data layer (L-511) + legal/zoning layer scoping.
**Dated:** 2026-07-24. **Maintainer:** UNASSIGNED.

> This document compiles confirmed findings from five research passes (attached docs, 2026-07-24) into
> a single citable reference. Cross-reference individual topic files in `../topics/` for gate answers.
> Legal/zoning layer: scoped only — no ÖREB endpoint has been queried.

---

## Part 1 — Why Switzerland is structurally different

Switzerland is **unlike every other country in this study** on the context-data dimension:

1. **One federal agency, one licence.** swisstopo and BFS publish all primary context data (3D
   buildings, terrain, roads, water, parks, trees, building register) under a single federal OGD
   licence (free since 1 March 2021, no login, commercial use permitted). There is no per-Bundesland
   licence fragmentation (cf. Germany), no regional open-data programme variance (cf. France), and no
   multi-agency consolidation problem (cf. Belgium).

2. **One federal building register with EGID.** The GWR (Gebäude- und Wohnungsregister, BFS) links
   every building in Switzerland to a federal building identifier (EGID). This makes
   geometry–attribute joins trivially repeatable: the same EGID key connects swissBUILDINGS3D 3.0
   Beta (where live) and GWR attributes nationally, via a single federal API endpoint.

3. **One ÖREB data model.** The V-ÖREB federal ordinance mandates a standardized public-law
   restriction cadastre across all 26 cantons. If canton implementations expose structured fields
   (zone code + Ausnützungsziffer + height), a single V-ÖREB reader is reusable for all cantons —
   unlike Germany's 16-Bundesland patchwork or France's per-commune PLU.

4. **Full national LiDAR coverage.** swissSURFACE3D completed its 7-stage national survey
   (2017–2024/25) — classified airborne LiDAR at 15–20 pts/m², full national + Liechtenstein, free.
   The Building class enables independent height verification for every building in the country.

---

## Part 2 — Buildings / LOD / Height (context layer)

### 2.1 — Source stack

**Layer 1 — swissBUILDINGS3D 2.0 (baseline, full national)**
- Coverage: full national + Liechtenstein since 2018
- Geometry: LOD2 closed solid OR separate roof/façade/footprint elements
- Method: manually stereo-photogrammetrically extracted roofs including overhangs — not a mass model
- Accuracy: ±30–50cm planimetric and altimetric
- Formats: ESRI FileGDB, DWG, CityGML
- Licence: free OGD since 1 March 2021
- Download: `map.geo.admin.ch` or swisstopo API (no registration)

**Layer 2 — swissBUILDINGS3D 3.0 Beta (EGID-enhanced, partial canton rollout)**
- Same LOD2 geometry + **EGID baked directly into the model**, cleaner roof/façade separation
- Update cadence: biannual
- **Live cantons (as of 2026-07-24):** AG, AI, AR, BE, BL, BS, FR, GL, JU, LU, NE, NW, OW, SG, SH,
  SO, SZ, TG, UR + **city of Zürich only** (not the rest of canton Zürich)
- **Not yet live:** GE (Geneva), VD (Vaud — incl. Lausanne), VS (Valais), TI (Ticino), ZG (Zug),
  GR (Graubünden), canton Zürich outside the city
- Fallback for above: swissBUILDINGS3D 2.0 (same LOD2 quality; EGID joined via GWR coordinate match)
- **Fidelity gap, not availability gap:** Geneva and Lausanne are fully covered at LOD2 via 2.0

**Layer 3 — swissSURFACE3D (classified LiDAR, ground-truth verification)**
- 15–20 pts/m²; classified point cloud
- Classes: Ground / Low veg / Medium veg / High veg / **Building** / Water / Bridge / power lines /
  façades / bridge piers
- Full national coverage (7-stage survey, Bern release completed national coverage, 2017–2024/25)
- Newest tiles (Eastern Switzerland, since 2024): **COPC** format (cloud-native, no full download)
- Older tiles: zipped `.las` (LAZ 1.2)
- Licence: free OGD, no login
- Use: independently verify/refine modeled roof geometry; derive height for cantons where 3.0 Beta is
  not yet live

**Layer 4 — swissSURFACE3D Raster**
- 0.5m grid DSM (ground + vegetation + buildings)
- Full national coverage by 2025; replaces on-request DSM orders
- Format: GeoTIFF, 1 km² tiles
- Note: integrates swissTLM3D watercourse vectors "to improve surface representation of large rivers
  and lakes" — the vector and point-cloud products are already mutually reconciled by swisstopo

**Layer 5 — swissALTI3D (DTM)**
- 0.5m or 2m grid, bare earth (no vegetation/buildings)
- 6-year update cycle; full national

**Layer 6 — GWR (Gebäude- und Wohnungsregister, BFS) — the key attribute addition**
- Per-building, EGID-linked attributes: Anzahl Geschosse (storey count) · Baujahr (construction year)
  · Gebäudeart (building type) · Gebäudefläche (footprint area) · heating type · dwelling count
- All above attributes are "Stufe A" = public, no restriction
- Update cadence: ≤48h nationally; Zürich / Thurgau / Glarus / Schwyz refresh daily
- Access: API/JSON via `housing-stat.ch` (BFS); also republished by several cantons on opendata.swiss
- EGID join: 3.0 Beta = EGID in model; 2.0 = GWR coordinate match

### 2.2 — Why this stack is the strongest in this country study

| Country | Geometry | Independent height | Open storey register |
|---|---|---|---|
| Switzerland | LOD2 manual photogrammetry (±30–50cm) | swissSURFACE3D LiDAR (15–20 pts/m²) | GWR EGID-linked (≤48h) |
| Germany | LoD2-DE (varies by Bundesland) | None open-national | None open-national |
| Norway | FKB-Bygning footprint + top height | None open-national | None open-national |
| France | BD TOPO® LOD1/2 | LiDAR HD (in progress) | None equivalent |

### 2.3 — Gate answers

| # | Question | Answer |
|---|---|---|
| a | Real footprint? | **YES** — nationwide since 2018 |
| b | Real height? | **YES** — LOD2 volumetric + LiDAR cross-check + GWR storey count |
| c | Real roof shape? | **YES** — manually stereo-photogrammetrically extracted |

### 2.4 — Open items before implementation

1. **GWR Merkmalskatalog full field schema:** read `housing-stat.ch/files/881-2200.pdf` field-by-field
   to confirm exact Stufe A field names, types, and domain values before building schema mapping.
2. **CityGML export conformance level:** download one sample `.gml` tile; inspect `cityGMLVersion`
   in header (CityGML 2.0 vs. 3.0 — matters for ingestion pipeline).
3. **3.0 Beta canton list cadence:** re-check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta`
   every 6 months; do not treat 2026-07-24 list as static.

---

## Part 3 — Roads / Pedestrian (context layer)

**Source:** swissTLM3D, topic group "Strassen und Wege" + "Öffentlicher Verkehr"

- 8-topic, 21M+-object national topographic landscape model
- Coverage: full national + Liechtenstein (confirmed versions 1.7 → 2.4)
- Accuracy: 0.2–1.5m in all 3 dimensions; roads are a "well-defined" object class
- Object-level: YES — real feature classes with type + confirmed attributes:
  - `VERKEHRSBEDEUTUNG` (traffic significance)
  - `VERKEHRSBESCHRAENKUNG` (traffic restriction, incl. "closed")
  - `VERKEHRSMITTEL` (mode of transport)
  - `EIGENTUEMER` (owner)
- Update cadence: 3-year full cycle + **annual** update for road links + admin boundaries;
  official cadastral survey is a named reference partner
- Formats: FileGDB (native), SHP, DXF
- Licence: free OGD since 1 March 2021

**Gate answer:** Object-level? **YES** — feature classes with attribute list, nationwide, no gaps.

**Open items:**
- Full VERKEHRSBEDEUTUNG / VERKEHRSBESCHRAENKUNG domain value list (read Objektkatalog 2.4)
- Pedestrian/sidewalk sub-classification within "Wege" path type (check 2.4 object catalogue
  path sub-types before assuming full pedestrian-network granularity)

---

## Part 4 — Water (context layer)

**Source:** swissTLM3D, topic group "Gewässernetz"

- Watercourse centerlines + lake polygon outlines as distinct feature classes
- Coverage: full national + Liechtenstein
- Accuracy: 0.2–1.5m (same "well-defined" top tier as roads)
- Cross-check: swissSURFACE3D Water class (independent LiDAR classification); additionally, the
  swissSURFACE3D DSM explicitly integrates TLM watercourse vectors for river/lake surface quality —
  the two products are already mutually reconciled by swisstopo, not independently inconsistent
- Formats: FileGDB (native), SHP, DXF
- Licence: free OGD since 1 March 2021

**Gate answer:** Object-level? **YES** — confirmed nationwide, with genuine independent cross-check.

**Open items:** None material — this is the most cleanly confirmed topic in this study.

---

## Part 5 — Parks / Trees (context layer)

**Sources:** swissTLM3D ("Areale" + "Bodenbedeckung") + swissSURFACE3D (vegetation classes)

**Parks/leisure areas:** swissTLM3D "Areale > Freizeit" — parks, recreation grounds, sports
facilities as distinct polygon class, separate from generic ground cover. Full national + Liechtenstein.

**Individual trees:** swissTLM3D "Bodenbedeckung" — Einzelbäume (individual tree points) +
Gehölzflächen (wooded area polygons) as distinct object classes. Production-use confirmed: City of
Zürich's open-data documentation explicitly uses this layer to supplement its municipal Baumkataster.

**Tree/vegetation height:** derivable from swissSURFACE3D Low/Med/High vegetation point classes —
goes beyond bare point location to actual canopy height per tree/wooded area.

**Known limitation — tree data authority:**
swissTLM3D's tree points are a periodic recalculation, not a continuously field-verified municipal
cadastre. The City of Zürich explicitly assigns **greater authority to its own Baumkataster** and
uses swissTLM3D only to supplement gaps. Pattern: national fallback (swissTLM3D) + municipal override
where a city publishes an open-data tree cadastre.

**Gate answer:** Object-level? **YES, with nuance** — parks confirmed distinct object class; trees
confirmed object-level but positioned as secondary to local municipal cadastre where available.

**Open items:**
- Check whether Geneva, Basel, Lausanne, Bern publish open-data tree cadastres (Zürich is the only
  confirmed case)
- Confirm swissTLM3D 2.4 Areale Freizeit sub-types (park vs. sports field vs. playground, if
  sub-classified)

---

## Part 6 — Coverage gaps and routing logic

### 6.1 — The one confirmed regional split

swissBUILDINGS3D 3.0 Beta is not yet full-national. Route by canton:

```
project_bbox → canton intersection check
  → 3.0 Beta live list? → swissBUILDINGS3D 3.0 Beta (EGID in model)
  → not yet in 3.0 Beta? → swissBUILDINGS3D 2.0 + GWR coordinate EGID join
```

**3.0 Beta LIVE (as of 2026-07-24):** AG, AI, AR, BE, BL, BS, FR, GL, JU, LU, NE, NW, OW, SG, SH,
SO, SZ, TG, UR + **city of Zürich only**.

**NOT YET live in 3.0 Beta:** GE, VD (incl. Lausanne), VS, TI, ZG, GR, canton ZH (outside city).

**Standing action:** re-check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` every 6 months.

### 6.2 — Everything else: full national, no routing

swissTLM3D · swissSURFACE3D · swissALTI3D · GWR — all are single national products under one
federal licence. No per-canton routing required for any of these four.

---

## Part 7 — Legal/zoning layer (scoped, not researched)

### 7.1 — Structure

Switzerland's planning law is **per-canton**: each canton enacts its own Nutzungsplanung /
plan d'affectation, implemented at municipality level as Bau- und Zonenordnung (BZO). The federal
instrument is the **ÖREB/RDPPF cadastre** — a V-ÖREB-ordinance-mandated standardized public-law
restriction cadastre, rolled out canton-by-canton.

**Key concepts:**
- **Ausnützungsziffer (AZ) / Geschossflächenziffer (GFZ):** the Swiss FAR-equivalent — ratio of
  total floor area to plot area. The primary density metric in most cantonal planning codes.
- **Baudichte / Ausnützung:** coverage and utilisation rate — varies by canton and zone type.
- **V-ÖREB:** federal ordinance mandating a standardized data model for the cantonal ÖREB cadastres.
  If canton implementations are compliant, a single ÖREB reader covers all 26 cantons.
- **ADR-0270 note:** Swiss Nutzungsplanung is typically a **density-and-height model** (AZ/GFZ + max
  Gebäudehöhe), not an alignment-governed model — confirm per canton before assuming any
  alignment-governed logic.

### 7.2 — The single most important unknown

Does a typical canton's ÖREB/RDPPF response return zone code + Ausnützungsziffer + max height as
structured machine-readable attributes — or only PDF URLs pointing to ordinance text?

This single question determines:
- **Outcome A (structured fields):** ceiling ~85–96%; V-ÖREB reader reusable for all 26 cantons;
  Switzerland becomes the highest-rated jurisdiction in this benchmark after Denmark.
- **Outcome B (PDF URL only):** ceiling ~30–45% without a transcription pipeline; OCR + L-449 gate
  required for numeric rule extraction.

### 7.3 — Pilot probe to run

```bash
# Zürich ÖREB endpoint (recommended pilot canton):
curl "https://oereb.zh.ch/extract/reduced/json/coord/2683448,1248342"
# Inspect: does the response include a structured field for:
#   - zone/use code (e.g. `Typ_Kt`, `Bezeichnung`, `LegendeEintrag`)
#   - numeric Ausnützungsziffer/GFZ
#   - numeric max height (Gebäudehöhe, Firsthöhe, Traufhöhe)
# Or only: `PDF_URL` for each restriction's legal provision?
```

Federal ÖREB aggregator (lists all canton endpoints): `geodienste.ch/db/oereb_2_0/deu`

### 7.4 — Why the potential is highest of any country

Switzerland has a structural advantage no other country in this benchmark possesses:
- One federal V-ÖREB data model → one reader for all 26 cantons
- AZ/GFZ is a numeric concept in Swiss planning law → more likely to be structured than narrative text
- High digitisation capacity at cantonal level
- No per-Bundesland licence or data-model fragmentation (cf. Germany)
- No per-commune PLU inconsistency (cf. France)

The effort to go from a confirmed Outcome A pilot to full-26-canton coverage is an engineering sprint,
not a policy or legal-data problem.

---

## Part 8 — Rate summary

| Layer | Score | Basis |
|---|---|---|
| Context-data (buildings, terrain, roads, water, parks, trees) | ~85% | Confirmed from official product documentation; specific open items noted |
| Building-rule (zone code + density + height without PDF read) | NOT ASSESSED | Zero ÖREB/RDPPF probes run; ceiling unknown pending one pilot query |
| **Potential ceiling (Outcome A)** | **~85–96%** | Conditioned on ÖREB structured-field confirmation |
| **Realistic ceiling (Outcome B)** | **~30–45%** | If ÖREB delivers PDF URL only |

---

## Part 9 — Resume instructions

1. **Phase 0 (context closeout):**
   - Read `housing-stat.ch/files/881-2200.pdf` → record full Stufe A field schema in `sources/SOURCES.md`
   - Download one swissBUILDINGS3D CityGML tile → confirm version declaration
   - Check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` → update canton list if changed
   - Read swissTLM3D 2.4 Objektkatalog → transcribe full VERKEHRSBEDEUTUNG/VERKEHRSBESCHRAENKUNG
     domain values; confirm pedestrian sub-classification; confirm Areale Freizeit sub-types

2. **Phase 0b (ÖREB pilot probe):**
   - Run `curl "https://oereb.zh.ch/extract/reduced/json/coord/2683448,1248342"` → inspect response
   - Record Outcome A or B in `NEXT.md §3.1`; update `RATE.md §3 — The structural gap`

3. **Phase 1 (first city pack):**
   - Only after Phase 0b — add `ch-zh/<BFS>-<slug>/` or `ch-be/...` folder
   - Full envelope query for a test address; cite per field in SOURCES.md; VERIFICATION.md sign-off

4. **Phase 2–3 (scale):**
   - Priority cities: Zürich (city), Geneva, Lausanne, Basel, Bern
   - All 26 cantons via `geodienste.ch` aggregator
