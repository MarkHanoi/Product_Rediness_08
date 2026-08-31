# PRYZM — EUROPEAN SITE INTELLIGENCE: DATA & ARCHITECTURE AUDIT — REPORT

> Campaign `europe-site-intel` · Synthesised 2026-08-31 from seven research lanes. Authority for
> scope: `BRIEF.md` (§31 sections A–T). Evidence base: the lane files under `lanes/` — every
> load-bearing claim below cites its lane file; nothing here was re-researched. Where a lane could
> not confirm something the report says **NOT CONFIRMED**. Where lanes disagreed, the resolution
> rule was: **a probed API/page beats a described one**; each resolution is flagged inline and in
> §A.4. The governing tie-breaker throughout (BRIEF §34): **own as little raw data infrastructure
> as possible.**
>
> Lane files (the authority for every cited fact):
> L1 `lanes/eu-infrastructure-and-standards.md` · L2 `lanes/germany-denmark-switzerland.md` ·
> L3 `lanes/spain-france-portugal.md` · L4 `lanes/netherlands-poland-lithuania-estonia.md` ·
> L5 `lanes/rest-of-europe-sweep.md` · L6 `lanes/oss-and-startups-2024-2026.md` ·
> L7 `lanes/pryzm-internal-review.md`

---

# A — EXECUTIVE SUMMARY

## A.1 The five findings that decide the architecture

1. **The central INSPIRE infrastructure was dismantled mid-2026; country adapters are now the ONLY
   architecture the EU landscape supports.** The INSPIRE Geoportal 301-redirects to
   data.europa.eu (L1 own probe, 2026-08-31); the Reference Validator shut 2026-03-31 with "no
   replacement planned"; the GreenData4All proposal COM(2025) 985 deletes the interoperability
   mandates and the central-geoportal obligation from the directive (L1 §A.1). "Harvest Europe
   through INSPIRE" is the wrong mental model; the national endpoints keep running unchanged and
   are what PRYZM already consumes. data.europa.eu survives as a source-DISCOVERY registry
   (DCAT/SPARQL), not a data plane.

