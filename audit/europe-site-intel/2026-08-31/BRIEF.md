# PRYZM — EUROPEAN SITE INTELLIGENCE DATA & ARCHITECTURE AUDIT (founder brief, 2026-08-31)

> Captured verbatim-in-substance from the founder's mandate of 2026-08-31 (per the
> standing capture-founder-research-to-repo rule). This 34-section brief is the
> authority for the europe-site-intel research campaign. The report lands beside
> this file as REPORT.md; per-lane findings under lanes/.

## Role
Principal geospatial/data architect, AEC/BIM software architect, European
planning-data specialist, open-source researcher. The task is NOT to build:
determine, based on what actually exists in 2026, what Pryzm should reuse,
consume, adapt, contribute to, or build itself for a Europe-wide
site-intelligence platform. Avoid duplicating what governments, open-source
projects, startups, universities, EU initiatives or data platforms already did.

Target architecture: Europe-wide · cloud-native · browser-first · scalable ·
cost-efficient · legally/provenance-aware · source-agnostic · country-adapter
based · evolves as public data improves · AI-assisted rule interpretation ·
deterministic buildable-envelope generation · future development-potential.

## §1 Classification for every capability
A EXISTING DATA · B EXISTING OSS CODE · C EXISTING API/SERVICE · D EXISTING
STANDARD · E DERIVABLE · F EXTRACTABLE (doc/AI) · G GENUINELY MISSING ·
H PRYZM IP. Never recommend building A–D from scratch without compelling
technical/licensing reason.

## §2–3 The two products
PRODUCT A — CONTEXTUAL SITE MODEL: parcel geometry, neighbours, buildings
(footprint/height/floors/use), LoD0-2, terrain, roads, water, land cover,
addresses, infrastructure, planning geometry — assembled from existing sources,
not necessarily owned.
PRODUCT B — DEVELOPMENT POTENTIAL / BUILDABLE ENVELOPE: permitted use, FAR/FSI/
GFZ/edificabilidad, coverage, footprint, height, floors, setbacks, building
lines/boundaries, volume, density, dwelling/parking limits, protections,
easements, exceptions, parcel-specific rules, max GFA, envelope, scenarios —
distinguishing (1) authoritative machine-readable, (2) authoritative
document-derived, (3) deterministic inference, (4) AI interpretation,
(5) human-validated, (6) uncertain/missing.

## §4 European infrastructure to audit
INSPIRE (Planned Land Use, Cadastral Parcels, Buildings, Land Use, Area
Management/Restriction/Regulation Zones), EuroGeographics, Open Maps for
Europe, Open Cadastral Map, Copernicus, JRC, European Data Portal, OGC APIs /
Features / WFS / WMS / WMTS, PMTiles, CityGML, CityJSON, FlatCityBuf, XPlanung,
BCRL, ACCORD, EUnet4DBP, other EU digital-building-regulation initiatives.
Special weight on 2024–2026 creations/updates, especially 2025–2026.

## §5 Country-by-country (EU27 + UK, CH, NO)
Per country: CADASTRE (official source, INSPIRE/national, API, WFS/WMS/OGC,
download, format, update frequency, licence, commercial use, identifiers,
quality) · BUILDINGS (footprints, height, floors, LoD1/2, CityGML/CityJSON/
3D Tiles, LiDAR, use, year, API, licence) · PLANNING (national/regional/
municipal, zoning, local plans, building lines/fields, setbacks, height,
FAR/FSI/GFZ, coverage, density, use, restrictions, documents,
machine-readability) · LEGAL FORM (GIS attributes / XML/GML / JSON / RDF /
API / PDF / HTML / scanned / database / structured object / legal text) ·
EXISTING SOFTWARE (repos, startups, academic).

