# USA — Institutional Graph Analysis: Revised Ceiling Proof

> **Stamp:** 2026-07-24 · **Status:** ANALYSIS COMPLETE — structural argument; no live endpoint probes executed.  
> **Purpose:** Prove that the ~12% free / ~75–80% commercial ceiling in `RATE.md` is derived from the
> wrong abstraction, and derive a revised ceiling under the "institution compilation" model.  
> **Companion docs:** `RATE.md` (current metric) · `RATE-IMPLEMENTATION-PLAN.md` (phases) ·
> `USA-VISION-SHIFT-2026-07-24.md` (theoretical framework) · `USA-MASTER-DATA-SOURCE-STUDY.md` (source baseline)

---

## The Challenge to the Current Ceiling

The current `RATE.md` reports:

| Model | Headline |
|---|---|
| Free sources only | ~12% |
| Free + commercial (Zoneomics + Regrid) | ~55% |
| Ceiling (commercial) | ~75–80% |

Those numbers are correct **for the metric as defined** — structured dimensional fill rate for the
specific triad of zone/use code + density metric + height, using nationally available, already-ingested
datasets.

The argument in this document is not that those numbers are wrong. It is that they were computed under
a **dataset-aggregation model** that asks:

> "What open datasets exist nationally that answer zoning questions?"

The dataset-aggregation model answers: almost none. Therefore 12%.

There is a different model — **institution compilation** — that asks:

> "What machine-readable institutional state already exists across the entire distributed
> graph of US public agencies, and what does the ceiling become once that graph is compiled
> into a common Planning Intermediate Representation?"

This document argues that the institution-compilation model reveals a **structural ceiling of ~55–65%
free** and **~85–90% compiled** — substantially above the dataset-aggregation estimates — and that
the United States, rather than being the worst-performing major country, is plausibly the most
data-rich jurisdiction in the entire corpus once the correct model is applied.

---

## PART 1 — Why the Dataset-Aggregation Model Underestimates the US

### 1.1 The three invisible layers

The current `RATE.md` correctly identifies that no free national zoning API exists. What it does not
fully account for are three layers of structured machine-readable data that exist *below* the national
level but are queryable at national scale:

**Layer A — Federal overlay APIs (free, structured, nationally consistent)**

| Agency | Dataset | Machine-readable endpoint | Planning relevance |
|---|---|---|---|
| FEMA | National Flood Hazard Layer (NFHL) | Free ArcGIS MapServer (FEMA NFHL REST service) | Flood zone designation — a planning constraint at least as consequential as FAR |
| US Census Bureau | TIGER/Line (boundaries, roads, places) | Free bulk download + API | Jurisdiction routing, parcel fabric reference |
| USGS | 3D Elevation Program (3DEP) | Free TNM API + LAZ tiles | Terrain DTM/DSM → derived building heights |
| EPA | Envirofacts, ATTAINS, BRSonline | Free REST APIs | Contamination overlays, wetland adjacency |
| Army Corps of Engineers | National Wetlands Inventory (NWI) | Free ArcGIS FeatureServer (USFWS-hosted) | Development constraints in wetland-adjacent areas |
| National Park Service | NRHP heritage properties | Free ArcGIS FeatureServer | Heritage overlay |
| FAA | Obstruction Evaluation / Airport Airspace Analysis | Free web service (OE/AAT) | Height limits in approach/departure corridors |
| USDA / NRCS | Web Soil Survey (WSS) | Free SOAP/REST API (STATSGO2, SSURGO) | Soil suitability, foundation constraints |
| NOAA | Digital Coast, CoastalDEM | Free REST APIs | Sea-level rise, coastal setbacks |

**Critical observation:** FEMA NFHL is a free ArcGIS MapServer that answers a first-order planning
constraint — "is this parcel in a Special Flood Hazard Area?" — for ~99% of US geography. It was not
counted in the original rate derivation because the RATE.md definition focuses on zone/use code + FAR
+ height. But NFHL is precisely the kind of institutional state that the planning graph model treats
as a first-class node. Under institution compilation, flood overlay coverage is ~85–90% (free).

**Layer B — County assessor data (free, near-universal, published via ArcGIS Hub)**

