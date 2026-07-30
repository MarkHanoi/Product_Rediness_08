# Legislation Data-Readiness Rate — United Kingdom (`gb`) national

**Headline rate: `NOT YET ASSESSED — scaffold only`**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage] + height**) **without
> reading an ordinance text/PDF**. This definition is IDENTICAL across every jurisdiction so the scores are
> directly comparable. Derived from endpoint/schema checks actually run — NOT assumed from open-data reputation.

⚠ **No live structured-rule endpoint has been probed for GB, and there is a structural reason the number will be
low even after probing:** GB planning is **discretionary**. There is **no as-of-right numeric zoning envelope**
(no national FAR/height table) — a permitted envelope is the outcome of a case-by-case determination against a
Local Plan (policy TEXT) + the NPPF, not a value published in a queryable field. So the "structured dimensional
fill" a rate measures **largely does not exist as data** in GB. The honest headline is therefore
**NOT YET ASSESSED — scaffold only**, and the realistic ceiling is structurally low (see `RATE-IMPLEMENTATION-PLAN.md`).

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **United Kingdom (national)** | **NOT YET ASSESSED — scaffold only** |

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ⚠️ partial | HM Land Registry INSPIRE Index Polygons (OGL, freehold **index** extents) / OS MasterMap (licensed) | not-assessed — no keyless parcel cadastre wired |
| Plan/zone existence + boundary | ⚠️ partial | Local Plan Policies Maps — per-LPA, no national numeric layer | not-assessed |
| Zone/use code | ❌ absent | GB has no as-of-right zoning district codes (discretionary) | ~0 structurally |
| Density metric (FAR / coverage) | ❌ absent | not published as a by-right field anywhere in GB | ~0 structurally |
| Max height (parcel-level) | ❌ absent | discretionary; no national height table | ~0 structurally |
| Setback / alignment | ❌ absent | discretionary | ~0 structurally |
| Building footprint + height (LOD1/2) | ✅ derivable | OSM/OS Open Buildings footprints + EA DSM−DTM height (see `LOD-RATE.md`) | not-assessed (unwired) |
| Terrain (DTM/DSM) | ✅ live | EA LIDAR Composite DTM 1 m (OGL v3, keyless) | live (England) |
| Heritage overlay | ✅ good | Historic England Listed Buildings + Conservation Areas (OGL) | not-assessed (not wired) |

---

## The structural gap

The one reason the number is (and will stay) low: **GB has no codified numeric development envelope.** Unlike
Germany's BauNVO (national zone taxonomy + density ceilings) or NYC's Zoning Resolution (per-district FAR + sky
exposure plane), an English/Scottish/Welsh/NI permission is a **discretionary** grant weighed against Local Plan
policy prose and the NPPF. The physical-model data (footprints, terrain, derivable heights) is genuinely strong
and OGL-open — but that is the LOD story (`LOD-RATE.md`), NOT the buildable-rule story. A rate that conflated the
two would be the §CONTEXT-DATA-HONESTY failure C58 forbids.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Ingest Local Plan Policies Maps (per-LPA WFS where they exist) for zone boundaries | small — boundaries only, no numeric fields | high (per-LPA) |
| Transcribe Local Plan density/height policies for a pilot LPA (+ L-449 human gate) | small per LPA; does not scale to a national number | very high |
| Model Permitted Development Rights as the as-of-right slice | modest — the only genuinely by-right envelope in GB | medium |

---

*Last updated: 2026-07-30. NOT YET ASSESSED — scaffold only; no live rule-endpoint probe run. The low ceiling is
structural (discretionary planning), not a currency lag. Maintainer: UNASSIGNED.*
