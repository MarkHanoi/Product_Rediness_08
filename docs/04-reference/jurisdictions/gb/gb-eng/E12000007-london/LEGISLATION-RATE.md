# Legislation Data-Readiness Rate — Greater London (`gb-E12000007`) city

**Headline rate: `NOT YET ASSESSED — scaffold only`**

> **Structured dimensional fill rate** — identical definition to all other jurisdictions (zone/use code + density
> metric + height, without reading a PDF). No live endpoint probed for London.

⚠ Like GB nationally, London's structured-fill ceiling is **structurally low**: the Greater London Authority
sets the **London Plan** (spatial policy) and the 33 boroughs set **Local Plans** — both are policy TEXT + a
Policies Map, **not** an as-of-right numeric envelope. FAR/height are not published as by-right fields; density is
governed by policy + design-code discretion + the London Plan's density matrix guidance (indicative, not binding).
The honest headline is therefore `NOT YET ASSESSED`.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Greater London (not yet assessed)** | **NOT YET ASSESSED** |

## Field-by-field breakdown (structural, pre-probe)

| Field | Structured? | Source | Note |
|---|---|---|---|
| Parcel geometry | ⚠️ index-only | HMLR INSPIRE Index Polygons (OGL) / OS MasterMap (licensed) | no keyless legal-parcel cadastre |
| Zone / use code | ❌ absent | discretionary — no by-right zoning district | GLA London Plan + borough Local Plans are policy text |
| Density metric | ❌ absent | London Plan density guidance is indicative, not a by-right FAR field | |
| Max height | ❌ absent | tall-buildings policy + views (LVMF) are discretionary | |
| Building footprint + height | ✅ derivable | OSM/OS Open Buildings + EA DSM−DTM (see `HEIGHT.md`) | unwired |
| Terrain | ✅ live | EA LIDAR Composite DTM 1 m | via `terrain.mjs` `gb` |
| Heritage overlay | ✅ good | Conservation Areas + Listed Buildings (Historic England, OGL) | not wired |

## The structural gap

London has abundant OPEN GIS (the London Datastore, borough portals, Historic England) but the buildable **rule**
is discretionary — the London Plan + borough Local Plans decide by policy and design review, not by a queryable
FAR/height table. The data richness is real; the by-right numeric envelope is not. Do not conflate the two.

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Ingest borough Local Plan Policies Maps (zone boundaries only) | small | high (33 boroughs) |
| Model Permitted Development Rights (the by-right slice) | modest | medium |

---
*Last updated: 2026-07-30. NOT YET ASSESSED — scaffold only. Low ceiling is structural (discretionary), not a
currency lag. Maintainer: UNASSIGNED.*