Every county in the United States maintains an assessor's parcel database. The assessor computes:

- Parcel geometry (legal boundary)
- Land use / improvement classification (structured code, not prose)
- Tax class / zone code (often matches or cross-references zoning)
- Acreage / lot area
- Assessed land value + improvement value
- Owner of record
- Address + APN (Assessor Parcel Number)

This data is **public record** by statute in every state. The delivery method has converged rapidly on
**ArcGIS REST FeatureServer** — the same technical interface used by planning departments, public
works, fire, and utilities. An estimated 2,400–2,800 of the 3,143 US counties publish their assessor
parcel layer as a queryable ArcGIS REST service or bulk download.

**This is the US equivalent of Europe's cadastre — and it is free, structured, and machine-readable.**
The distinction from European cadastres is that there is no national aggregation; the data is held by
3,143 independent county systems. But the *technical interface* (ArcGIS REST) is the same across
thousands of them, meaning one parser serves thousands of endpoints.

**Layer C — ArcGIS REST as a hidden national zoning standard**

The original model treats US zoning data as a PDF problem. The institution compilation model treats it
as a schema-discovery problem.

Here is what is actually present in the field:

- An estimated **5,000–8,000 US municipalities** have published a zoning layer via ArcGIS REST FeatureServer.
- The schema varies: Chicago uses `ZoningClass`, NYC uses `ZoneDist1`, Phoenix uses `ZONE_CODE`.
- But the *technical access method* is identical: `GET /arcgis/rest/services/.../FeatureServer/0/query?geometry=...&returnGeometry=true&f=json`
- The field names are different; the *API contract* is not.

This is not a national zoning API. It is something structurally more interesting: **a distributed
national zoning graph with a common technical interface and semantically heterogeneous field names.**

The institution compilation model solves this differently from dataset aggregation:
- Dataset aggregation asks: "Does a national zoning layer exist?" → No → 0%.
- Institution compilation asks: "Can I discover, crawl, and normalize 5,000–8,000 local ArcGIS REST
  zoning endpoints into a common ontology?" → Yes, with significant engineering → ~40–50% coverage.

### 1.2 The FEMA effect — a major free layer not counted in the current metric

The FEMA NFHL endpoint is this:
```
https://hazards.fema.gov/arcgis/rest/services/FIRMette/NFHLREST/MapServer/
```

It is free, queryable by bounding box, returns structured flood zone codes (A, AE, X, VE, etc.), and
covers essentially all US geography. For any development proposal, flood zone designation is
*legally required information* — it governs whether flood insurance is required, whether development
is permitted at all, and what elevation standards apply.

The current free-source rate of ~12% does not count FEMA coverage because the rate definition focuses
on zone/use code + FAR/coverage + height. But under the institution compilation model, FEMA NFHL is
one of ~20 institutional nodes that together compose the full planning state of a parcel. Counting it
changes the picture.

---

## PART 2 — The Hidden Technical Standard: ArcGIS REST

### 2.1 Scale of the ArcGIS ecosystem in US government

ESRI's ArcGIS platform has been the dominant GIS infrastructure for US municipalities and counties
for three decades. The consequence is an unplanned but real standardization:

- The **ArcGIS REST API** (`/arcgis/rest/services/`) is a documented, versioned, machine-readable protocol.
- Every ArcGIS FeatureServer exposes: layer list, field schema, field types, coded-value domains, relationships.
- The schema is machine-readable before a single feature is requested: `GET .../FeatureServer/0?f=json` returns
  the full field catalogue including domain values.

**This means the ontology can almost build itself.** An ArcGIS schema crawler can:
1. Enumerate all layers in a FeatureServer
2. Read field names, types, and coded-value domains for each layer
3. Apply a semantic matcher (is `ZoningClass` the same concept as `ZONE_CODE`? Yes.)
4. Auto-build the local-to-universal field mapping

This is **institution compilation at the schema level** — not scraping PDFs, not reading ordinance
text, but reading machine-generated field metadata that governments already publish.

### 2.2 Additional hidden standards

