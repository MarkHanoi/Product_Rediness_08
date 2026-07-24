# Data Readiness Rate — USA (`us`) national

**Headline rate: ~12% (free sources only) · ~55% (with commercial APIs)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> lot coverage] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …)
> so the scores are directly comparable. Derived from structural research, not assumed from the
> jurisdiction's open-data reputation. No live endpoint probes have been run yet.

**Two rates are reported because the US has a structural duality found in no other jurisdiction
studied:** free government data is almost entirely absent for zoning, but a mature commercial
ecosystem (Zoneomics, Regrid) provides numeric attributes nationally at a price. The ~12% rate
reflects what is achievable using only open/free sources. The ~55% rate reflects what is
achievable if Zoneomics and Regrid are contracted.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **USA (national, free sources only)** | **~12%** |
| **USA (national, with Zoneomics + Regrid)** | **~55%** |
| Italy (national) | ~8–10% |

The US is unique in the corpus: worst free-source rate of any non-Italy country, highest
commercial ceiling of any country studied.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score (free) | Score (commercial) |
|---|---|---|---|---|
| Parcel geometry | ⚠️ Partial | **Free:** ArcGIS Hub / Socrata county portals — unsystematic, schema-inconsistent; OSM. **Commercial:** Regrid (160M parcels, 99% of Americans). | **~40%** (major urban counties free; rural gaps) | **~90%** (Regrid near-universal) |
| Jurisdiction router (which of ~33,000 ordinances governs?) | ❌ Free absent | **Free:** none national. **Commercial:** Regrid + Zoneomics both provide jurisdiction assignment. | **~0%** (no free national routing layer) | **~80%** (Zoneomics 20,000+ cities) |
| Zone / use code | ❌ Free absent at scale | **Free:** Mercatus/NZA partner outputs (partial states); some municipal open-data portals. **Commercial:** Zoneomics 20,000+ cities. | **~5%** (NZA/Mercatus partner jurisdictions only) | **~60%** (Zoneomics coverage fraction; rural gaps remain) |
| Density metric (FAR / lot coverage) | ❌ Free absent | **Free:** essentially none nationally. **Commercial:** Zoneomics claims FAR for covered cities. | **~0%** | **~50%** (Zoneomics; FAR field completeness per city unconfirmed) |
| Max height (parcel-level) | ❌ Free absent | **Free:** essentially none nationally — each ordinance defines height differently. **Commercial:** Zoneomics claims building height limits. | **~0%** | **~50%** (same as FAR) |
| Setback / alignment | ❌ Free absent | **Free:** none. **Commercial:** Zoneomics may include setbacks for some jurisdictions. | **~0%** | **~20%** (uncertain — setback completeness in Zoneomics not confirmed) |
| Building footprint (LOD1) | ✅ Full (free) | Microsoft US Building Footprints (129.6M buildings, ODbL). Overture Maps (also free, ODbL). | **~90%** (near-national coverage) | **~95%** |
| Building height (modelled) | ⚠️ Partial | Overture Maps + USGS 3DEP modelled heights — 20M+ buildings (of 129.6M footprints), growing to 40–50M. 3DEP DSM–DTM derivation possible for remainder where LiDAR exists. | **~15–20%** direct; **~40–50%** with 3DEP derivation | **~50%** (same; height is a free source) |
| Terrain (DTM/DSM) | ✅ Good (free) | USGS 3DEP — national LiDAR programme; >60% of US with high-quality LiDAR; full national coverage targeted. Public Domain. | **~65–70%** (coverage not 100%; check per city) | **~70%** |
| Heritage overlay | ✅ Good (free) | NRHP via NPS ArcGIS feature services — ~100,000 properties nationally, updated weekly. Caveats: restricted sites excluded; pre-1983 NAD27; attributes minimal (join NRIS). | **~75%** (spatial layer — most properties covered; full record requires NRIS join) | **~80%** |

---

## The structural gap

**The zoning data problem — no free national equivalent exists.**

The US has ~33,000 independent zoning jurisdictions, each with its own ordinance, zone code
vocabulary, FAR definition, height measurement method, and setback formula. No government body
has aggregated these into a queryable national API. The National Zoning Atlas (NZA) is the
closest attempt — a Cornell academic project — but it is explicitly browse-only with no bulk
download or API as of mid-2026, and it explicitly rejects AI automation as insufficiently
accurate for its methodology.

