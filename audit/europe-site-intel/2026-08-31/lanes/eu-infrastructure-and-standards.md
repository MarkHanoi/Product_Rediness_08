# LANE 1 — European Infrastructure, Standards & Flagship Datasets

> Lane of the europe-site-intel audit (BRIEF.md §4, §8, §9 + §16 evidence + §19 rule frameworks).
> Researcher: eu-infra-standards lane · Started 2026-08-31 · Method: every claim carries a URL +
> date-checked; public APIs are PROBED (live GetCapabilities / feature requests), not described
> from documentation. Classification letters per BRIEF §1 (A data · B OSS code · C API/service ·
> D standard · E derivable · F extractable · G missing · H PRYZM IP). Licence colour
> GREEN/YELLOW/RED per §9. Access option 1–6 per §10 (1 query dynamically · 2 cache · 3 mirror ·
> 4 cloud-optimise · 5 store derived only · 6 metadata + on-demand).

## What PRYZM already has (read before judging anything "new")

- Overture vs OSM vs MS head-to-head ALREADY PROBED 2026-07-24 (`docs/04-reference/geospatial/CONTEXT-BUILDING-SOURCE-EVALUATION.md`):
  Overture = strict superset of OSM (Riyadh 5.33×, Barcelona +24%), MS ML footprints arrive
  *through* Overture conflation, height-or-floors 73.2% in Barcelona. A per-region
  `buildingsSource` toggle is prototyped in `tools/context-bake/bake.mjs`.
- Tiered country resolver (Tier A LoD2 native / Tier B footprint+nDSM / Tier C OSM/Overture)
  designed in `CONTEXT-DATA-COUNTRY-STUDY.md`; NL/DK/CH/DE named Tier A.
- Spain Catastro INSPIRE + Italy Agenzia Entrate INSPIRE WFS provider already built
  (MASTER-ROI-TRACKER §0.5); 15-country jurisdiction work exists.
- PMTiles already the production delivery format for context tiles (bake → tippecanoe → PMTiles → R2).
- Envelope generation is PRYZM IP (H) — ordinance-as-algorithm, ADR-0271/C64.

---

# SECTION A — INSPIRE: the standard on paper vs what is harvestable in 2026

*(findings being filled in as probed)*

## A.1 — THE 2026 HEADLINE: the central INSPIRE infrastructure was DISMANTLED mid-2026

**PROBED 2026-08-31 (own probe, not documentation):** `https://inspire-geoportal.ec.europa.eu/index.html`
returns **301 → https://data.europa.eu/**. The INSPIRE Geoportal no longer exists.

| Fact | Date | Source (checked 2026-08-31) |
|---|---|---|
| INSPIRE Geoportal decommissioned; data.europa.eu is the single EU entry point | 30 Jun/1 Jul 2026 | https://data.europa.eu/en/news-events/news/inspire-datasets-move-european-data-portal + own 301 probe |
| INSPIRE Reference Validator central instance shut, **"no replacement planned"** | 31 Mar 2026 | https://wetransform.to/news-and-events/european-spatial-data-infrastructures/ |
| INSPIRE Registry (code lists, vocabularies) migrated to EU Vocabularies (VocBench) | 30 Jun 2026 | same + https://inspire.ec.europa.eu/ |
| **GreenData4All legislative proposal COM(2025) 985** published — REMOVES prescriptive data-interoperability rules, network-service interoperability rules, and central-geoportal obligation from the directive | 10 Dec 2025 | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A52025PC0985 + https://environment.ec.europa.eu/law-and-governance/green-data_en |
| Community replacement catalogue “OpenDataCat” launched by GeoCat after geoportal shutdown | 2026 | https://www.geocat.com/blog/news-1/the-inspire-geoportal-is-gone-here-s-what-we-built-instead-25 |

**Consequences for PRYZM (architecture-defining):**
1. **“Harvest Europe through INSPIRE” is now the WRONG mental model.** The centre of gravity has
   moved to (a) data.europa.eu (DCAT catalogue with geospatial filter — a *metadata* index, not a
   data API) and (b) the NATIONAL geoportals/endpoints, which keep running unchanged. The
   country-adapter architecture in the brief (§12) is not merely a choice — after COM(2025) 985 it
   is the only architecture the legal landscape supports. Classification: the INSPIRE *themes*
   remain **D (standard)** + per-country **A/C**; the central harvest point is now **G at EU level**.
2. **Interoperability mandates are being deleted, not strengthened** — the wetransform analysis
   (checked 2026-08-31) expects INCREASED fragmentation across member states. Expect national
   schemas to drift from the INSPIRE data specs over 2027-2029; do not hard-code INSPIRE GML
   application schemas as “the” EU format. They remain most useful precisely where already deployed
   (ES/IT cadastre WFS, DE PLU services).
3. **The validator’s death matters for quality claims:** nothing central certifies a national
   service as “INSPIRE-conformant” from 2026 on. Treat conformance statements in metadata as
   UNVERIFIED; probe every endpoint (which is already PRYZM discipline).
4. data.europa.eu is harvestable itself (DCAT-AP, SPARQL) — usable as a SOURCE-DISCOVERY registry
   (brief §21 “source registry”), not as a data plane.

## A.2 — Live endpoint probes (all run 2026-08-31 by this lane; GetCapabilities/landing fetched, not read from docs)