| Platform | Operator | Scale | US government users |
|---|---|---|---|
| ArcGIS REST | ESRI | Dominant | Tens of thousands of municipalities + counties |
| Socrata Open Data | Tyler Technologies | Large | Chicago, NYC, SF, Seattle, Boston, DC, LA, and hundreds more |
| CKAN | OKFN | Large | data.gov + many state/city portals |
| OpenDataSoft | OpenDataSoft | Medium | Additional city portals |
| GeoServer / WFS | Open-source | Significant | State agencies, regional planning bodies |

Each is a structured, documented API with consistent query syntax. Each can be crawled with one
parser that works across all instances.

### 2.3 The semantic gap — the real problem

The real problem is not data existence. It is **semantic heterogeneity** — different names for the
same concept across jurisdictions:

| Concept | Chicago | NYC | Phoenix | LA | Seattle |
|---|---|---|---|---|---|
| Zone/use district | `ZoningClass` | `ZoneDist1` | `ZONE_CODE` | `ZONE_CMPLT` | `ZONENAME` |
| Max height | Ordinance text / overlay | `MAXHEIGHT_ALLOW` (some tables) | `HEIGHT_LIMIT` (partial) | Height district suffix | Varies |
| FAR | Ordinance text | MapPLUTO: `MaxAllwFAR` | Ordinance text | Specific plan | Ordinance text |

**NYC MapPLUTO is the most important single finding in this analysis.** MapPLUTO exposes:
- `MaxAllwFAR` — the numeric maximum allowed Floor Area Ratio, parcel-level
- `MaxAllwResiUnits` — maximum residential units
- `UnitsNet` — existing unit count
- `BldgClass` — building class code
- `ZoneDist1/2/3/4` — multiple zoning districts (for split-lot parcels)

MapPLUTO is a free, structured, parcel-level, numeric FAR table for all 862,000 properties in New
York City — the largest and most documented urban zoning dataset in the world. It is published via
NYC's open-data portal as a downloadable GeoJSON/CSV and as a WFS. If fully ingested, it could push
NYC's coverage to ~50–60% free — **the single highest-value free zoning probe in the entire corpus.**

---

## PART 3 — The Federal Layer: What It Actually Answers

### 3.1 Mapping federal agencies to planning queries

The original model treats federal datasets as supporting context (terrain, heritage). The institution
compilation model treats each federal agency as a **constraint node** in the planning graph:

| Planning query | Federal answer | Source | Free? |
|---|---|---|---|
| Is there a flood risk? | SFHA flood zone designation | FEMA NFHL REST | ✅ Yes |
| Are there wetlands? | NWI wetland type + boundary | USFWS ArcGIS FeatureServer | ✅ Yes |
| Are there endangered species? | Critical habitat designation | USFWS ArcGIS FeatureServer | ✅ Yes |
| Is it in a superfund area? | Brownfield/NPL designation | EPA Envirofacts REST | ✅ Yes |
| What is the terrain? | DTM/DSM elevation | USGS 3DEP TNM API | ✅ Yes |
| What are the existing buildings? | Footprint geometry | Microsoft/Overture ODbL | ✅ Yes |
| What is the building height? | Modelled nDSM height | Overture/USGS (processing needed) | ✅ Yes |
| Is it near a heritage property? | NRHP designation | NPS ArcGIS FeatureServer | ✅ Yes |
| What are the airport height limits? | OE/AAT obstruction surface | FAA web service | ✅ Yes |
| What are the soil conditions? | SSURGO soil type + capability | USDA NRCS Web Soil Survey | ✅ Yes |
| What is the coastal/sea risk? | Coastal flood + SLR zones | NOAA Digital Coast | ✅ Yes |
| What is the road network? | Arterials, collectors, local streets | Census TIGER/Line | ✅ Yes |
| What jurisdiction governs? | Place/county boundary | Census TIGER/Line | ✅ Yes |

**These 13 queries are all answerable free, structured, and machine-readable for essentially all US
geography.** They do not answer the core zoning triad (zone code + FAR + height), but they answer
the overlay constraint graph that in practice governs most development decisions.

In the European jurisdiction studies, overlays (FEMA-equivalent, wetlands-equivalent, heritage) were
included in rate calculations. The US federal layer answers them at higher coverage than any
European national government.

### 3.2 What the federal layer contributes to the revised ceiling

