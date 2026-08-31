# LANE 6 — Open-source + startup recon, 2024–2026 (brief §7, §8, §33)

> Lane: `oss-startups-recon` · campaign `europe-site-intel` · written 2026-08-31.
> Method per brief §32: every claim carries a URL and a checked date; GitHub repos verified by
> fetching the actual repo page (stars / licence / last-commit read off the page, not from memory);
> licences read from the repo, not assumed. Classification letters per brief §1
> (A data · B OSS code · C API/service · D standard · E derivable · F extractable · G missing · H Pryzm IP).
> Licence colour per brief §9 (GREEN / YELLOW / RED). Access-vs-ownership option per brief §10
> (1 query dynamically · 2 cache · 3 mirror · 4 cloud-optimise · 5 store derived only · 6 metadata + on-demand).
> Pryzm action menu per brief §8: CONSUME / DEPEND ON / WRAP / ADAPT / FORK / CONTRIBUTE / MONITOR / REPLACE / BUILD OUR OWN.

## Status: COMPLETE 2026-08-31 — 16 named-set items + 8 broader-OSS items + 13 startup/competitor entries; gaps recorded in §4.4

---

## PART 1 — Named minimum set (brief §7–8), verified individually

### 1. EUBUCCO — European building stock database
- **URL:** https://github.com/ai4up/eubucco · https://eubucco.com · Zenodo DOI 10.5281/zenodo.6524780 — checked 2026-08-31 (repo page + eubucco.com fetched).
- **What:** 322M+ individual buildings, EU-27 + UK/NO/CH ("30 countries"). Site claims 100% coverage for type/subtype/height/floors, construction year only 15.9%. Source mix per site: government registries 62.2%, Microsoft footprints 20.4%, OSM 17.4%.
- **Verified facts:** repo 119 stars, MIT (CODE only), Python, 307 commits; v0.1 cited in the paper; site says "Development since v0.2 is led by Florian Nachtigall" → a v0.2 line exists.
- **Caveat (measured, not assumed):** the "100% height/floors" is largely MODELLED/imputed, not surveyed — treat height as ESTIMATED until the per-building attribute-source column is inspected. SURVEYED ≠ NORMATIVE ≠ MODELLED. **Data licence was NOT stated on eubucco.com or the repo page** — per the v0.1 paper it is per-country (ODbL / CC-BY / CC0 depending on upstream cadastre); MUST be resolved per country before commercial use. Licence colour: **YELLOW (data — per-country, share-alike risk from ODbL upstreams; code GREEN/MIT)**.
- **Class:** A (data) + B (pipeline code). **Access option:** 5 (store derived only) or 2 (cache per-country extracts).
- **Pryzm action:** **CONSUME selectively / MONITOR.** Useful as a fallback height/floors layer where national LoD2 is missing; do NOT prefer it over national cadastral buildings (its own source mix is 62% those registries — go upstream where PRYZM already has an adapter). Freshness: static research releases, not a live feed.

