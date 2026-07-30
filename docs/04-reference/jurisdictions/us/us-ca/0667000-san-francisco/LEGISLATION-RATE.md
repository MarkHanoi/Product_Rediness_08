# Legislation Data-Readiness Rate — San Francisco (`us-ca-0667000`) city

**Headline rate: `NOT YET ASSESSED — scaffold only`**

> **Structured dimensional fill rate** — identical definition to all other jurisdictions (zone/use code + density
> metric + height, without reading a PDF). No live endpoint probed for SF.

⚠ San Francisco is a **consolidated city-county** with a single Planning Code and a well-published open-data
estate (DataSF), including **zoning districts** and **height-and-bulk districts** (numeric height + bulk). That
makes SF one of the more addressable US cities in principle — but nothing has been sourced per-clau or
L-449-verified, and FAR is not the SF density lever (SF uses use-district + height/bulk + density-per-lot rules,
not a citywide FAR the way NYC does). Honest headline: `NOT YET ASSESSED`.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| USA (national, commercial) | ~55% |
| Germany (national) | ~28% |
| USA (national, free) | ~12% |
| **San Francisco (not yet assessed)** | **NOT YET ASSESSED** |

## Field-by-field breakdown (structural, pre-probe)

| Field | Structured? | Source | Note |
|---|---|---|---|
| Parcel geometry | ✅ likely full | SF Assessor parcels (DataSF, ArcGIS) | not wired into `registry.ts` |
| Zone / use code | ✅ published | SF Planning Code zoning districts (DataSF) | not wired |
| Density metric | ⚠️ district-based | SF uses use-district + density-per-lot, not a citywide FAR | needs Planning Code reads |
| Max height | ✅ published | **Height-and-bulk districts** (numeric height limit + bulk) — DataSF layer | the strongest SF structured lever; unprobed |
| Setback / bulk | ⚠️ bulk district | bulk controls in the height-and-bulk designation | |
| Building footprint + height | ✅ derivable | Overture/OSM + USGS 3DEP (see `HEIGHT.md`) | unwired |
| Terrain | ✅ live | USGS 3DEP 1 m DEM | via `terrain.mjs` `us` |
| Heritage | ✅ good | NRHP (NPS) + SF Article 10/11 landmarks | not wired |

## The structural gap

Unlike most US municipalities, SF's zoning + **height-and-bulk** numbers ARE published on DataSF as machine-
readable layers — so SF's structural ceiling is higher than the ~12 % national free average. The gap is that none
of it is sourced, wired, or L-449-verified yet, and the Planning Code's density-per-lot + conditional-use +
discretionary-review machinery makes a clean parcel-level envelope non-trivial.

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe + wire the DataSF height-and-bulk + zoning-district layers | HIGH — SF's strongest structured lever | medium |
| Source Planning Code density-per-lot rules per district (+ L-449) | medium | high |

---
*Last updated: 2026-07-30. NOT YET ASSESSED — scaffold only. SF's ceiling is above the US free average (DataSF
publishes zoning + height-bulk), but nothing is sourced/verified yet. Maintainer: UNASSIGNED.*