## §6 Priority countries (architecture-defining)
DE (XPlanung/XPlanGML/WFS, Bebauungsplan, GRZ/GFZ, building lines/areas, OSS
tooling — how much is directly consumable) · DK (Plandata, lokalplaner,
byggefelter, building %, floors/height/volume/use, kommuneplaner,
cadastral+building APIs — reference implementation for structured-rule
countries?) · CH (ÖREB, cantonal WFS, Swiss Zoning API, BZOdigital,
dev-potential projects) · ES (Catastro, IDEE, autonomous-community GIS,
Madrid/Barcelona/Valencia/Andalusia/Catalonia, PNOA, edificabilidad/altura/
ocupación/alineaciones/retranqueos — central vs CA-adapter split) · FR (GPU,
CNIG, PLU/PLUi, prescriptions, règlement, BD TOPO, LiDAR HD, Polis) · PT (DGT,
SNIT, PDM, PDMFacil, BUPi, municipal ArcGIS) · LT (TPDR, Geoportal, intensity/
density/floors) · EE (PLANK, Maa-amet, building rights, 3D) · NL (PDOK,
Kadaster, Omgevingswet/Omgevingsplan, STOP/TPOD, IMOW, DSO — most digitised) ·
PL (Rejestr Urbanistyczny, Geoportal, general/local plans, 2025–2026 reforms —
no stale assumptions).

## §7–8 New projects + OSS audit
GitHub/GitLab 2025–2026 repos, startups 2024–2026, zoning engines, cadastral
projects, 3D city, building-regulation, AI rule extraction, planning-to-BIM,
parcel-to-envelope. Per repo: URL, created, last commit, stars, contributors,
licence, architecture, language, maturity, production-ready?, commercial?,
Pryzm action. Named minimum set: EUBUCCO, Overture, Microsoft footprints,
DBSM/JRC, CityJSON, FlatCityBuf, XPlanung tools, SAGisXPlanung, AMX-26,
Mapterhorn, Open Cadastral Map, Swiss Zoning API, BZOdigital, Polis, Envelope,
PlanX-CAD, ACCORD, BCRL, EUnet4DBP. Actions: CONSUME / DEPEND ON / WRAP /
ADAPT / FORK / CONTRIBUTE / MONITOR / REPLACE / BUILD OUR OWN.

## §9–10 Licensing + access-vs-ownership
Per dependency: licence, attribution, share-alike, database rights, commercial
restrictions, API terms, redistribution, derivative DBs, caching, tiles,
combination with proprietary data → GREEN / YELLOW / RED. Per dataset: query
dynamically / cache / mirror / cloud-optimise / store derived only / metadata +
on-demand — minimising storage, duplication, update burden, legal exposure,
cost.

## §11–15 Canonical model, adapters, two-stage pipeline, evidence graph, versioning
Smallest canonical model (Parcel, Building, Terrain, Road, Plan, Zone,
Prescription, Restriction, Regulation, Rule, Scenario, Envelope,
DevelopmentPotential, Source, Evidence, Version, Confidence) with per-rule
provenance JSON (parameter/value/unit/source{country,authority,dataset,plan,
object,document,article,page}/derivation/confidence/valid_from/valid_to).
Country adapters ONLY: source discovery, API/download, schema mapping,
semantics, document retrieval, extraction — core stays country-agnostic.
Two-stage: SOURCE → NORMALIZATION → EVIDENCE GRAPH → RULE EXTRACTION → RULE
GRAPH → APPLICABILITY ENGINE → GEOMETRY ENGINE. Evidence chain answers "why is
max height 18m" and survives updates. Versioning answers "what applied on
2025-01-01", not just latest.

