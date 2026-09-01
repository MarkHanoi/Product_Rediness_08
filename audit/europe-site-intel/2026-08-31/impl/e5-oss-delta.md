# LANE 3 (E5) — OSS/GITHUB DELTA (brief §5) — PASS 1 + PASS 2 COMPLETE 2026-09-01

> Lane `oss-delta` · E5 data-reuse investigation · started 2026-09-01.
> DELTA over `lanes/oss-and-startups-2024-2026.md` (the "OSS lane"): that lane's 16 named-set
> items + 8 broader-OSS items + 13 startups are NOT re-derived here — cited as `OSS-lane §N`.
> Also citing: `lanes/eu-infrastructure-and-standards.md` (EU-infra lane) which already covers
> 3DCityDB 5.0, CHEK, GERS-as-key, CityGML3/CityJSON2, Overture-vs-EUBUCCO-vs-Microsoft matrix.
> Rules: probe the repo/licence/endpoint before any claim; URL + timestamp per claim;
> NOT CONFIRMED stays NOT CONFIRMED. READ-ONLY lane.

> ⛔ **READ PASS 2 BEFORE QUOTING PASS 1.** Everything from here to the `PASS 2` divider is the
> first sweep. Pass 2 (bottom of this file) **corrects six of its claims** — including two
> ABSENCE claims that were wrong (`D11` "no third OSS LoD2 engine"; `D19` "CODE-ACCORD is
> unlicensed") and one inventory claim taken from a docs page instead of the data (`D1`
> "seven bridged datasets" — the bucket has sixteen). It also adds **EUBUCCO v0.2**, which
> supersedes the v0.1 reading used throughout the campaign. **Corrections index: §S.3.**

## Scope of the delta (what the OSS lane did NOT cover)
1. Geospatial CONFLATION tooling — GERS ecosystem tools, footprint-matchers, height-fusers.
2. LoD2 GENERATION beyond roofer.
3. Cadastral/planning HARMONISATION projects (tooling side).
4. Building-regulation KNOWLEDGE GRAPHS beyond ACCORD.
5. Planning APIs / open urban-planning engines new or materially changed 2024–2026.
6. Re-verification where staleness matters: the OSS lane §4.4 explicitly left licence files
   UNREAD for pyramid_oereb, roofer, ozgxplanung, PlanX, CODE-ACCORD — closed here where
   load-bearing.

## Candidate table (11 columns per brief §5) — filled as verified

*(rows appended below as each candidate is probed)*

---

## PART 1 — Conflation tooling / GERS ecosystem (delta over OSS-lane §2 + EU-infra §F "adopt GERS as key")