2. **Federation + conflation rules beats any master building dataset — the brief §16 expectation
   is CONFIRMED by evidence, not preference.** Every attempted European master froze and staled
   within a release cycle (EUBUCCO v0.1 2023, DBSM built on the already-superseded v0.1 with
   "irregular" updates — L1 §C.1/F). The one continuously-conflated global set (Overture, monthly,
   GERS stable IDs) is attribute-poor exactly where national LoD2/cadastre are rich. Winning shape:
   Overture backbone (Tier C, already prototyped) + national LoD2/cadastre override (Tier A/B,
   already designed) + EUBUCCO/DBSM attribute joins for year/use — with per-source provenance and
   priority. **Adopt GERS as the cross-source conflation key** (L1 §F.2). Four lanes independently
   confirm federation (L1 §F, L2 DE-5, L4 summary #3, L5 synthesis).

3. **No adoptable zoning rule engine exists anywhere.** BCRL has no public spec/engine repo
   (probed org listing, L1 §E.2, L6 §11); OpenFisca has zero spatial/planning users found (L1
   §G.5); Drools/SHACL fail on architecture fit; NL DSO STTR/DMN is the lone structured-rule
   production system and is a national service, not a library (L1 §G.6). What IS adoptable:
   **patterns** — OpenFisca time-versioned parameters, RASE annotation, the CODE-ACCORD corpus
   (Apache-2.0), and the state-run rule vocabularies (IMOW value lists, XPlanung attributes,
   PlanDK2/3, LT ASGR columns). The **geometric applicability + envelope engine is G (missing) →
   H (PRYZM IP)** — confirmed by every EU project ending semi-manual (ACCORD/CHEK, L1 §E.3) and by
   the commercial sweep (L6 §4.3).

4. **The pan-European parcel-to-envelope seat is EMPTY as of 2026-08-31 — and it is time-bound.**
   National players exist (Syte DE €8.2M, Kel Foncier FR, Amenti CH, Hektar SE, Tomtly NO,
   PDMFacil PT…), the US has three+ (Zoneomics, Buildability, Envelope-legacy), Autodesk Forma
   already BUYS zoning envelopes via the Zoneomics partnership — **US + Canada only, with nothing
   European to plug in** (L6 §3.13). Nobody found in any lane serves deterministic envelopes with
   per-rule provenance. That is PRYZM defensible layer, and the Forma acquisition channel is how
   the window could close.

5. **PRYZM is not starting from zero on any audited axis — and its existing storage/adapter/AI
   architecture already matches the brief target.** ~20 registered parcel providers over 8+
   live keyless national cadastres, a 30-entry rule-pack registry with refusal-as-first-class-answer,
   a ~7,300-line deterministic envelope engine with per-number derivation traces, an
   ordinance-extraction gate battery, and a 15-country dated probe corpus (L7 §0). The two real
   divergences from the brief target: **rule packs are TypeScript code, not data** (the §18
   engine evaluation was never done internally — now done by L1 §G) and **no valid_from/valid_to
   versioning exists anywhere** (L7 §10). Both are refactors of existing seams, not rebuilds.

## A.2 The country landscape in one paragraph

Ten countries serve **machine-readable planning rules today or this quarter**: NL (typed norm
objects in BOTH regimes, free API key — L4 NL-1), EE (per-plot ehitusõigus incl. served max-GFA,
keyless — L4 EE-1), DK (keyless Plandata WFS with measured national fill and a denominator
codelist — L2 DK-1/2), LT (national ASGR with per-value provenance at ~14–18% fill — L4 LT-1),
PL (zone-level POG GML landing Q3–Q4 2026 — L4 PL-2), plus a six-country "structured-plan family"
publishing plan geometry through ONE national channel each: SE, FI, NO, LU, LV, SI (L5 synthesis
#1). DE is a PDF-extraction country with an 82k-plan machine-served document index and structured
XPlanGML only in MV-class Länder (L2 DE-1). CH hands a per-parcel restriction→exact-law evidence
chain (ÖREB) but zero structured numerics (L2 CH-1). ES/FR/PT are PRODUCT-A green on national
spines with document-bound rules (FR closest on plumbing, ES-Madrid on payload — L3 synthesis).
The cadastre axis is effectively solved in ~25 of 30 countries; the exceptions are structural
(UK/IE no cadastre by design, MT incomplete, HU fee-gated, GR/RO/BG incomplete fabric — L5
synthesis #3). **No country serves complete numeric envelope rules: the rules axis converges at
5–50% everywhere** (L5 synthesis #4). The envelope layer is state-served NOWHERE (20/20 chains,
§R).

## A.3 What to do (compressed; full lists §H/§S, decisions in DECISION-SUMMARY.md)

- **Architecture: Option C (hybrid)** — query parcels/rules dynamically, cloud-optimise bulky
  context, store derived-only envelopes + evidence graph. This is what PRYZM already runs (§H).
- **Stop building:** terrain-tile compilation (trial Mapterhorn), ES/FR nDSM differencing (states
  pre-computed it), any new hand-written TypeScript rule pack beyond the migration pilot, XPlanGML
  parsing from scratch (§H.3 DO-NOT-BUILD).
- **Build immediately:** request the free NL DSO keys (a form, not procurement — L4 NL-1);
  declarative rule envelope + versioned parameters; wire the existing attribution layer into an
  evidence graph; EE then NL adapters (§S).
- **Sequencing:** EE → NL → LT → (PL after 2026-11-30), in parallel: DK corrections + the
  Nordic/structured family, then document-rule countries on the extraction pipeline (§S).

## A.4 Lane contradictions found and resolved

| # | Contradiction | Resolution (probed beats described) |
|---|---|---|
| 1 | **Microsoft GlobalML licence**: L1 §F.1 table says ODbL (YELLOW, read via Overture source breakdown); L6 §1.3 says **CDLA Permissive 2.0** (GREEN, "page exact words", repo fetched 2026-08-31) | L6 fetched the repo page → CDLA-P-2.0 stands as the reading. **But the two lanes disagree on a load-bearing licence — VERIFY the repo LICENSE file verbatim before any direct (non-Overture) MS ingestion.** Both lanes agree on the action: consume via Overture by default. |
| 2 | **DK structured-rule rate**: PRYZM internal tracker figure "~96%" (quoted in L4 ranking table) vs L2 live-measured national fill (30.6% plan-level / 43.1% sub-area / 60.8% ramme / 100% doklink) | L2 WFS `resulttype=hits` measurements are the authority. The ~96% measured a different thing (machine-readability of the delivery channel, not value fill). Report uses L2 numbers throughout. |
| 3 | **Microsoft standalone ingestion**: L1 §F.2 "settled: NO"; L6 §1.3 allows direct use "where share-alike-free matters" | Compatible, not contradictory: default = via Overture (one ingestion path); direct MS only for a specifically share-alike-free layer, gated on resolving #1. |
| 4 | **DGT Portugal OGC API**: repo doc (2026-07-31) "Cadastro Predial is NOT on the OGC API" vs L3 PT-1 probe (2026-08-31) serving `cadastro` | L3 probe wins — and is itself the lesson: the platform changed capability inside one month; re-probe before prod is a standing rule. |
| 5 | **DK is "Keyed"** (rollout tracker §5) vs L2 DK-1 probe: Plandata WFS and DAWA are KEYLESS; only Datafordeler is keyed | L2 probe wins; tracker correction recorded in L2 §5.3. |
| 6 | Three names from the brief resolve to nothing: **"Polis" (FR), "Swiss Zoning API", "BZOdigital"** — searched independently by L2 CH-5, L3 FR-5, and L6 §14–16 | All three lanes agree: UNRESOLVED-NAME. The underlying capabilities exist under other names (GPU APIs; geo.admin.ch `ch.are.bauzonen`; Zürich BZO open geodata). **Founder to supply URLs or drop the names.** |

---

# B — THE EU LANDSCAPE (what exists, what died, what to consume)

All facts L1 unless noted; probe dates 2026-08-31.

- **INSPIRE**: the *schemas* survive as normalisation vocabulary (CP is the best-implemented
  theme; PLU is a lossy projection of richer national models — harvest the national model,
  use PLU only where nothing better exists). The *infrastructure* (geoportal, validator,
  registry, harmonisation mandate) is gone or going (L1 §A.1, §A.3). Nothing central certifies
  conformance any more → probe every endpoint (already PRYZM discipline).
- **GreenData4All COM(2025) 985** removes prescriptive data-interoperability rules → expect
  national schema drift 2027–2029; do not hard-code INSPIRE GML application schemas as "the" EU
  format (L1 §A.1).
- **The EU High-Value-Datasets Regulation (EU) 2023/138 is the live forcing function** — it is
  why 15/16 German Länder opened ALKIS (L2 DE-4), why Sweden opened fastighetsindelning in 2025
  (L5 SE), and why the Bavaria holdout is under pressure. HVD, not INSPIRE, is the trend to bet on.
- **data.europa.eu**: harvestable itself (DCAT-AP, SPARQL) — use as the §21 source-discovery
  registry, not a data plane (L1 §A.1.4). Geospatial-filter quality NOT CONFIRMED (L1 gap 7).
- **EuroGeographics OME2 / Open Cadastral Map**: final release covers 15 NMCAs (BE HR CZ DK EE GR
  IE LV LU PL SK SI ES CH NL); project ENDED end-2025, no stated post-project cadence; licence
  text UNVERIFIED (JS portal did not render) → **YELLOW, MONITOR; use as source-registry seed and
  bootstrap fallback only** (L1 §B, L6 §10). The absentees (DE FR IT PT AT SE NO FI) confirm
  national adapters are needed regardless.
- **JRC DBSM R2025**: EU-27 conflation (EUBUCCO v0.1 > OSM > MS), ODbL, "irregular" updates —
  evidence FOR federation; use only for epoch/use cross-checks (L1 §C.1).
- **Copernicus**: Urban Atlas Building Block Height 2021 (10 m, published 2026-01-31) and CLC+
  Backbone — GREEN, fallback height prior only; not parcel-grade (L1 §C.3).
- **EU digital-building-permit projects (ACCORD/CHEK/DigiChecks) all ENDED 2025 with no direct
  successor IA found on CORDIS** (searched; nearest is COMBO 2026–2029, generic compliance LLM,
  not building-permit-specific). They produced methods, corpora, converters, maturity models —
  **no deployed pan-EU rule service or rule database exists to consume.** The
  regulation-digitisation layer remains G at European scale → the core H opportunity (L1 §E.4).
  DigiChecks outcomes NOT individually audited (L1 gap 5).

---

# C — THE OSS LANDSCAPE (verified repos, with actions)

From L6 (repo pages fetched) + L1/L2. Full rollup: L6 §4.1. The load-bearing rows:

| Item | Verified state (2026-08-31) | Licence | PRYZM action |
|---|---|---|---|
| **Overture buildings** | monthly GeoParquet on S3/Azure, GERS stable IDs, conflates OSM+Esri+authoritative(+ES IGN)+MS/Google ML | ODbL (YELLOW) | **CONSUME** as default pan-EU context backbone; adopt GERS as conflation key (L1 §F.2, L6 §2) |
| **EUBUCCO** | 322M bldgs "30 countries"; repo MIT (code only); data licence per-country, NOT stated on site; v0.2 line exists but **NOT CONFIRMED** on eubucco.com (L1 gap 2, L6 §1) | YELLOW data (ODbL default, CC-BY-NC Abruzzo = RED pocket) | **CONSUME selectively** (year/type attributes); never the backbone |
| **Microsoft GlobalML** | 1.4B bldgs, refreshed 2026-08-13; licence: see §A.4 #1 (lane conflict) | GREEN-claimed / VERIFY | **CONSUME via Overture**; direct only if share-alike-free need + licence verified |
| **roofer / geoflow (3DBAG)** | LoD2.2 reconstruction from pointcloud+footprint; **Kadaster-funded 2024–2026**; the engine behind 3DBAG | verify (GPL lineage → external-process only) | **DEPEND ON as external pipeline** where LoD2 must be manufactured (ES: PNOA+Catastro; FR: LiDAR HD+BD TOPO) — highest-leverage Product-A OSS item (L6 §2.4) |
| **FlatCityBuf** | MIT, Rust + TS bindings, 2025 paper, 9–250× faster than CityJSON, whole-NL 70 GB | GREEN | **TRIAL → DEPEND ON wrapped**; only if full semantic LoD2 ever ships to browser; PMTiles+GeoParquet cover today (L1 §D.3, L6 §6) |
| **cjio / CityJSON** | MIT, active, v2.0 | GREEN | **DEPEND ON (pipeline-side)** for national CityJSON ingestion |
| **xPlanBox / ozgxplanung** (gitlab.opencode.de) | THE German government XPlanung stack, AGPL-3.0 (L2 read the LICENSE), active through 9.x tags | AGPL → GREEN as standalone tool, YELLOW to embed | **WRAP: run validator as external service/CLI in DE ingestion QA; consult its schema mappings; never link** (L2 DE-3, L6 §2.1). German admin OSS lives on opencode.de, not GitHub — GitHub-only sweeps structurally miss it |
| **SAGisXPlanung + QGIS cluster** | GPL-3.0, authoring-side (municipality tools) | YELLOW-arch | **MONITOR** — none evaluates a plan against a parcel; the reading/evaluation side is the open gap (H) |
| **pyramid_oereb** | 4,531 commits, multi-canton production | verify | **MONITOR; consume its data model** as CH restriction-schema documentation — do not run an ÖREB server (L6 §2.2) |
| **Mapterhorn** | global terrain PMTiles from Copernicus GLO-30, NLnet-funded, Protomaps-adjacent | GREEN | **CONSUME/DEPEND ON** for non-wired countries; candidate to delete PRYZM hand-written terrain compiler (L6 §9, L7 §8.1) |
| **DTCC Platform** (SE) | MIT, 35 repos, Vinnova-funded | GREEN | MONITOR (SE accelerant; prefer roofer for buildings) |
| **ACCORD outputs** | no BCRL repo; `accord-nlp` Apache-2.0 still moving 2026-05; **CODE-ACCORD corpus** (licence file NOT read — L6 gap 1) | YELLOW (partly unlicensed) | **ADAPT concepts** (RASE, AEC3PO provenance chain); corpus = training/eval data for the extractor, after licence check |
| **AMX-26** | Japanese cadastre→PMTiles, CC0 | GREEN | MONITOR as PATTERN only (the per-country recipe) |
| zoning.space / Envelope (NYC) | dormant / dead | — | history lessons: hand-encoding without a funded update loop dies; single-jurisdiction depth without a replication standard did not scale (L6 §2.6, §15) |

**What OSS does NOT contain (G):** a country-rule-independent deterministic parcel→envelope
engine with per-rule provenance. Parsers exist, permit-rule languages exist, per-country SaaS
exists, generative massing exists — the connecting engine does not (L6 §4.3).

---

# D — STARTUPS & COMPETITORS (2024–2026)

From L6 Part 3, L3 FR-5/PT-3, L5 incumbent watch. Vendor claims verified as CLAIMS, not
product-tested (L6 gap 4).

| Company | Country | Shape | The one fact that matters |
|---|---|---|---|
| **Autodesk Forma** (ex-Spacemaker, NO) | global | BENCHMARK | Owns the massing/optimisation category; imports zoning envelopes via Zoneomics — **US+CA only; no European source exists to plug in** (L6 §2.7, §3.13) |
| **Syte GmbH** | DE | COMPETITOR+BENCHMARK | €5M seed 2024-09 (Schwarz Group), €8.2M total; seconds-latency DE-wide potential. Lacks rule-by-rule provenance + BIM-grade envelope. The DE wedge = what Syte lacks (L6 §3.1) |
| **Kel Foncier** | FR | COMPETITOR (prospection) | Ten years encoding ALL French PLUs — validates the document-rule cost model; do not compete on FR breadth, enter via design/BIM differentiation (L6 §3.2) |
| **Amenti AG** | CH | COMPETITOR | "Largest Swiss building-law DB", delivery "within one hour" → human-in-loop. Deterministic seconds-latency with provenance beats them on speed (L6 §3.3) |
| **Hektar** | SE/Nordics | COMPETITOR (massing axis) | Municipal adoption since 2024; no rules automation — the known "Hektar gap" (L6 §3.7) |
| **Resights** | DK | PARTNER-shaped | Proves DK data is a commodity platform; PRYZM reads the same public sources directly (L6 §3.5) |
| **LandTech / Searchland / Nimbus** | UK | COMPETITORS (sourcing) | Constraint aggregation only; discretionary system prevents deterministic envelopes — UK is a Product-A market (L5 UK, L6 §3.6) |
| **PDMFacil** | PT | competitor evidence | 260+ municipalities federated in real time — proves per-municipal federation is FEASIBLE; RED as a dependency (L3 PT-3) |
| **Parcello, plufr, CityCode, UrbaPlus** | FR | competitors | FR point-lookup is CROWDED; differentiation = deterministic envelope + evidence graph, not PLU summarisation (L3 FR-5) |
| **VisualUrb / Virtual Mike** | ES | competitors | Virtual Mike delivers in 1–3 DAYS (human-in-loop) — the gap the ordinance-as-algorithm engine already beats in Barcelona (L6 §3.8) |
| **OnGeo / sigm-a / Dzialki360** | PL | low-threat | Report vendors; the 2025–2026 reform forces re-encoding on everyone — adapter architecture is the right bet (L6 §3.9) |
| **UrbanMetrix** | CH | PARTNER-shaped | June 2026 launch, environment/comfort layer, no rules engine (L6 §3.4) |
| **Tomtly** | NO | COMPETITOR (consumer) | Proves NO reguleringsplan+BYA is automatable today (L6 §3.11) |
| **Rulemapping Group** | DE | PARTNER-shaped | Thüringen pilot 2025-09: a German state is PAYING for statutes→decision-logic — the §20 architecture is being procured (L6 §3.12) |
| **QMAP** | RO | PARTNER candidate | Does CAD/PDF→GIS plan conversion at scale — evaluate PARTNER/CONSUME before building RO extraction (L5 RO) |
| **The empty seat** | pan-EU | — | **No company sells a pan-European zoning/parcel-to-envelope API** (L6 §3.13) |

Conspicuous gap: despite NL being the most digitised regime in Europe, **no Dutch SaaS computes
deterministic 3D envelopes from the omgevingsplan** — NL is the cheapest country in Europe to
demonstrate Product B end-to-end and nobody has taken the seat (L6 §3.10;
absence-of-evidence caveat recorded).

---

# E — STANDARDS (adoption reality, not paper)

| Standard | Reality 2026 | PRYZM stance |
|---|---|---|
| **OGC API Features + CQL2** | Real and accelerating (PDOK production, Testbed Europe, UK OS NGD) — but the probed planning/cadastre workhorses are still WFS 2.0 (ES Catastro, Hamburg XPlanung) | Adapter fetch layer targets OGC API Features + CQL2 with a WFS 2.0 stored-query/paging fallback — **never OGC-API-only** (L1 §D.1) |
| **PMTiles** | v3 stable, mainstream, already PRYZM production | KEEP (L1 §D.2) |
| **CityGML 3.0 / CityJSON 2.x** | 3.0 is a database/exchange reality (3DCityDB 5.0, DE ~56M LoD2), NOT a download-portal reality — producers publish 2.0/1.0 | Read 2.0 first; CityJSON as internal LoD interchange if ever needed (L1 §D.3) |
| **XPlanung (DE)** | The one national machine-readable planning-law standard that is production-real; `BP_Baugebietsteilflaeche` carries GRZ/GFZ/height/storeys; BUT delivered structured fraction is small (MV-class Länder) — standard ≠ data | CONSUME XPlanGML from Länder WFS; adopt the content model as the canonical GERMAN rule vocabulary (L1 §E.1, L2 DE-1/7) |
| **IMOW / STOP-TPOD (NL)** | Typed norm objects with unit value-lists, quantitative/qualitative/in-regeltekst three-way values — production, both regimes | CONSUME; import the value lists (Eenheid, TypeNorm, Normgroep) as canonical enums rather than inventing (L4 NL-1/NL-6) |
| **STTR/IMTR (DMN, NL)** | The lone production machine-EXECUTABLE rule system in Europe | Existence proof for structured-rule adapters; consume rules directly in NL (L1 §G.6) |
| **PlanDK2/3 (DK)** | De-facto national standard; lifecycle+history layers first-class; `bebygpctaf` denominator codelist | Calibrate the canonical Rule model against it (L2 DK-1/2/5) |
| **APP GML 2.0 (PL)** | National schema with FAR/height/coverage/green per zone + versioning fields; official samples probed | Build the parser NOW off official samples; adapter core for PL (L4 PL-2/7) |
| **SOSI plan (NO)** | National plan object catalogue mandated since 2009; registers mandatory online since 2025-07; NAP 2026 | Structured-family adapter (L5 NO) |
| **CNIG PLU (FR)** | Structures the MAP + prescription typology + idurba versioned document identity — numerics stay in the règlement | One national FR adapter keyed on idurba (L3 FR-2) |
| **BCRL / AEC3PO** | Research artefact; no public engine | Steal RASE + corpus; skip the stack (L1 §E.2/G.1) |
| **OZFS (US, 2025)** | "GTFS for zoning", early/academic | MONITOR; read schema as canonical-model design input (L1 §G.7) |
| **FlatCityBuf** | Research-grade, single-team, MIT | MONITOR (L1 §D.3) |

---

# F — DATA AVAILABILITY MATRIX (30 countries × 7 axes)

Axes per BRIEF §21: contextual-3D / cadastre / planning-geometry / rules / automation / envelope /
confidence, 0–100. **Provenance of rows differs and is marked:** rows for the 20 sweep countries
are L5 lane estimates verbatim (L5 summary table). Rows for the 10 priority countries are
**synthesis estimates derived by this report from L2/L3/L4 findings** — triage numbers, NOT C63
scorecard outputs; the lane files are the authority for every underlying fact. Honest zeros and
low numbers stand.

| CC | ctx3D | cadastre | plan-geo | rules | autom. | envelope | conf. | Source | One-line basis |
|----|------|----------|----------|-------|--------|----------|-------|--------|----------------|
| **DE** | 80 | 90 | 85 | 20 | 45 | 25 | 85 | L2 (synth) | LoD2 free 15/16 Länder (Saarland gap, national product closed); ALKIS keyless 15/16 (BY gated); 82k-plan NRW index; numerics MV-class only (~33% fill where served) |
| **DK** | 85 | 90 | 95 | 60 | 85 | 65 | 90 | L2 (synth) | Keyless Plandata + DAWA; fill measured 30.6/43.1/60.8% by layer + 100% doklink + BR18 defaults; byggefelt geometry unique |
| **CH** | 90 | 85 | 80 | 10 | 55 | 30 | 85 | L2 (synth) | swisstopo OGD everything; ÖREB evidence chain best-in-class; ~0% structured numerics delivered nationally |
| **ES** | 85 | 95 | 55 | 25 | 40 | 35 | 90 | L3 (synth) | Catastro national keyless (foral seams); MDSnE pre-computed heights; per-CA planning; Madrid 70% populated; Barcelona envelope shipped (20.9% citywide resolution) |
| **FR** | 85 | 90 | 85 | 15 | 60 | 20 | 85 | L3 (synth) | GPU serves 2026 PLUs in weeks; MNH LiDAR HD pre-computed; prescription geometry direct incl. height-ceiling polygons; numerics règlement-PDF |
| **PT** | 60 | 45 | 70 | 10 | 40 | 15 | 75 | L3 (synth) | DGT OGC API live incl. cadastro — but central Lisbon = **0 parcels (measured)**; rural 34% BUPi fill; CRUS national classification; regulamento text rules |
| **NL** | 95 | 95 | 95 | 80 | 90 | 60 | 85 | L4 (synth) | The flagship: typed norm objects both regimes (schema-probed), free key; BGT CC0, 3DBAG; data responses unprobed pending key |
| **PL** | 70 | 85 | 60 | 35 | 50 | 30 | 70 | L4 (synth) | ULDK/KIEG keyless; national GeoParquet buildings; POG GML (FAR/height/coverage/green) landing via RU by 2026-11-30; MPZP = raster+text |
| **LT** | 45 | 85 | 85 | 40 | 70 | 40 | 80 | L4 (synth) | ASGR national with per-value provenance, daily FGDB; fill 14–18%; LiDAR soft-gated; state serves 3D allowed-height volumes |
| **EE** | 90 | 95 | 90 | 55 | 85 | 60 | 85 | L4 (synth) | Keyless full stack; ehitusõigus incl. served max GFA; Eesti 3D LoD2 pre-joined to EHR; annual cadastre snapshots since 2012 |
| AT | 70 | 85 | 40 | 15 | 25 | 20 | 55 | L5 | CC BY cadastre snapshots; 9-Länder planning patchwork, rules PDF |
| BE | 80 | 90 | 75 | 35 | 50 | 30 | 70 | L5 | Keyless everything; Flanders DSI has RDF+SPARQL plans (only linked-data plan register found) |
| BG | 30 | 50 | 15 | 5 | 15 | 10 | 45 | L5 | Free viewing, paid extracts; planning per-municipality PDF |
| HR | 50 | 75 | 60 | 15 | 40 | 20 | 50 | L5 | INSPIRE ATOM bulk since 2023; ISPU national plan WMS/WFS |
| CY | 30 | 65 | 55 | 40 | 40 | 35 | 45 | L5 | Zones GIS + numeric coefficient tables = automatable join (sample unverified) |
| CZ | 65 | 90 | 45 | 25 | 45 | 25 | 60 | L5 | Daily-change cadastre feed (best incremental design found); RUIAN floors; NGUP consolidating |
| FI | 75 | 90 | 55 | 50 | 55 | 35 | 70 | L5 | Ryhti/kaavatietomalli rollout; probed open collections are index-level only so far |
| GR | 35 | 55 | 15 | 10 | 15 | 10 | 45 | L5 | Incomplete cadastre; rules FEK-scanned |
| HU | 30 | 35 | 30 | 10 | 20 | 10 | 40 | L5 | Paid Lechner gate; E-ING transition troubled |
| IE | 40 | 30 | 65 | 15 | 30 | 15 | 55 | L5 | No cadastre by design; national harmonized zoning GIS open |
| IT | 55 | 80 | 35 | 10 | 15 | 15 | 65 | L5 | Live CC BY cadastre WFS; rules NTA-PDF, 21 legal mechanisms |
| LV | 60 | 85 | 70 | 35 | 55 | 30 | 55 | L5 | Weekly open cadastre; TAPIS single national plan system |
| LU | 70 | 85 | 80 | 45 | 60 | 40 | 55 | L5 | All PAGs in ONE national GML model — cheapest structured pilot |
| MT | 25 | 10 | 40 | 20 | 15 | 15 | 40 | L5 | No complete cadastre (honest near-zero) |
| NO | 80 | 85 | 70 | 40 | 55 | 40 | 75 | L5 | SOSI plans; registers mandatory online 2025-07; NAP 2026 |
| RO | 35 | 55 | 25 | 10 | 25 | 15 | 50 | L5 | REST cadastre, incomplete fabric; 2024 GIS-PUG standard; QMAP |
| SI | 75 | 95 | 65 | 25 | 55 | 30 | 65 | L5 | Richest open building register (floors+heights+GFA+use) |
| SK | 60 | 85 | 20 | 10 | 25 | 15 | 50 | L5 | HVD cadastre WFS; planning digitisation ~2028 |
| SE | 70 | 80 | 50 | 45 | 55 | 35 | 65 | L5 | HVD cadastre 2025 + NGP detaljplan API open to all; stock scanned |
| UK | 75 | 40 | 55 | 10 | 40 | 10 | 75 | L5 | Product-A market; envelope structurally capped (discretionary) |

Reading: **no country exceeds ~80 on rules; seven reach 40+** (NL 80, DK 60, EE 55, FI 50, SE/LU
45, CY/LT 40) — exactly the H-class gap. Confidence <60 marks countries where lanes ran doc-level
verification only (licence IDs unconfirmed for CZ/HR/LV/GR/RO/BG/CY/MT — L5 gaps).

---

# G — LICENSING MATRIX (per critical dependency)

Colours are lane judgments from primary pages, **not legal review** (every lane own caveat).

| Dependency | Licence | Colour | The binding constraint | Lane |
|---|---|---|---|---|
| Overture buildings | ODbL | **YELLOW** | Share-alike binds DERIVATIVE DATABASES. **The single biggest legal design constraint in the buildings stack: keep source layers SEPARABLE (federate at query time), never physically merge into one DB.** Produced works (renders, envelope calcs) fine with attribution | L1 §F.2.6 |
| OSM / Geofabrik (context bake) | ODbL | YELLOW | Same share-alike calculus; attribution already shipped | L7 §5 |
| EUBUCCO | per-source: ODbL 95%+, CC-BY-SA Prague, **CC-BY-NC Abruzzo** | YELLOW, **RED pocket** | Exclude Abruzzo (source.coop mirror already does); enumerate per-country before commercial use (NOT done — L6 gap 2) | L1 §C.2 |
| Microsoft GlobalML | CDLA-P-2.0 claimed / ODbL claimed | **CONFLICT — VERIFY** | See §A.4 #1 | L1/L6 |
| JRC DBSM | ODbL | YELLOW | Cross-check only | L1 §C.1 |
| ES Catastro | CC BY 4.0 (resolution 2023) | GREEN | Licencia.pdf located but NOT fetched verbatim (READ-level) — fetch before shipping reliance. No massive scraping on OVC query services; ATOM = the mirror product | L3 ES-1.5 |
| FR IGN / GPU / cadastre | Licence Ouverte / Etalab 2.0 | GREEN | Attribution; cadastre not survey-precise | L3 FR-1/3 |
| PT DGT / SNIC / CRUS | CC BY 4.0 | GREEN | BUPi RGG polygon openness NOT CONFIRMED — treat as identity gate, not missing | L3 PT-1/4 |
| NL PDOK (BAG/BGT/BRK/3DBAG/AHN) | Public Domain / CC0 / CC BY 4.0 | GREEN | Kadaster OWNERSHIP data: not open, priced — RED for redistribution, not needed for envelopes | L4 NL-2/4 |
| NL DSO APIs | govt reuse + fair-use | YELLOW-GREEN | Free key; fair-use policy text UNREAD — read before production | L4 NL-1 |
| DK (Plandata, DAWA, Datafordeler) | CC BY 4.0 | GREEN | Keyless critical path; Datafordeler key server-side | L2 DK-4 |
| DE ALKIS (15 Länder) / LoD2 / XPlanung WFS | DL-DE-BY-2.0 (mostly) | GREEN ×15 | **Bavaria ALKIS contract-gated (YELLOW/RED — re-verify at ship, EU HVD pressure)**; BKG national LoD2 aggregate CLOSED — federate the 15 Land downloads | L2 DE-4/5 |
| CH swisstopo OGD | attribution, commercial OK | GREEN | — | L2 CH-4 |
| CH geodienste.ch NPL | per-canton mosaic | **YELLOW** | Capture the per-canton flag matrix before shipping a canton (NOT done — L2 gap) | L2 CH-2 |
| CH ÖREB extracts | public-law cadastre, free | GREEN | Never cache stale law — option 1 strictly | L2 §5.2 |
| LT ASGR/TPDR | public + attribution (VTPSI) | GREEN | "Recommendation-grade" consolidation — legal source is the underlying TPD; geoportal.lt licence text not read verbatim | L4 LT-1 |
| EE Maa-/Ruumiamet open data | custom Estonian licence (fetched): attribution, commercial OK, no share-alike | GREEN | Use maaruum.ee URLs | L4 EE-2 |
| PL (ULDK/KIEG/BDOT10k/3D) | free for any use (2020 Prawo geodezyjne) | GREEN | RU endpoints not yet discoverable (transition to 2026-11-30) | L4 PL |
| SE NGP / Lantmäteriet HVD | CC BY 4.0 | GREEN | Free registration + org onboarding friction (gate, not missing) | L5 SE |
| NO Matrikkelen/NDH | NLOD | GREEN geometry | FKB footprints COMMERCIAL — do not license (internal doctrine); Norge-digitalt agreement gates the national plan copy | L5 NO |
| UK OS MasterMap / Building Heights | commercial | **RED — skip** | Derive from EA LiDAR instead (generalised doctrine) | L5 UK/synth 6 |
| OME2 / Open Cadastral Map | "single open licence" — text UNVERIFIED | YELLOW | Pull the actual licence before any reliance | L1 §B |
| Mapterhorn | OSS pipeline; Copernicus attribution | GREEN | Re-verify per added national lidar source | L6 §9 |
| xPlanBox | AGPL-3.0 | YELLOW to embed / GREEN as tool | External process only | L2 DE-3 |
| roofer/geoflow | GPL lineage — assume | YELLOW-arch | External process only until LICENSE read (NOT read — L6 gap 1) | L6 §2.4 |
| OpenFisca | AGPL-3.0 | YELLOW | Engine adoption would trigger network copyleft — take the PATTERN, not the code | L1 §G.5 |
| CODE-ACCORD corpus | Apache-2.0 per L1; licence file not shown on org page per L6 | GREEN-pending | Check LICENSE file before fine-tuning on it | L1 §G.1, L6 §11 |
| Commercial competitor data (Syte, Kel Foncier, Amenti, Resights…) | proprietary | RED | Competitive intel only | L6 Part 3 |

---

# H — RECOMMENDED ARCHITECTURE

## H.1 The three options, against the evidence

| | **A — Centralised lake** (mirror everything into one DB) | **B — Pure federation** (query everything live, own nothing) | **C — Hybrid** (recommended) |
|---|---|---|---|
| Update burden | Fatal. Every European master attempted (EUBUCCO, DBSM) froze and staled within one release cycle (L1 §F.2.5). PT DGT changed capability inside ONE MONTH (L3 PT-1); 3 of 4 lane-4 countries are mid-regime-transition RIGHT NOW (L4 #4) | None | Low: mirror only bulk artefacts the state publishes AS bulk (LT daily FGDB, EE nightly GPKG, PL GeoParquet, DE LoD2 ZIPs) |
| Legal | Worst: ODbL share-alike attaches to the merged derivative DB (L1 §F.2.6); Bavaria/FKB/MasterMap poison pills | Best | Good: source layers stay separable; derived-only storage (option 5) carries PRYZM-owned provenance |
| Availability/latency | Best once built | Fragile: Matriklen 503 mid-audit (L2 DK-3), DSO maintenance windows (L4 NL-1), fair-use ceilings | Good: live query + LRU cache + bulk mirror for hot paths |
| Cost | Highest (storage + refresh pipelines for 30 countries) | Lowest infra, highest per-query | Scales with usage (§Q) |
| Fit to evidence | Contradicted by L1 §F | Contradicted at scale by probe evidence | **What PRYZM already runs** (L7 §6: "the storage architecture already matches the brief expected hybrid") |

**Recommendation: Option C.** Per-source access policy (BRIEF §10): parcels + live rules =
option 1+2 (query + bounded cache; nothing cadastral mirrored); bulky context (buildings/terrain
tiles) = option 3+4 (mirror → cloud-optimise → PMTiles/GeoParquet on R2); heights/envelopes/
evidence = option 5 (derived-only); discovery = option 6 (data.europa.eu DCAT + OME2 schema +
PRYZM probe corpus as the source registry). ÖREB extracts strictly option 1 (never cache stale
law — L2 §5.2).

## H.2 The minimum European core (BRIEF §21 — what PRYZM owns)

1. Source registry (exists in embryo: registry row comments + `heightSources.mjs` impl table — L7 §1/§5)
2. Adapter SDK (formalise the two existing registries — L7 §11)
3. Canonical model (§I)
4. Evidence graph (§K — attribution layer exists UNWIRED, L7 §4)
5. Rule normaliser + declarative rule format (§L)
6. Applicability engine (the registry tri-state generalised — L7 §2)
7. Deterministic geometry/envelope engine (exists — §M)
8. Confidence/provenance + heatmap engine (extend C63 scorecard — L7 §7)
9. Tile/context infra (exists: PMTiles on R2 — L7 §5)
10. API surface (REST + OGC API Features out; GraphQL only if a concrete consumer demands it)

## H.3 DO-NOT-BUILD (mandatory list; every row cites its evidence)

| # | Do not build | Evidence |
|---|---|---|
| 1 | A pan-EU master building dataset | Federation confirmed; masters freeze (L1 §F.2) |
| 2 | Terrain tile compilation long-term (incl. the hand-written quantized-mesh encoder) | Mapterhorn/Copernicus tilesets exist; keep ONLY datum-lift + façade-rasant sampling (L6 §9, L7 §8.1) |
| 3 | nDSM differencing for ES and FR | States pre-computed it: MDSnE (ES), MNH LiDAR HD (FR) — the remaining job is zonal stats (L3 ES-2/FR-4) |
| 4 | An XPlanGML parser/validator stack | xPlanBox exists (wrap as external tool); xleitstelle test data = free fixtures (L2 DE-3) |
| 5 | An LoD2 reconstruction engine | roofer, Kadaster-funded through 2026 (L6 §2.4) |
| 6 | A rival CH evidence chain | ÖREB IS a working national instance of the §14 evidence graph — consume it, model on it (L2 CH-1) |
| 7 | A cadastre mirror for any country with a live API | Nothing cadastral is mirrored today and nothing needs to be (L7 §6); cadastre solved/gated in ~25/30 (L5 synth 3) |
| 8 | A rule engine on Drools / SHACL / OpenFisca / raw BCRL | All four rejected on architecture fit or non-existence; patterns yes, engines no (L1 §G) |
| 9 | CityJSON tooling, 3D encodings, tile formats | cjio/CityJSON/FlatCityBuf/PMTiles all exist (L1 §D, L6) |
| 10 | A UK by-right envelope product | Structurally capped (discretionary); crowded aggregator market (L5 UK) |
| 11 | An EU-central harvest pipeline | The centre is gone (L1 §A.1) |
| 12 | FR breadth rule-encoding / PLU summarisation | Kel Foncier decade + four startups already there; enter via differentiation (L6 §3.2, L3 FR-5) |
| 13 | Commercial survey-product licensing (OS MasterMap, NO FKB, HU Geoshop, OSi Prime2) | Derive from open LiDAR instead — doctrine generalises lane-wide (L5 synth 6) |

## H.4 MUST-BUILD / PRYZM IP (proven missing, not assumed)

| # | Must build (H) | Evidence it is genuinely missing |
|---|---|---|
| 1 | **Geometric applicability + envelope engine** (exists — extract into core, §M) | Every EU project ended semi-manual (L1 §E.3); no OSS/commercial equivalent (L6 §4.3); 0/20 chains state-served (§R) |
| 2 | **Rule normalisation across regimes** (bebygpct+af / GRZ+Z / AZ / MAX_INTENS / Normwaarde / ehitusõigus) | No mapping standard exists anywhere; the per-country semantics ARE the moat (L2 §5.4.2) |
| 3 | **PDF→structured-rule extraction at corpus scale, gate-verified** | DE (80k+ linked PDFs in NRW alone) and CH (per-commune Reglemente) reduce to this one capability; nobody has it (L2 §5.4.3, L1 §E.3) |
| 4 | **Declarative rule representation** (rule envelope + JSON-Logic bodies + OpenFisca-style versioned parameters) | §L; the internal §18 evaluation was never done and packs are code (L7 §11) |
| 5 | **Versioned evidence graph** (valid_from/valid_to; "what applied on 2025-01-01") | No versioning axis exists in PRYZM (L7 §10); state-served in NL/PL/LT/EE — an adapter mapping there, new core elsewhere (L4 #2) |
| 6 | **Source registry as code** | Discovery layer post-INSPIRE is DIY (L1 §A.1.4) |
| 7 | **§34/context-derived inference (DE)** — LoD2 + parcel fabric → Einfügung envelope | ~30% of German parcels; no numeric source exists at all; nobody does it (L2 DE-2) |
| 8 | **Confidence/provenance heatmap engine** (extend `computeScorecard.mjs`) | Already principled internally; nothing external equivalent (L7 §7) |
| 9 | **GERS-keyed federation/conflation with per-source priority** | The only cross-source stable-ID system on offer (L1 §F.2) |
| 10 | **The refusal/honesty machinery generalised** (FetchOutcome end-to-end, refusal-with-citation) | Unique to PRYZM; jurisdiction-independent (L7 §9.2) |

---

# I — CANONICAL DATA MODEL (minimal)

Entities (BRIEF §11), minimal fields only. The design rule from the lanes: **import the state-run
vocabularies rather than inventing** — IMOW value lists for units/norm types (L4 NL-6), XPlanung
attribute names as the DE rule vocabulary (L2 DE-7), PlanDK2/3 denominator codes (L2 DK-2),
LT per-value provenance columns (L4 LT-1). Three states already run the §11 provenance model
(L4 cross-cutting #1) — the schema below is a normalisation of theirs.

```
Parcel        { id, nationalId{country, scheme, value}   // Flurstückskennzeichen, refcat, BFE, EGRID, idu, CAPAKEY, kad.Nr, tunnus…
                geometry(nativeCrs), area, adminUnit, source→Source, version }
Building      { id, gersId?, nationalIds[]               // BAG id / EHR id / ALKIS / catastro…
                footprint, height{value, method: SURVEYED|MODELLED|DERIVED_FLOORS, source},
                floors{above, below, source}, use, yearBuilt, lod, source, version }
Terrain       { tileRef | dtmRef, datum: ELLIPSOIDAL, source }
Plan          { id, kind (POG/MPZP/B-Plan/lokalplan/PLU/PDM/omgevingsplan/detaljplan/dp/…),
                status(lifecycle), adoptedDate, inForceFrom, inForceTo?, documents[]→Document,
                geometryRef, source, version }                 // DK serves lifecycle natively; mirror it
Zone          { id, planId, typology{national, harmonised?}, geometry, source }
Prescription  { id, kind (buildingLine|buildingField|heightCeiling|setback|…),
                geometry, typology{scheme, code}, value?, zoneOrPlanRef, source }
                // FR typepsc, DE BauGrenze/BauLinie, DK byggefelt, CH Baulinien — first-class, geometric
Restriction   { id, theme (heritage|noise|flood|utility|easement|…), typeCode, lawStatus,
                geometry?|areaShare, legalProvisions[]→Document, source }   // modelled on the ÖREB extract
Rule          { id, parameter, value, unit,               // see provenance JSON below
                body?: JSONLogic,                          // scalar/conditional expression when not a bare value
                applicability{geometryRef|zoneRef|predicate}, provenance, confidence,
                valid_from, valid_to }                     // OpenFisca-pattern time-versioning
Source        { id, country, authority, dataset, endpoint, protocol(WFS2|OGCAPI|REST|ATOM|bulk),
                licence{id, colour, verifiedDate, textRef}, accessOption(1..6), gate?, probes[] }
Evidence      { id, claim, from→(Source|Document|Rule|Derivation), method, checkedDate, hash }
Document      { id, url, kind (règlement|Reglement|NTA|regulamento|lokalplan-PDF|law),
                identity{idurba|doklink|ELI|…}, version, retrievedDate }
Scenario      { id, parcelId, asOfDate, overrides[], envelopeRef }
Envelope      { id, parcelId, solids[]|tiers[], footprint, maxVolumeM3, maxGfaM2,
                isUpperBound, derivationTrace[]→Evidence, confidenceTier, computedAt, ruleSetVersion }
DevelopmentPotential { parcelId, permitted{gfa, …}, existing{gfa, source}, delta, confidence }
Version       { entityRef, validFrom, validTo, supersededBy? }
Confidence    { tier: (1)auth-machine|(2)auth-doc-derived|(3)deterministic-inference|
                      (4)ai-interpreted|(5)human-validated|(6)uncertain-missing }   // BRIEF §3 six-way, verbatim
```

**Per-rule provenance JSON** (BRIEF §11 shape, aligned to what NL/LT/EE already serve):

```json
{
  "parameter": "maxHeight",
  "value": 17.4,
  "unit": "m",
  "source": {
    "country": "EE", "authority": "PLANK/PLANIS", "dataset": "dp_hoonestus",
    "plan": "…", "object": "hoonestusala Kopli tn 2", "document": null,
    "article": null, "page": null
  },
  "derivation": "DIRECT",
  "valueLocation": "attribute",
  "confidence": { "tier": 1, "note": "korgus=0/empty means UNKNOWN, never no-limit" },
  "valid_from": "2018-05-02", "valid_to": null
}
```

(`derivation` ∈ DIRECT | DERIVED | AI_EXTRACTED | HUMAN_VALIDATED; `valueLocation` ∈ attribute |
in-document-text — the NL `waardeInRegeltekst` / EE `tingimus` split; `unit` from the IMOW
Eenheid value list where possible.)

Non-negotiable invariants carried over from lane evidence: **UNKNOWN ≠ 0 ≠ no-limit** (L4 EE-4);
**failure ≠ absence** (`FetchOutcome`, L7 §1.2); **denominator is data, never assumed** (DK
`bebygpctaf` 4-way branch — L2 DK-2); **surveyed ≠ normative** on every height/floor/GFA
attribute (L3 synthesis 4); **measure in native CRS only** (Madrid EPSG:4326 silent-zero trap,
L3 ES-5; PL EPSG:2180, EE EPSG:3301, LT EPSG:3346 — L4).

---

# J — COUNTRY ADAPTER ARCHITECTURE

Core stays country-agnostic; ONLY adapters know sources, schemas, semantics, documents (BRIEF
§12). The two existing PRYZM registries are the embryo (L7 §1–2) — formalise, do not rebuild:

```ts
interface CountryAdapter {
  country: string;                       // + subdivision adapters beneath (16 DE Länder, 26 CH cantons, 17 ES CAs)
  sources(): SourceDescriptor[];         // the registry rows, incl. probe provenance + licence + gate
  parcel:   ParcelProvider;              // resolve(point|bbox) → FetchOutcome<ParcelFeature>
  buildings: BuildingProvider;           // federated: national override > Overture backbone, GERS-keyed
  planGeometry: PlanProvider;            // zones, plans, prescriptions, restrictions (typed outcomes)
  rules:    RuleSource;                  // one of three shapes, see below
  documents: DocumentRetriever;          // doklink / idurba / officialDocument / ÖREB LegalProvisions
  precedence: ApplicabilityLadder;       // e.g. DK: byggefelt → delområde → lokalplan → ramme → BR18 default
  vocabulary: RuleVocabularyMapping;     // national params → canonical (grz→coverage, bebygpct(af)→FAR-like, …)
}

type RuleSource =
  | { kind: "structured";  fetch(parcel): FetchOutcome<Rule[]> }         // NL, EE, DK, LT, PL-POG, SE/FI new-plan
  | { kind: "document";    locate(parcel): FetchOutcome<Document[]>;    // CH (ÖREB hands the doc), DE non-MV, FR, PT, IT…
                           extract: ExtractionPipelineRef }              //   → gate-verified, tier (4)→(5)
  | { kind: "refusal";     cite(parcel): CitedRefusal };                 // the tri-state honest third leg

type FetchOutcome<T> = { status: "found", value: T } | { status: "absent" }
                     | { status: "transient", retryable: true } | { status: "aborted" };
```

Design rules proven by the lanes:
- **Dual-regime merge is a first-class adapter capability**, not an NL quirk: NL (IMOW ∪ IMRO by
  temporal validity — L4 NL-1c) generalises to every country with old+new plan stock (SE post-2022
  vs scanned; PL POG vs MPZP; EE PLANK vs paper-era).
- **Adapters speak OGC API Features + CQL2 AND WFS 2.0** for years (L1 §D.1).
- **A "source-class upgrade" path is mandatory**: five new national machine-readable channels
  opened in the sweep countries in 2024–2026 alone (L5 synthesis 2) — a country RuleSource kind
  flips mid-life (PL flips Q4 2026).
- **Gates are recorded, never conflated with absence**: SE onboarding, DK Datafordeler key, LT
  LiDAR agreement, HU fee, NL ownership — all "record the gate" rows (L4/L5 passim).

---

# K — EVIDENCE GRAPH DESIGN

The model to copy is running in production in Switzerland: the **ÖREB extract** hands, per
parcel: restriction → typed code → law status → exact legal document, down to versioned-law
APIs and per-decision PDFs via ÖREBlex (L2 CH-1: "PRYZM should MODEL its evidence chain on it —
and for CH simply CONSUME it, not invent a rival"). LT adds per-VALUE provenance columns
(`*_TP/_NR/_D/_TPR` per value family + `PILN` completeness flag — L4 LT-1); NL adds the
three-way value taxonomy (quantitative / qualitative / in-rule-text — L4 NL-1); FR adds
versioned document identity for free (`idurba 75056_PLU_20260616` — L3 FR-2).

Design:
1. Every `Rule.value` points to `Evidence` → (`Source` | `Document`ⁿ | `Derivation`). "Why is max
   height 18 m" is answered by walking the chain; the chain SURVIVES updates because nodes are
   versioned, never overwritten.
2. **Versioning is the graph time axis**: `valid_from/valid_to` on Rule and Plan (OpenFisca
   parameter pattern — L1 §G.5); "what applied on 2025-01-01" = point-in-time resolution. Where
   the state serves history (DK `_med_historik` layers, PL `wersjaId/obowiazujeOd`, LT
   `GALIOJA_NUO/IKI`, EE annual snapshots — L4 #2) the adapter MAPS it; elsewhere the graph
   records ingestion versions.
3. **The seat for it exists**: the PRYZM legal-attribution layer (instrument-priority tables
   deciding which correctly-read value BINDS) is built and wired to nothing (L7 §4) — wire it,
   add validity intervals, and the evidence graph is an extension, not a new system.
4. The DK placement resolver 4-tier evidence hierarchy with UNKNOWN-IS-NOT-ZERO and
   higher-authority-unresolved cache-poisoning rules IS the §14 pattern applied — generalise it
   beyond DK (L7 §3).
5. SHACL optionally validates graph-shape consistency as a QA tool — never as the applicability
   engine (L1 §G.2).

---

# L — RULE ENGINE RECOMMENDATION

**Verdict (L1 §G.8): no existing framework covers the needed intersection** (geometric zoning
rules × citation-grade provenance × time-versioned parameters × TS/browser-first deterministic
execution). Adopt the composite:

| Layer | Take | From | Why |
|---|---|---|---|
| Rule envelope (parameter/value/unit/source/derivation/confidence/validity) | **BUILD (H)** — §I JSON | PRYZM design | Nothing external has provenance+versioning+geometry |
| Scalar/conditional rule bodies | **JSON Logic** as the serialised expression format | MIT, every-language impls | Deterministic, embeddable, storable in a rule-graph row; an EXPRESSION format, never sufficient alone (L1 §G.3) |
| Parameter time-versioning | **OpenFisca pattern** (valid_from/valid_to, point-in-time resolution) — pattern, NOT the AGPL engine | L1 §G.5 | Exactly §15 requirement; zero spatial users found, so no engine reuse |
| Extraction annotation | **RASE** (requirement/applicability/selection/exception) | ACCORD (L1 §E.2) | Maps 1:1 onto the provenance JSON + applicability engine |
| Structured-rule ingestion | **STTR/IMOW, XPlanung, PlanDK, ASGR, APP GML, ehitusõigus** consumed natively | L2/L4 | Where the state publishes rules, ingest — never re-extract from text (L1 §G.6) |
| Rejected as engines | BCRL (no public engine), Drools (JVM/imperative/no provenance), SHACL (geometry-blind; QA only), OpenFisca engine (AGPL + zero geometry) | L1 §G.1–G.5 | — |

**The single biggest internal refactor this implies (L7 §2/§11):** migrate rule-pack DATA
(numbers, citations, applicability predicates) out of hand-written TypeScript into this
declarative format with a typed evaluator — preserving the sourced legal content (the moat),
unlocking non-engineer authoring, and making country #16+ scalable. The DK extraction JSON shows
the team already converging on rules-as-data for structured countries.

---

# M — ENVELOPE ENGINE VERDICT

**PRYZM HAS a deterministic envelope engine and it is the confirmed IP core. The verdict is
EXTRACT-INTO-CORE, not replace** (L7 §3, §9). Grounding:

- ~7,300 lines of pure L2 geometry: block-derived depth as ordinance algorithm (Art. 242.2
  bisection, survived an independent-oracle audit), capsule-union inset, street-width
  construction (street width has NO national source anywhere — it must be CONSTRUCTED, L2/L7),
  façade-rasant legal datum, explicit-area/bouwvlak, depth bands, building-line offsets,
  per-number `DerivationTrace` + confidence tier. Country-rule independent — exactly BRIEF §17.
- Nothing found in ANY lane replicates it: not government (0/20 chains state-served an envelope —
  §R; the closest artefacts are INPUTS: DK byggefelter, LT 3D allowed-height volumes), not OSS
  (L6 §4.3), not startups (analysis products, human-in-loop, or massing-without-rules — §D).
- **The work is adoption, not invention** (L7 §10): finish `envelopeToMassing` adoption (render
  currently consumes 4 fields and discards `tiers[]`/`maxVolumeM3`/`footprintIsUpperBound` —
  Seam 1); add the never-overstate CI property test over every pack; fix the two documented
  overstating mechanisms in `ZoningRulesEngine` (unknown-setback→0-inset; maxFAR never capping
  volume); establish the SiteFrame single-owner (Seam 2).
- Keep the honest tiers: refusal-with-citation and estimated-default are product features, not
  gaps (L7 §2; refusing-half-needs-its-escape-hatch doctrine).

---

# N — AI ARCHITECTURE (interpretation, not truth)

The split (BRIEF §20) is validated externally — CHEK €M pilots ended with rule digitisation
SEMI-MANUAL (L1 §E.3); a German state is procuring exactly this architecture (Rulemapping ×
Thüringen, L6 §3.12) — and already implemented internally (L7 §4):

- **AI does:** document classification, rule extraction, semantics, exceptions, linking,
  uncertainty estimation. Every AI-derived rule carries evidence, source, confidence, method,
  validation state, and lands at a permanent `pipeline-extracted-unverified` tier with **no
  silent graduation** (PRYZM LOCK 3). Human sign-off (the L-449 `*_ENVELOPE_VERIFIED` gate)
  promotes tier (4)→(5).
- **Deterministic does:** geometry, intersections, buffers, FAR/coverage/height/GFA arithmetic,
  envelope construction. AI never silently determines geometry or numbers.
- **The gate battery is the differentiator** (dual-pass agreement, arithmetic cross-check,
  supersession, locale, range-sanity, regime) — no OSS extraction repo has an equivalent (L7 §4).
- **Inputs to build on:** CODE-ACCORD multilingual corpus for training/eval (licence check first),
  RASE tagging as the annotation schema, ÖREB/idurba/doklink document identity so retrieval is
  solved before parsing (CH: the extract hands you THE document per parcel — half the battle,
  L2 CH-1.3).
- **Where AI extraction is the primary rule path:** DE non-MV (80k+ PDFs indexed with URLs), CH
  communes, FR règlements (keyed on idurba — ONE national pipeline), PT regulamentos, IT NTA,
  ES non-Madrid CAs, GR FEK (later). Where it is FALLBACK only: NL/EE/DK/LT/PL-POG nulls.

---

# O — PRYZM CODE REVIEW DIGEST (from L7; full tables there)

| Verdict | Components (representative) |
|---|---|
| **EXTRACT INTO CORE** | parcel-provider framework + registry; `FetchOutcome` discipline (finish end-to-end — dispatcher still flattens transient/absent, and C57 §1.5 mandates the collapse → contract amendment needed); rule-pack registry + tri-state applicability; refusal vocabulary + answerability classifier; DK 4-tier placement resolver (generalise); ordinance-extraction gate battery; legal-attribution layer (**+ WIRE it**); C63 scorecard engine |
| **KEEP** | envelope geometry corpus (blockDerivedDepth, blockRing, insetPolygon, streetWidth, facadeRasantDatum, nativeCrs…); context bake + PMTiles/R2 delivery; German text-parse grammar (for the non-XPlanGML long tail); DK Matrikel keyed-source template; measurement records; 15-country probe corpus |
| **REFACTOR** | `ZoningRulesEngine` (two overstating mechanisms); rule-pack REPRESENTATION (TS→declarative, §L); `CesiumViewport.ts` 14.6k-line monolith (execute the written seam fixes, do not re-design); shape+height single-record weld (blocks federated heights); three proxies returning `200 {null}` for failure AND empty |
| **REPLACE (candidate, gated)** | terrain compiler → Mapterhorn/external tileset (keep datum-lift + rasant sampling); per-country height joins → GERS-keyed attribute-join IF external data beats the `levels×3.2m` V3 gate against the 0.9% surveyed ground truth |
| **MOVE TO COUNTRY ADAPTER** | per-country providers/resolvers (already are); city-specific geometry riding in the shared package (sevillaFondoClip, cossosSortints); regime resolvers |
| **DELETE (gated)** | old same-origin tile proxies — after founder Network-tab confirmation R2 is read directly |

Debt the migration must carry (L7 §10): Seams 1/2/4, schema weld, the two monoliths
(`CesiumViewport.ts` 14.6k / `siteDispatch.ts` 9.1k lines), authored-but-unwired inventory
(attribution layer, heritage/flood adapters, Madrid PUB:ALIN, MDS re-bake), **no versioning
axis**, **rule packs are code**.

---

# P — TECHNOLOGY STACK

Verdict: the brief said "do not assume current PRYZM tech is optimal" — the audit largely
CONFIRMS the current stack, with named additions:

- **Storage:** PostGIS (evidence graph, rule graph, canonical entities) + object storage (R2) for
  PMTiles/derived artefacts + **GeoParquet** for bulk mirrors (PL publishes it natively — DuckDB
  can query in place, L4 PL-5) + DuckDB(-spatial) for bake/analysis pipelines. No new database.
- **Delivery:** PMTiles (KEEP, production); quantized-mesh terrain until the Mapterhorn trial
  concludes; FlatCityBuf only if full semantic LoD2 ever ships to the browser (MONITOR).
- **APIs:** REST + OGC API Features out; CQL2 in the adapter fetch layer with WFS 2.0 fallback
  (L1 §D.1). GraphQL: not justified by any lane finding.
- **Processing:** TS for adapters/engine (browser-parity determinism), Python+GDAL/GeoPandas/
  Shapely for bakes, tippecanoe for tiles; external-process GPL/AGPL tools (xPlanBox validator,
  roofer) invoked as CLIs, never linked.
- **3D:** Three.js/WebGPU + Cesium as today; consume state 3D where pre-joined (EE LoD2 carries
  EHR ids; LT serves allowed-height volumes — consume attributes, not Multipatch, L4 LT-2).
- **Conflation key:** GERS (L1 §F.2).
- **CRS discipline:** native-CRS-only measurement is stack policy, not a per-adapter nicety
  (`nativeCrs.ts` exists — L7 §3; trap catalogue: L3 synthesis 6, L4 passim).

---

# Q — COST MODEL (order-of-magnitude; assumptions stated)

**Assumptions** (from lane evidence): one parcel resolution ≈ 4–8 upstream calls (parcel,
buildings, plan geometry, restrictions, rules), all against keyless/free-key national APIs
(fair-use bounded — e.g. NL 200 req/s, L4 NL-1); envelope compute is pure CPU ~10–50 ms;
context tiles served from R2 (zero egress); **rule extraction is per-PLAN, not per-parcel** —
corpus work amortised (e.g. NRW 82,007 plans with doc URLs, DK 37,990 plans at 100% doklink);
cache hit-rate rises with volume (spatial locality). Currency ≈ €/month, infra only, excluding
staff.

| Scale (parcels/day) | Dominant mode | Upstream posture | Infra estimate | AI/extraction | Notes |
|---|---|---|---|---|---|
| **1k** | live query + LRU | option 1+2 everywhere; well inside every fair-use policy | **~€100–200/mo** (1 node, small PostGIS, R2 cents) | corpus one-offs only | Today shape; nothing changes |
| **10k** | cache-first | option 1+2 + per-bbox caches mandatory | **~€400–800/mo** (2 nodes, managed PostGIS, R2 ~€20) | per-country corpus: ~€3–15k one-off (LLM ~€0.05–0.30/doc × 10k–80k docs) + human validation (dominant) | Politeness, not cost, forces the caches |
| **100k** | bulk-mirror hot countries | flip hot countries to option 3/4 (LT daily FGDB 130 MB, EE nightly GPKG 177 MB, PL GeoParquet, DK WFS cache); live query = cold paths only | **~€2–5k/mo** (4–8 sustained vCPU, 100s GB PostGIS, workers) | as above, more countries in flight | Live-hammering national WFS at this rate would breach fair use AND availability (Matriklen 503-class outages) |
| **1M** | bulk-first, query-on-miss | mirrors + change feeds (CZ daily-change pattern is the model); CDN in front | **~€15–40k/mo** (50–100 vCPU, 1–2 TB PostGIS, tiles/CDN) | steady-state re-extraction on plan updates; validation team is the real line | Marginal infra cost ≈ €0.001–0.005/parcel. **The scaling cost is NOT infra: it is rule-pack sourcing + human validation** — the founder own cost-structure finding (L7 §9.3), and the reason Kel Foncier took a decade (L6 §3.2) |

Honesty note: these are order-of-magnitude planning numbers synthesised from lane facts about
data volumes and access modes; no lane ran a load test. The two real cost risks are legal
(ODbL separability, §G) and organisational (validation throughput), not compute.

---

# R — 20-PARCEL VALIDATION (BRIEF §30, aggregated from lanes 2–4)

20 chains run live 2026-08-31: DE×2, DK×2, CH×2 (L2 Part 4) · ES×2, FR×2, PT×2 (L3 §*-5/6) ·
NL×2, PL×2, LT×2, EE×2 (L4 chains). Per-step aggregation (graded steps only; some lanes did not
grade every step of every chain — denominators shown):

| Step | DIRECT | DERIVED | AI-EXTRACTED (F) | MISSING | n | Reading |
|---|---|---|---|---|---|---|
| Parcel | **95%** (19) | — | — | 5% (1: central Lisbon, measured 0 — genuine absence, not a gate) | 20 | Solved. Keyless in every probed country |
| Buildings | **83%** (15) | 17% (3: PT nDSM, LT heights E) | — | — | 18 | Solved-with-derivation; DK key-gated but free |
| Zone/plan geometry | **100%** (20) | — | — | — | 20 | Solved everywhere probed (PT-B via municipal adapter) |
| Restrictions | ~56% (9, geometry/flags) | — | ~13% (2) | ~31% partial/unknown (5) | 16 | Least uniformly graded step; ÖREB best-in-class |
| **Numeric rules** | **30%** (6: DE-MV, DK×2, NL×2, EE-B) + **20% conditional** (4: PL zone-pending, LT where-filled) | — | **50%** (10: DE-Cologne, CH×2, ES×2, FR×2, PT×2, EE-A) | — | 20 | **The fork.** Structured where the state serves it; document-bound elsewhere — with the doc URL machine-served in every case |
| **Envelope** | **0%** (0 state-served; EE-B serves the max-GFA *number*, not the volume) | **100%** derivable once rules resolve | — | (in-prod: shipped for 1 city) | 20 | **PRYZM IP in all 20 chains — no country ships an envelope engine** (L2 cross-chain verdict, confirmed L3/L4) |
| GFA (permitted) | 5% (EE-B `sbp`) | ~70% | — | ~25% (blocked on rules: FR/PT/ES-Madrid) | 20 | Existing-GFA is separately DIRECT in ES nationally (DNPRC/wfsBU — L3 ES-1) — permitted−existing computable TODAY in ES |

**Cross-chain shape (identical everywhere):** parcel/buildings/plan geometry are DIRECT in all
ten countries; the numeric-rule step is the fork (DIRECT in the structured countries, F with a
served document URL elsewhere); envelope + GFA are DERIVED everywhere once rules resolve. The
architecture that follows: one deterministic engine, one gated extraction pipeline, per-country
RuleSource kinds (§J) — nothing per-country in the core.

---

# S — ROADMAP (6 / 12 / 24 months, mapped to BRIEF §29 phases 0–6)

## 0–6 months (Phases 0–2: canonical core + adapter framework + first structured countries)
1. **Week 1 admin:** request NL DSO pre-prod + prod keys (a form — L4 NL-1); fetch the four
   outstanding licence texts (Catastro Licencia.pdf, OME2, geoportal.lt, MS GlobalML LICENSE).
2. **Canonical core:** §I model + provenance JSON; declarative rule envelope + JSON-Logic bodies
   + valid_from/valid_to (§L); wire the attribution layer (evidence graph v1, §K); migrate ONE
   pack (Barcelona) TS→data as the pilot.
3. **Adapter SDK:** formalise the two registries into the §J interface; `FetchOutcome` end-to-end
   (incl. the C57 §1.5 contract amendment); OGC-API+WFS dual fetch layer.
4. **Countries:** **EE first** (smallest, fullest stack, keyless — L4 sequencing), **NL second**
   (dual-regime merge; run the NL-A/B rules step end-to-end once keyed), **LT third** (wire ASGR
   live+FGDB — after resolving MAX_INTENS units from the ASGR methodology, the named blocker),
   DK corrections (keyless re-pin, denominator branch, 4-layer ladder).
5. **Engine debt:** Seam-1 `envelopeToMassing` adoption + never-overstate CI property test; fix
   the two overstating mechanisms; build the APP GML 2.0 parser off official samples (PL prep).
6. **Stop:** terrain-compiler investment (run the Mapterhorn trial instead); ES/FR nDSM
   differencing (zonal stats over MDSnE/MNH); new hand-written TS packs.

## 6–12 months (Phases 3–4: structured-rule family + document-rule pipeline)
1. **PL adapter live after 2026-11-30** (RU transition ends; harvest WMS/WFS endpoints).
2. **Nordic/structured family:** SE (NGP + Planbestämmelsekatalog) + FI (Ryhti as it fills) + NO
   (NAP) + LU/LV/SI — one adapter family, shared vocabulary (L5 synthesis 1).
3. **DE:** XPlanGML fast-path (MV-class), NRW 82k-plan document pipeline as the first
   corpus-scale extraction run (gate-verified, human-signed); ALKIS federation ×15.
4. **FR:** ONE national règlement-extraction pipeline keyed on idurba (behind DK/NL/DE on
   payoff-per-effort — L3 verdict).
5. **CH:** ÖREB consumption per launch canton; extraction seeded from ÖREB doc refs.
6. **Evidence graph v2:** point-in-time queries; heatmap engine extension of C63 scorecard.
7. **GERS conflation** into the buildings federation; height-join V3 gate evaluation.

## 12–24 months (Phases 5–6: expansion + development intelligence)
1. Document-rule breadth: ES CAs (watch Andalucía/Galicia forward-only structured delivery),
   PT (CRUS + municipal regulamentos; BUPi fill accelerating past the 2026-10 pricing cliff),
   IT northern mosaics, BE (Flanders DSI RDF/SPARQL evaluated as a rule-graph source first).
2. **DevelopmentPotential product:** permitted − existing (ES computable TODAY via
   DNPRC/wfsBU; EE via EHR; DK via BBR); scenario engine; §34 context-inference (DE) as the
   flagship derived-envelope capability.
3. RO via QMAP partner evaluation; monitor SK (~2028), GR/BG (later F-markets), HU (Lechner
   relationship), CY (zone-coefficient join verification).
4. Time-travel API ("what applied on date X") productised; EUnet4DBP visibility contribution.

**Smallest-team Europe-ready plan (T-Q20):** 4–6 engineers — 2 on core (canonical model, rule
format, engine adoption), 1–2 on adapters (structured family first; each structured adapter is a
JSON/GML mapper, not a document pipeline), 1 on extraction/AI + gates, 0.5 infra — plus the
human validation loop (the actual scaling constraint, §Q).

---

# T — FINAL DECISION: THE TWENTY QUESTIONS, ANSWERED

1. **Master building dataset or federation?** Federation + conflation rules — CONFIRMED by
   evidence (every master froze; Overture attribute-poor where national data is rich). Adopt GERS
   as the conflation key. (L1 §F.2)
2. **Is INSPIRE the harvest backbone?** No. The central infrastructure was dismantled mid-2026;
   GreenData4All deletes the mandates. National endpoints + data.europa.eu discovery. Country
   adapters are the only architecture the landscape supports. (L1 §A.1)
3. **Is there an adoptable rule engine (BCRL/RDF-SHACL/JSON Logic/Drools/OpenFisca)?** No engine;
   four patterns: JSON-Logic bodies, OpenFisca versioning, RASE annotation, state vocabularies.
   The geometric applicability engine is G→H. (L1 §G.8)
4. **Envelope engine: reuse, thin layer, or new?** PRYZM already has the engine; nothing external
   replicates it; 0/20 chains state-served. Verdict: EXTRACT-INTO-CORE + finish adoption
   (Seams 1/2, never-overstate CI). (§M, L7 §3)
5. **Which countries are structured-rule countries TODAY?** NL, EE, DK, LT (with fill caveats);
   PL at zone level from Q4 2026; SE/FI/NO/LU/LV/SI as the one-national-channel family. (L2/L4/L5)
6. **Is Denmark the reference implementation for structured-rule countries?** Yes for the
   canonical Rule model (denominator codelist, 4-layer precedence, lifecycle layers, kompleks
   flag, statutory defaults) — but NL has the richer object model and EE the fullest keyless
   stack; calibrate against all three. DK fill is 30–61% by layer, NOT ~96% (§A.4 #2). (L2 DK-5)
7. **Central lake, federation, or hybrid?** Hybrid (Option C) — which PRYZM already runs.
   Query parcels/rules, cloud-optimise context, store derived-only. (§H)
8. **What is the canonical model?** §I — 17 entities, six-tier confidence, per-rule provenance
   JSON aligned to what NL/LT/EE already serve; import state vocabularies, do not invent.
9. **How are rules represented?** Declarative rule envelope (H) + JSON-Logic scalar bodies +
   versioned parameters; packs migrate from TS code to data. (§L)
10. **AI vs deterministic split?** AI interprets (gated, evidence-carrying, no silent
    graduation); deterministic computes ALL geometry and numbers. Already implemented internally;
    validated externally (CHEK ended semi-manual; Thüringen procures this shape). (§N)
11. **What to STOP building immediately?** Terrain-tile compilation (trial Mapterhorn); ES/FR
    nDSM differencing (MDSnE/MNH exist); new hand-written TS rule packs; any XPlanGML
    parser/validator; any cadastre mirror; UK envelope ambitions. (§H.3)
12. **What to BUILD immediately?** NL DSO key request (this week); declarative rule format +
    validity intervals; evidence-graph wiring of the existing attribution layer; EE adapter; APP
    GML 2.0 parser; Seam-1 adoption + never-overstate CI. (§S 0–6mo)
13. **Which licence risks are real?** ODbL share-alike on merged derivative DBs (keep layers
    separable — the one architectural licence constraint); EUBUCCO CC-BY-NC pocket; Bavaria
    ALKIS; geodienste per-canton mosaic; four licence texts still unread (§G). MS GlobalML
    licence is a live lane conflict — verify (§A.4 #1).
14. **Cache/mirror/query policy?** Option 1+2 for parcels/rules; 3+4 for bulk context; 5 for
    heights/envelopes/evidence; 6 for discovery; ÖREB strictly live. (§H.1)
15. **Does anyone sell pan-European parcel-to-envelope?** No — the seat is empty as of
    2026-08-31, and Zoneomics→Forma shows the acquisition channel by which it could close. (L6 §3.13)
16. **Who are the competitors to respect per country?** Syte (DE), Kel Foncier (FR), Amenti (CH),
    Hektar (Nordics massing), Forma (global massing), UK aggregators (Product-A only). None ship
    rule-level provenance. (§D)
17. **LOD200 vs PRYZM P0–P3 contextual representation?** Keep P0–P3 (minimum sufficient
    geometry). LoD2 is now MANUFACTURABLE (roofer) where states do not publish it; FlatCityBuf
    only if full semantic models ever ship to browser. (L6 §4.2, L1 §D.3)
18. **What is the defensible PRYZM IP?** The constructed-envelope engine with derivation traces;
    rule normalisation semantics + signed pack content; the extraction gate battery + attribution
    layer; the refusal/honesty machinery; the C63 scorecard-as-total-function; the 15-country
    probe corpus; the façade-rasant datum. (L7 §9)
19. **What does Europe cost at scale?** Infra ~€100/mo (1k/day) → ~€15–40k/mo (1M/day);
    marginal infra ~€0.001–0.005/parcel. The scaling cost is rule sourcing + human validation,
    not compute. (§Q)
20. **Smallest-team Europe-ready plan?** 4–6 engineers on the §S sequencing: core + structured
    family first (EE→NL→LT→PL + DK corrections; each structured adapter is a mapper, not a
    document pipeline), extraction pipeline second (DE/FR/CH corpora), document-rule breadth
    third — with the human validation loop staffed as the true constraint. (§S)

---

## APPENDIX — Gaps this report inherits (honest register, deduplicated from all lanes)

**Founder/orchestrator actions:** clarify or drop the three unresolved names (Polis FR, Swiss
Zoning API, BZOdigital — §A.4 #6) · fetch four licence texts verbatim (Catastro Licencia.pdf,
OME2, geoportal.lt, MS GlobalML) · confirm BUPi RGG polygon openness (identity-gate candidate) ·
Network-tab confirmation for tile-proxy deletion.

**Not probed / not confirmed (carry into adapter work):** NL DSO data responses (pending key) +
fair-use text + SRU mirror · PL RU WMS/WFS endpoints (≤2026-11-30) + 3D direct URLs + BDOT10k
attribute schema (DOC-level) · LT MAX_INTENS unit semantics (**blocks GFA computation**) · EE EHR
auth mode, kitsendused GetFeature, not-in-PLANK disambiguation · Sachsen-Anhalt PLU WFS
("richest XPlanung data" UNVERIFIED) · Saarland LoD2 (absence-of-evidence only) · Bavaria ALKIS
terms at ship time · geodienste.ch per-canton flag matrix · EUBUCCO v0.2 existence/licence ·
MDPI IJGI 15(6):252 (paywalled) · licence IDs for CZ/HR/LV/GR/RO/BG/CY/MT · feature-level probes
for most L5 countries (capabilities-level only) · ES-B Madrid restriction layers + PT CRUS
attribute schema · DigiChecks outcomes · data.europa.eu geo-filter quality · a systematic
opencode.de/CORDIS 2025–2026 crawl. **All licence colours are lane judgments from primary pages,
not legal review.**