This is structurally more fragmented than Germany (XPlanung exists as a federal standard, even
if GRZ/GFZ are rarely populated in WFS responses) or France (GPU WFS delivers zone boundaries;
rules live in PDFs, but zone codes are machine-readable). The US equivalent of the GPU WFS —
a national zone boundary layer — simply does not exist as a government product.

**The commercial solution exists but is paid:** Zoneomics provides exactly the numeric fields
that the German XPlanung schema defines but rarely populates — FAR, height, use code — for
20,000+ US cities. The structural difference from Italy is not that the US has better government
data (it does not) but that a commercial actor has solved the problem the government never did.

**The free building data advantage:** Microsoft's 129.6M footprints (ODbL) and the growing
Overture/USGS height model are genuinely strong — better than Italy, comparable to Germany's
LoD2-DE for footprints, and better than Germany's per-Land fragmentation for the *free and
nationally unified* criterion. This is where the US free-source rate diverges from Italy.

---

## What would raise the rate

| Action | Rate impact (free) | Rate impact (commercial) | Effort |
|---|---|---|---|
| Contract Zoneomics API | — | +35–40 pts (zone + FAR + height for 20,000+ cities) | Low (API integration); cost TBD |
| Contract Regrid API | +10 pts (parcel routing enables other lookups) | +5 pts (supplements Zoneomics routing) | Low; cost TBD |
| Survey ArcGIS Hub county portals for zoning layers | +3–5 pts (major metro counties likely have zone boundaries) | — | Medium (scripted crawl) |
| Process USGS 3DEP DSM–DTM for city bboxes to derive building heights | +25–30 pts (free height model where LiDAR exists) | +5 pts (fills gap between Overture coverage and full footprint set) | High (point-cloud processing pipeline) |
| Ingest Mercatus/NZA partner-team GeoJSON outputs (free, partial) | +3–5 pts (covers NZA-partnered states) | — | Low |
| Probe Chicago open-data portal zoning layer for numeric attributes | +1–2 pts (one city; signal for other open-data cities) | — | Low |
| Probe NYC ZOLA / ZAP open zoning data | +1 pt | — | Low |

---

## The ceiling

**Free-only ceiling: ~25–30%.** Achievable by combining: Microsoft footprints (~90%),
USGS 3DEP-derived heights (~50% with processing effort), NRHP heritage (~75%), plus city-by-city
zoning layer harvesting from open-data portals (major metros only, zone code without numeric
attributes). The ~12% current rate reflects no zoning pipeline built and no 3DEP processing.

**Commercial ceiling: ~75–80%.** Achievable with Zoneomics + Regrid + Microsoft + Overture/USGS
heights, assuming Zoneomics FAR/height fields are fully populated for covered cities and the
remaining ~30% of jurisdictions (small municipalities, rural areas) are handled with refusals.
Full coverage is structurally impossible without a parcel-by-parcel ordinance-reading pipeline
for the ~13,000 jurisdictions outside Zoneomics' coverage.

**Denmark (~96%) ceiling for the US:** not structurally achievable without either a government-
mandated national digitisation programme (which does not exist) or a fully automated ordinance-
reading pipeline across ~33,000 jurisdictions (which NZA says does not yet work reliably). The
~33,000-jurisdiction fragmentation is the hard ceiling that separates the US from Scandinavia.

---

## Revised ceiling: Institutional Graph model

> ⚠ **This section describes a revised model** derived from the vision-shift analysis in
> `findings/USA-VISION-SHIFT-2026-07-24.md`. The headline rates above remain the authoritative
> numbers for cross-jurisdiction comparison (they use the same metric definition as every other
> jurisdiction). The revised numbers below describe a **different metric** — Institutional Graph
> Coverage (IGC) — and are **structural estimates pending five falsification probes**. Do not
> substitute them for the headline until the probes are run. See
> `findings/USA-INSTITUTIONAL-GRAPH-ANALYSIS.md` for the full derivation.

### The shift: dataset aggregation → institution compilation

The headline rates above were derived by asking:

> "What open datasets exist nationally that answer zoning questions?"

The answer: almost none nationally. Therefore 12% free.

A second model — **institution compilation** — asks instead:

> "What machine-readable institutional state already exists across the entire distributed graph
> of US public agencies, and what does the ceiling become once that graph is compiled?"

Under institution compilation, the US is not the second-worst free-source country. It may be the best.

### What the institutional graph adds

Three layers are materially undercounted in the current metric:

**(A) Federal overlay APIs — free, structured, national**