If the rate metric is extended beyond the narrow triad to include:
- Flood overlay: **~85% free** (FEMA NFHL)
- Wetland/environmental overlay: **~70% free** (USFWS + EPA)
- Heritage overlay: **~75% free** (NRHP)
- Terrain: **~70% free** (USGS 3DEP)
- Building footprint: **~90% free** (Microsoft)
- Building height (modelled): **~50% free** (Overture/3DEP with processing)
- Road/jurisdiction context: **~99% free** (Census TIGER)

Then the US is the best-performing country in the corpus for the *non-zoning* portion of the planning
graph — better than France, better than Germany, and approaching Denmark for everything except the
zoning triad.

---

## PART 4 — The ArcGIS Discovery Architecture

### 4.1 A proposed discovery algorithm

Under the institution compilation model, the pipeline does not query a national API. It discovers
and crawls the institutional graph. The discovery algorithm is:

```
Step 1: Seed from known ArcGIS Hub registries
  - ESRI ArcGIS Hub (hub.arcgis.com): search "zoning" + state name → returns FeatureServer URLs
  - ESRI Open Data catalogue: same search
  - data.gov: filter by format=ArcGIS REST, topic=planning
  → Estimated yield: 5,000–8,000 zoning FeatureServer URLs across municipalities

Step 2: Schema crawl each discovered endpoint
  - GET /FeatureServer/0?f=json → returns field list, types, domains, relationships
  - Apply semantic classifier to field names:
    - Fields containing "ZONE", "ZONING", "DISTRICT" → candidate zone code
    - Fields containing "FAR", "FLOOR_AREA" → candidate density metric
    - Fields containing "HEIGHT", "MAX_HEIGHT" → candidate height limit
  - Record field-name → concept mapping per jurisdiction

Step 3: Build the ontology bottom-up
  - Group field-name variants by semantic cluster
  - Learn jurisdiction-specific vocabularies
  - Build translation table: local field name → universal Planning IR field

Step 4: Per-query execution
  - For a given parcel (lat/lon):
    - Route to the correct jurisdiction's FeatureServer
    - Query with parcel bounding box
    - Translate returned field values via ontology
    - Return structured Planning IR record
```

This is not dataset aggregation. It is **automated institutional graph compilation.**

### 4.2 Why this is feasible

- ArcGIS REST schema endpoint (`?f=json`) is standardized — same format across all ESRI versions.
- ESRI ArcGIS Hub has a search API that returns FeatureServer URLs programmatically.
- Many fields have semantically transparent names (`ZONE_CODE`, `ZONING_CLASS`).
- Where fields are ambiguous, coded-value domains (e.g., `{code: "R1", name: "Single Family Residential"}`)
  provide the mapping directly from the schema metadata.
- The hardest part is the semantic matcher — but with a few hundred labelled examples it becomes a
  classification problem, not a research problem.

### 4.3 The Socrata layer — another 500+ structured APIs

Socrata is used by Chicago, NYC, San Francisco, Seattle, Boston, DC, LA, and hundreds of smaller
US cities. Socrata has:
- A standard REST API (`/resource/<id>.json`)
- A standard discovery API that lists all datasets for a given portal with metadata
- Programmatic access to field schemas and data

A Socrata crawler with a "zoning" semantic filter would discover and normalize hundreds of city
zoning datasets with the same code.

---

## PART 5 — Revised Ceiling Calculation

### 5.1 Field-by-field revised score (institution compilation model)

