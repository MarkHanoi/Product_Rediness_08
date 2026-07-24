# Rate Implementation Plan — USA (`us`) national

**Current rate:** `~12% (free sources)` (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling (free only):** `~28–30%` ·
**Realistic ceiling (commercial):** `~75–80%` ·
**Gap to Denmark (~96%):** `~84 pts (free) / ~41 pts (commercial)` ·
**Last updated:** `2026-07-24` · **Owner:** `UNASSIGNED`

---

## 1 — The ceiling: what "maximum" means here

**Free-only ceiling: ~28–30%.** Achievable by combining Microsoft building footprints (~90%
coverage), USGS 3DEP-derived modelled heights (~50% with processing effort), NRHP heritage
(~75%), and city-by-city zoning layer harvesting for major metro areas (zone codes, but numeric
FAR/height absent from most free portals). The zoning ceiling is capped by the ~33,000-
jurisdiction fragmentation — no free national numeric zoning API exists and is not expected
from government sources. Even with aggressive city-portal harvesting, the ~30% ceiling holds
because only zone codes (not FAR/height/setbacks) are typically available free.

**Commercial ceiling: ~75–80%.** Achievable with Zoneomics (zone + FAR + height for 20,000+
cities) + Regrid (parcel routing for 99% of Americans) + Microsoft footprints + Overture/USGS
heights, assuming Zoneomics numeric fields (FAR, height) are populated for covered cities.
The remaining ~20–25% gap to Denmark (~96%) is structurally hard: ~13,000 jurisdictions
outside Zoneomics coverage, non-conforming uses with no numeric rule, unzoned rural territory,
and no national digitisation mandate to close those gaps.

**Denmark (~96%) for the US:** not achievable without either a government-mandated national
digitisation programme (does not exist) or a fully automated ordinance-reading pipeline across
~33,000 jurisdictions (NZA says is not yet reliable). The structural fragmentation is the
hard ceiling.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — probe Chicago open zoning portal + Overture height for Chicago bbox + NRHP endpoint; write RATE.md | The honest free-source baseline | — → `~12%` | 1–2 dev-days | VERIFIED (research; no live probes) | UNASSIGNED |
| **1a** | Ingest Microsoft Building Footprints for three pilot cities + join Overture/USGS heights | Building context LOD1 with height for Chicago/LA/NYC | `~12%` → `~20%` | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **1b** | Harvest city open-data zoning layers (Chicago, LA, NYC) — zone codes + any free numeric attributes | Free zoning coverage for the three pilot cities | `~20%` → `~22%` | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **1c** | Ingest NRHP ArcGIS feature service + NRIS join | Heritage overlay for all US parcels | `~22%` → `~25%` | 1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Contract + integrate Zoneomics API for Chicago, LA, NYC (then expand) | Numeric FAR + height + use code for covered cities | `~25%` → `~55%` | 3–5 dev-days (integration); cost TBD | NOT STARTED | UNASSIGNED |
| **3** | Contract + integrate Regrid parcel API — jurisdiction routing + parcel context | Parcel-level routing for all US queries; parcel geometry for counties without free portal | `~55%` → `~65%` | 3–4 dev-days; cost TBD | NOT STARTED | UNASSIGNED |
| **4** | 3DEP nDSM pipeline — derive building heights from USGS LiDAR for footprints Overture does not cover | Height coverage climbs from 15% toward 50% | `~65%` → `~70%` | 5–7 dev-days (point-cloud pipeline) | NOT STARTED | UNASSIGNED |
| **5** | Expand Zoneomics + Regrid to full national coverage; harvest Mercatus/NZA partner states | Raises coverage toward commercial ceiling | `~70%` → `~75%` (ceiling) | Ongoing | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Three structural factors separate the US from the 96% ceiling model:

**(a) No national zoning digitisation mandate.** Denmark's Plandata.dk delivers structured
zone + numeric density + height as machine-readable fields for all Danish municipalities —
there is no US equivalent and no federal legislation to create one. ~33,000 jurisdictions,
each with its own ordinance, means a Plandata-equivalent would require 33,000 separate
ingestion agreements or one commercial aggregator (Zoneomics) that still covers only 60% of
jurisdictions.

**(b) Commercial dependency.** The US path to 55–65% runs entirely through paid commercial
APIs (Zoneomics, Regrid). This is a different kind of risk than Denmark's government-mandate
risk — it is a vendor risk. If Zoneomics pricing changes, coverage updates, or the company is
acquired, the rate can change without any code change. A government-mandated free source does
not carry this risk.

**(c) ~13,000 uncovered jurisdictions.** Even with Zoneomics at its current 20,000-city
coverage, ~13,000 small municipalities, unincorporated counties, and rural jurisdictions
remain outside any commercial aggregator's coverage. Serving these requires either per-
ordinance reading (high cost, low scalability) or structured refusal (honest but lowers the
ceiling). This is the equivalent of Germany's §34 floor — structurally no numeric answer,
not a data gap.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Zoneomics contract:** Phase 2 is blocked until a Zoneomics trial/contract is in place.
  Probe the trial API before committing to the integration — verify FAR/height null rates.
- **Regrid contract or MCP evaluation:** Phase 3 is blocked on the same. Evaluate the Regrid
  MCP server (AI-native parcel access) — if it works, it may replace a custom API integration.
- **3DEP pipeline (Phase 4):** the nDSM pipeline built here reuses for any other jurisdiction
  using USGS LiDAR (none in the current corpus; but France's LiDAR HD pipeline is structurally
  identical — reuse the nDSM adapter, swap the tile source).
- **Microsoft footprints ingestion (Phase 1a):** the ODbL footprint ingestion pattern reuses
  directly for Overture Maps integration (same licence, similar format). Build once, parameterise
  tile source.
- **City-portal harvesting (Phase 1b):** no cross-jurisdiction reuse — each city's open-data
  portal has a different schema. Document schema per city in the city-level SOURCES.md. Do not
  assume field name portability.

---

## 5 — Live probe findings (2026-07-24): what changed

> Full results: `findings/USA-PROBE-RESULTS-2026-07-24.md`. Summary of score revisions below.

| Field | Old score | Probed score | Key finding |
|---|---|---|---|
| Jurisdiction routing | ~0% free | **~80% free** | Census TIGER geocoder — 11-layer routing, all 3 cities confirmed in one API call |
| NYC FAR (residfar/commfar) | ~0% free | **99.5% NYC** | MapPLUTO 858,602 parcels; non-conforming count: 137,541 |
| Flood overlay | Not counted | **~90% free** | FEMA ESRI-hosted FeatureServer — 19 zones for Chicago, 2 for NYC — instant return |
| Heritage overlay | ~75% estimated | **72,668 confirmed** | NPS NRHP MapServer — 250 in Chicago bbox; 379 in greater metro |
| Terrain elevation | ~65–70% estimated | **Functional nationwide** | USGS 3DEP point API — 180.7m Chicago, 14.8m NYC, 86.7m LA |
| LiDAR tiles | >60% estimated | **178 QL1 tiles confirmed** for Chicago bbox | TNM API — LAZ format, 2019 publication, highest quality tier |
| LA City zoning | ~0% free | **Queryable** (zone code + category) | LA City Zoning FeatureServer Layer 15 — zone suffix parsing needed for overlays |
| LA County parcels | Unknown | **Confirmed** (AIN + UseCode + geometry) | ASSR_PARCELS_25_View — assessor parcel layer live |

### Most important single finding from probes

**Jurisdiction routing ("which of ~33,000 ordinances applies?") was the stated ~0% free blocker. It is not.**
Census TIGER geocoder (`geocoding.geo.census.gov/geocoder/geographies/coordinates`) answers it free,
instantly, for all incorporated places (87% of US population) and all counties. This removes Regrid
as a prerequisite for routing and unblocks Phases 1b and 2 without commercial API contracts.

### What the probes did not confirm

- ArcGIS Hub zoning endpoint count (5,000–8,000 estimate): API search returned parameter errors; manual
  URL discovery needed. The scale claim is plausible but unverified.
- USFWS NWI spatial query: Schema confirmed; spatial queries failing (scale restriction). County-level
  bbox will fix it.
- Microsoft Building Footprints: Download blocked from probe environment. Public documentation confirms 129.6M footprints.

---

## 6 — Phase 6: Institution Compilation (revised-model path)

> Added 2026-07-24 based on the vision-shift analysis in
> `findings/USA-VISION-SHIFT-2026-07-24.md` and `findings/USA-INSTITUTIONAL-GRAPH-ANALYSIS.md`.
> Phase 6 is an **alternative path** to the dataset-aggregation phases above, not a replacement.
> Phases 0–5 deliver the commercial triad quickly via Zoneomics/Regrid. Phase 6 builds the
> durable institutional graph that raises the free-only ceiling from ~25–30% to ~55–65%.

### The institution compilation model in one sentence

Instead of waiting for a national zoning API that does not exist, build a compiler that discovers,
crawls, and semantically normalises the ~5,000–8,000 municipal ArcGIS REST zoning endpoints plus
the federal overlay graph — treating every public agency as a computational node.

### Phase 6 tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status |
|---|---|---|---|---|---|
| **6a** | ArcGIS Hub zoning discovery crawl — enumerate municipal FeatureServer URLs; schema-crawl first 500 | Corpus of local endpoints; field-name distribution for semantic classifier | ~12% → ~35% | 2–4 dev-days | NOT STARTED |
| **6b** | Semantic normalisation — field-name ontology mapping (local → Planning IR) | One parser for thousands of jurisdictions | ~35% → ~42% | 3–5 dev-days | NOT STARTED |
| **6c** | Federal overlay integration — FEMA NFHL, USFWS NWI, EPA Envirofacts, FAA OE/AAT, NRCS WSS | Free structured answers for flood, wetland, heritage, airport overlays (free, near-national) | ~42% → ~55% | 3–5 dev-days (one adapter per agency) | NOT STARTED |
| **6d** | County assessor parcel fabric — crawl ArcGIS Hub for county assessor layers; standardise geometry + land-use codes | Near-universal free parcel fabric replacing Regrid dependency for routing | ~55% → ~62–65% | 4–7 dev-days (scripted crawl; schema normalisation) | NOT STARTED |
| **6e** | NYC MapPLUTO `MaxAllwFAR` integration | Numeric FAR for 862K NYC parcels — highest-value free probe in corpus | Raises NYC city rate from ~15% to ~50–60% | 1–2 dev-days | NOT STARTED |
| **6f** | Socrata city discovery — enumerate city Socrata portals; auto-discover zoning / permit datasets | Hundreds of additional structured city datasets | +3–5 pts (major cities) | 2–3 dev-days | NOT STARTED |

### Phase 6 falsification probes (run first — before any Phase 6 dev work)

These are cheap probes that confirm or falsify the institution-compilation hypothesis. If they
fail, Phase 6 scope is adjusted downward before significant dev investment is made.

| Probe | Command / method | Pass criteria | Est. time |
|---|---|---|---|
| FEMA NFHL endpoint | `curl "https://hazards.fema.gov/arcgis/rest/services/FIRMette/NFHLREST/MapServer/28/query?geometry=-87.65,41.85&geometryType=esriGeometryPoint&inSR=4326&outFields=FLD_ZONE,FLD_AR_ID&f=json"` | Returns JSON with FLD_ZONE field | 1 hr |
| ArcGIS Hub zoning count | Query `https://hub.arcgis.com/api/search/v1/collections/all/items?q=zoning&bbox=-130,20,-60,55&resultType=hits` | Returns >2,000 distinct FeatureServer URLs | 2 hrs |
| NYC MapPLUTO FAR fill | Download `https://data.cityofnewyork.us/resource/64uk-42ks.json?$select=bbl,maxallwfar&$limit=1000` | `MaxAllwFAR` > 0 for >80% rows | 1 hr |
| County assessor sample | Fetch schema for Cook County (IL), LA County (CA), Harris County (TX) ArcGIS Hub layers | Land-use code field present in all three | 2 hrs |
| USFWS NWI endpoint | `curl "https://www.fws.gov/wetlandsmapper/rest/services/Wetlands/MapServer/0/query?geometry=-87.65,41.85&geometryType=esriGeometryPoint&inSR=4326&outFields=ATTRIBUTE&f=json"` | Returns wetland type classification | 1 hr |

### Architecture of the institution compilation pipeline

```
Discovery Layer
  ├── ArcGIS Hub search API → municipal zoning FeatureServer URLs
  ├── Socrata discovery API → city portal dataset catalogue
  ├── CKAN API → state/city CKAN portals
  └── Federal endpoints (hardcoded; stable) → FEMA, USFWS, EPA, FAA, NRCS, Census

Schema Crawl Layer
  ├── Per endpoint: GET /FeatureServer/0?f=json → field catalogue
  ├── Coded-value domains → zone code vocabulary per jurisdiction
  └── Field semantic classifier → local name → Planning IR concept

Planning Intermediate Representation (Planning IR)
  ├── parcel_id, jurisdiction_id
  ├── zone_code, zone_description
  ├── far_max (float | null), height_max_m (float | null), coverage_max (float | null)
  ├── setback_front_m, setback_rear_m, setback_side_m (float | null)
  ├── flood_zone (FEMA SFHA code | null)
  ├── wetland_flag (bool), wetland_type (NWI attribute | null)
  ├── heritage_flag (bool), heritage_source (NRHP | municipal | null)
  ├── airport_overlay_flag (bool), airport_height_limit_m (float | null)
  └── confidence (structured | constructed | derived | null)

Query Layer
  ├── Input: lat/lon + query type (zoning | flood | heritage | full)
  ├── Route to jurisdiction via Census TIGER place boundary
  ├── Fetch from discovered endpoint OR federal overlay OR county assessor
  └── Translate via ontology → Planning IR → structured response
```

### Relationship between Phase 6 and Phases 0–5

| Phases 0–5 (dataset aggregation + commercial) | Phase 6 (institution compilation) |
|---|---|
| Fast path to ~75–80% ceiling | Slower path to ~85–90% ceiling |
| Single-vendor dependency (Zoneomics, Regrid) | Distributed; no single point of failure |
| Zone code + FAR + height for covered cities | Full institutional graph including overlays |
| Good for launch, high commercial ceiling | Good for long-term, high free ceiling |
| Can run in parallel with Phase 6 | Can run in parallel with Phases 1–5 |

The recommended strategy: run Phases 1–3 in parallel with Phase 6 falsification probes.
If probes pass, begin Phase 6a while Phases 4–5 continue. The two paths converge at the ceiling.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb). Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve),
**L-449** (human-verification gate).*

*Institution compilation framework: `findings/USA-VISION-SHIFT-2026-07-24.md` ·
`findings/USA-INSTITUTIONAL-GRAPH-ANALYSIS.md`. Added 2026-07-24.*