| Layer | Source | Free endpoint confirmed? | Coverage |
|---|---|---|---|
| Flood zone (SFHA) | FEMA NFHL ArcGIS MapServer | Endpoint known; not live-probed | ~99% US geography |
| Wetland / habitat | USFWS National Wetlands Inventory ArcGIS FeatureServer | Endpoint known; not live-probed | ~95% US geography |
| Terrain DTM/DSM | USGS 3DEP TNM API | Confirmed | >60% LiDAR; full national coverage targeted |
| Heritage | NPS NRHP ArcGIS FeatureServer | Endpoint known; not live-probed | ~100,000 properties |
| Airport height limits | FAA OE/AAT web service | Endpoint known; not live-probed | ~99% near airports |
| Wetlands / soils | USDA NRCS Web Soil Survey API | Endpoint known; not live-probed | National |
| Jurisdiction boundaries | Census TIGER/Line | Confirmed | 99% national |
| Environmental risk | EPA Envirofacts REST | Confirmed | National |

FEMA NFHL alone answers a first-order planning constraint — flood zone designation — for ~99% of US
geography, free, via a structured ArcGIS MapServer. This field is as consequential as FAR for
development decisions and was not counted in the current metric.

**(B) ArcGIS REST as a hidden national zoning standard**

An estimated 5,000–8,000 US municipalities publish zoning layers via ArcGIS REST FeatureServer —
the same technical interface across all instances, with machine-readable field schemas
(`GET .../FeatureServer/0?f=json`). Field names differ (`ZoningClass` vs `ZoneDist1` vs
`ZONE_CODE`) but the API contract is identical, enabling a single ArcGIS crawler to discover
and normalise thousands of municipal zoning endpoints.

**NYC MapPLUTO** is the highest-value single free source in the entire corpus: it exposes
`MaxAllwFAR` (numeric maximum FAR), `MaxAllwResiUnits`, and `ZoneDist1/2/3/4` for all ~862,000
NYC properties as a free, structured download. If ingested, it could push NYC coverage to ~50–60%
free — a performance unmatched by any single free dataset in any other jurisdiction.

**(C) County assessor parcel fabric — near-universal, free, ArcGIS REST**

Every US county maintains an assessor's parcel database (public record by statute). An estimated
2,400–2,800 of the 3,143 counties publish this as an ArcGIS REST FeatureServer or bulk download.
This is the US equivalent of Europe's cadastre — parcel geometry, land use codes, tax class,
acreage — and it is free, structured, and machine-readable at near-universal coverage.

### Revised ceiling table

| Model | Core triad (zone + FAR + height) | Full institutional graph (incl. overlays) |
|---|---|---|
| Dataset aggregation, free only | **~12%** (current headline) | ~25–30% (current ceiling) |
| Institution compilation, free only | **~35–40%** | **~55–65%** |
| Institution compilation + commercial | **~75–80%** (same as current commercial) | **~85–90%** |

The delta between the current free ceiling (~25–30%) and the revised free ceiling (~55–65%) comes
from: (1) FEMA + EPA + USFWS + FAA federal overlays, (2) ArcGIS REST zoning discovery across
5,000–8,000 municipalities, (3) NYC MapPLUTO numeric FAR/height, (4) county assessor parcel
fabric. None of these require Zoneomics or Regrid.

### Five falsification probes before revising the headline

The revised ceiling is a structural hypothesis, not a measured rate. It becomes evidential only after:

1. **FEMA NFHL bounding-box query** — confirm endpoint, SFHA field name, return format (1 dev-hour).
2. **ArcGIS Hub zoning search** — count distinct municipal FeatureServer URLs; schema-crawl first 50;
   measure FAR/height field presence rate (1–2 dev-days).
3. **NYC MapPLUTO `MaxAllwFAR` population rate** — download one borough; confirm numeric fill rate (2–4 dev-hours).
4. **County assessor Hub crawl (20-county sample)** — confirm land-use code field presence and
   estimate national coverage fraction (1 dev-day).
5. **USFWS NWI FeatureServer query** — confirm endpoint, wetland-type field, coverage (2 dev-hours).

See `RATE-IMPLEMENTATION-PLAN.md` §"Phase 6" for the full operationalisation.

---

*Last updated: 2026-07-24. Structural research complete; revised ceiling added 2026-07-24 based
on institution-compilation analysis (see `findings/USA-INSTITUTIONAL-GRAPH-ANALYSIS.md` and
`findings/USA-VISION-SHIFT-2026-07-24.md`). No live endpoint probes run. Headline rates
(~12% free / ~55% commercial) remain authoritative for cross-jurisdiction comparison until
falsification probes are executed. Maintainer: UNASSIGNED.*