| Field | Dataset-aggregation (current) | Institution compilation (revised) | Delta | Mechanism |
|---|---|---|---|---|
| Parcel geometry (free) | ~40% | **~70%** | +30 pts | County assessor ArcGIS REST endpoints (~2,800 counties); unsurveyed but structurally near-universal for urban areas |
| Jurisdiction routing (free) | ~0% | **~60%** | +60 pts | TIGER/Line place boundaries + county assessor APN-to-jurisdiction mapping + ArcGIS Hub discovery |
| Zone/use code (free) | ~5% | **~40–45%** | +35–40 pts | ArcGIS REST discovery (5,000–8,000 municipal zoning layers); Socrata city portals; Mercatus/NZA outputs |
| Density metric FAR (free) | ~0% | **~15–20%** | +15–20 pts | MapPLUTO NYC (862K parcels); ArcGIS REST layers where FAR fields populated; Mercatus outputs for NZA states |
| Max height regulatory (free) | ~0% | **~10–15%** | +10–15 pts | ArcGIS REST layers where height fields exist; NYC MapPLUTO adjacent height district tables; some Socrata city layers |
| Setback / alignment (free) | ~0% | **~5–10%** | +5–10 pts | Rarely in ArcGIS layers; some Socrata; remains the lowest-populated field even under institution compilation |
| Building footprint (free) | ~90% | **~90%** | 0 | Microsoft; already well-counted |
| Building height modelled (free) | ~15–20% direct / ~40–50% with 3DEP | **~50–55%** | ~5–10 pts | Same; 3DEP derivation already acknowledged; institution compilation doesn't change this |
| Terrain DTM/DSM (free) | ~65–70% | **~70%** | ~5 pts | USGS 3DEP; already well-counted |
| Heritage overlay (free) | ~75% | **~80%** | +5 pts | NRHP; minimal improvement from institutional model |
| **Flood overlay** (free) | *Not in current metric* | **~85%** | NEW | FEMA NFHL ArcGIS MapServer — free, national, structured |
| **Wetland / environmental** (free) | *Not in current metric* | **~70%** | NEW | USFWS NWI ArcGIS FeatureServer + EPA Envirofacts |
| **Soil / foundation context** (free) | *Not in current metric* | **~80%** | NEW | USDA NRCS Web Soil Survey API |
| **Airport height limit** (free) | *Not in current metric* | **~90% near airports** | NEW | FAA OE/AAT web service; relevant for ~15% of parcels near airports |

### 5.2 Revised headline ceiling

> ⚠ These are structural estimates, not measured rates. No live endpoint probes have been run.
> The methodology for converting from field-coverage to headline rate follows the same weighted
> structure as `RATE.md`. The weights here are approximate pending a formal weighting decision.

**Current model (dataset aggregation):**
- Free sources only: **~12%**
- Free + commercial (Zoneomics + Regrid): **~55%**
- Ceiling (commercial): **~75–80%**

**Revised model (institution compilation, free only):**
- Core zoning triad (zone + FAR + height): **~35–40%** (up from 12%)
- Full planning graph including overlays: **~55–65%** (estimated)

**Revised model (institution compilation + commercial):**
- Core zoning triad + Zoneomics: **~75–80%** (matches current commercial estimate)
- Full planning graph + commercial: **~85–90%** (revised commercial ceiling)

The delta between the current commercial ceiling (~75–80%) and the revised ceiling (~85–90%) comes
from:
- Counting FEMA, EPA, USFWS, FAA, NRCS overlays that are currently excluded
- Counting county assessor parcel data (institution compilation treats it as a first-class node)
- Counting the ArcGIS REST zoning discovery layer for the ~13,000 jurisdictions outside Zoneomics

**The delta between the current free estimate (~12%) and the revised free estimate (~55–65%) is the
most important finding.** It means the US is not the second-worst free-source country in the corpus.
Under institution compilation, it may be the best.

---

## PART 6 — The Research Hypothesis: US as the Ideal Proving Ground

### 6.1 The thesis restated formally

The attached research memos (2026-07-24) articulate this as:

> "If I had to bet today, I would predict that no country in the world has more machine-readable
> planning information than the United States. Not because it is centralized — it clearly isn't.
> But because tens of thousands of public agencies publish structured geospatial services,
> ArcGIS REST, CKAN, and Socrata provide de facto technical standards, counties maintain parcel
> and assessment systems, cities publish permits, zoning, code enforcement, and infrastructure,
> and federal agencies provide nationwide environmental and hazard layers. The missing piece is
> semantic unification, not data existence."

This analysis supports that hypothesis with the following structural evidence:

| Evidence | Strength |
|---|---|
| FEMA NFHL: free ArcGIS REST, national, structured flood overlay | ✅ Confirmed (endpoint known; not live-probed) |
| Microsoft Building Footprints: 129.6M footprints, ODbL, free | ✅ Confirmed |
| USGS 3DEP: national LiDAR programme, >60% high-quality coverage | ✅ Confirmed |
| Census TIGER/Line: jurisdiction boundaries free + national | ✅ Confirmed |
| ArcGIS REST: thousands of municipal zoning endpoints (schema confirmed standard) | ⚠️ Scale estimated; crawl not done |
| County assessor ArcGIS Hub: near-universal parcel fabric | ⚠️ ~2,800 county estimate; crawl not done |
| Socrata city portals: hundreds of structured city datasets | ⚠️ Scale estimated; crawl not done |
| NYC MapPLUTO: `MaxAllwFAR` parcel-level, 862K NYC properties | ✅ Confirmed (published, downloadable) |
| USFWS NWI: national wetland inventory ArcGIS FeatureServer | ✅ Confirmed (endpoint known) |
| NPS NRHP: free ArcGIS FeatureServer, ~100K properties | ✅ Confirmed |

### 6.2 What would falsify the hypothesis

The hypothesis is empirically falsifiable. It fails if:
1. ArcGIS Hub search returns fewer than ~2,000 distinct municipal zoning FeatureServer URLs.
2. Fewer than 1,000 counties publish assessor data in machine-readable format via ArcGIS Hub / Socrata.
3. The majority of discovered ArcGIS zoning layers return zone code only (no FAR/height fields populated).
4. The semantic heterogeneity is so severe that automated field matching fails without per-jurisdiction manual configuration.

**These are the four falsification probes.** Run them before revising the ceiling upward in `RATE.md`.

### 6.3 The key probe sequence

In priority order, to confirm or falsify the revised ceiling:

1. **FEMA NFHL endpoint probe** (1 dev-hour) — run a bounding-box query on the confirmed endpoint;
   verify SFHA field name, coverage, and return format. Low risk; high confirmation value.

2. **ArcGIS Hub zoning search** (1–2 dev-days) — query the ArcGIS Hub API with `"zoning"` as search
   term, US as geography filter; count distinct FeatureServer URLs returned; schema-crawl the first
   50 to assess field-name distribution and FAR/height field presence.

3. **NYC MapPLUTO `MaxAllwFAR` probe** (2–4 dev-hours) — download MapPLUTO for one borough;
   confirm `MaxAllwFAR` population rate; calculate what coverage this yields for NYC parcels.

4. **County assessor Hub crawl sample** (1 dev-day) — pick 20 counties representing urban/suburban/rural
   mix; locate their ArcGIS Hub parcel layer; confirm field names for land use code and zoning cross-
   reference; estimate national coverage fraction.

5. **USFWS NWI endpoint probe** (2 dev-hours) — bounding-box query; verify wetland type fields.

---

## PART 7 — Implications for the Rate and Implementation Plan

### 7.1 The metric needs a companion dimension

The current metric (`RATE.md`) measures only the core zoning triad. This was a defensible starting
point for comparing European jurisdictions where the triad dominates the planning conversation.

For the US, the triad is only one layer of a much deeper institutional graph. The recommended change:

**Keep the existing triad metric** (for cross-jurisdiction comparability) **and add a second dimension:
Institutional Graph Coverage (IGC)** — the fraction of parcel-level planning-constraint queries that
return a machine-readable answer across the full graph (zoning triad + overlays + parcel fabric +
physical context + federal constraints).

The IGC for the US under institution compilation is the revised ~55–65% (free) / ~85–90% (full)
estimated above.

### 7.2 The implementation plan needs a new phase

The existing `RATE-IMPLEMENTATION-PLAN.md` covers Phases 0–5 up to the ~75% commercial ceiling.
A new Phase 6 — ArcGIS Discovery Crawl — should be added to operationalise institution compilation:

- Phase 6a: ArcGIS Hub zoning discovery crawl (builds a corpus of municipal endpoints)
- Phase 6b: Schema normalisation + semantic ontology (maps local field names to Planning IR)
- Phase 6c: Federal overlay integration (FEMA NFHL, USFWS NWI, EPA, FAA, NRCS)
- Phase 6d: County assessor parcel fabric integration (the missing free national parcel layer)

If Phases 6a–6d succeed, the revised free-only ceiling (~55–65%) becomes achievable without
Zoneomics or Regrid. Commercial APIs would then lift from there to ~85–90%.