| Endpoint | Probe result | Verdict |
|---|---|---|
| **ES Catastro INSPIRE WFS-CP** `http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&request=GetCapabilities` | **LIVE.** WFS 2.0.0, `cp:CadastralParcel` + `cp:CadastralZoning`, GML 3.2.1, stored queries, no fees; licence PDF at catastro.hacienda.gob.es (attribution licence) | A+C · GREEN (attribution) · option 1 (query) — already wired in PRYZM |
| **NL PDOK BAG OGC API Features** `https://api.pdok.nl/kadaster/bag/ogc/v2/` | **LIVE.** OGC API Features landing, conformance + OpenAPI, **Public Domain Mark 1.0**, buildings incl. demolished status | A+C · GREEN (public domain) · option 1 |
| **NL PDOK index** `https://api.pdok.nl/` | Enumerates OGC APIs: `kadaster/brk-kadastrale-kaart/ogc/v1` (cadastral map), `kadaster/brk-kadastrale-percelen/ogc/v1` (**INSPIRE-harmonised parcels as OGC API Features** — the modern replacement for WFS), `lv/bgt/ogc/v1` (large-scale topo), BRT | C · GREEN · option 1 |
| **DE Hamburg XPlanung WFS** `https://geodienste.hamburg.de/HH_WFS_xplan_dls?service=WFS&request=GetCapabilities` | **LIVE.** WFS 2.0.0, XPlanung **5.1**, **200+ feature types**: `BP_Plan`, `BP_Baugebietsteilflaeche` (carries GRZ/GFZ), `BP_BauGrenze`/building lines, FP_* (Flächennutzungsplan), LP_*; stored query by PlanName; paging at 15,000; EPSG:25832 etc.; no stated fees/constraints | A+C+D · GREEN (DL-DE likely — verify per Land) · option 1-2 |
| ~~INSPIRE Geoportal~~ | **301 → data.europa.eu** (decommissioned) | G at EU level |

## A.3 — Theme-by-theme: paper vs harvestable (2026)

