# Data Readiness Rate — Netherlands (`nl`) national

**Headline rate: NOT YET ASSESSED — scaffold only**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

<!-- The cross-jurisdiction benchmark. Keep this table in SYNC across every RATE.md — it is the
     shared ruler. Insert this jurisdiction at its honest position. -->
| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Netherlands (national)** | **NOT YET ASSESSED** |

> Netherlands is not yet placed on the ruler. Its open-geodata infrastructure (3DBAG, AHN, PDOK)
> and digital-first planning system (DSO / STOP-TPOD) suggest a higher structural ceiling than
> Germany or France — but the zoning-rules layer has not been probed and no number can be stated
> honestly until Phase 0 is complete.

---

## Field-by-field breakdown

<!-- Evidence key:
     ✅ = structured, live-verified   ⚠️ partial = partial / conditional   ❌ = not probed / absent / PDF-only
     Score = this field's contribution to the headline; "—" where the headline is NOT YET ASSESSED. -->

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ | BAG `pand` polygon confirmed live via `api.3dbag.nl/collections/pand` (2026-07-21 spike); national coverage | — |
| Plan/zone existence + boundary | ⚠️ partial | omgevingsplan via DSO / ruimtelijkeplannen.nl confirmed to exist; "Regels op de kaart" API not yet probed for structured-field delivery | — |
| Zone/use code | ❌ not probed | DSO / omgevingsplan — whether machine-readable coded values are returned per parcel is NOT YET TESTED | — |
| Density metric (FAR / coverage / %-utilisation) | ❌ not probed | omgevingsplan may encode FSI (floor-space index) or bebouwingspercentage as structured fields under STOP-TPOD — NOT YET TESTED | — |
| Max height (parcel-level, ALLOWED) | ❌ not probed | omgevingsplan bouwhoogte — whether numeric allowed-height is delivered as a structured field is NOT YET TESTED. Note: 3DBAG `b3_h_dak_*` gives EXISTING building heights (LiDAR-derived), not ALLOWED heights — these are separate data streams | — |
| Setback / alignment | ❌ not probed | omgevingsplan rooilijn / bouwvlak — not probed | — |
| Building footprint + height (LOD1/2, EXISTING) | ✅ | 3DBAG `api.3dbag.nl` live-verified (2026-07-21): CityJSONFeatures LOD2.2, AHN5 LiDAR-derived, sub-metre RMSE, CC BY 4.0; EPSG:7415 (RD New + NAP height) | — |
| Terrain (DTM/DSM) | ✅ | AHN4/5 (Actueel Hoogtebestand Nederland) — national LiDAR survey; `b3_pw_bron: "ahn5"` confirmed in 3DBAG feature attributes | — |
| Heritage overlay | ❌ not probed | Amsterdam and other historic centres have rijksmonumenten / beschermd stadsgezicht overlays; whether these are delivered as a structured geo-layer per parcel is not yet checked | — |

---

## The structural gap

The rate cannot be stated because the **legal/zoning layer has not been assessed**. The research conducted to date (spike 2026-07-21) was scoped entirely to *context data* — confirming that 3DBAG (buildings), AHN (terrain), and BGT (roads/water/green) can feed the 3D scene. That work confirmed excellent physical-world data but says nothing about whether *planning rules* (zone code, density limit, allowed height) are delivered as machine-readable structured fields.

The Netherlands enacted the Omgevingswet in 2024, replacing ~26 separate sectoral laws with a single integrated environmental-permit framework. Municipal zoning rules are now published as **omgevingsplannen** (environmental plans) via the **DSO** (Digitaal Stelsel Omgevingswet) and are accessible via the "Regels op de kaart" API and ruimtelijkeplannen.nl. The STOP-TPOD standard that governs these publications is machine-oriented and designed for structured digital delivery — raising the possibility that numeric rule values (FSI, bouwhoogte, bebouwingspercentage) come back as typed fields rather than PDF prose. **This is the critical unknown.** Until a live DSO probe is run at a sample address, the ceiling itself cannot be set honestly.

The BGT endpoint (`api.pdok.nl/lv/bgt/ogc/v1/collections`) returned HTTP 000 during the 2026-07-21 spike — not confirmed dead, possibly an egress/DNS issue in the spike environment. This blocks the context-layer gate but does not affect the zoning-rate headline, which depends on DSO, not BGT.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Run Phase 0: probe DSO "Regels op de kaart" API at one address — classify whether rule delivery is structured fields or plan text | Establishes the baseline rate and the realistic ceiling | ~1 dev-day |
| If DSO delivers structured fields: ingest zone/use code per parcel from omgevingsplan | Large — unlocks the first component of the fill-rate triplet | Medium |
| If DSO delivers structured fields: ingest density metric (FSI / bebouwingspercentage) per parcel | Large — unlocks second component | Medium |
| If DSO delivers structured fields: ingest bouwhoogte (allowed height) per parcel | Large — completes the triplet; moves rate to near-ceiling | Medium |
| If DSO delivers plan text only: build STOP-TPOD OCR / rule-extraction pipeline + L-449 human-verification gate | Required to raise the ceiling; without this, structured delivery of numbers is impossible | High |
| Re-verify BGT endpoint from a non-geo-fenced environment | Unblocks context-layer gate; no effect on zoning rate | Low |
| Probe heritage-overlay (rijksmonumenten / beschermd stadsgezicht) as a geo-layer per parcel | Unlocks overlay flag for historic-area plots | Low–Medium |

---

*Last updated: 2026-07-24. Parcel geometry (BAG) and existing building heights (3DBAG / AHN5) are CONFIRMED live; zoning-rules layer (DSO / omgevingsplan) is NOT YET PROBED — rate NOT YET ASSESSED pending Phase 0.
Maintainer: UNASSIGNED.*