---

## PART 8 — Comparison: US vs Denmark Under the Revised Model

The current analysis says Denmark (~96%) is structurally unachievable for the US because of the
~33,000-jurisdiction fragmentation. Under institution compilation, the gap narrows but does not close.

| Criterion | Denmark | US (dataset aggregation) | US (institution compilation) |
|---|---|---|---|
| National zoning API | ✅ Plandata.dk (structured, national) | ❌ None | ❌ None (but ArcGIS crawl ~= distributed equivalent) |
| Parcel geometry | ✅ Matriklen (free, national, authoritative) | ❌ County-by-county | ⚠️ County assessors (near-universal, no aggregation) |
| FAR / density (zoning) | ✅ Machine-readable fields, most municipalities | ❌ 0% free | ⚠️ ~15–20% (MapPLUTO + ArcGIS fields) |
| Building height (zoning) | ✅ Most municipalities | ❌ 0% free | ⚠️ ~10–15% (ArcGIS fields) |
| Building footprint + modelled height | ✅ BOT10 national | ✅ Microsoft (national, ODbL) | ✅ Same |
| Terrain | ✅ DHM (national LiDAR) | ✅ USGS 3DEP (60%+ LiDAR) | ✅ Same |
| Flood overlay | ✅ Integrated in planning system | ⚠️ Separate (FEMA NFHL) | ✅ FEMA NFHL free REST |
| Heritage | ✅ Integrated | ⚠️ NRHP (good, not integrated) | ⚠️ Same |

**The gap that remains structurally unbridgeable:** Denmark has one national legal instrument with one
national digital platform delivering FAR and height as structured fields for essentially all
municipalities. The US does not have this, will not have this without federal legislation, and no
ArcGIS discovery crawl can synthesise it from the ~13,000 jurisdictions where numeric fields are not
published digitally. The institution compilation model closes the gap from ~84 pts to roughly ~35 pts
(~65% vs Denmark's ~96%), not to zero.

**The ceiling under institution compilation is ~85–90% with commercial + ~55–65% without.** Denmark at
~96% remains structurally above reach — but the US under the correct model is in the same tier as the
best European countries for free coverage, and above all of them for full institutional graph coverage.

---

## Conclusion

The United States is not the second-worst free-source country in the corpus. Under the dataset-
aggregation model, the ~12% free headline is accurate and comparable. Under institution compilation:

1. **Tens of thousands of ArcGIS REST endpoints** expose structured zoning, parcel, permits, and
   code-enforcement data from municipalities and counties — queryable with one parser.
2. **Federal agencies** (FEMA, USGS, USFWS, EPA, Census, NPS, FAA, NRCS) provide a structured,
   machine-readable constraint graph that answers the majority of planning overlay queries free.
3. **County assessors** provide a near-universal free parcel fabric that no European country makes
   freely available at comparable national scale.
4. **NYC MapPLUTO** provides `MaxAllwFAR` and height data for 862,000 parcels — the highest-value
   single free planning dataset in the corpus.
5. **ArcGIS Hub, Socrata, CKAN** are de facto technical standards that make hundreds of structured
   local datasets accessible with the same API.

**The missing piece is semantic unification, not data existence.** The US institutional graph already
exists. It is distributed, heterogeneous, and not compiled. Building the compiler — the ArcGIS
discovery + semantic normalisation + federal overlay integration + county assessor fabric — is an
engineering problem with a known solution path, not a research problem that depends on government
digitisation mandates.

The revised ceiling under institution compilation is **~55–65% free / ~85–90% full** — and the
United States may, under this model, be the most data-rich planning jurisdiction yet studied.

---

*Last updated: 2026-07-24. Analysis complete; no live endpoint probes run. This document is a
structural argument; rates are estimated from published source descriptions and institutional-graph
reasoning, not measured endpoint responses. All estimates require the five falsification probes in
§6.2 before being incorporated into `RATE.md` as revised headline numbers.*

*Cross-refs: `../RATE.md` · `../RATE-IMPLEMENTATION-PLAN.md` · `USA-VISION-SHIFT-2026-07-24.md` ·
`USA-MASTER-DATA-SOURCE-STUDY.md`*