### 2. Overture Maps — buildings theme
- **URL:** https://docs.overturemaps.org/guides/buildings/ — checked 2026-08-31 (docs fetched).
- **What:** `building` + `building_part` types; conflation of OSM (highest priority), Esri Community Maps, authoritative sets (explicitly incl. **Spain IGN**), ML roofprints from Microsoft + Google Open Buildings. Monthly releases, GeoParquet on S3/Azure, GERS stable IDs.
- **Licence:** buildings theme is **ODbL** (docs' exact statement: published under ODbL "because it includes OpenStreetMap data"). Colour: **YELLOW** (ODbL share-alike on derivative DATABASES; fine to render/serve tiles with attribution; a derived per-parcel building-attribute table may qualify as a derivative database → isolate or share-alike).
- **Class:** A + C (S3 GeoParquet query via DuckDB is effectively an API). **Access option:** 4 (cloud-optimise direct query) or 2 (cache bboxes).
- **Pryzm action:** **CONSUME as the default pan-EU context-buildings layer** for countries without a wired national adapter; PRYZM's existing per-country sources stay authoritative where present (CONTEXT-BUILDING-SOURCE-EVALUATION.md). Monthly cadence + GERS IDs make it the strongest federation backbone of the three big footprint sets.

### 3. Microsoft GlobalMLBuildingFootprints
- **URL:** https://github.com/microsoft/GlobalMLBuildingFootprints — checked 2026-08-31 (repo fetched).
- **Verified facts:** 1.9k stars; data licence **CDLA Permissive 2.0** (page's exact words); 1.4B buildings, 225 regions, 30,340 tiles; **174M buildings with ML height estimates**; line-delimited GeoJSON via dataset-links.csv on Azure blob; **actively refreshed — last dataset refresh 2026-08-13** ("1,945 tiles were updated"). Stated precision 94.3–97.17%.
- **Licence colour:** **GREEN** (CDLA-Permissive-2.0: commercial use + derivatives OK, no share-alike).
- **Caveat:** heights are ML ESTIMATES (imagery-derived) — usable for context LoD1 extrusion, never for normative checks.
- **Class:** A. **Access option:** 2/4.
- **Pryzm action:** **CONSUME via Overture** (Overture already conflates it) rather than directly — one ingestion path, not three. Direct use only where CDLA-Permissive's GREEN licence matters vs Overture's ODbL (a share-alike-free building layer for proprietary derived products).

### 4. DBSM — JRC Digital Building Stock Model (R2025)
- **URLs:** https://data.jrc.ec.europa.eu/dataset/a601a4a8-9289-4fc4-983a-25d54f957f3a (R2025) · collection id-00382 · BUILD-UP webinar PDF 2025-08 — checked 2026-08-31 (search-verified; dataset page not probed).
- **What:** pan-EU-27 building DB (incl. Azores/Madeira/Canaries), GeoPackage per country, energy-focused attributes; R2025 adds satellite-based attributes + rooftop-PV potential (fed the Nature Energy 2025 rooftop-PV paper).
- **Licence:** **ODbL v1.0** — colour **YELLOW** (same share-alike calculus as Overture).
- **Class:** A. **Access option:** 6 (metadata + on-demand) — energy attributes are not PRYZM's product; only floors/height/use conflation value.
- **Pryzm action:** **MONITOR.** It is itself a conflation of the same upstreams (OSM/Microsoft/national). Value only as a cross-check corpus; do not add as a fourth footprint source.

### 5. CityJSON / cjio
- **URLs:** https://www.cityjson.org · https://github.com/cityjson/cjio — checked 2026-08-31 (repo fetched).
- **Verified facts:** cjio 148 stars, MIT, Python, 1,034 commits; supports CityJSON v2.0 (back-compat 1.1/1.0); subset / convert-to-glTF / reproject / validate / merge operators; CLI + API. CityJSON itself is an OGC community standard (class D).
- **Licence colour:** **GREEN** (MIT).
- **Class:** B + D. **Pryzm action:** **DEPEND ON (pipeline-side)** for national CityJSON ingestion (NL 3DBAG, EE, …); not a browser dependency.

### 6. FlatCityBuf
- **URL:** https://github.com/cityjson/flatcitybuf — checked 2026-08-31 (repo fetched). Paper: ISPRS Archives, 3D GeoInfo 2025, DOI 10.5194/isprs-archives-XLVIII-4-W15-2025-17-2025.
- **Verified facts:** 32 stars, **MIT**, Rust core + C++/Python/**TypeScript** bindings, 550 commits; HTTP range-request partial fetch, spatial + attribute indices; whole-NL in one 70GB file; paper claims 9–250× faster deserialisation than CityJSON, 10–30% smaller. Live demo flatcitybuf-prototype.hideba.me.
- **Licence colour:** **GREEN**.
- **Maturity:** young (32 stars, 2025 paper, TU Delft single-org ecosystem) but exactly the "PMTiles-for-3D-buildings" shape the brief §27 stack anticipates. TypeScript binding = browser-consumable.
- **Class:** B + D(-emerging). **Access option:** 4 — this IS the cloud-optimise option for LoD1/2 context buildings.
- **Pryzm action:** **TRIAL → DEPEND ON behind an interface + MONITOR.** Strong candidate to replace ad-hoc 3D-context plumbing; risk is bus-factor, so wrap it. CONTRIBUTE if gaps surface (e.g. attribute filters for per-level styling).

### 7. SAGisXPlanung + the German XPlanung QGIS-plugin cluster
- **URL:** https://github.com/nti-de/SAGisXPlanung — checked 2026-08-31 (repo fetched).
- **Verified facts:** 4 stars, **GPL-3.0**, Python, 512 commits; maintained by NTI Deutschland GmbH; QGIS 3.34+ / PostgreSQL 12+ / PostGIS 3.4; exports XPlanGML **5.3 and 6.0**, imports XPlanGML; open community edition + **commercial full version** (attribute editing, table imports).
- **Related repos surfaced in the same sweep (checked-in-passing 2026-08-31, not individually fetched):** kreis-viersen/xplan-reader (QGIS XPlanGML import), kreis-viersen/xplan-umring, Bau-Land-XPlanung/XPLANUNG24-QGIS-Plugin, bstroebl/xplanplugin, GitHub topic `xplanung`.
- **Licence colour:** **YELLOW-by-architecture** (GPL-3.0 fine as an external pipeline TOOL; never link into PRYZM code).
- **Class:** B. These are AUTHORING/CAPTURE tools (municipality-side), not rule EXTRACTION tools — none evaluates a Bebauungsplan against a parcel.
- **Pryzm action:** **no dependency; MONITOR the cluster.** The consequential fact: German XPlanung tooling is mature for WRITING plans; the READING/EVALUATION side (XPlanGML → rules → envelope) is the open gap — PRYZM-shaped (H). See also xplanbox in Part 2.

### 8. AMX-26 — disambiguated: JAPANESE cadastre-to-PMTiles
- **URL:** https://github.com/amx-project → repo `amx-26` "Cadastral Data to PMTiles", Python, **CC0-1.0**, updated 2026-02-26 — checked 2026-08-31 (org page fetched).
- The org is the 法務省地図XMLアダプトプロジェクト (Japan Ministry of Justice registry-map XML adapt project, with Geolonia + Digital Agency contributors); amx-26 converts Japan's cadastral XML to PMTiles. **Not European.**
- **Licence colour:** GREEN (CC0). **Class:** B.
- **Pryzm action:** **MONITOR as a PATTERN only** — the exact "national cadastre → PMTiles, community-run, CC0" recipe the target architecture wants per European country; zero direct data value for Europe.

### 9. Mapterhorn — open terrain tiles
- **URLs:** https://mapterhorn.com · https://github.com/mapterhorn/mapterhorn · https://protomaps.com/blog/mapterhorn-terrain/ · https://source.coop/mapterhorn/mapterhorn — checked 2026-08-31 (search-verified incl. maintainers + funding).
- **Verified facts:** public terrain PMTiles; global ~350GB up to z12 from Copernicus GLO-30; full pipeline OSS; maintained by Oliver Wipfli with Brandon Liu (Protomaps) + Sascha Brawer as co-admins; NLnet grant. Higher-res national lidar ingestion is the roadmap (Swiss origin).
- **Licence:** pipeline OSS; tiles derive from Copernicus (free use with attribution; attribution page exists) — colour **GREEN**, re-verify per added national lidar source.
- **Class:** A + B. **Access option:** 1/2 (their PMTiles direct, or self-hosted copy).
- **Pryzm action:** **CONSUME/DEPEND ON for context terrain outside already-wired countries.** PRYZM already runs its own baked-terrain path for ES (R2 PMTiles); Mapterhorn is the same architecture run as a commons — migrating removes a self-maintained pipeline. Trial before touching the Spanish terrain (the L-584 rasant/façade-sampling defect is about SAMPLING, unaffected by tile source).

### 10. Open Cadastral Map (OME2 / EuroGeographics)
- **URLs:** https://eurogeographics.org/activities/ome2-progress/open-maps-for-europe-2-highlights/ · eurogeographics.org news 2025–2026 — checked 2026-08-31 (search-verified).
- **Verified facts:** OME2 consortium (EuroGeographics + IGN-Belgium, IGN-France, Hellenic Cadastre, ES Catastro, NL Kadaster); pan-EU cadastral map service harmonising INSPIRE open data; final release covers **15 countries**: BE HR CZ DK EE GR IE LV LU PL SK SI ES CH NL; 4 layers (AdminUnits, CadastralParcels+Zones, Buildings+Parts, Addresses); links out to national geoportals for download; "pan-European Cadastral Data Strategy" announced.
- **Licence:** harmonised from national OPEN data — per-source terms persist; colour **YELLOW until per-country checked** (each source is already open by definition of inclusion).
- **Class:** A + C. **Access option:** 6/1 — explicitly a FINDABILITY layer over national sources, matching PRYZM's country-adapter architecture 1:1.
- **Pryzm action:** **CONSUME as source-registry input; do NOT ingest as data.** Its harmonised schema + per-country access catalogue is a ready-made seed for the brief §21 "source registry". 15 of 30 target countries covered; the absence of DE/FR/IT confirms those need national adapters regardless.

### 11. ACCORD project outputs (EU Horizon — digital building permits)
- **URLs:** https://accordproject.eu · https://github.com/Accord-Project — checked 2026-08-31 (org page fetched; deliverable D2.2 PDF located).
- **Verified repos (org page, 2026-08-31):** `aec3po` ontology (9 stars, HTML, updated 2025-04-22, no licence shown) · `CODE-ACCORD` corpus of building-regulation sentences for rule generation (13 stars, updated 2025-02-04, no licence shown) · `accord-nlp` (11 stars, **Apache-2.0**, updated 2026-05-29 — still active) · `RegulationTransformationTool` (Java, 0 stars, **Apache-2.0**, updated 2026-05-12) · `RuleFormalizationTool` (PHP, 1 star) · `bsdd` (5 stars, MIT).
- **BCRL** (Building Compliance Rule Language) is defined in deliverable **D2.2 "BCO Ontology and Rules Format"** (accordproject.eu/wp-content/uploads/2024/02/ACCORD_D2.2_BCO_Ontology_and_Rules_Format.pdf) — a domain-specific rule language over the AEC3PO ontology. **There is NO standalone BCRL repo on the org page** — it lives as spec + tooling (RuleFormalizationTool / RegulationTransformationTool).
- **Licence colour:** YELLOW (two key repos show no licence; Apache-2.0 where stated).
- **Class:** D (ontology + rule-language standard) + B (tools) + F (the NLP corpus/models are exactly "extractable via AI" infrastructure).
- **Assessment for the brief §18 rule-engine question:** ACCORD/BCRL is BUILDING-PERMIT compliance (BIM model vs building code), not PARCEL development-potential (plan rules vs parcel). The ontology's provenance model (document→article→rule→check) overlaps heavily with the brief §11 evidence-graph — worth ADOPTING concepts, not the stack: PHP/Java tools, low stars, project-funding lifecycle risk (Horizon project ends; accord-nlp still moving 2026-05).
- **Pryzm action:** **ADAPT (concepts: AEC3PO provenance chain, BCRL rule taxonomy) + MONITOR; do not DEPEND ON the tooling.** CODE-ACCORD corpus: candidate fine-tuning/eval data for PRYZM's own rule-extraction AI (check its licence file first — not shown on org page).

### 12. EUnet4DBP — European Network for Digital Building Permits
- **URLs:** https://eu4dbp.net · https://3d.bk.tudelft.nl/projects/eunet4dbp/ · DBP Conference 2025 Vienna book of abstracts (repositum.tuwien.at) — checked 2026-08-31 (search-verified).
- **What:** professional network (est. 2020, TU Delft 3D geoinformation among anchors) around digital building permits; outputs are a validated DBP **maturity model** (2025), conference proceedings 2024/2025 (e.g. semi-automated building-height verification in Italy; AI assistant for interpreting building regulations), best-practice reports.
- **Class:** D-adjacent (community/knowledge, no code, no data). Licence colour: n/a (publications).
- **Pryzm action:** **MONITOR + CONTRIBUTE (visibility play).** The 2025 conference material is a map of which EU jurisdictions are automating rule checking — recruitment ground for country-adapter knowledge; presenting PRYZM's envelope-compiler provenance model there is a low-cost credibility channel.

### 13. PlanX-CAD — disambiguated (two distinct things)
- **(a) Literal match:** "PlanX CAD Toolset" — QGIS plugin, 18+ CAD drafting features for urban planning workflows, Dokuz Eylül University (TR). https://plugins.qgis.org/plugins/planX_CAD_arac_Seti/ — checked 2026-08-31. Drafting convenience, irrelevant to rules/envelopes. **Action: none.**
- **(b) The planning-relevant PlanX:** Open Systems Lab's **PlanX** (https://opendigitalplanning.org/planx · https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/748096929311324) — CMS for LPAs to build data-driven planning services; **in use by 16 English Local Planning Authorities**; flagship service "Find Out If You Need Planning Permission". Checked 2026-08-31 (search-verified; repo theopensystemslab/planx-new not yet fetched).
- **What (b) proves:** rules-as-data planning-decision flows are deployable at government scale in the UK; its model is QUESTIONNAIRE-driven (user answers + GIS constraint layers), not parcel-geometry-driven envelope computation — adjacent, not overlapping, to PRYZM Product B.
- **Class:** B + C. Licence: open-source (verify exact licence on repo before any reuse). Colour: provisionally GREEN, unverified.
- **Pryzm action:** **MONITOR (UK adapter research input).** Its constraint-layer registry for England (article-4 directions, conservation areas, listed buildings) is a concrete UK source catalogue to mine.

### 14. Polis (France) — NOT RESOLVED under that name
- Three targeted searches 2026-08-31 (FR planning context: "Polis urbanisme PLU", "Polis plateforme urbanisme 2025", "polis site analysis France PLU/GPU") surfaced NO French planning tool named Polis.
- Nearest real candidates surfaced instead: **PLU Analyzer** (interactive PLU consultation over official IGN + GPU APIs — https://www.data.gouv.fr/reuses/plu-analyzer-donnees-durbanisme-et-telechargement-de-plu) · **InfoPLU** (https://www.infoplu.fr/ — address-queryable, sourced answers linked to articles/pages of official documents) · the **POLIS Network** (polisnetwork.eu — EU cities network, TRANSPORT, almost certainly not the referent).
- **Honesty rule applied:** recorded as UNRESOLVED-NAME, not as missing capability. Founder should clarify the referent. The underlying French capability the brief cares about (GPU APIs + PLU rule structuring) exists — see the FR data lane.
- **What the near-misses prove (feasibility):** two independent French tools already deliver address→PLU-rules-with-article-citations over PUBLIC APIs — the document-derived rule path for FR is commercially practised, not hypothetical.

### 15. Envelope — disambiguated: envelope.city (NYC, 2015–2018 era)
- **URLs:** https://www.archpaper.com/2017/05/envelope-startup-zoning/ · https://www.crainsnewyork.com/article/20180131/REAL_ESTATE/180139977/ · https://www.crunchbase.com/organization/envelope-city-inc — checked 2026-08-31 (search-verified).
- **What:** SaaS zoning-envelope engine for NYC: "mapped 100 years of zoning into a proprietary zoning rules engine", parametric 3D massing (setbacks, FAR, air rights, assemblages), spun out of an architecture firm 2015, $2M raised 2018. All substantive coverage is 2017–2018; no 2024–2026 activity surfaced → treat as dormant/legacy until proven otherwise.
- **Class:** precedent only (US, proprietary). Licence colour: RED (proprietary).
- **What it proves:** a city-scale "ordinance-as-algorithm + 3D massing" product was buildable in 2016 with ONE jurisdiction's rules — and single-jurisdiction depth without a replication standard did not scale into a durable company. PRYZM's per-country adapter + replication-standard approach is the direct answer to that failure mode. **Action: none (history lesson).**

### 16. Swiss Zoning API + BZOdigital — recorded as found/not-found
- **"Swiss Zoning API":** no third-party OSS project by that exact name found (2 targeted searches 2026-08-31). What EXISTS and answers the brief's intent: the official **geo.admin.ch RESTful API + WMS/WMTS over `ch.are.bauzonen`** — the ARE-harmonised building-zones dataset for all of Switzerland (9 harmonised main uses; https://opendata.swiss/en/dataset/bauzonen-schweiz-harmonisiert — checked 2026-08-31). Class C, colour GREEN (opendata.swiss terms; verify attribution string). **Action: CONSUME (CH adapter), option 1/2.**
- **BZOdigital:** NOT FOUND after 3 searches incl. exact-name (`bzodigital` resolves to an Indian billing SaaS). What exists instead for Zürich: BZO geodata as open data (DXF/GPKG/GeoJSON, daily refresh, extracted from ÖREB-Kataster — https://data.stadt-zuerich.ch/dataset/geo_nutzungsplanung___kommunale_bau__und_zonenordnung__bzo_) and the BZO 2016 statute via oerebdocs.zh.ch; a BZO revision is in public consultation (Mar–Jun 2026). **Recorded as UNRESOLVED-NAME; the Zürich machine-readable zoning capability itself is real and open.**

---

## PART 2 — Broader OSS sweep (zoning engines, XPlanung, cadastral toolkits, 3D city, planning-AI)

### 2.1 xPlanBox / DiPlanung `ozgxplanung` — the German government XPlanung stack IS open source
- **URL:** https://gitlab.opencode.de/diplanung/ozgxplanung — checked 2026-08-31 (search-verified incl. repo tree).
- **What:** lat/lon GmbH's xPlanBox, open-sourced April 2022 on openCoDE (public-administration OSS platform), now developed as DiPlanung/ozgxplanung under the OZG "Einer-für-Alle" programme. Components: **XPlanValidator** (syntactic + geometric + semantic XPlanGML validation; web + CLI + API), xplan-webservices (incl. validator WMS), manager/services for storing and serving XPlanGML; built on **deegree**. Branch `xplanbox-7.0` exists → actively versioned through 2025–2026.
- **Licence:** openCoDE requires OSS; exact licence file not yet read — verify before any linkage. Colour: provisional GREEN-as-tool.
- **Class:** B + C. **⭐ Lane lesson:** German administration OSS lives on **gitlab.opencode.de, not GitHub** — a GitHub-only sweep structurally misses the most production-grade German planning software. (Same error class as GetCapabilities-is-not-an-inventory.)
- **Pryzm action:** **WRAP/DEPEND ON (pipeline-side) for the DE adapter's XPlanGML validation + parsing**; do NOT rebuild an XPlanGML parser. The rule-EVALUATION layer on top (XPlanGML → parcel envelope) still does not exist anywhere in this stack → PRYZM IP (H).

### 2.2 pyramid_oereb (openoereb) — Swiss PLR/ÖREB cadastre server
- **URL:** https://github.com/openoereb/pyramid_oereb — checked 2026-08-31 (repo fetched).
- **Verified facts:** 9 stars, 22 forks, **4,531 commits** (deep, multi-canton production use despite low stars), Python/Pyramid, PostgreSQL/PostGIS, Docker; licence file present but type not shown on page — read before use.
- **Class:** B + C-shape. Colour: provisional GREEN (verify LICENSE.txt).
- **Pryzm action:** **MONITOR; consume its DATA MODEL.** PRYZM does not need to run an ÖREB server; pyramid_oereb's schema is the reference shape of Swiss public-law restrictions per parcel — the CH adapter should read official ÖREB extracts, using this repo as schema documentation.

### 2.3 liip/open-swiss-buildings-api
- **URL:** https://github.com/liip/open-swiss-buildings-api — checked 2026-08-31 (search-verified).
- API over the Swiss federal buildings register (GWR), resolving inputs to address/building lists. Class B + C. **Action: MONITOR** (CH adapter convenience; official GWR is the source).

### 2.4 3DBAG / roofer + geoflow — national-scale LoD2 reconstruction, ALIVE and cadastre-funded
- **URLs:** https://github.com/3DBAG/roofer · https://github.com/geoflow3d · https://github.com/3DBAG — checked 2026-08-31 (search-verified incl. README).
- **Verified facts:** roofer = "fully automatic LoD2.2 building reconstruction from a pointcloud and a roofprint polygon"; outputs LoD1.2/1.3/2.2; C++ with Python bindings; born summer 2024 as the refactor of geoflow's gfp-building-reconstruction; **funded 2024–2026 by Kadaster (NL)**; it is the engine behind the 3DBAG national dataset.
- **Class:** B (+E: it is the DERIVABILITY engine — any country with lidar + footprints can be lifted to LoD2). Colour: read licence file before embedding (geoflow lineage was GPL-3 — assume YELLOW-by-architecture, external-process only, until read).
- **Pryzm action:** **DEPEND ON (as external pipeline) where PRYZM must MANUFACTURE LoD2** — e.g. ES (PNOA lidar + Catastro footprints), FR (LiDAR HD + BD TOPO). Highest-leverage OSS item in this lane for Product A: it converts two datasets the target countries already publish into the 3D context layer the product renders. Kadaster funding through 2026 = maintained.

### 2.5 DTCC Platform (Chalmers Digital Twin Cities Centre, SE)
- **URLs:** https://github.com/dtcc-platform/dtcc · https://platform.dtcc.chalmers.se (v0.9.6) — checked 2026-08-31 (search-verified).
- **Verified facts:** **MIT licence**, 35 repos (dtcc-core, viewer, sim, mesher, atlas…), Vinnova-funded, city-scale mesh generation from open Swedish data (lidar + footprints).
- **Class:** B. Colour: GREEN. **Pryzm action:** **MONITOR** (SE adapter accelerant; overlaps roofer — prefer roofer for buildings). Not a dependency today.

### 2.6 zoning.space — the cautionary tale
- **URL:** https://github.com/zoningspace/zoning.space — checked 2026-08-31 (search-verified).
- US "machine-readable zoning data" project; effectively dormant (pre-2020 era). Proves the graveyard risk of hand-encoding zoning without a funded update loop. **Action: none (pattern evidence for sustainability questions).**

### 2.7 US pattern evidence (not Europe; one line each — checked 2026-08-31)
- **LightBox Zoning API** (https://github.com/api-evangelist/lightbox-zoning-api — listing created 2025-01, updated 2026-05): commercial parcel-level zoning-attributes API (districts, uses, setbacks, FAR, heights) — the US already has PRYZM-Product-B-shaped data as a paid API. Class C, RED (proprietary).
- **Zoneomics × Autodesk Forma** "3D Envelope by Zoneomics" (2024-08-19 — https://blogs.autodesk.com/forma/2024/08/19/autodesk-and-zoneomics-partner-to-bring-zoning-responsive-building-envelopes-to-forma/): zoning-responsive envelopes inside Forma, **US + Canada cities only**. ⭐ Direct competitive intel: the Forma frame PRYZM measures itself against is actively importing zoning envelopes via partnership — and has NO European zoning source to plug in. The European Zoneomics does not exist; that seat is open.
- **ALPA skills-for-architects `/zoning-envelope`** (https://alpa.llc/skills/zoning-envelope/ · AlpacaLabsLLC/skills-for-architects): LLM-skill rendering lot + setbacks + buildable volume + FAR panel from GIS data — envelope UX is commoditising at the toy level; the moat is jurisdictional rule DEPTH + provenance, not the 3D viewer.
- **ReadyPermit MCP**: AI zoning/buildability analysis via MCP (US) — same lesson.

### 2.8 IGNF/geoportail-urbanisme-dev
- **URL:** https://github.com/IGNF/geoportail-urbanisme-dev — checked 2026-08-31 (search-verified). Official GPU developer-documentation repo — the FR adapter's front door. Class C-docs. **Action: CONSUME (FR adapter).**

---

## PART 3 — Startups / competitors solving parcel-to-potential in Europe (2024–2026)

> Shape legend: COMPETITOR (overlaps Product B) / PARTNER (complementary layer) / ACQUISITION-SHAPED
> (small, data- or rules-asset-heavy, strategically adjacent) / BENCHMARK (bigger than us in their country).

### 3.1 Syte GmbH (DE) — the German benchmark
- **URLs:** https://www.syte.ms · https://www.syte.ms/news/finanzierungsrunde · starting-up.de profile — checked 2026-08-31.
- **Verified:** founded 2021, Münster; AI platform returning development + energy + renovation potential **for any address in Germany within seconds**; **€5M seed 2024-09 led by Schwarz Group** (plus Vantage Value, vent.io, HTGF); **€8.2M raised total; 30+ employees**; German AI Prize 2023 winner; sells to developers AND to Behörden/Kommunen (dedicated public-sector product page).
- **What it proves:** nationwide DE parcel-to-potential with seconds-latency is FEASIBLE and FUNDED — B-Plan/§34 heterogeneity did not stop them; and German public-sector demand exists. It does NOT (per public material) expose deterministic rule-by-rule provenance or a BIM-grade envelope→design pipeline — its output is analysis, not a design-tool substrate.
- **Shape:** **COMPETITOR + BENCHMARK (DE).** Too big to acquire, too direct to partner. PRYZM's DE wedge must be what Syte lacks: provenance-traced envelopes feeding an actual BIM editor.

### 3.2 Kel Foncier (FR) — the French incumbent
- **URLs:** https://kelfoncier.com · https://frenchproptech.fr/listing/kel-foncier/ — checked 2026-08-31.
- **Verified:** founded 2015, 45 employees, CEO Eduardo Larrain; claims **the largest land database in France: ALL local urban plans (PLU), buildable potential of every plot, owner identification**, 50+ search criteria; coverage "from Lille to Réunion"; Pass French Tech laureate.
- **What it proves:** ten years of encoding French PLUs nationwide is a done, paying business — the document-derived rule path (brief §3 category 2) scales commercially in a country with 35k communes. Their product is land PROSPECTION (find + contact owner), not 3D envelope design.
- **Shape:** **COMPETITOR (FR, prospection axis) / BENCHMARK.** Their existence VALIDATES the FR rule-encoding cost model; their decade head start means PRYZM should not compete on French rule-encoding breadth — enter FR via the design/BIM differentiation or via GPU-machine-readable subsets first.

### 3.3 Amenti AG (CH)
- **URL:** https://amenti.ch/ — fetched 2026-08-31.
- **Verified:** Swiss feasibility-study platform; claims **"the largest building-law database in Switzerland"**; computes volumes + floor areas per use, project returns, regulatory compliance, PV facade potential, CAD export; **delivery "within one hour"** (⇒ hybrid human/automated pipeline, NOT instant compute — the latency betrays the architecture).
- **Shape:** **COMPETITOR (CH).** The one-hour turnaround and CAD export are the tells: they solved rule DEPTH with humans in the loop. A deterministic seconds-latency envelope with provenance beats them on speed; they beat entrants on Swiss rule depth. **ACQUISITION-SHAPED only for its rule database** (if ever for sale).

### 3.4 UrbanMetrix SA (CH, Ticino) — NEW 2026
- **URLs:** https://urbanmetrix.com · https://www.startupticker.ch/en/news/contech-urbanmetrix-launches-site-analysis-software-with-strong-momentum · venturekick.ch/urbanmetrix — checked 2026-08-31.
- **Verified:** launched **June 2026**; environmental site analysis + early design (views, sunlight, noise, wind) on empty sites/facades; auto-gathers geodata, accepts user 3D models, 3D visualizer; pilots with planners/developers/AEC; Prix SIA 2026 Public Award; Archimethod spin-off (Michele Leidi); Venture Kick backed.
- **Shape:** **PARTNER-shaped, not competitor** — it is the environment/comfort layer, no zoning-rule engine claimed. Also evidence the CH early-stage market is heating (Amenti + UrbanMetrix + 486 companies on the SwissPropTech 2025 map, up from 429 mid-2024 — startupticker).

### 3.5 Resights ApS (DK)
- **URLs:** https://resights.dk · https://resights.dk/datakilder/ — checked 2026-08-31.
- **Verified:** Danish property-data platform aggregating **25+ public registers** (BBR, CVR, EJF, tinglysning, **Plandata.dk lokalplaner**); REST API with **2,500+ variables**; CAD files + building geometry + local plans on interactive maps.
- **What it proves:** in structured-rule Denmark the DATA layer is already a commodity platform — PRYZM's DK adapter can likely license/read the same public sources directly (they add convenience, not exclusivity).
- **Shape:** **PARTNER (data source/API) or ignore; competitor only if they climb to envelope computation** (no sign of that — they sell data access, not geometry).

### 3.6 Searchland + LandTech (UK)
- **URLs:** https://searchland.co.uk (incl. /features/planning-constraints, /api, /competitors/searchland-vs-landtech) — checked 2026-08-31.
- **Verified:** both active 2025; Searchland: constraint filtering (flood, green belt, heritage), ownership, planning history, "30+ years of planning data updated daily", AI search builder, public API; £2.3M seed 2022 (uktech.news).
- **Shape:** **COMPETITORS (UK sourcing axis), neither computes deterministic 3D envelopes.** UK's discretionary planning system (no as-of-right envelope) makes Product B's deterministic promise structurally weaker there — consistent with UK being outside PRYZM's priority-country set.

### 3.7 Hektar (SE) — hektar.ai
- **URLs:** https://www.hektar.ai — checked 2026-08-31 (search-verified profile).
- **Verified:** established 2020, Västra Götaland (SE); cloud generative-design for early-stage development: evolutionary algorithms produce volume studies, density scenarios, KPIs from raw land; housing typologies (quarter blocks, lamellas, point houses); **adopted across the Nordics since spring-2024 launch**; used by developers, architects AND municipalities.
- **Shape:** **COMPETITOR on the generative-massing axis** (overlaps PRYZM's typology pipeline — already tracked internally as the "Hektar gap"), **not on the rules axis** (no zoning-rule automation claimed — sites are configured by the user). The Nordics municipal adoption is the notable 2024–2026 delta.

### 3.8 Spain: VisualUrb, Virtual Mike (+ VEDA Madrid, official)
- **URLs:** https://www.visualurb.es · https://virtualmike.ai · https://www.esmartcity.es/2025/05/13/veda-madrid-nuevo-visor-online-datos-edificabilidad-ambitos-urbanisticos-ciudad — checked 2026-08-31.
- **VisualUrb:** web delivering per-parcel urban regulation — **edificabilidad, altura, ocupación, uso** — "ordered normative access" for professionals. Direct overlap with PRYZM's Spanish envelope INPUTS; no 3D envelope generation claimed. **COMPETITOR (ES, data/consultation axis).**
- **Virtual Mike:** per-parcel legal + fiscal + urbanistic report, official sources, **delivered in 1–3 working days** — human-in-loop. Proves paid Spanish demand AND that automation is NOT solved (days, not seconds). **Benchmark of the gap PRYZM's ordinance-as-algorithm already beats in Barcelona.**
- **VEDA Madrid (official, 2025-05):** Madrid city launched a public edificabilidad viewer with downloadable, reusable data per ámbito urbanístico. Not a startup — hand to the ES data lane: it is a NEW machine-readable Madrid source (checked date 2025-05-13 launch coverage).

### 3.9 Poland: OnGeo.pl, sigm-a.pl, Dzialki360 — report generators under a moving reform
- **URLs:** https://ongeo.pl/mpzp-dzialki · https://blog.ongeo.pl/potencjal-inwestycyjny-dzialki · https://sigm-a.pl/ · https://www.dzialki360.pl/ — checked 2026-08-31.
- **Verified:** parcel-report SaaS (MPZP extract, investment potential, hazards) by parcel/KW/TERYT; sigm-a markets off-market + MPZP/POG analytics. All are REPORT products, no envelope geometry. The **2025 planning reform (plan ogólny/Rejestr Urbanistyczny)** is live market context (factorycentrum.pl commentary) — per the brief's warning, PL rules are shifting under everyone's feet; report vendors will have to re-encode, and so would PRYZM (advantage: adapter architecture + reform-era machine-readable registers).
- **Shape:** low-threat local COMPETITORS; the reform is the real story.

### 3.10 Netherlands: Percelio, Kavelscout, KadastraleKaart — and a conspicuous gap
- **URLs:** https://percelio.nl/kenniscentrum/kavelpaspoort-maken · https://kavelscout.nl · https://kadastralekaart.com — checked 2026-08-31.
- **Verified:** Percelio auto-assembles per-parcel reports from dozens of public sources "in minutes"; Kavelscout finds split-potential parcels; KadastraleKaart provides free cadastral browsing incl. omgevingswet views.
- **The gap:** despite NL being Europe's most digitised planning regime (DSO, STOP/TPOD, machine-readable omgevingsplan rules), **no Dutch SaaS surfaced that computes deterministic 3D buildable envelopes from the omgevingsplan**. If the NL lane's data audit confirms rule machine-readability, NL is the cheapest country in Europe to demonstrate Product B end-to-end — and nobody has taken the seat. (Absence-of-evidence caveat: one search sweep; treat as strong-signal-unproven.)

### 3.11 Tomtly (NO)
- **URL:** https://tomtly.no/tomteanalyse — checked 2026-08-31.
- **Verified:** Norwegian tomteanalyse: retrieves reguleringsplan, **BYA (utnyttelsesgrad), heights**, natural hazards, ground conditions per address; suggests house models with cost estimates. Consumer/SMB-facing.
- **Shape:** **COMPETITOR (NO, consumer axis).** Proves NO rule data (reguleringsplan + BYA) is automatable today — relevant when NO enters the rollout.

### 3.12 Rulemapping Group (DE) — rules-as-code for building permits
- **URLs:** https://digitalebaugenehmigung.de/aktuelles/baugenehmigung-und-ki — checked 2026-08-31 (search-verified).
- **Verified:** pilot "Automatisierte Entscheidungsunterstützung in kommunalen Baugenehmigungsverfahren" started **2025-09-30** with the Thüringen digital ministry (Landkreise Greiz + Saalfeld-Rudolstadt); their rule-based AI "translates" statutes into machine-readable decision logic; further model-commune pilots in Hamburg, München, Stuttgart, Ulm.
- **Shape:** **PARTNER-shaped (DE rules layer) + validation** of the brief §20 split (AI for interpretation, deterministic logic for decisions) — a German state is paying for exactly that architecture in 2025/26.

### 3.13 The empty seat: no European Zoneomics
- **Zoneomics (US):** 2025 recap — 8M zoning tiles served, 1M bulk API calls (https://blog.zoneomics.com/2025-recap-zoneomics-advancing-zoning-intelligence); **Autodesk Forma partnership 2024-08 for zoning-responsive envelopes, US + Canada only**. **Buildability.us:** US REST API + MCP incl. buildable-envelope calculation. **Regrid:** parcel API claiming US/CA + enterprise "Europe" parcels (data reseller). — all checked 2026-08-31.
- **Conclusion, stated carefully:** across every sweep in this lane, **no company was found selling a pan-European zoning/parcel-to-envelope API**. National players exist per country (3.1–3.11); the US has three+; the European cross-border seat is EMPTY as of 2026-08-31. This is the lane's headline finding, and it is time-bound: Zoneomics-into-Forma shows the acquisition channel by which it could close.
- Market-mapping source worth mining for the report: https://stream.estate/blog/real-estate-data-api-europe-complete-guide-2025 (compares 15+ EU property-data API providers; checked 2026-08-31).

---

## PART 4 — Lane synthesis

### 4.1 Rollup table (classification · licence · action)

| Item | Class | Licence | Action |
|---|---|---|---|
| EUBUCCO | A+B | YELLOW (data per-country; code MIT) | CONSUME selectively / MONITOR |
| Overture buildings | A+C | YELLOW (ODbL) | CONSUME (default pan-EU context buildings) |
| Microsoft footprints | A | GREEN (CDLA-P-2.0) | CONSUME via Overture; direct if share-alike-free needed |
| DBSM R2025 (JRC) | A | YELLOW (ODbL) | MONITOR (cross-check only) |
| CityJSON / cjio | B+D | GREEN (MIT) | DEPEND ON (pipeline) |
| FlatCityBuf | B+D | GREEN (MIT) | TRIAL → DEPEND ON (wrapped) |
| SAGisXPlanung + QGIS cluster | B | YELLOW-arch (GPL-3) | MONITOR (authoring side only) |
| xPlanBox / ozgxplanung (openCoDE) | B+C | verify licence | WRAP for DE XPlanGML validate/parse |
| AMX-26 (Japan) | B | GREEN (CC0) | MONITOR as pattern |
| Mapterhorn | A+B | GREEN (attribution) | CONSUME/DEPEND ON (terrain, non-wired countries) |
| Open Cadastral Map (OME2) | A+C | YELLOW (per-source) | CONSUME as source registry seed |
| ACCORD / AEC3PO / BCRL | D+B+F | YELLOW (partly unlicensed) | ADAPT concepts; MONITOR |
| EUnet4DBP | D-adjacent | n/a | MONITOR / CONTRIBUTE (visibility) |
| PlanX (OSL, UK) | B+C | verify | MONITOR (UK source catalogue) |
| pyramid_oereb | B | verify | MONITOR; consume data model |
| roofer / 3DBAG | B+E | verify (likely GPL-arch) | DEPEND ON as external pipeline (LoD2 manufacture) |
| DTCC Platform | B | GREEN (MIT) | MONITOR |
| Syte, KelFoncier, Amenti, Hektar, Tomtly, VisualUrb, OnGeo… | — | RED (proprietary) | competitive intel only |

### 4.2 What 2024–2026 changed (the recency findings the brief asked for)
1. **roofer** (2024, Kadaster-funded to 2026) industrialised LoD2-from-lidar — LoD2 is now MANUFACTURABLE per country, not a dataset you wait for (E, not G).
2. **FlatCityBuf** (2025 paper) gives 3D city models the PMTiles treatment — cloud-optimised, range-request, browser-decodable (MIT).
3. **Mapterhorn** (2024–2026, NLnet) does the same for terrain, run as a commons.
4. **Overture's monthly GeoParquet + GERS** matured into the practical federation backbone for context buildings.
5. **Zoneomics→Forma** (2024-08) proves design tools now BUY zoning envelopes — and have nothing to buy in Europe.
6. **Syte's €5M from Schwarz Group** (2024-09) prices the German market's belief in parcel-to-potential.
7. **Rulemapping × Thüringen** (2025-09) puts public money behind statutes-to-decision-logic — the brief §20 architecture is being procured, not just researched.
8. **PL 2025 reform + VEDA Madrid 2025** — machine-readable rule surfaces are EXPANDING; adapter architecture (not hand-encoding) is the right bet.

### 4.3 The G/H verdict for this lane (what genuinely does not exist)
- **G (missing everywhere, OSS and commercial):** a country-rule-independent, deterministic **parcel→envelope engine with per-rule provenance**, machine-consumable, pan-European. Parsers exist (xplanbox), permit-rule languages exist (BCRL), per-country analysis SaaS exists (Part 3), generative massing exists (Hektar/Forma) — the connecting engine does not. This matches brief §22's expected MUST-BUILD, now evidence-backed rather than assumed.
- **H (PRYZM IP, confirmed by absence):** the envelope compiler + evidence-graph provenance (PRYZM already runs an ordinance-as-algorithm pipeline in production for Barcelona — ADR-0271 lineage — which nothing found in this lane replicates).
- **NOT missing (do not build):** footprints, terrain tiles, 3D formats, XPlanGML parsing/validation, cadastral findability, CityJSON tooling — all A–D above.

### 4.4 Honest gaps in this lane (record of what was NOT verified)
1. **Licence files not read** for pyramid_oereb, roofer/geoflow, xplanbox/ozgxplanung, PlanX (OSL), CODE-ACCORD — each marked "verify" above; none is load-bearing for a today-decision.
2. **EUBUCCO per-country data licences** not enumerated (the site omits them; the Zenodo record would settle it).
3. **Three names from the brief unresolved:** Polis (FR context), BZOdigital, "Swiss Zoning API" as a proper noun — 2–3 searches each; recorded as UNRESOLVED-NAME with nearest-real-thing documented, per the honesty rules. Founder clarification requested.
4. **Startup claims are vendor-stated** (Syte latency, Amenti "largest database", KelFoncier "all PLUs") — verified as CLAIMS with sources, not as measured capability; none was product-tested.
5. **GitLab-wide / CORDIS-wide sweeps not exhaustive** — opencode.de was reached via targeted search only; a systematic `gitlab.opencode.de/explore` + CORDIS 2025–2026 crawl is a follow-up for the report lane.
6. **No API probing was performed in this lane** (GetCapabilities-style) — this lane is repos/companies; live-API probes belong to the country data lanes.
7. Stars/commit dates were read from fetched pages 2026-08-31; GitHub pages sometimes omit last-commit dates in the fetched rendering — where a date is absent above, it was genuinely not shown, not skipped.

*Lane complete 2026-08-31. Deliverable: this file. Digest returned to orchestrator.*