## §16–20 Buildings, LOD, envelope engine, rule engine, AI split
Master dataset vs federation+conflation (expectation: federation wins — prove
or disprove; source priority, matching, dedup, height/floor confidence, LoD
selection, national override, provenance). LOD200 vs a Pryzm P0–P3 contextual
representation (minimum sufficient geometry, not standards compliance).
Envelope engine: reuse vs thin layer vs new (setbacks, lines, offsets, height
planes, stepped/sloped, terrain, coverage, FAR, multi-field, irregular, holes,
corners, protections, overlaps, per-part rules) — country-rule independent.
Rule engine: evaluate BCRL/RDF/SHACL/JSON Logic/Drools/OpenFisca before any
DSL. AI does document classification / rule extraction / semantics /
exceptions / linking / uncertainty; DETERMINISTIC does geometry /
intersections / buffers / FAR / coverage / height / GFA / envelope. AI never
silently determines geometry or numbers; every AI rule carries evidence,
source, confidence, method, validation state.

## §21–27 Coverage levels, minimum core, do-not-build, must-build, options, cost, stack
Coverage LEVEL 1 contextual / 2 planning / 3 development-intelligence;
per-country heatmap (contextual 3D, cadastre, planning geometry, rules,
automation, envelope, confidence 0–100%). Minimum European core (candidate:
source registry, adapter SDK, canonical model, evidence graph, rule
normalizer, applicability engine, geometry engine, confidence/provenance, tile
infra, API). Mandatory DO-NOT-BUILD list (verify each) + MUST-BUILD/IP list
(prove, not assume). ≥3 architectures: A centralised lake / B federated /
C hybrid — infra, cost, scale, legal, update burden; recommend on evidence
(hybrid expected). Cost model at 1k/10k/100k/1M parcels/day across storage,
compute, API calls, tiles, docs, AI, DB, cache, pipelines. Stack: storage
(PostGIS, object storage, Parquet, DuckDB, PMTiles, FlatCityBuf, COG, vector
tiles), APIs (REST, OGC API Features, GraphQL where justified), processing
(Python/TS/Rust/GDAL/GeoPandas/Shapely/Tippecanoe/DuckDB Spatial/PostGIS),
3D (Three.js, WebGL/WebGPU, 3D Tiles, CityJSON, FlatCityBuf). Do not assume
current Pryzm tech is optimal.

## §28–29 Pryzm code review + migration plan
Inspect existing ingestion, building data, cadastre handling, terrain, zoning,
planning, envelope generation, models, APIs, storage, cloud, duplicates, debt.
Classify KEEP / REFACTOR / REPLACE / DELETE / EXTRACT INTO CORE / MOVE TO
COUNTRY ADAPTER. Migration phases 0–6 (research, canonical core, adapter
framework, structured-rule countries, document-rule countries, expansion,
development intelligence) with effort, dependencies, risk, coverage, value.

## §30 Critical test — 20+ real parcels
Across DE, DK, CH, ES, FR, PT, LT, EE, NL, PL: parcel → buildings → zone →
plan → restrictions → rules → envelope → GFA; record per step DIRECT /
DERIVED / AI-EXTRACTED / HUMAN-VALIDATED / MISSING.

## §31 Output: report sections A–T
Exec summary; EU landscape; OSS landscape; startups/competitors; standards;
data availability matrix; licensing matrix; recommended architecture; canonical
model; adapter architecture; evidence graph; rule engine; envelope engine; AI
architecture; Pryzm code review; stack; cost model; 20-parcel validation;
6/12/24-month roadmap; FINAL DECISION — the 20 explicit questions (incl. what
to stop building immediately, what to build immediately, smallest-team
Europe-ready plan).

## §32–34 Research rules + final principle
Verify with official sources; inspect actual APIs/repos/schemas/samples/
licences/activity. Never claim exists / machine-readable / covers-Europe /
open-source / commercial-ok without confirmation. Special focus 2025–2026
(GitHub, CORDIS, EU portals, geoportals, OGC, academia, startups, procurement).
Reuse data, standards, OSS; federate; cache only when justified; normalize;
preserve provenance; AI for interpretation not truth; deterministic geometry;
applicability = the core intelligence layer; development potential = the
product. Goal: given any parcel in Europe — what exists, what rules apply,
what can be built, shown transparently source-backed in 3D — owning as little
raw data infrastructure as possible.