**Cadastral Parcels (CP)** — the BEST-implemented INSPIRE theme. National INSPIRE CP services are
live and stable in ES (probed above), IT (Agenzia Entrate — PRYZM provider already built,
`893e62eb`), and most member states; NL serves the harmonised theme as OGC API Features (probed).
MDPI Land 12(7):1462 ("Building a Cadastral Map of Europe through INSPIRE", checked 2026-08-31,
https://www.mdpi.com/2073-445X/12/7/1462) documents the pan-EU CP picture. Verdict: **A+C per
country, D as schema; harvest via country adapters; the theme schema (cp:CadastralParcel) is a
usable cross-country normalisation TARGET for geometry+identifier, nothing more.**

**Buildings (BU)** — implemented in far fewer countries as INSPIRE BU; where it exists it is
mostly 2D footprint + attributes (ES Catastro BU is the flagship, incl. `numberOfFloorsAboveGround`).
The REAL European building story is NATIONAL LoD1/LoD2 programmes (NL 3DBAG, DE LoD2 per Land,
DK, CH) + EUBUCCO/Overture/DBSM (Section C/F below) — not the INSPIRE theme. Verdict: **theme = D
with thin A; buildings themselves = Section F.**

**Planned Land Use (PLU)** — the theme that matters most for Product B and the LEAST uniformly
implemented. Reality by regime:
- DE: PLU exists where Länder transform XPlanung→INSPIRE PLU, but the NATIVE XPlanung services
  (probed: Hamburg, 200+ types) are far richer — INSPIRE PLU flattens exactly the attributes an
  envelope engine needs (GRZ/GFZ live in XPlanung `BP_Baugebietsteilflaeche`; INSPIRE PLU carries
  them only as generic `RegulationNature`/HILUCS + optional `dimensioningIndication`).
- FR: GPU (Géoportail de l'urbanisme) serves the national CNIG model AND an INSPIRE PLU view; the
  CNIG model is the richer one.
- ES: no meaningful national PLU service; planning geometry is per-CCAA/municipal (PRYZM's Barcelona
  MUC work is exactly this).
- **Pattern: INSPIRE PLU is a lossy projection of richer national models. Harvest the national
  model; use PLU only for countries with nothing better.** Verdict: **D (lossy); national A/C wins.**

**Area Management/Restriction/Regulation Zones (AM)** — protections, easements, noise/flood/heritage
zones. Patchily published (best: NL, DK, FI); after COM(2025) 985 the obligation to harmonise these
WEAKENS. Verdict: **A per country where present; treat as per-country discovery via data.europa.eu
DCAT search + national catalogues; never assume presence.**

**Bottom line for the brief’s question “what is actually harvestable in 2026 vs the standard on
paper”: the INSPIRE *schemas* survive as normalisation vocabulary; the INSPIRE *infrastructure*
(geoportal, validator, registry, harmonisation mandate) is gone or going. Harvestable = the
national endpoints, one adapter each — which is what PRYZM already builds.**

---

# SECTION B — EuroGeographics: Open Maps for Europe + Open Cadastral Map

**Open Maps for Europe 2 (OME2)** — EU-co-funded EuroGeographics project, 2023 → end-2025 (now
ENDED; sustainability = a "pan-European Cadastral Data Strategy", concrete post-project maintenance
NOT published). Checked 2026-08-31:
https://eurogeographics.org/activities/ome2-progress/open-maps-for-europe-2-highlights/

- **Open Cadastral Map (final release, news 2025-07-28):** four layers — Administrative Units,
  **Cadastral Parcels**, **Buildings**, Addresses — from **15 NMCAs**: BE, HR, CZ, DK, EE, GR, IE,
  LV, LU, PL, SK, SI, ES, CH, NL.
  (https://eurogeographics.org/news/ome2-adds-five-new-countries-to-final-release-of-open-cadastral-map/)
- **High-value 1:10 000 prototype:** admin boundaries + transport, ~10 countries targeted by
  end-2025.
- Also refreshed EuroGlobalMap / EuroRegionalMap / EuroDEM.
- **Access:** GeoPackage download via www.mapsforeurope.org + WMS/WMTS/WFS; "single open licence".
- ⚠ **Licence text UNVERIFIED** — mapsforeurope.org is a JS app whose licence page did not render
  to the fetcher; news pages say only "single open licence / free to use". **Before any commercial
  reliance, pull the actual end-user licence from the portal.** Until then: **YELLOW**.

**Verdict for PRYZM:** classification **A (data) + C (portal)**, licence **YELLOW (pending text)**,
access option **6 (metadata + on-demand)** at most. Reasons it does NOT displace national adapters:
1. 15 of 31 target countries; the big absentees include DE, FR, IT, PT, AT, SE, NO, FI — exactly
   several priority countries.
2. It is a harvested SNAPSHOT of national cadastres with no stated update cadence (project-funded,
   project now over) — PRYZM's live national WFS/OGC adapters are fresher and richer (the OME2
   portal itself links users "directly to national geoportals" for download).
3. Usable value: a *bootstrap/fallback parcel layer* for the 15 covered countries where PRYZM has
   no adapter yet, and a harmonised schema worth reading when designing the canonical Parcel model.
**Action: MONITOR** (watch whether the Cadastral Data Strategy yields a maintained service);
do not build on it as a dependency.

---

# SECTION C — Copernicus + JRC flagship datasets

## C.1 — JRC Digital Building Stock Model (DBSM R2025)

Checked 2026-08-31: https://data.jrc.ec.europa.eu/dataset/a601a4a8-9289-4fc4-983a-25d54f957f3a

- Released **2025-05-19**; full **EU-27** coverage (incl. Azores/Madeira/Canaries).
- Built by CONFLATION, priority-ordered: **EUBUCCO v0.1 > OSM > Microsoft GlobalML** (MS heights
  kept only at >90% confidence). Attributes: height, compactness, construction epoch, use type,
  rooftop-PV potential. Attribute completeness NOT stated on the record.
- **Licence ODbL v1.0** → share-alike over derivative DATABASES: **YELLOW** for PRYZM (see F.4).
- Update cadence: "**irregular**" (its own metadata). Energy-policy oriented.
- **Relevance beyond data:** DBSM is a real-world test of the brief §16 "master dataset" road — a
  one-shot conflation that froze its inputs (EUBUCCO **v0.1**, already superseded) and updates
  irregularly. Evidence FOR federation-with-conflation-rules over any static master.
- Classification **A** · **YELLOW (ODbL)** · access option **2/5** (cache or derive-only) ·
  Action: **MONITOR**; use as cross-check/epoch+use enrichment, not as the buildings backbone.

## C.2 — EUBUCCO

Checked 2026-08-31: https://www.nature.com/articles/s41597-023-02040-2 ·
https://zenodo.org/records/7225259 · https://source.coop/abry-tudelft/eubucco

- v0.1 (2023): **~202M buildings, EU-27 + CH**, from **50 open government datasets + OSM**.
  Attribute coverage (paper, v0.1): **height 73% · construction year 24% · type 46%**.
- **v0.2 reportedly released spring 2026** (search-level claim — ⚠ NOT verified against
  eubucco.com/data this session; docs.eubucco.com/license 404'd on probe. Verify version + licence
  page directly before relying).
- **Licence is PER-SOURCE: ODbL for 95%+, Prague CC-BY-SA, Abruzzo CC-BY-NC** (non-commercial —
  **RED** for that region; the source.coop mirror EXCLUDES Prague/Abruzzo for exactly this reason).
- **Cloud-native access exists and is active:** source.coop hosts EUBUCCO as **GeoParquet +
  FlatGeoBuf + PMTiles** (25,570 downloads / 1.1 TB served in the 28 days to late Aug 2026 — live
  figure from the source.coop page, checked 2026-08-31).
- Classification **A** · **YELLOW (ODbL default, RED pockets)** · option **4 (cloud-optimise)** ·
  Action: **CONSUME selectively** — best-in-class for construction YEAR + TYPE where Overture/OSM
  lack them; NOT a substitute for national LoD2 heights (its height is mostly the same national
  data PRYZM's Tier A/B adapters reach directly, but frozen at harvest date).

## C.3 — Copernicus land layers relevant to site context

Checked 2026-08-31: https://land.copernicus.eu/en/products/urban-atlas · EEA SDI catalogue

- **Urban Atlas Building Block Height 2021** (10 m raster, selected EEA38+UK cities) published
  **2026-01-31** — a fresh, pan-European, coarse height layer; superseder of the 2012 one.
- Urban Atlas land use moving to **3-yearly cadence** (2021 + 2024 layers in production) with a new
  Green Land Use product.
- **CLC+ Backbone 2023** released (PUM v1.3.1, 2025-04-01) — 10 m land-cover backbone.
- Copernicus data: free, open, commercial use allowed (Copernicus data licence) → **GREEN**.
- For PRYZM: useful as **fallback height prior** (Tier C regions) and land-cover context;
  10 m block-level height is NOT parcel-grade. Classification **A** · GREEN · option **6**.
  PRYZM already has terrain via its own baked pipeline; no displacement.

---

# SECTION D — Standards & formats: adoption reality 2026

## D.1 — OGC API Features: adoption is REAL and accelerating, but WFS 2.0 still carries Europe

Evidence (all checked 2026-08-31):
- **Own probes:** PDOK serves BAG/BGT/BRK as production OGC API Features (Public Domain, live —
  Section A.2). Kadaster states its key registers "are in the process of being migrated" to OGC
  APIs (https://www.ogc.org/success-stories/... GeoCat story).
- **OGC API Features is an INSPIRE "Good Practice"** for download services
  (https://www.ogc.org/blog-article/inspire-and-ogc-apis-modernizing-inspire/) — i.e. legally
  acceptable INSPIRE delivery, which mattered until the mandate itself dissolved (A.1).
- **Testbed Europe** (OGC iDays Bad Nauheim, Dec 2025) — NMAs of DE, FR, ES, NL, NO, IS, FI
  working the legacy-WFS → OGC-API transition together
  (https://www.ogc.org/announcement/testbed-europe-shaping-the-future-of-geospatial-innovation-together/).
- UK OS NGD API – Features live with CQL2 filtering (OGC blog, checked 2026-08-31).
- **Counter-evidence:** the actually-probed planning/cadastre workhorses this session are still
  WFS 2.0 (ES Catastro, Hamburg XPlanung). **Adapters must speak BOTH for years.**

**Verdict: D (standard), mature; design the adapter SDK's fetch layer around OGC API Features +
CQL2 as the forward target with a WFS 2.0 stored-query/paging fallback — never OGC-API-only.**

## D.2 — PMTiles: mature, mainstream, already PRYZM production

- v3 spec stable; Python lib 3.7.0 (Feb 2026); MapLibre/Martin support; Overture publishes global
  PMTiles; Felt runs user data on it; FOSSGIS 2025 talk. Not an OGC standard — a de-facto
  community format (spec + reference impl BSD-3, Protomaps).
  (https://protomaps.com/blog/pmtiles-v3-whats-new/ · https://guide.cloudnativegeo.org/pmtiles/intro.html,
  checked 2026-08-31)
- **PRYZM verdict: KEEP** (already the production context-tile format). Classification **D/B** ·
  GREEN · no action.

## D.3 — CityGML 3.0 / CityJSON 2.x / FlatCityBuf

- **CityGML 3.0 Part 2 GML Encoding** is now an official OGC standard; **3DCityDB 5.0**
  (early 2025) supports CityGML 3.0; German Länder run ~**56M LoD2 buildings** on 3DCityDB
  (https://www.ogc.org/announcement/ogc-adopts-citygml-3-0-part-2-gml-encoding-as-an-official-ogc-standard/ ·
  https://isprs-annals.copernicus.org/articles/X-4-W6-2025/241/2025/, checked 2026-08-31).
  BUT: national producers still PUBLISH CityGML 2.0/1.0 overwhelmingly; 3.0 is a database/exchange
  reality, not yet a download-portal reality. Adapters must read 2.0 first.
- **CityJSON 2.0** supported across citygml-tools/cjio/QGIS plugin ecosystem (cityjson.org).
  CityJSON remains the developer-friendly encoding of the CityGML model — the right INTERNAL
  interchange for LoD data if PRYZM ever needs one.
- **FlatCityBuf (2025, TU Delft — Baba/Ledoux/Peters):** FlatBuffers encoding of CityJSON;
  10-30% smaller, **9-250× faster deserialisation**, spatial+attribute indices, HTTP range-request
  access; whole-NL in one 70 GB file; code at https://github.com/cityjson/flatcitybuf (permissive)
  (https://isprs-archives.copernicus.org/articles/XLVIII-4-W15-2025/17/2025/, checked 2026-08-31).
  **Maturity: research-grade, single-team, months old.** The brief's stack list (§27) names it —
  verdict: **MONITOR, do not adopt as a dependency yet**; PMTiles+GeoParquet already cover PRYZM's
  delivery needs; FlatCityBuf becomes interesting only if PRYZM starts shipping full semantic LoD2
  city models to the browser (not the current P0-P3 contextual representation).

---

# SECTION E — Digital building-regulation initiatives (XPlanung, BCRL, ACCORD, EUnet4DBP, CHEK + successors)

## E.1 — XPlanung (DE) — the one NATIONAL machine-readable planning-law standard that is production-real

Checked 2026-08-31 (probe + sources in A.2 + below):
- **Standard:** XPlanung/XPlanGML is MANDATORY for German municipal planning data exchange (OZG
  context); versions in the wild: 5.1 (Hamburg probe), 5.3/6.0 (SAGisXPlanung support), 6.x
  current. `BP_Baugebietsteilflaeche` carries **GRZ/GFZ/height/storeys**; `BP_BauGrenze`/
  `BP_BauLinie` are literal building lines — i.e. the exact Product-B vocabulary, standardised.
- **OSS tooling (all alive 2025-2026):**
  - **xPlanBox** (lat/lon, on deegree/OSGeo) — validator + WFS/services stack; source on
    opencode.de, `gitlab.opencode.de/diplanung/ozgxplanung` at **xplanbox-7.0** (checked 2026-08-31).
  - **SAGisXPlanung** — QGIS plugin for authoring/import/export XPlanGML 5.3/6.0
    (https://github.com/nti-de/SAGisXPlanung).
  - **XLeitstelle** publishes the validation rules openly (opencode.de).
  - FOSSGIS 2025 talk "XPlanung mit Open Source Software" (media.ccc.de) — active community.
- Classification: **D (standard) + B (OSS) + A/C (per-Land WFS)** · GREEN · option 1-2.
- **PRYZM action: CONSUME the data; ADAPT-read the schema; do NOT adopt the stack.** xPlanBox is a
  Java/deegree publishing stack for municipalities, not a consumption library. Build the DE
  adapter to parse XPlanGML feature types directly from Länder WFS (probe-proven trivial:
  standard WFS 2.0 + GML). ⚠ Coverage caveat: XPlanung availability differs per Land/municipality;
  many Bebauungspläne are still scanned PDFs — the standard ≠ complete data.

## E.2 — ACCORD (Horizon Europe 101056973, 2022→2025, ENDED) + BCRL

Checked 2026-08-31: https://accordproject.eu/ · https://github.com/Accord-Project · D2.2 PDF
- Built a semantic framework for AUTOMATED BUILDING-PERMIT COMPLIANCE (BIM/IFC-centric): AEC3PO
  ontology, RASE tagging methodology, **BCRL** rule language, rule-formalisation tool, pilots in
  FI/EE/DE/UK/ES.
- **BCRL reality check (this is the §19 answer):** BCRL "populates the ontology with instances of
  compliance elements"; check methods include **SHACL**; the formalisation tool is coupled to
  **Solibri (commercial)** services. **There is NO public BCRL spec/engine repo in the org**
  (probed the GitHub org listing 2026-08-31: 13 repos, none is BCRL; best assets are
  `aec3po` [9★], `CODE-ACCORD` corpus [13★, Apache/open], `accord-nlp` [11★, Apache-2.0]).
  2026 activity: two repo updates. **Verdict: BCRL is a research artefact, not an adoptable rule
  engine — classification D-on-paper/G-in-practice for zoning use.** What IS reusable:
  **CODE-ACCORD** (annotated multilingual building-reg corpus — training/eval data for PRYZM's
  own rule-extraction AI, Apache-licensed) and the **RASE methodology** (requirement/
  applicability/selection/exception tagging — directly maps onto PRYZM's rule-provenance JSON and
  the applicability engine; adopt the METHOD, cite it, skip the stack).
- Institutional continuation: **buildingSMART Regulatory Room** + EUnet4DBP network + annual DBP
  conference (TU Wien 2025 book of abstracts) — standardisation fora, not code.

## E.3 — CHEK (ENDED Dec 2025) — the GIS-side digital-building-permit toolkit

Checked 2026-08-31: https://chekdbp.eu/outcome/ · https://3d.bk.tudelft.nl/projects/chek/
Open-source outputs worth knowing (all on GitHub, probed list):
- **CityJSON validator / data-completeness** (ogcincubator/chek-data-completeness) + val3dity.
- **CityGML2IFC** (peterrdf/gml2ifc) and **IFC→GeoJSON** (abdoulayediak/ifc2geojson).
- **IFC georeferencing** (tudelft3d/ifcgref) + **IFC Building-Envelope Extractor**
  (tudelft3d/IFC_BuildingEnvExtractor — extracts LoD0-2 shells from IFC; useful someday for
  "user's BIM → context model" round-trip).
- **3DCityDB 5.0** (CityGML 3.0-capable).
- Proprietary halves: CYPEUrban rule checks, VC Map context checking, Fraunhofer maturity
  assistant.
**Relevance to PRYZM: LOW-to-MEDIUM today** — CHEK checks a DESIGNED building against rules;
PRYZM generates the ENVELOPE from rules. The convergent insight from CHEK's pilots: rule
digitisation (their "rule interpretation" step) stayed SEMI-MANUAL even in a €M project with
municipal partners; nobody has an automated zoning-rule extractor. PRYZM's AI-extraction +
human-validation pipeline (brief §20) is the same shape everyone landed on. Action: **MONITOR;
lift individual converters if/when BIM interop is needed.**

## E.4 — DigiChecks, EUnet4DBP + the 2026 successor landscape

- The 2021 Horizon call funded THREE sibling IAs — **DigiChecks, ACCORD, CHEK** — all ended
  2025 (https://cordis.europa.eu/programme/id/HORIZON_HORIZON-CL4-2021-TWIN-TRANSITION-01-10,
  checked 2026-08-31). **No direct successor Innovation Action for digital building permits was
  found on CORDIS for 2024-2026** (searched 2026-08-31). The nearest new project is **COMBO**
  (101299049, DFKI, Oct 2026 → Sep 2029, €9M): multilingual LLM/RAG/agentic compliance assistance —
  generic EU-regulation compliance across 5 sectors, NOT building-permit-specific
  (https://cordis.europa.eu/project/id/101299049).
- **EUnet4DBP** (network, TU Delft/TU Wien orbit) remains the community hub; DBP Conference 2025
  proceedings exist (repositum.tuwien.at).
- **Implication for PRYZM:** the EU projects produced methods, corpora, converters and maturity
  models — but NO deployed pan-EU rule service or rule database that PRYZM could consume. The
  regulation-digitisation layer (Product B's rule graph) remains **G (genuinely missing) at
  European scale** → the core H (PRYZM IP) opportunity, exactly as the brief hypothesises.

---

# SECTION F — Flagship building datasets head-to-head (evidence for §16 master-vs-federation)

## F.1 — The contenders, with evidence

| | **Overture buildings** | **EUBUCCO** | **Microsoft GlobalML** | **DBSM R2025 (JRC)** | **National LoD2/3D** |
|---|---|---|---|---|---|
| Coverage | Global; **⊇ OSM proven by PRYZM's own probe** (2026-07-24: Riyadh 5.33×, BCN +24%) | EU-27 + CH, ~202M bldgs | Global, ML footprints | EU-27 complete | Per country: DE ~56M LoD2; NL 3DBAG; CH swissBUILDINGS3D; DK; ES Catastro BU + storeys |
| Heights/floors | Where sources have them — **BCN 73.2% height-or-floors (PRYZM measured)**; Riyadh ~0% | height 73% · year 24% · type 46% (v0.1 paper) | geometry-only (heights only >90%-confidence subset) | height + epoch + use, completeness unstated | **Best available: modelled LoD2 roofs (DE/CH), full-stock height (3DBAG from AHN)** |
| Construction year / use | weak | **best-in-class (its differentiator)** | none | epoch + use (from EUBUCCO) | varies; often in cadastre not 3D model |
| Update cadence | **monthly-ish releases; matching pipeline upgraded July 2026** | frozen harvests (v0.1 2023; v0.2 "spring 2026" UNVERIFIED) | sporadic | **"irregular" (own metadata)** | national cycles (3DBAG regenerates; DE Länder rolling) |
| Stable IDs | **GERS — the only cross-source stable-ID system on offer** | own ids | none | own ids | national ids (BAG id, ALKIS, cadastral ref) — authoritative but per-country |
| Format/access | GeoParquet on S3/Azure (registry.opendata.aws/overture) + PMTiles | GeoParquet/FGB/PMTiles (source.coop) | tiles/parquet | download (JRC catalogue) | WFS/downloads per country |
| Licence | **ODbL** (OSM-derived) — attribution + DB share-alike | ODbL 95%+, **CC-BY-SA Prague, CC-BY-NC Abruzzo (RED pocket)** | ODbL | ODbL | mostly open (DL-DE, CC-BY 3DBAG, CH OGD, ES attribution) — **verify per country** |
| Sources checked 2026-08-31 | docs.overturemaps.org/guides/buildings/ + /attribution/ | nature.com s41597-023-02040-2 · source.coop | via Overture sources breakdown (PRYZM probe) | data.jrc.ec.europa.eu a601a4a8… | ISPRS X-4-W6-2025 (DE 56M) · docs already in repo |

## F.2 — Head-to-head verdict

1. **Standalone Microsoft ingestion is settled: NO.** PRYZM's own 2026-07-24 probe proved MS
   arrives through Overture conflation, deduplicated. (Already decided in
   CONTEXT-BUILDING-SOURCE-EVALUATION.md — this lane found nothing that reopens it.)
2. **EUBUCCO ≠ a competitor to Overture; it is an ENRICHMENT layer.** Its footprints are the same
   national/OSM data, frozen; its unique value is harmonised **construction year + type** and the
   TU-Delft cloud-native mirror. Join it BY GEOMETRY/ID onto whatever backbone is used, for the
   attributes only.
3. **DBSM shows what a static master costs:** built on EUBUCCO v0.1 (already stale), updates
   "irregular". Use for energy-ish attributes (epoch/use/PV) as cross-check, never as backbone.
4. **National LoD2 remains the height/roof gold standard** — PRYZM's Tier A/B design already says
   this; nothing found contradicts it; DE's ~56M LoD2 + 3DCityDB 5.0 confirm scale and freshness.
5. **§16 verdict the evidence supports: FEDERATION + conflation rules wins; the brief's
   expectation is CONFIRMED.** Every attempted European master (EUBUCCO, DBSM) froze and staled
   within a release cycle; the one continuously-conflated global set (Overture) is attribute-poor
   exactly where national sources are rich. The winning shape = Overture as the always-there
   backbone (Tier C, already prototyped) + national LoD2/cadastre override (Tier A/B, already
   designed) + EUBUCCO/DBSM attribute joins where year/use matter — with **per-source provenance
   and priority, which is PRYZM's existing resolveHeight/provenance pattern generalised.**
   **GERS is worth adopting as the cross-source matching KEY** when conflating national data onto
   the backbone (classification D/C, ODbL-compatible, actively maintained — July 2026 pipeline).
6. **Licence note (YELLOW, applies to 1-5):** ODbL's share-alike binds DERIVATIVE DATABASES; a
   PRYZM-served conflated building layer mixing ODbL sources with proprietary data must either
   keep the ODbL portion separable or open the derived DB. Produced WORKS (rendered context,
   envelope calculations citing a building) are fine with attribution. This is the single biggest
   legal design constraint in the buildings stack; the lane recommends the §16 conflation design
   keep source layers SEPARABLE (federated at query time, not physically merged into one DB) —
   which is also the §10 cost answer (options 1/4/6 over 3).

---

# SECTION G — Rule frameworks for §19 (BCRL · RDF/SHACL · JSON Logic · Drools · OpenFisca)

## G.1 — BCRL
See E.2. **Not adoptable as an engine** (no public spec/engine repo, Solibri-coupled tooling,
project ended, minimal 2026 activity). REUSE: RASE tagging methodology (for the rule-extraction
pipeline's annotation schema) + the Apache-licensed **CODE-ACCORD corpus** (multilingual annotated
building regulations — training/eval data for PRYZM's extractor). Class: D-paper/G-practice ·
corpus GREEN (Apache-2.0).

## G.2 — RDF/SHACL
W3C standards, mature, triplestore-centric; ACCORD used SHACL for check methods. Strengths:
graph-shape validation, semantics, linked provenance. Weaknesses for PRYZM: geometry-blind
(GeoSPARQL support is thin in practice), arithmetic/derivation ergonomics poor, heavy runtime for
a TS/browser-first stack. **Verdict: not the rule engine. Optional later use: SHACL-style shape
validation of the evidence graph's consistency — a QA tool, not the applicability engine.**
Class: D · GREEN · no dependency.

## G.3 — JSON Logic
Tiny JSON-serialisable boolean/arithmetic rule encoding; implementations in every language;
deterministic; trivially embeddable in TS and storable inside a rule-graph row. Weaknesses: no
units, no quantifiers, no geometry, no native provenance or versioning — it is an EXPRESSION
format, not a rule system. **Verdict: viable as the SERIALISED BODY of scalar rules inside a
PRYZM-designed rule envelope (parameter/value/unit/source/derivation/confidence per brief §11);
never sufficient alone.** Class: D/B · GREEN (MIT).

## G.4 — Drools
Mature JVM production-rule engine (Rete/Phreak), enterprise pedigree. Wrong on every PRYZM axis:
JVM runtime in a TS/browser-first cloud stack, imperative DRL authoring, no citation-grade
provenance, no time-versioned legal parameters. **Verdict: NO.** Class: B · GREEN (Apache) ·
rejected on architecture fit.

## G.5 — OpenFisca (the §19 special-focus question: who uses it for spatial/planning rules?)
Checked 2026-08-31: https://openfisca.org/en/ · https://openfisca.readthedocs.io/ ·
https://www.codeforaustralia.org/case-studies/dpie-rules-as-code/ · IDB/DPGA listings
- Production rules-as-code in **France (origin, DINUM-backed), New Zealand, Australia (NSW),
  Canada, Spain**; 2026 OpenFisca Conference exists — healthy, funded, AGPL Python.
- **Answer to the brief's question: NOBODY uses OpenFisca for spatial/planning/zoning rules that
  this lane could find (searched 2026-08-31).** The closest, NSW DPIE (a PLANNING department), used
  it for the **Energy Security Safeguard** — scalar certificate calculations from a 120-page
  policy, not zoning. OpenFisca's model is entity-based (person/household/company) with ZERO
  geometry; a parcel-envelope rule (block-derived depth, height planes) cannot be expressed.
- **What to STEAL, not adopt:** its **time-versioned parameter model** — every legislative
  parameter carries validity periods, so "what applied on 2025-01-01" is a native query. That is
  EXACTLY brief §15's versioning requirement. Encode PRYZM rule-graph parameters with
  valid_from/valid_to and point-in-time resolution semantics copied from OpenFisca's design
  (and cite it). Class: B · YELLOW (AGPL-3.0 — engine adoption would trigger copyleft on a
  networked service; another reason to take the pattern, not the code).

## G.6 — The production counter-example: Dutch DSO STTR/IMTR (DMN)
Checked 2026-08-31: https://iplo.nl/digitaal-stelsel/aansluiten/standaarden/sttr-imtr/ ·
https://regels.overheid.nl/docs/methods/DSO · developer.omgevingswet.overheid.nl
- The Netherlands RUNS a national machine-readable planning-rule system in production: STTR
  (Standaard toepasbare regels) on **OMG DMN**, mandatory for authorities feeding the
  Omgevingsloket; IMTR is the info model; delivery via a public API standard.
- **This is the strongest European evidence that "structured-rule country" adapters can consume
  RULES, not just geometry.** The NL adapter should ingest STTR/IMTR + Omgevingsplan (STOP/TPOD)
  rather than re-extracting rules from text. (Deep NL work belongs to the country lane; recorded
  here as the §19 existence proof.) Class: A+C+D for NL · GREEN (overheid.nl open data) · option 1.

## G.7 — Emerging: Open Zoning Feed Specification (OZFS)
Harvard GSD ViBE Lab + Cornell Tech + UBuffalo + Minneapolis Planning, announced 2025-08-19 —
"GTFS for zoning", parcel-level machine-readable zoning schema, US-focused, early/academic, no
published adoption or licence details yet
(http://research.gsd.harvard.edu/vibelab/2025/08/19/open-zoning-feed-specification-ozfs/, checked
2026-08-31). **MONITOR; read the schema when published as design input for PRYZM's canonical
Zone/Prescription model.** Class: D (emerging).

## G.8 — §19 verdict
**No existing framework covers the intersection PRYZM needs** (geometric zoning rules ×
citation-grade provenance × time-versioned parameters × TS/browser-first deterministic
execution). Every credible European attempt confirms the split the brief hypothesises: structured
encodings exist for FORMS of rules (DMN question trees, XPlanung attributes), corpora exist for
EXTRACTION (CODE-ACCORD), engines exist for SCALAR law (OpenFisca) — the geometric applicability
engine is **G (missing) → H (PRYZM IP)**, and PRYZM's rulepacks + provenance JSON are already the
right shape. Composite recommendation: PRYZM-designed rule envelope (H) + JSON-Logic-style
serialised scalar bodies (D) + OpenFisca-style parameter versioning (pattern) + RASE-style
annotation in the extraction pipeline (pattern) + STTR/XPlanung ingestion where countries publish
structured rules (A/C).

---

# CLOSING — Lane 1 classification summary

| Item | Class | Licence | Access opt | Action |
|---|---|---|---|---|
| INSPIRE central infra (geoportal/validator/registry) | was C, now **G** (dismantled 2026) | — | — | pivot to national endpoints + data.europa.eu discovery |
| INSPIRE theme schemas (CP/BU/PLU/AM) | D | GREEN | — | use as normalisation vocabulary only |
| National INSPIRE/OGC endpoints (ES/NL/DE probed live) | A+C | GREEN | 1-2 | CONSUME via country adapters (existing pattern) |
| data.europa.eu (DCAT/SPARQL) | C | GREEN | 6 | use as source-discovery registry (brief §21) |
| EuroGeographics OME2 / Open Cadastral Map | A | YELLOW (licence text unverified) | 6 | MONITOR; bootstrap fallback for 15 countries |
| JRC DBSM R2025 | A | YELLOW (ODbL) | 2/5 | cross-check + epoch/use enrichment |
| EUBUCCO | A | YELLOW (ODbL; RED pockets) | 4 | CONSUME year/type attributes; verify v0.2 |
| Copernicus UA Building Height 2021 / CLC+ | A | GREEN | 6 | fallback height prior |
| Overture buildings (+ GERS) | A+C | YELLOW (ODbL) | 4 | already adopted Tier C; adopt GERS as conflation key |
| Microsoft GlobalML standalone | A | YELLOW (ODbL) | — | REJECT standalone (settled by PRYZM probe) |
| National LoD2 (DE 56M / 3DBAG / CH / DK) | A | GREEN-ish per country | 1-2 | Tier A/B adapters (existing design) |
| OGC API Features + CQL2 | D | — | — | adapter fetch-layer target; keep WFS 2.0 fallback |
| PMTiles | D/B | GREEN | — | KEEP (production) |
| CityGML 3.0 / CityJSON 2.x | D | GREEN | — | read 2.0 first; CityJSON for LoD interchange if needed |
| FlatCityBuf | B/D | GREEN (permissive) | — | MONITOR (research-grade) |
| XPlanung + xPlanBox/SAGisXPlanung | D+B+A/C | GREEN | 1-2 | CONSUME XPlanGML from Länder WFS; skip the Java stack |
| ACCORD/BCRL | D-paper/G-practice | corpus GREEN | — | steal RASE + CODE-ACCORD corpus |
| CHEK toolkit | B | GREEN (OSS parts) | — | MONITOR; lift converters for BIM interop later |
| EUnet4DBP / DBP conference / bSI Regulatory Room | community | — | — | MONITOR (no code) |
| COMBO (2026-2029, DFKI) | C future | — | — | MONITOR (generic compliance LLM) |
| RDF/SHACL · JSON Logic · Drools · OpenFisca | D/B | GREEN/AGPL | — | per G.2-G.5: patterns yes, engines no |
| DSO STTR/DMN (NL) | A+C+D | GREEN | 1 | NL adapter consumes rules directly |
| OZFS (US, 2025) | D emerging | unknown | — | MONITOR |
| Geometric applicability + envelope engine | **G → H** | — | — | **PRYZM IP — confirmed by every EU project ending semi-manual** |

## Honest gaps of this lane (things NOT verified)
1. OME2/Open Cadastral Map licence TEXT (JS portal did not render) — YELLOW until read.
2. EUBUCCO v0.2 existence/date/licence — search-level claim only; eubucco.com not probed.
3. MDPI IJGI 15(6):252 (pan-EU building-dataset semantic comparison) — 403; would sharpen F.1's
   attribute-coverage numbers per dataset.
4. No PLU-specific national endpoint was probed beyond DE (Hamburg native XPlanung); FR GPU and a
   transformed INSPIRE-PLU service remain unprobed in THIS lane (country lanes own them).
5. DigiChecks outcomes not individually audited (ACCORD/CHEK were; DigiChecks assumed sibling).
6. OGC API Features adoption was probed for NL only; FR/FI/DE OGC-API production endpoints not
   individually probed.
7. data.europa.eu geospatial-filter/geo-viewer functional quality not probed (announced features).