### D1. Overture GERS Bridge Files — the conflation-provenance layer, and it bridges IGN-España
- **Repo/URL:** https://docs.overturemaps.org/gers/bridge-files/ — fetched 2026-09-01.
- **Coverage:** per-release, global; bridged source datasets (page's exact list): "Esri Community
  Maps, geoBoundaries, **Instituto Geográfico Nacional (España)**, Meta Places, Microsoft Places,
  OpenStreetMap, PinMeTo."
- **Data:** GERS-ID ↔ source-ID mappings, generated "with each data release"; current release
  `2026-08-19.0`.
- **Format:** Parquet, partitioned by `dataset`/`theme`/`type`, on S3
  (`s3://overturemaps-us-west-2/bridgefiles/<RELEASE>`) + Azure blob.
- **Licence:** NOT STATED on the bridge-files page — NOT CONFIRMED; resolve before redistribution
  (rendering/attribution unaffected).
- **Activity:** live, monthly-cadence with Overture releases (GERS GA June 2025).
- **API:** direct Parquet over S3/Azure (DuckDB-queryable).
- **Maturity:** production (Overture Foundation).
- **Commercial:** usable subject to per-source terms of the bridged IDs; the mapping itself is the
  question mark above.
- **Consumable:** YES, directly (Parquet).
- **⭐ Pryzm action — SOURCE-PRIORITY DATA CHANGE:** the ES bridge means Overture buildings can be
  joined back to **IGN-ES authoritative building IDs** without Pryzm running its own footprint
  matcher for Spain. EU-infra lane §F said "adopt GERS as the conflation key" in the abstract;
  this is the concrete artefact: bridge files ARE the pre-computed conflation. For any country
  Overture bridges to an authoritative source, Pryzm's federation scaffold should CONSUME the
  bridge file instead of building a geometric matcher. Countries NOT bridged (DE/NL/DK cadastres
  are absent from the list) still need geometric conflation. Feed to registry as a per-country
  `conflation: bridge-file | geometric` flag — data, not architecture.

### D2. VIDA Google-Microsoft-OSM Open Buildings — REFUTED for Europe
- **URL:** https://source.coop/vida/google-microsoft-osm-open-buildings — fetched 2026-09-01.
- 2.7B footprints, GeoParquet 1.1/FlatGeobuf/PMTiles, ODbL v1.0 (stated verbatim), last updated
  2025-08-21. **Coverage: 48 countries in Africa/South Asia/SE Asia/LatAm/Caribbean — Europe is
  not covered** (Google V3 inference area excludes Europe; the OSM/MS parts Pryzm already gets
  via Overture, OSS-lane §2/§3).
- **Pryzm action: NONE for Europe** — recorded so nobody re-evaluates it; Overture strictly
  dominates for Pryzm's countries. (Counted refuted-for-purpose.)

### D3. IGN France LoD2 benchmark (lod2bench) — FR national LoD2 is being industrialised
- **URLs:** https://sites.google.com/view/lod2-building-benchmark · paper DOI
  10.5194/isprs-archives-XLVIII-1-W6-2025-83-2025 · data at lod2bench.maps.science — fetched
  2026-09-01.
- **What:** IGN-France-run benchmark (contact lod2bench@ign.fr) for country-scale LoD2
  reconstruction from **LidarHD tiles + footprints**, 4 French zones, submissions as CityJSON;
  2025 ISPRS paper; ongoing.
- **⭐ Signal for source priority:** the FR national mapping agency is benchmarking exactly the
  roofer-shaped pipeline (OSS-lane §2.4) on its own LidarHD. FR LoD2 as a PUBLISHED national
  product is plausibly coming — MONITOR before Pryzm invests in manufacturing FR LoD2 itself
  (brief §6: do-not-build candidate in the making). Until it ships, FR stays
  "derivable via roofer" (E), not available (A).

### D4. GERS ecosystem tooling (official awesome-gers list) — the conflation toolchain exists
- **Repo/URL:** https://github.com/OvertureMaps/awesome-gers — fetched 2026-09-01.
- **The rows that matter to Pryzm** (all official OvertureMaps org unless noted):
  - `overturemaps-py` — Python CLI; `gers <UUID>` queries the GERS Registry, returns
    GeoJSON/GeoParquet. The consumption tool for registry lookups.
  - `match-inspector` — Flask/Folium app for **manual review of building conflation candidates
    before GERS ID assignment** — Overture's own building-matcher has a human-review UI; pattern
    evidence that pure-geometric matching needs a review loop even at Overture scale.
  - `osm-pbf-parquet` — Rust, OSM PBF→Parquet, feeds the OSM→GERS conflation pipeline.
  - TomTom **GEM** (Global Entity Matcher) — commercial DL conflation-to-GERS service; the
    "match my dataset to GERS" job is already a paid product category.
- **Licence:** per-repo (overturemaps-py is MIT per its repo listing; others unverified — small
  tools, verify at adoption). **Activity:** org-maintained, 2025–2026. **Maturity:** official but
  young. **Consumable:** yes (pip/cargo).
- **Pryzm action: DEPEND ON `overturemaps-py` pipeline-side; ADAPT `match-inspector`'s
  review-loop pattern** if Pryzm ever builds a geometric matcher for non-bridged cadastres
  (DE/NL/DK). Do NOT build a GERS query client.

### D5. GlobalBuildingAtlas (TUM, ESSD Dec 2025) — NEW global LoD1 + 3m height maps
- **URLs:** https://essd.copernicus.org/articles/17/6647/2025/ ·
  https://github.com/zhu-xlab/GlobalBuildingAtlas · data DOI 10.14459/2025mp1782307 (mediaTUM)
  — fetched 2026-09-01.
- **Coverage:** global; 2.75B footprints (GBA.Polygon), **3m-resolution height maps
  (GBA.Height)**, 2.68B LoD1 models (GBA.LoD1); PlanetScope imagery mostly 2018–2019.
- **Accuracy:** height RMSE **1.5–8.9 m by continent** — MODELLED, satellite-derived; never
  normative; vintage ~2019.
- **Format:** polygons + rasters + LoD1 models via mediaTUM; code Python.
- **Licence:** data: footprint portions from OSM/Microsoft under **ODbL**; **code: MIT + Commons
  Clause — commercial use of the CODE restricted** (rare licence, treat code as RED for
  embedding; data YELLOW/ODbL).
- **Activity:** published 2025-12-01; active research group (TUM Zhu lab).
- **API:** bulk download only. **Maturity:** research-grade at production scale.
- **Commercial:** data usable under ODbL calculus; code effectively non-commercial.
- **Consumable:** bulk yes; not cloud-optimised.
- **Pryzm action: MONITOR as Tier-C+ fallback height layer** for countries with no national
  LoD2 and no better source — BELOW national LoD2/cadastre and below Overture-carried heights
  where those exist. RMSE up to 8.9m and 2019 vintage keep it context-only. Do not ingest now;
  re-evaluate when a country outside the LoD2 set enters rollout.

### D6. GHS-OBAT (JRC, R2024A) — building attributes PRE-JOINED to Overture IDs
- **URLs:** https://data.jrc.ec.europa.eu/dataset/f41a22f1-5741-4c41-86eb-6384654f6927 ·
  landing ghsl.jrc.ec.europa.eu — fetched 2026-09-01.
- **Coverage:** global, 2.3B footprints, linked to **"Overture buildings 2024-07-22.0" by unique
  identifiers** (page does not name them GERS — NOT CONFIRMED which id space; verify one row
  before use).
- **Data:** per-footprint **height, construction epoch (1980–2020 decades), function
  (res/non-res), compactness**, area/perimeter, centroid, GADM 4.1 admin.
- **Format:** CSV + SQLite GeoPackage (footprint level); XLSX/TIFF aggregates.
- **Licence:** footprint-level CSV/GPKG **ODbL v1.0**; aggregates CC-BY 4.0 (page-stated).
- **Activity:** JRC GHSL suite, R2024A. **API:** open FTP (cidportal.jrc.ec.europa.eu), no auth.
- **Maturity:** production (JRC). **Commercial:** ODbL calculus as for Overture itself.
- **Consumable:** YES — join-by-id to Overture, zero geometric conflation.
- **⭐ Pryzm action — SOURCE-PRIORITY DATA CHANGE (fallback tier):** for countries where Pryzm has
  NO national height/floors source, GHS-OBAT height+epoch+function joined onto the Overture layer
  Pryzm already consumes is the cheapest attribute enrichment available (join, not conflate).
  Sits BELOW every national source; MODELLED values; same ODbL isolation as Overture. Registry
  gets a data row, not new architecture. Caveat: linked to a 2024-07 Overture release — id drift
  against current releases must be checked via GERS changelogs before the join is trusted.

### D7. 3D-GloBFP (2024) — superseded-for-Europe by D5/D6; recorded to close the question
- **URLs:** https://essd.copernicus.org/articles/16/5357/2024/ · Zenodo 10.5281/zenodo.11391077
  — checked 2026-09-01 (search-verified).
- 1.66B buildings with heights, CC-BY 4.0, shapefile, year-2020. **Europe heights derive from
  Urban Atlas Building Height 10m across 870 core-urban cities** — i.e. its European value-add is
  a re-gridded Copernicus product Pryzm could read directly.
- **Pryzm action: NONE** — for Europe it is dominated by national LoD2 (Tier A/B), Overture+
  GHS-OBAT (Tier C), and GlobalBuildingAtlas (newer, finer). Counted refuted-for-purpose.

### D8. OpenBuildingMap (GFZ) — noted, not advanced
- **URL:** https://www.openbuildingmap.org/ — checked 2026-09-01 (search-level only).
- Global conflation of Google/Microsoft/OSM with semantic enrichment (exposure/risk focus).
  Same upstreams Pryzm already reaches via Overture; no European authoritative content beyond
  them. **Action: NONE for Europe. NOT CONFIRMED beyond search level — deliberately.**
---

## PART 2 — LoD2 generation beyond roofer

### D9. roofer licence RE-VERIFIED (closes OSS-lane §4.4 gap 1, roofer arm)
- **URL:** https://github.com/3DBAG/roofer — fetched 2026-09-01.
- **Licence CONFIRMED: GPLv3** (the OSS lane assumed "likely GPL-arch"; now read). 194 stars,
  1,033 commits; Kadaster funding 2024–2026 and ERC lineage confirmed on the page; asks for
  sponsorship for maintenance.
- **Consequence:** the OSS-lane action "DEPEND ON as external pipeline" stands with the
  YELLOW-by-architecture condition now CONFIRMED, not assumed: subprocess/service only, never
  linked into Pryzm code.

### D10. City4CFD (TU Delft) — the only other maintained OSS LoD2-class reconstructor found
- **URL:** https://github.com/tudelft3d/City4CFD — fetched 2026-09-01.
- **Coverage:** anywhere with point cloud + footprints. **Data:** in LAS/LAZ + polygons; out
  OBJ/STL/CityJSON, LoD1.2/1.3/2.2, watertight, terrain-integrated. **Licence: AGPL-3.0**
  (stricter than roofer — external-process only, and mind AGPL if ever service-wrapped
  user-facing). **Activity:** 184 stars, 614 commits, Docker per release; same TU Delft 3D
  geoinformation group as roofer. **Maturity:** solid research-production. **Commercial:**
  AGPL calculus. **Consumable:** CLI/Docker.
- **Pryzm action: NONE while roofer exists** — City4CFD optimises for CFD-grade watertight
  terrain+building fusion, not per-building LoD2.2 quality; roofer stays the pick. Recorded as
  the honest answer to "what else is out there".

### D11. IGN lod2bench context — who participates
- Paper authors (fetched 2026-09-01, DOI 10.5194/isprs-archives-XLVIII-1-W6-2025-83-2025):
  IGN/LASTIG (Geniet, Séguin, Le Bihan, Vallet) + **LuxCarta (commercial)** + **Ravi Peters,
  3DGI — roofer's author**. Evaluation via open **PyScoring** tool; submissions CityJSON.
- **Reading:** roofer's author benchmarks against IGN's own LidarHD; commercial LoD2 vendors are
  in the same arena. Beyond roofer + City4CFD, the field is commercial (LuxCarta) or
  research-only — **no third maintained OSS LoD2 engine surfaced** (search 2026-09-01, two
  sweeps). NOT-FOUND recorded as such.

---

## PART 3 — Cadastral / planning harmonisation tooling

### D12. hale studio (wetransform) — the INSPIRE harmonisation ETL, alive
- **URLs:** https://github.com/halestudio/hale · https://wetransform.to/halestudio/ — checked
  2026-09-01 (search-verified; licence from project statements).
- **Coverage:** schema-mapping ETL for INSPIRE/OGC/ISO/XPlanung-adjacent transformations; the
  tool "at least 50% of all currently compliant [INSPIRE] data sets" were created with
  (vendor claim, flagged as claim). **Licence:** libs **LGPL-3.0**, distribution build GPL-3.0.
  **Activity:** repo updated 2026-02 — alive. **Maturity:** 10+ years production.
  **Commercial:** wetransform sells hosted hale connect. **Consumable:** desktop/CLI ETL.
- **Pryzm action: MONITOR as a manual/bake-time transformation tool only.** Pryzm's adapters are
  code, not ETL projects; hale matters if a one-off harmonisation of a national XPlanGML/INSPIRE
  PLU corpus is ever needed at bake time. Never a runtime dependency. (wetransform is also the
  best-informed watcher of INSPIRE's deregulation drift — EU-infra lane already cites them.)

### D13. ozgxplanung licence RE-VERIFIED (closes OSS-lane §4.4 gap 1, xplanbox arm)
- **URL:** https://gitlab.opencode.de/diplanung/ozgxplanung — fetched 2026-09-01.
- **Licence CONFIRMED: AGPL-3.0** (LICENSE.txt). 367 commits, **26 releases/tags** — actively
  versioned. Components: XPlanung validator + REST API + Docker + OGC services.
- **Consequence:** the OSS-lane action "WRAP for DE XPlanGML validate/parse" survives but ONLY
  as an external service (Docker sidecar / separate process) — AGPL forbids linking it into the
  product. Its REST API shape makes that natural.

### D14. Geonovum STOP/TPOD GitHub corpus — specs machine-readable, no evaluation engine
- **URLs:** https://geonovum.github.io/TPOD/ · github.com/Geonovum (TPOD, dso-cim-oi) — checked
  2026-09-01 (search-verified).
- TPOD profiles (omgevingsplan v2.0.0 etc.) + CIM-OI conceptual model live as versioned specs on
  GitHub (class D). **No OSS "toepasbare regels" evaluation engine surfaced** — STTR/IMTR
  derivation is described as ongoing standards work, not shipped tooling.
- **Pryzm action:** cite specs for the NL adapter (NL lane owns the DSO API probes); the
  rule-EVALUATION layer over STOP/TPOD remains missing everywhere — consistent with the NL-lane
  "empty seat" finding (OSS-lane §3.10) and the G-verdict.

### D15. digital-land / planning.data.gov.uk platform (MHCLG) — the platform CODE is MIT
- **URLs:** https://github.com/digital-land — checked 2026-09-01 (search-verified; digital-land.info
  and sibling repos MIT-licensed). The DATA API itself was already probed live by the
  rest-of-europe lane (108 datasets, OGL v3) — cited, not re-probed.
- **What the delta adds:** the whole national data-collation machine (collector → pipeline →
  specification → publish) is open, MIT, government-run, England-only. Includes
  `planning-application-data-specification` (2025-onward planning-application schema work).
- **Pryzm action: ADAPT patterns, consume nothing as code.** Its specification/pipeline layout is
  the best public reference implementation of "collate heterogeneous LPA sources into one
  API with provenance" — read it when hardening the federation scaffold's collector discipline;
  England data itself stays out of priority scope (UK discretionary regime, OSS-lane §3.6).

### D16. XPlanung READ/EVALUATE gap re-confirmed — no delta since the OSS lane
- Targeted sweep 2026-09-01 ("XPlanGML auswerten/evaluation engine 2025/2026") surfaced ONLY the
  cluster the OSS lane §7/§2.1 already recorded (xplan-reader 0.37.0, xplan-umring 2.13.1,
  SAGisXPlanung, XPLANUNG24, validators). **Nothing evaluates a Bebauungsplan against a parcel.**
  The gap the OSS lane called PRYZM-shaped (H) is unchanged as of 2026-09-01.

### D17. INSPIRE cloud-native distribution — looked for, NOT FOUND as a unified practice
- Search 2026-09-01: no adopted "INSPIRE GeoParquet good practice" exists; INSPIRE cadastral
  parcels remain WFS/Atom-shaped per country. Recorded so the synthesis does not assume a bulk
  cloud-native INSPIRE path exists. (EU-infra lane's INSPIRE-deregulation findings unchanged.)

---

## PART 4 — Building-regulation knowledge graphs (beyond ACCORD)

### D18. FireBIM (ITEA4 project 22003, started 2024-01) — fire codes → ontology + SHACL, five countries
- **URLs:** https://itea4.org/project/firebim.html · D2.1 "Fire Code Matrix & FireBIM Compendium"
  PDF on itea4.org · CEUR paper "Converting Fire Safety Regulations to SHACL Shapes"
  (ceur-ws.org/Vol-3874/paper7.pdf) — checked 2026-09-01 (search-verified).
- **Coverage:** fire-safety regulations of **NL, BE, LT, DK, PT** (22 partners); goal: harmonised
  machine-readable fire codes + automated compliance checking on an open-source web BIM platform.
- **Data/format:** regulation ontology stack (module 1 structures regulations + metadata) +
  SHACL shapes derived from regulation text.
- **Licence:** platform stated "open-source"; no public repo located this sweep — NOT CONFIRMED.
- **Activity:** running (2024–). **Maturity:** project-stage. **Commercial:** n/a yet.
- **Consumable:** not yet (deliverable PDFs only).
- **Pryzm action: MONITOR (concepts).** Same regulation→ontology→executable-rules method as
  ACCORD (OSS-lane §11) applied to a DIFFERENT rule family (fire, not zoning) across five
  countries incl. three Pryzm-relevant ones. Its D2.1 cross-country fire-code MATRIX is the
  pattern for Pryzm's cross-country ZONING-rule matrix. Zero overlap with Product B's data needs.

### D19. CODE-ACCORD licence — RE-CHECKED, still unlicensed → corpus is GATED
- **URL:** https://github.com/Accord-Project/CODE-ACCORD — fetched 2026-09-01.
- **No LICENSE file** on the repo (confirming OSS-lane §11's "check licence first"). Contents:
  annotated sentences (entities + relations) from **23 EN regulation documents (1,455 pp) + 10
  Finnish (140 pp, translated)**; CSV + HuggingFace; Scientific Data 2025 paper.
- **Pryzm action: DO NOT use as fine-tuning data** until a licence is granted (the Scientific
  Data paper may carry a CC-BY data statement — check the PAPER's data-availability section
  before writing it off entirely; not done this sweep). Gated, not refuted.

---

## PART 5 — Planning APIs / open urban-planning engines (new or materially changed)

### D20. SimPLU3D (IGN COGIT) — the missed European precedent: rules→3D built configurations
- **URL:** https://github.com/SimPLU3D/simplu3D — fetched 2026-09-01. NOT in the original OSS
  lane — the closest OSS ancestor of Product B found anywhere this campaign.
- **Coverage:** France-shaped (PLU-style rule parameters), method is country-agnostic.
- **Data:** in: parcels + urban-regulation parameters (setbacks from roads/boundaries,
  inter-building distances, max built-area ratios); out: optimised 3D cuboid built
  configurations (shapefile). Trans-dimensional simulated annealing over a rule-constrained
  space (Brasebin PhD 2014).
- **Format:** Java 1.8 / Maven / GeOxygene. **Licence: CeCILL** (French GPL-compatible copyleft).
- **Activity:** 25 stars, 597 commits, **dormant as active development** (research artefact;
  documented applications: land assessment, permit checking, citizen planning tools).
- **API:** none (library). **Maturity:** research-grade, finished. **Commercial:** CeCILL
  copyleft — external-tool only. **Consumable:** no (Java research stack).
- **Pryzm action: ADAPT concepts, cite as prior art; no dependency.** Two lessons: (1) IGN
  already formalised "PLU rules as machine parameters over a parcel" a decade ago — Pryzm's FR
  rule-pack vocabulary should be checked against Brasebin's parameterisation before inventing
  names; (2) it SAMPLES compliant buildings rather than COMPILING the envelope — the
  deterministic envelope-with-provenance seat stays empty, refining (not overturning) the
  OSS-lane §4.3 G-verdict.

### D21. PlanX QGIS suite grew a "Urban Procedural 3D" zoning lab — §13(a) update
- **URLs:** https://plugins.qgis.org/plugins/planx/ · plugins by Yusuf Eminoglu — checked
  2026-09-01. Same Turkish developer as OSS-lane §13(a)'s PlanX CAD Toolset; the suite now
  includes a parametric 3D zoning lab (Three.js, setbacks/heights/typologies, live compliance
  feedback) + 3D city viewer + space-syntax analytics.
- **Rules are USER-SUPPLIED** — it reads no national planning data; an envelope SANDBOX, not an
  envelope SOURCE. Same lesson as ALPA (OSS-lane §2.7): envelope UX is commoditising; the moat
  is jurisdictional rule depth + provenance. **Action: none.**

### D22. planx-new (Open Systems Lab, UK) licence RE-VERIFIED — MPL-2.0
- **URL:** https://github.com/theopensystemslab/planx-new — fetched 2026-09-01. **MPL-2.0**,
  6,393 commits, active PRs — production-alive for UK councils. Closes the OSS-lane §13(b)
  "verify exact licence" gap. Action unchanged: MONITOR (UK source catalogue).

### D23. pyramid_oereb licence RE-VERIFIED — BSD-2-Clause (GREEN)
- **URL:** https://github.com/openoereb/pyramid_oereb/blob/master/LICENSE.txt — fetched
  2026-09-01. **BSD 2-Clause**; copyright Kanton Basel-Landschaft, République et Canton de
  Neuchâtel, Camptocamp SA (2017–2019) — the multi-canton production claim in OSS-lane §2.2 is
  corroborated by the copyright holders themselves. Upgrades its colour from "provisional
  GREEN (verify)" to **GREEN confirmed**; action unchanged (consume the data model).
---

## PART 6 — Lane synthesis

### 6.1 Rollup (delta rows only; OSS-lane §4.1 rows unchanged)

| # | Item | Class | Licence | Action |
|---|---|---|---|---|
| D1 | GERS bridge files | A (conflation data) | NOT STATED — resolve | ⭐ CONSUME (ES join to IGN ids) |
| D2 | VIDA combined buildings | A | ODbL | NONE — no Europe coverage |
| D3 | IGN lod2bench | D/E signal | open data | MONITOR (FR LoD2 incoming?) |
| D4 | overturemaps-py / match-inspector | B | MIT / per-repo | DEPEND ON / ADAPT pattern |
| D5 | GlobalBuildingAtlas (TUM 2025) | A | data ODbL · code MIT+Commons-Clause | MONITOR (Tier-C+ heights) |
| D6 | GHS-OBAT (JRC) | A | ODbL (footprint-level) | ⭐ CONSUME as Overture join (fallback tier) |
| D7 | 3D-GloBFP | A | CC-BY 4.0 | NONE — dominated for Europe |
| D8 | OpenBuildingMap | A | unverified | NONE for Europe |
| D9 | roofer (re-verified) | B+E | **GPLv3 confirmed** | DEPEND ON, external process (unchanged) |
| D10 | City4CFD | B | **AGPL-3.0** | NONE while roofer exists |
| D12 | hale studio | B | LGPL-3/GPL-3 | MONITOR (bake-time ETL only) |
| D13 | ozgxplanung (re-verified) | B+C | **AGPL-3.0 confirmed** | WRAP as external service only |
| D14 | Geonovum STOP/TPOD corpus | D | open specs | cite for NL adapter |
| D15 | digital-land platform (MHCLG) | B+C | MIT | ADAPT collector/spec patterns |
| D18 | FireBIM (ITEA4) | D+F | open-source claimed, repo NOT FOUND | MONITOR concepts |
| D19 | CODE-ACCORD (re-verified) | F | **NO LICENSE — gated** | do not train on it yet |
| D20 | SimPLU3D (IGN) | B (prior art) | CeCILL | ADAPT concepts; cite as prior art |
| D21 | PlanX Urban Procedural 3D | B | plugin repo | NONE (sandbox, not source) |
| D22 | planx-new (re-verified) | B+C | **MPL-2.0 confirmed** | MONITOR (unchanged) |
| D23 | pyramid_oereb (re-verified) | B | **BSD-2 confirmed → GREEN** | consume data model (unchanged) |

### 6.2 ⭐ What changes the federation scaffold's SOURCE-PRIORITY DATA (data, not architecture)
1. **GERS bridge files (D1):** for ES, Overture↔IGN-España id mappings exist as monthly Parquet.
   Registry rows for ES context-buildings can carry `conflation: bridge-file`; countries whose
   cadastres are NOT bridged (DE, NL, DK, …) stay `conflation: geometric-or-none`. One S3
   partition-existence probe still owed before the flag is set (not run this lane — READ-ONLY
   sweep, and the listing needs an S3 client).
2. **GHS-OBAT (D6):** a ready-made per-footprint height/epoch/function table keyed to Overture
   2024-07 ids — the cheapest fallback-tier attribute enrichment for no-national-source
   countries; ODbL isolation identical to Overture's; id-drift check owed against current GERS
   changelogs.
3. **FR LoD2 watch (D3):** IGN benchmarking LidarHD→LoD2 means FR may move from "derivable (E,
   roofer)" to "available (A, national product)" — re-check before any FR LoD2 manufacturing
   spend.
4. **GlobalBuildingAtlas (D5):** new last-resort global height/LoD1 layer BELOW everything
   national; note-only until a non-LoD2 country enters rollout.
5. **Negative results that PIN the current priorities:** VIDA/3D-GloBFP/OpenBuildingMap add
   nothing for Europe (D2/D7/D8); no third OSS LoD2 engine (D11); no INSPIRE cloud-native bulk
   path (D17); XPlanung evaluation gap unchanged (D16).

### 6.3 Category-4 (precomputed buildable envelope) — OSS space verdict
**None found.** The two nearest objects are SimPLU3D (D20 — SAMPLES rule-compliant built forms,
research-grade, dormant, CeCILL) and PlanX Urban Procedural 3D (D21 — user-supplied rules
sandbox). Neither provides precomputed envelopes for any jurisdiction. The OSS-lane §4.3
G-verdict (no deterministic parcel→envelope engine with per-rule provenance, anywhere) SURVIVES
this delta sweep, now with the strongest known prior art named and assessed.

### 6.4 Honest gaps (this lane)
1. **GERS bridge-file licence + ES-partition existence** not probed (S3 listing not fetchable via
   plain HTTP fetch here). Owed: one `aws s3 ls`/DuckDB probe + licence question to Overture.
2. **GHS-OBAT id space** ("unique identifiers" = GERS?) unverified at row level; one GPKG row
   inspection owed before the join is designed.
3. **FireBIM repo** not located — "open-source platform" recorded as claim, not artefact.
4. **CODE-ACCORD**: the Scientific Data paper's data-availability licence statement not read.
5. **match-inspector / osm-pbf-parquet licences** not individually read (small official tools).
6. **awesome-gers via ecosyste.ms** was access-blocked; the GitHub original was used instead.
7. Searches are one-sweep-deep per axis (conflation, LoD2, harmonisation, reg-KG, planning
   engines); gitlab.opencode.de and CORDIS remain non-exhaustively swept (same gap the OSS lane
   recorded — unchanged).

*Lane oss-delta complete 2026-09-01. 17 candidates/claims confirmed with probes; 4 refuted or
gated; 3 absence-confirmations (D11, D16, D17). Deliverable: this file.*

---

# PASS 2 (2026-09-01, later) — OWED PROBES CLOSED + SWEEP EXTENDED

> Pass 1 above closed with §6.4 listing 7 owed probes and marked itself complete. This pass
> RUNS those probes and extends the sweep on the five delta axes. **Where pass 1 is corrected,
> the correction is stated here and the pass-1 row is NOT silently edited** — both readings stay
> visible, per the repo's own correction discipline.

## P-1 ⭐ GERS bridge files — PROBED AT THE BUCKET (closes §6.4 gap 1, partition half)

Pass 1 owed "one S3 partition-existence probe". **Run 2026-09-01** by anonymous HTTPS
`ListObjectsV2` against the public bucket — no S3 client needed, the REST listing is open:

- `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=bridgefiles/&delimiter=/`
  → **19 release folders**, `2025-03-19.0-beta.0` through **`2026-08-19.0`**, monthly, unbroken
  (2025-08 has two: `.0` and `.1`). Bridge files are a *sustained* product, not a one-off.
- `…&prefix=bridgefiles/2026-08-19.0/&delimiter=/` → **16 provider partitions**, verbatim:
  `alltheplaces, brightquery, dac, dados_abertos, esri, foursquare, geoboundaries, ign_es,
  krick, linz, meta, microsoft, osm, pinmeto, renderseo, vancouver`.
- `…&prefix=bridgefiles/2026-08-19.0/provider=ign_es/&delimiter=/` →
  **`provider=ign_es/theme=buildings/`** — a single theme. ⭐ **CONFIRMED: the Spanish bridge is a
  BUILDINGS bridge.** Pass 1's ES claim was inferred from a docs sentence; it is now verified at
  the object store.

**⚠ Correction to pass 1 D1 (and a reusable lesson).** D1 quoted the docs page's list of seven
bridged datasets. **The bucket has sixteen.** The docs page is not an inventory of the bridge
files — the same failure shape as `[[getcapabilities-is-not-an-inventory]]`. Of the nine
undocumented extras, `krick / renderseo / dac / brightquery / foursquare / alltheplaces` are
*Places* providers (corroborated: the Overture attribution page names Krick, RenderSEO, DAC and
BrightQuery under **Places / CDLA-Permissive 2.0**), and `linz` (NZ) / `vancouver` /
`dados_abertos` are non-EU. **The finding that matters is unchanged and now sharper: `ign_es` is
the ONLY European national mapping agency bridged to GERS.** DE/NL/DK/FR/PT/PL/LT/EE cadastres
are absent from the 2026-08-19.0 listing — those countries keep `conflation: geometric-or-none`.

**Licence: still NOT STATED — now double-probed, so record it as a real hole, not an un-checked
box.** `docs.overturemaps.org/attribution/` (fetched 2026-09-01) enumerates per-theme terms —
**Buildings / Base / Divisions © OpenStreetMap contributors, ODbL; Places CDLA-Permissive 2.0** —
and **says nothing about GERS, the GERS Registry, or bridge files**. So the bridge-file mapping
table has no published licence of its own on either page. Pryzm consuming an `ign_es ↔ GERS`
building-id join should assume the buildings theme's **ODbL** reach until Overture states
otherwise, and ask Overture directly before redistributing the mapping. (Reading the id join as
"a derived work of an ODbL database" is the conservative posture; not legal advice.)

## P-2 ⭐ GHS-OBAT id space RESOLVED — it IS a GERS id (closes §6.4 gap 2)

Pass 1 flagged "NOT CONFIRMED which id space". The published schema names it outright:
`id` = **"Unique GERS identifier linking to Overture buildings (32 HEX string)"**, alongside
`lon, lat, country, adm1, height, shapefactor, use (0–2), epoch (0–5), area, perimeter`
(https://gee-community-catalog.org/projects/ghs_obat/, fetched 2026-09-01).
**Consequence: the D6 join is a plain GERS equi-join** — zero geometric conflation, exactly as
pass 1 hoped, now on evidence. The **id-drift caveat survives unchanged and is the real risk**:
the ids are minted against Overture **2024-07-22.0**, ~13 releases behind `2026-08-19.0`.

**⚠ Licence conflict found — do not treat as settled.** The JRC dataset page (authoritative, the
licensor) states footprint-level **CSV/GPKG = ODbL v1.0** with only the XLSX/TIFF **aggregates**
CC-BY-4.0 (pass 1 read this correctly). The GEE community catalog re-host states the dataset is
**CC BY 4.0**. **A re-host is not the licensor — follow the JRC page: ODbL for the footprint-level
table Pryzm would actually join.** That keeps GHS-OBAT inside the same ODbL isolation Pryzm
already applies to Overture, and *removes* the temptation to treat it as permissive.

## P-3 ⚠ CORRECTION to D11 — a THIRD open-source LoD2 engine exists (City3D), but is dormant

Pass 1 §D11 recorded "no third maintained OSS LoD2 engine surfaced". **City3D exists and pass 1
missed it.**

### D24. City3D (tudelft3d) — LoD2 from airborne LiDAR, *and it can synthesise its own footprints*
- **Repo:** https://github.com/tudelft3d/City3D — fetched 2026-09-01.
- **Coverage:** anywhere with airborne LiDAR. **Data in:** point cloud + footprints (OBJ/GeoJSON);
  **CLI_Example_2 generates a footprint per building from the point cloud alone** — the one
  capability roofer lacks (roofer requires a roofprint polygon).
- **Out:** LoD2 models. **Licence: GPL-3.0.** **Activity: 355 stars, 188 commits, last activity
  2022-06-28 — DORMANT** (paper: Huang, Stoter, Peters, Nan, ISPRS J. 2022).
- **Maturity:** self-described **"research prototype"**, with the caveat *"Despite being a research
  prototype, City3D has been used to create city-scale building models."*
- **Pryzm action: NONE as a dependency; NOTE the footprint-free path.** roofer (D9, GPLv3, funded
  through 2026) remains the pick. City3D matters for exactly one contingency: a country with LiDAR
  but **no usable footprint layer**, where roofer cannot start. Same authorship lineage as roofer
  (Ravi Peters on both) — the capability is known to that group, not lost.
- **The corrected sentence:** "no third *maintained* OSS LoD2 engine" holds (City3D is 4 years
  idle); "no third OSS LoD2 engine" was **wrong**. Pass 1 overstated an absence.

### D25. points2poly / PolyGNN (chenzhaiyu, TU Delft lineage) — research reconstructors, not products
- **Repos:** https://github.com/chenzhaiyu/points2poly · https://github.com/chenzhaiyu/polygnn
  — surfaced 2026-09-01 (search-level; per-repo licence/activity NOT read this pass).
- Deep implicit fields (ISPRS J. 2022) and polyhedron-based GNN occupancy learning — both produce
  compact piecewise-planar building models from point clouds.
- **Pryzm action: NONE. Record as the research frontier only.** Reference implementations of
  papers, not pipelines; they do not change the roofer verdict. **NOT CONFIRMED on licence and
  maintenance — deliberately not advanced, because no action depends on it.**

## P-4 Conflation tooling, second sweep — the general-purpose engines

### D26. Hootenanny (NGA) — the heavyweight OSS conflation engine, incl. building conflation
- **Repo:** https://github.com/ngageoint/hootenanny · releases page — both fetched 2026-09-01.
- **Coverage:** dataset-agnostic. **Capability (verbatim list):** tailored conflation algorithms for
  *"Areas, Buildings, Points of Interest (POIs), Power Lines, Railways, Rivers, Roads"*, plus
  Generic Geometry Conflation for untyped features, and custom algorithms in JavaScript or C++.
- **Licence: GPL-3.0.** **Activity:** 387 stars, **10,050 commits**; latest release **v0.2.87,
  2024-10-03** (prior: 0.2.86 2024-09-23, 0.2.85 2024-07-10, 0.2.84 2024-05-22, 0.2.83
  2024-03-21). **No deprecation notice.** Cadence was ~6-weekly through 2024 and then stops —
  **~23 months with no release as of this probe. Treat as slowing/possibly parked, not dead.**
- **Maturity:** production, government-grade (US NGA), heavy stack. **Commercial:** GPL-3.0 →
  external process only. **Consumable:** yes, as a service/CLI (Docker/VM).
- **Pryzm action: DO NOT ADOPT NOW; keep as the named fallback** if Pryzm is ever forced to build
  geometric footprint matching for the un-bridged cadastres (DE/NL/DK/FR). It is the only mature
  OSS engine that already has a *building-specific* conflation algorithm — building it in-house
  would be reinventing 10k commits. Weigh against Overture's own `match-inspector` review-loop
  pattern (D4) and against simply waiting for more GERS bridges.
- Lighter neighbours seen in the same sweep, **not advanced**: `systemed/conflation` (OSM Live
  Conflation — a human merge UI), `osm-merge` (OSM import tooling). Both are *import-to-OSM*
  tools, not dataset-to-dataset matchers; wrong shape for Pryzm.

## P-5 ⭐ Rules-as-code prior art the campaign had not named — Catala and OpenFisca

Nothing in the OSS lane or pass 1 covered the **legislation-as-code** field, which is the
discipline Pryzm's rule packs actually belong to. Two mature artefacts:

### D27. Catala (Inria) — a language whose whole point is per-article provenance
- **Repo:** https://github.com/CatalaLang/catala — fetched 2026-09-01.
- **What:** *"a domain-specific language for deriving faithful-by-construction algorithms from
  legislative texts"* — **literate programming where the statute is the source document and code
  is annotated article by article**; compiles to executable code AND to a **lawyer-readable PDF**
  of the implementation. Explicitly models the general-case/exception structure of statutory law.
- **Licence: Apache-2.0** (permissive — no copyleft problem). **Activity: 2.4k stars, 5,644
  commits**, active CI. **Maturity:** research-origin but far past prototype; self-warns *"The
  compiler is yet unstable and lacks some of its features."*
- **Pryzm action: ⭐ ADAPT THE MODEL, do not adopt the language.** This is the strongest prior art
  found in the whole campaign for the thing Pryzm must own (brief §7 "OWN AS IP"): a rule
  representation where **every computed number traces to the article that produced it**, and
  where **exceptions are first-class rather than special-cased**. Pryzm's rule packs already aim
  at per-rule provenance; Catala shows the shape that survived peer review and government use in
  a neighbouring domain (socio-fiscal law). Read it before the FR/ES rule-pack vocabulary
  freezes. Adopting the compiler itself is out of scope (§9 no core expansion) — the *authoring
  discipline* is the transferable part.

### D28. OpenFisca (core) — the microsimulation incumbent; the wrong shape, worth knowing
- **Repo:** https://github.com/openfisca/openfisca-core — fetched 2026-09-01.
- **Licence: AGPL-3.0** (copyleft, network clause — a hard blocker for embedding in a SaaS).
  **Activity:** 236 stars, 5,219 commits, active. Country rule packages live in separate repos
  (e.g. OpenFisca-France). Ships a Web API.
- **Pryzm action: NONE — recorded to close the question.** Built for tax/benefit microsimulation
  over populations, not per-parcel geometric constraint resolution; and AGPL-3.0 makes it a
  non-starter inside the product. Cited only as evidence that "rules-as-code with country
  packages" is a proven organisational pattern.

## P-6 ⚠ Refinement to D17 — INSPIRE DOES have an adopted bulk-file good practice (GeoPackage)

Pass 1 D17 said "no adopted INSPIRE GeoParquet good practice … INSPIRE cadastral parcels remain
WFS/Atom-shaped per country". **The GeoParquet half is confirmed; the implied "no bulk path"
is too strong.**
- **https://github.com/INSPIRE-MIF/gp-geopackage-encodings** (fetched 2026-09-01): *"GeoPackage
  encoding of INSPIRE datasets"* was **"unanimously endorsed as INSPIRE Good Practice"** on
  **2022-11-25** (16th back-to-back MIG/MIG-T, 72nd MIG-T meeting). 33 commits; spec + member-state
  examples in-repo. **Which themes / which member states is NOT stated on the landing page —
  `examples/overview.md` not read this pass. NOT CONFIRMED whether Cadastral Parcels or Buildings
  have encodings, and that is precisely the question that would matter.**
- **GeoParquet:** no INSPIRE Good Practice exists (2026-09-01). Ecosystem moved anyway — Apache
  Parquet adopted native GEOMETRY/GEOGRAPHY types (2026-02) and `geoparquet-io` shipped
  (2026-03) — but that is community, not INSPIRE.
- **Pryzm action:** when a country's INSPIRE endpoint looks WFS-only, **check for a sanctioned
  GeoPackage bulk download before writing a WFS pager**. Data-level, per-country; no architecture
  change. Owed: read `examples/overview.md` for the theme/member-state matrix.

## P-7 FireBIM repo — searched again, still NOT FOUND (§6.4 gap 3 stands)
Second targeted sweep 2026-09-01 (ITEA4 project page, ISEP/iBuilt partner page, CEUR Vol-3874
paper 7, DTU Orbit project record, ResearchGate ontology figure). **No public code repository
surfaced.** The "open-source web-based BIM platform" remains a **project claim with no located
artefact**. Partner set re-confirmed: 22 partners across **NL, BE, LT, DK, PT**. D18's action
(MONITOR concepts) is unchanged; its licence line stays **NOT CONFIRMED**, not "open source".

## P-8 ⭐⭐ EUBUCCO v0.2 — MATERIALLY CHANGED since the OSS lane read it (source-priority DATA change)

The OSS lane §1.1 assessed **v0.1** (200M buildings, Nature Sci Data 2023). **v0.2 exists and is
live.** This is the single largest data-level change found in this delta.

- **URLs:** https://eubucco.com/ · https://docs.eubucco.com/latest/ ·
  https://github.com/ai4up/eubucco · https://source.coop/abry-tudelft/eubucco — all fetched
  2026-09-01.
- **Coverage:** **322M+ individual buildings**, *"the 27 European Union countries, Norway,
  Switzerland, and the UK"* (30 countries). Composed of **55 open sources**: government
  registries **62.2%**, OpenStreetMap **17.4%**, Microsoft footprints **20.4%**.
- **Attributes — read the split, not the headline:**
  | attribute | total | ground truth | ML-estimated |
  |---|---|---|---|
  | type (res/non-res) | 100% | — | — |
  | **height** | **100%** | **43.2%** | **56.7%** |
  | **floors** | **100%** | **16.6%** | **79.9%** |
  | construction year | **15.9%** | — | — |
- ⛔ **The "100%" is completeness AFTER ML IMPUTATION.** Over half of heights and four fifths of
  floor counts are *predicted*. Consuming that column as "the height" is precisely the
  overstatement class this repo has already been burned by
  (`[[envelope-solid-overstates-partial-data]]`, `[[context-data-honesty-family]]` — a modelled
  value and a measured value must not be the same value). **The 43.2% / 16.6% ground-truth
  fractions are the numbers a source-priority table should carry**, and any ingest MUST preserve
  the ground-truth-vs-estimated flag or drop the estimated rows.
- **Format/access:** *".parquet files on a S3-compatible object storage (MinIO)"*, reachable via
  website, CLI, Python, **SQL/DuckDB**, and Zenodo.
- **Code:** MIT, 119 stars, 307 commits (`ai4up/eubucco`); nine-stage pipeline
  (download → parse → clean → **conflate** → ML attribute prediction). v0.2 development led by
  Florian Nachtigall (TU Berlin).
- **⭐ LICENCE — exact, and it has a non-commercial pocket:** base **ODbL v1.0**, with exactly two
  exceptions — **`gov-czechia-prague` = CC-BY-SA** (share-alike) and
  **`gov-italy-abruzzo` = CC-BY-NC (NON-COMMERCIAL)**. The docs give the remedy verbatim: users
  wanting *"a dataset licensed exclusively under ODbL"* filter out records whose
  **`geometry_source`** column matches those two sources.
- **⭐ Better still — a pre-cleaned mirror exists.** `source.coop/abry-tudelft/eubucco` serves
  **FlatGeobuf + Parquet + PMTiles**, **licence stated "ODbL" with Prague and Abruzzo already
  EXCLUDED**, last updated **2026-01-27** (1.1 TB served / 25,550 downloads in the trailing 28
  days). **PMTiles matters** — Pryzm's context pipeline already speaks PMTiles
  (`[[context-3d-tiles-not-live-overpass]]`), so this is a drop-in shape, not a new one.
- **Pryzm action — REGISTRY DATA ROW, not architecture:** treat EUBUCCO v0.2 as a **Tier-C
  pan-European fallback** for footprints+height+floors, *below* national cadastre/LoD2 and
  alongside/above the Overture+GHS-OBAT join depending on country. **Consume the source.coop
  ODbL-clean mirror** rather than filtering `geometry_source` yourself — one less way to leak a
  CC-BY-NC row into a commercial product. **Carry the ground-truth flag through, or do not carry
  the value.**
- **NOT CONFIRMED (deliberately):** the exact **v0.2 release date**. eubucco.com says only
  *"Development since v0.2 is led by Florian Nachtigall"*; a search result asserted "spring 2026"
  and **that was not corroborated at source**, so it is not recorded as fact. The source.coop
  mirror does not state which version it hosts either.

## P-9 ⭐ A peer-reviewed EU-27 comparison of the six pan-European building datasets (June 2026)

- **Paper:** *"Towards a Comparison of the Semantic Information of Pan-European Open Building
  Data"*, **ISPRS Int. J. Geo-Inf. 15(6):252, June 2026**, doi `10.3390/ijgi15060252`.
  ⚠ **Evidence level: ABSTRACT ONLY.** `mdpi.com/2220-9964/15/6/252` returned **HTTP 403** to
  direct fetch on 2026-09-01; findings below are from the abstract as returned by search and an
  OECD-hosted PDF of the same work. **Not read in full — do not quote numbers from it.**
- **What it compares:** *"the first systematic comparison of the semantic attributes of six major
  pan-European open building datasets — OpenStreetMap, EUBUCCO, Microsoft Global ML Building
  Footprints, Overture Maps, GHS-OBAT, and the Digital Building Stock Model (DBSM)"*, over the
  **EU-27** as common reference area, on **height, typology, building age, number of floors,
  building material**.
- **Findings (verbatim-ish from the abstract):** *"Remote-sensing-derived products (GHS-OBAT and
  DBSM) exhibit the highest levels of attribute completeness for height, typology, and building
  age, but rely on aggregated or coarse semantic representations. In contrast, community-driven
  and conflated datasets (OpenStreetMap and Overture Maps) provide richer and more detailed
  semantic schemas, albeit with low and spatially uneven completeness."* And the sentence that
  should go straight into Pryzm's source-priority rationale: *"high completeness values often
  mask limited semantic informativeness due to the prevalence of unknown or aggregated attribute
  values."*
- **⭐ Why it matters here:** it is **independent, peer-reviewed corroboration of pass-1 D6** (use
  GHS-OBAT as the fallback attribute layer) **and** an external statement of the trap P-8 found
  inside EUBUCCO — completeness is not informativeness, and an imputed/aggregated value dressed
  as a measurement is the failure mode. Two independent sources now say the same thing about the
  Tier-C layer.
- **Pryzm action:** cite in the source-priority rationale; obtain the full text before using any
  per-country completeness figure. It is a *comparison*, not a licence or coverage source.

## P-10 ACCORD's artefacts are real code/data — and one licence question is now CLOSED

### D29. AEC3PO — the digital-building-permit ontology, with FOUR countries' rules as examples
- **Repo:** https://github.com/Accord-Project/aec3po — fetched 2026-09-01.
  *(Announcement: https://accordproject.eu/building-compliance-ontology-released/ — "at the
  beginning of 2024".)*
- **What:** *"Architecture Engineering and Construction Compliance Checking and Permitting
  Ontology"* — **12–13 modules** (Document, Statement, DataRequirement, Evidence, CheckMethod,
  FeatureOfInterest, CheckingAct, ComplianceVerificationReport, Design, LegalVerifier, Model,
  Table), ~80 classes, 803 axioms (174 logical). **RDF/OWL, Turtle serialisation.**
- **⭐ Real regulations encoded as worked examples — including Spain and planning:**
  **Finland** (accessibility, CO2), **Estonia** (fire safety), **Spain — "urban planning rules
  for cantilever structures"**, **UK** (Eurocode 5 timber compression).
- **Licence: NOT SPECIFIED in the repo metadata — NOT CONFIRMED.** 9 stars, 841 commits, active.
- **Pryzm action: READ IT, DEPEND ON NOTHING.** Two transferable pieces: (1) the separation of
  *Statement → DataRequirement → CheckMethod → CheckingAct → ComplianceVerificationReport* is a
  clean decomposition of the thing Pryzm calls a rule evaluation with provenance, and (2) its
  `CheckMethod` taxonomy (**Boolean / SHACL / Composite**) is the honest admission that not every
  rule is machine-checkable by the same mechanism — which is Pryzm's `never-overstate` problem in
  ontology form. **Its ES example is a cantilever rule, i.e. demo-scale — this is not a source of
  Spanish planning rules.** Licence must be resolved before any reuse of the .ttl files.
- Sibling: **BCRL ("Building Compliance Rule Language")** — the project's rule DSL, described in
  deliverable **D2.2 "BCO Ontology and Rules Format"** (accordproject.eu PDF, 2024-02). Rules are
  encoded in **RDF as a knowledge graph**, with *manual / semi-automatic / automatic* pathways for
  formalising them. **No standalone BCRL repo located** — NOT CONFIRMED as shipped tooling.

### D19 ⚠ CORRECTED — CODE-ACCORD IS licensed: **CC-BY-4.0** at the Zenodo deposit
Pass 1 recorded *"No LICENSE file → gated → do not use as fine-tuning data"*, and explicitly left
the paper's data-availability statement unread. **Read now, and it flips the verdict:**
- **Zenodo record 10.5281/zenodo.10210022** (fetched 2026-09-01) — *"Creative Commons Attribution
  4.0 International"*, deposit **v1.0.0, published 2023-11-27**, single artefact
  `Accord-Project/CODE-ACCORD-v1.0.0.zip` (101.3 MB). The Scientific Data paper
  (`s41597-024-04320-x`) names that DOI as the data availability location.
- **Corpus, per the paper:** **862 sentences** from the building regulations of **England and
  Finland**, annotated by 12 annotators → **4,297 entities and 4,329 relations**; supports text
  classification, NER, relation extraction. *(Pass 1's "23 EN documents (1,455pp) + 10 Finnish"
  describes the source-document corpus; the annotated set is the 862 sentences. Both are true of
  different layers — do not conflate them.)*
- **Corrected Pryzm action: USABLE under CC-BY-4.0 — but only the v1.0.0 Zenodo deposit.** The
  GitHub repo still carries **no LICENSE file**, so anything added there after v1.0.0 is
  unlicensed. **Cite the DOI, take the Zenodo zip, attribute.** Pass 1's "gated" was
  over-cautious — an unread licence statement is not an absent licence.

## P-11 CHEK shipped OSS the campaign had only tracked as a project (delta over the EU-infra lane)

The EU-infra lane covers CHEK at project level. **The code exists and is on GitHub.** Located
2026-09-01 (search-verified unless a fetch is noted):
- **`tudelft3d/IFC_BuildingEnvExtractor`** (fetched) — IFC → **CityJSON** envelope extraction,
  optional STEP/OBJ; generates **LoD0.0–5.0** variants (0.2/0.3/1.2/1.3/**2.2**/3.2/4.x/voxelised);
  **licence LGPL-3.0 + GPL-3.0**; 40 stars, **596 commits**, active; funded by **CHEK (2022–2025)**
  plus TU Delft / Geonovum / VNG / Eindhoven **through August 2026**. Self-labelled
  **"experimental"**, report-JSON *"still being developed"*.
- **`tudelft3d/ifcgref`** — Flask app for **georeferencing IFC files**, CHEK-funded (GA 101058559).
- **`ogcincubator/chek-data-completeness`** — FastAPI service combining **val3dity** (geometry
  validity, ISO 19107; **GPL-3.0**) + **SHACL profiles** (data completeness) + CityGML→CityJSON
  conversion.
- **`ogcincubator/chek-profiles`** (fetched) — profiles for **CityGML-OWL, CityJSON (JSON Uplift
  → RDF), INSPIRE**. 1 star, 33 commits. **Licence not specified — NOT CONFIRMED.** Repo's own
  blocker, verbatim: *"A canonical OWL representation of CityGML is the key blocker."*
- **`tudelft3d/3dinteractivevalidation`** — upload/validate/visualise CityJSON against the CHEK
  validator's SHACL profiles.
- **Project status: CHEK "has officially come to an end"** (2022-10-01 start, Horizon Europe GA
  101058559) — the repos outlive the project; check maintenance before depending.
- **⭐ Pryzm action — ADAPT ONE PATTERN, adopt no dependency.** CHEK's requirement spreadsheets were
  translated to **SHACL shapes at ~1:1 requirement↔shape**, bundled as **profiles with
  INHERITANCE** (*"If a profile is declared to be the profile of another, the validation SHACL
  shapes in the latter will be included any time that the former is used, allowing defining
  fine-grained rules for specific cases (e.g., cities, areas, building types)"*). **That is the
  jurisdictional cascade Pryzm's rule packs need** — national → regional → municipal → plan →
  building type — expressed as profile inheritance rather than as per-country code branches
  (which brief §9 forbids in core anyway). Worth reading before the rule-pack composition model
  is fixed. `IFC_BuildingEnvExtractor` is separately interesting as the **only** OSS IFC→CityJSON
  LoD-ladder extractor found, if Pryzm ever needs to push a designed building back into a
  3D-city-model context — but GPL/LGPL and "experimental" both apply.

## P-12 LLM ordinance extraction at scale — a permissively-licensed production pipeline exists (US)

Brief §6 classes some planning data as *"🟠 document/AI extraction only"*. **That job has mature,
permissively-licensed prior art, and Pryzm should not design it from scratch.**

### D31. ⭐ NREL COMPASS / INFRA-COMPASS — BSD-3, with hallucination guardrails and per-record source URLs
- **Repo:** https://github.com/NREL/COMPASS — fetched 2026-09-01. PyPI `INFRA-COMPASS` (0.28.0);
  docs `nrel.github.io/COMPASS`. Companion: `NREL/elm` (Energy Language Model utilities).
- **What:** *"Infrastructure Continuous Ordinance Mapping for Planning and Siting Systems"* —
  end-to-end LLM pipeline that (1) **retrieves** the ordinance documents for named jurisdictions
  and (2) **extracts structured values** into a versioned database, output as
  **CSV / Excel / GeoPackage** with *"consistent CSV rows with stable column names, units, and
  feature labels"*. Extracted fields include **setbacks, height limits, noise thresholds as
  numerical values rather than text**.
- **⭐ The two guardrails, verbatim:** *"cleaned text is checked against the source and dropped if
  it drifts too far, so fabricated values never reach the database"*; and *"every record carries a
  URL back to the original ordinance document, so any value can be audited or spot-checked."*
- **Licence: BSD-3-Clause** (permissive — no copyleft, embeddable). 17 stars, **381 commits**,
  national-lab maintained; published datasets: US wind (2025) and solar siting ordinances on
  OpenEI/data.gov.
- **Scope: energy-infrastructure ordinances, US.** No evidence of generalisation to other
  ordinance types or to Europe — **do not claim it works on a Bebauungsplan.**
- **⭐ Pryzm action — ADAPT THE ARCHITECTURE (strongest reusable pattern in this pass).** The
  extraction *targets* differ (setbacks/height/noise vs FAR/coverage/building lines) but the
  **shape is identical to Pryzm's category-2 problem**: discover the governing document for a
  jurisdiction, extract numeric constraints with units, refuse rather than fabricate, and keep a
  URL to the source per value. That last property is exactly Pryzm's never-overstate gate
  (`[[context-data-honesty-family]]`) implemented by a national lab, under **BSD-3 — code Pryzm
  may legally read, borrow from, and even vendor.** Read `elm` + `COMPASS` before writing a
  European ordinance-extraction pipeline. **Do not adopt the datasets** (US energy siting).

### D32. `zoning-gpt` (National Zoning Atlas × Cornell) and `ai-zoning` (NYU) — method, not data
- **`National-Zoning-Atlas/zoning-gpt`** (fetched 2026-09-01): LLM+NLP extraction of structured
  values from **US** zoning codes (targets *min lot size*, *min unit size*, extensible). 21 stars,
  367 commits. **Licence not specified — NOT CONFIRMED.** Evaluation harness exists
  (`data/results/eval.yaml|csv`) but **no accuracy numbers are on the repo page**, and artefacts
  sit behind **credentialed DVC/Azure** — so its published record is not a usable accuracy
  benchmark.
- **`dmilo75/ai-zoning`** (fetched 2026-09-01): **MIT**, 74 stars, 21 commits; LLM parsing of US
  municipal zoning documents into binary/numerical answers (`Questions.xlsx`); results published
  via Dropbox. Claims *"the reliability of LLMs in analyzing complex regulatory datasets"* —
  **with no accuracy figure or human baseline on the repo page. NOT CONFIRMED; treat the
  reliability claim as unevidenced.**
- **Pryzm action: NONE as dependency; read for question-design.** Both are US-only and neither
  publishes the accuracy calibration Pryzm would actually need. Recorded because the OSS lane
  §2.6's zoning.space cautionary tale is not the whole picture — **academic LLM zoning extraction
  is an active field with published corpora; what it has NOT produced is a licensed, evaluated,
  European result.**

## P-13 Category-4 (precomputed buildable envelope) — RE-TESTED with different wording; absence HOLDS, and the market corroborates it

Pass 1 §6.3 concluded "none found" from an OSS sweep. Re-run 2026-09-01 with envelope/massing/
setback-solver vocabulary rather than planning vocabulary, to attack the same claim from the other
side. **The verdict survives, and two commercial data points make it sharper:**
- **⭐ Autodesk Forma × Zoneomics — "3D Envelope by Zoneomics"** (blogs.autodesk.com, 2024-08-19,
  fetched 2026-09-01): the incumbent CAD vendor **ships zoning-responsive envelope generation**,
  fed by Zoneomics *"Generative Design Enabled (GDE) data APIs"* carrying **height, setbacks, lot
  coverage, floor-area limits**; pick a parcel → *"generate a building envelope to conduct a
  massing feasibility study"*. **Coverage, verbatim: *"currently available for cities in the US
  and Canada"* — the announcement does not mention Europe.** ⭐ **This is the strongest evidence
  yet for the OSS lane §3.13 "no European Zoneomics" verdict**: Autodesk demonstrably wants this
  feature and shipped it where a rules-data supplier exists. **The missing thing in Europe is the
  DATA SUPPLY, not the envelope UX or the demand.**
- **3D Cityplanner (StrateGis Groep BV, NL** — 3dcityplanner.com, fetched 2026-09-01): commercial
  browser 3D urban-scenario tool; uses *"worldwide basemaps and terrain"* plus user GIS, and
  *"BAG and BGT can be used as additional planning context"*; generates plots/roads/buildings and
  costs/revenues. **No zoning-compliance checking and no buildable-volume computation** — it helps
  teams *"explore"* what is possible. Another instance of the pass-1 D21/ALPA lesson: **envelope
  UX is commoditising; jurisdictional rule depth with provenance is the moat.**
- OSS side, nothing new of substance: `ssajedi/upzone` (NYC-only, 2024 AECTech hackathon
  prototype, LLM + spatial algorithms over the NYC zoning resolution — the closest OSS object to
  category 4 and it is one city, one hackathon), `jason9075/city-pcg` (procedural massing, no
  rules), `wojtryb/Procedural-Building-Generator` (Blender add-on). All **search-level, not
  probed** — none warrants a probe, and each is recorded so the next sweep does not re-open them.
- **Verdict: for EUROPE, category 4 is still not provided by anyone — OSS or commercial.**
  Pass 1 §6.3 and OSS-lane §4.3 both stand, now tested from two vocabularies and corroborated by
  where Autodesk did and did not ship.

## P-14 Two small closes

- **`OvertureMaps/match-inspector` licence = MIT** — and the copyright line is the finding.
  Probed twice by independent routes (github.com blob view, then
  `raw.githubusercontent.com/OvertureMaps/match-inspector/main/LICENSE`, both 2026-09-01) because
  the first result looked wrong: *"MIT License / Copyright (c) 2025 **Florian Nachtigall**"*.
  It is not wrong. **The building-conflation review tool in the Overture org was written by the
  person now leading EUBUCCO v0.2** (P-8). ⭐ Two consequences: the "geometric matching needs a
  human review loop" evidence (pass-1 D4) and Europe's largest open building-conflation effort
  are **the same lineage, not two independent data points**; and the tool Pryzm would copy the
  pattern from is **MIT — freely reusable**, unlike almost everything else in this lane.
  *(Method note: this is the `[[probe-can-be-wrong-three-ways]]` discipline paying off — the
  surprising reading was re-probed on a different transport before being recorded.)*
- **INSPIRE GeoPackage Good Practice — examples read, and the practical value is LOW for Pryzm**
  (closes the item owed in P-6). `examples/overview.md` (fetched 2026-09-01) lists:
  **DK — Addresses**; **FI — topographic themes**; **IT — Geology** (+ EEA and EJPSOIL examples
  for transport networks, environmental noise, soil). **Neither Cadastral Parcels nor Buildings
  appears among the member-state examples.** So: the sanctioned bulk-file path *exists* (endorsed
  2022-11-25) but **nobody has published cadastral parcels or buildings through it** — the two
  themes Pryzm actually needs. **Refined action: still worth one look per country, but expect
  WFS/Atom; do not budget on a GeoPackage bulk path existing for cadastre.**

---

# PASS 2 — SYNTHESIS

## S.1 New/changed rows (pass 2 only; pass-1 rows D1–D23 stand except where corrected in S.3)

| # | Item | Class | Licence | Action |
|---|---|---|---|---|
| D24 | City3D (tudelft3d) | B (LoD2 gen) | **GPL-3.0** | NONE as dep; note the *footprint-free* path |
| D25 | points2poly / PolyGNN | research | NOT CONFIRMED | NONE — frontier only |
| D26 | Hootenanny (NGA) | B (conflation) | **GPL-3.0** | named fallback if geometric matching is forced |
| D27 | **Catala (Inria)** | B (prior art) | **Apache-2.0** | ⭐ ADAPT the authoring model (per-article provenance) |
| D28 | OpenFisca core | B | **AGPL-3.0** | NONE — wrong shape + network copyleft |
| D29 | AEC3PO (ACCORD) | D/F (ontology) | **NOT CONFIRMED** | READ the decomposition; depend on nothing |
| D19′ | CODE-ACCORD **corrected** | F (corpus) | **CC-BY-4.0 @ Zenodo v1.0.0** | USABLE with attribution (Zenodo deposit only) |
| D30 | CHEK toolchain (6 repos) | B+C | LGPL/GPL-3.0 · others NOT CONFIRMED | ⭐ ADAPT SHACL **profile inheritance** |
| D31 | **NREL COMPASS / elm** | B (AI extraction) | **BSD-3-Clause** | ⭐ ADAPT the architecture (guardrails + source URL per value) |
| D32 | zoning-gpt · ai-zoning | B (method) | NOT CONFIRMED · **MIT** | read for question design; no accuracy to borrow |
| D33 | **EUBUCCO v0.2** | A (dataset) | **ODbL + CC-BY-SA(Prague) + CC-BY-NC(Abruzzo)** | ⭐ CONSUME the source.coop ODbL-clean mirror |
| D34 | EUBUCCO source.coop mirror | A | **ODbL** (2 regions excluded) | ⭐ preferred access path (FGB/Parquet/**PMTiles**) |
| D35 | IJGI 15(6):252 comparison | D (evidence) | CC-BY (MDPI) | cite in source-priority rationale (abstract-level) |
| D36 | INSPIRE GeoPackage Good Practice | C | n/a | one look per country; **no cadastre/buildings exemplars** |
| D37 | Autodesk Forma × Zoneomics | market signal | commercial | ⭐ evidence: US/CA only — Europe's gap is DATA SUPPLY |
| D38 | 3D Cityplanner (StrateGis, NL) | market signal | commercial | none — no compliance layer |

## S.2 ⭐ What pass 2 changes in the federation scaffold's SOURCE-PRIORITY **DATA** (never its architecture)

1. **`ign_es` bridge is REAL and is a buildings bridge** (P-1, verified at the object store).
   Spain's `conflation:` flag can be set to `bridge-file` on evidence. **Every other European
   country stays `geometric-or-none`** — 16 providers listed, one European NMA among them.
   ⚠ The **bridge-file licence is still unstated after two probes** — flag it, do not redistribute
   the mapping until Overture answers.
2. **GHS-OBAT joins by GERS id** (P-2) — pass-1's "cheapest fallback enrichment" is now a plain
   equi-join, with the **13-release id-drift check still owed**. Licence = **ODbL** per the JRC
   (the licensor), *not* the CC-BY a re-host claims.
3. **EUBUCCO v0.2 replaces v0.1 in every table that mentions it** (P-8): 322M buildings, 30
   countries, Parquet/DuckDB, and a **licence-clean PMTiles mirror**. ⛔ **Its height and floor
   columns are ~57% and ~80% ML-IMPUTED** — carry the ground-truth flag or drop the value.
4. **Peer-reviewed corroboration of the Tier-C ordering** (P-9): GHS-OBAT/DBSM lead on
   completeness but are coarse; OSM/Overture are semantically rich but sparse; **completeness ≠
   informativeness**.
5. **Category 4 remains unprovided in Europe by anyone, OSS or commercial** (P-13) — and Autodesk
   shipping it in the US/Canada while not shipping it in Europe is the cleanest available proof
   that **the missing input is the rules data, not the envelope engine.**

## S.3 Corrections to pass 1 (both readings kept visible, per repo discipline)

| Pass-1 claim | Status after pass 2 |
|---|---|
| D1: "seven bridged source datasets" (docs page) | **REFUTED — 16 provider partitions in the bucket.** The docs list is not an inventory. |
| D1: ES bridge inferred from prose | **CONFIRMED at S3** — `provider=ign_es/theme=buildings/` |
| D6: id space "NOT CONFIRMED (GERS?)" | **RESOLVED — `id` is a GERS 32-hex identifier** |
| D11: "no third OSS LoD2 engine surfaced" | **REFUTED — City3D (GPL-3.0).** "No third *maintained* engine" survives (dormant since 2022-06-28). Pass 1 **overstated an absence.** |
| D17: implied "no INSPIRE bulk path" | **REFINED — GeoPackage Good Practice endorsed 2022-11-25**, but **no cadastral-parcel or building exemplars**; GeoParquet half confirmed. |
| D19: CODE-ACCORD "no licence → gated" | **REFUTED — CC-BY-4.0 on the Zenodo v1.0.0 deposit.** An unread licence statement is not an absent licence. |
| §6.3 "category 4: none found" | **RE-TESTED from a second vocabulary — HOLDS**, now with commercial corroboration. |

## S.4 Honest gaps AFTER pass 2 (what is still owed)

**Closed this pass:** §6.4 gaps 1 (partition half), 2, 3 (re-searched, still not found → recorded
as absence), 4, 5 (match-inspector), and the P-6 examples item.

**Still open:**
1. **GERS bridge-file LICENCE** — unstated on both the bridge-files page and the attribution page.
   Two probes, no answer. **Needs a direct question to Overture**, not another fetch.
2. **GHS-OBAT id drift** — ids minted against Overture `2024-07-22.0`; current release is
   `2026-08-19.0`. One join-rate test against a current release is owed before the join ships.
3. **EUBUCCO v0.2 release date** and the **version hosted by the source.coop mirror** — neither is
   stated at source. "Spring 2026" is a search assertion, **not corroborated**.
4. **IJGI 15(6):252 full text** — MDPI returned **403**; only the abstract was read. No per-country
   figure from it may be quoted until the PDF is obtained.
5. **Licences NOT CONFIRMED:** `aec3po`, `ogcincubator/chek-profiles`, `zoning-gpt`,
   `points2poly`, `polygnn`, `osm-pbf-parquet`. All are read-before-use, none blocking today.
6. **FireBIM code** — second sweep, still no public repo. Recorded as an absence, not a licence.
7. **Hootenanny maintenance** — last release 2024-10-03, no deprecation notice; **~23 months
   quiet**. If it ever becomes load-bearing, verify the project is alive first.
8. **`NREL/elm` not probed individually** (only COMPASS was); and COMPASS's extraction accuracy is
   not published on the repo page — the guardrail *design* is evidenced, its *error rate* is not.
9. Axis depth unchanged from pass 1: one-to-two sweeps per axis; **gitlab.opencode.de, CORDIS and
   the OGC incubator org are not exhaustively enumerated.**

## S.5 The one-line verdict for the E5 synthesis

**Nothing found in this delta changes what Pryzm must BUILD; four things change what Pryzm may
STOP building or must stop over-trusting.** Consume: the **`ign_es` GERS bridge** (Spain's
conflation is pre-computed), **GHS-OBAT by GERS equi-join**, and **EUBUCCO v0.2 via the ODbL-clean
source.coop mirror**. Adapt, do not adopt: **COMPASS's guarded extraction architecture** (BSD-3),
**Catala's per-article provenance model** (Apache-2.0), **CHEK's SHACL profile inheritance** as
the jurisdictional cascade. Refuse: **EUBUCCO's "100% height/floors"** as measurement, and any
belief that a European Zoneomics exists — **Autodesk shipped zoning-responsive envelopes in the
US and Canada and could not ship them here, which is the market's own statement that the
precomputed-envelope seat in Europe is empty.** That seat is Pryzm's.

---

*Lane oss-delta — PASS 2 complete 2026-09-01. Pass 2 adds 15 new candidates (D24–D38), closes 6
of the 7 owed probes, issues **6 corrections to pass 1** (two of them refutations of pass-1
absence claims), and re-tests the category-4 negative from a second vocabulary. Cumulative for
this lane: ~35 claims probe-confirmed, ~18 refuted/gated/NOT-CONFIRMED. READ-ONLY throughout — no
production code touched.*
