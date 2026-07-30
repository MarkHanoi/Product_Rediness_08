# Data Readiness Rate — Chicago (`us-il-1714000`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: NOT YET ASSESSED — scaffold only**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (zone/use code + FAR/density metric + height)
> without reading an ordinance PDF. Definition identical across all jurisdictions. No live
> endpoint probe has been run for Chicago yet.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| USA (national, commercial) | ~55% |
| USA (national, free) | ~12% |
| **Chicago (city, not yet assessed)** | **NOT YET ASSESSED** |

---

## Field-by-field breakdown (pre-probe estimates)

| Field | Structured? | Source | Pre-probe estimate |
|---|---|---|---|
| Parcel geometry | ⚠️ Partial | Cook County Assessor open data + `data.cityofchicago.org` building footprints | **~80%** (Cook County well-covered; confirm field schema) |
| Zone / use code | ⚠️ Unknown | `data.cityofchicago.org` Zoning Districts dataset (zone code confirmed present; numeric attributes unknown) | **~60%** (zone code likely available free; numeric fields TBD) |
| Density metric (FAR) | ❌ Unknown | Chicago ordinance tables; possibly Zoneomics (paid) | **~0% free / ~55% Zoneomics** |
| Max height (parcel-level) | ❌ Unknown | Chicago ordinance; Zoneomics | **~0% free / ~55% Zoneomics** |
| Setback / alignment | ❌ Unknown | Chicago ordinance tables; Zoneomics partial | **~0%** |
| Building footprint + height (LOD1) | ✅ Footprint good; height partial | Microsoft Footprints (ODbL) + Overture/USGS height (Chicago pilot confirmed) | **~75%** footprint; **~40%** height (Chicago pilot area) |
| Terrain (DTM/DSM) | ✅ Available | USGS 3DEP — Chicago confirmed in pilot coverage area | **~85%** |
| Heritage overlay | ✅ Good | NRHP via NPS ArcGIS; Chicago Landmarks (city layer) | **~75%** NRHP + city landmarks dataset |

**City-specific advantage over national average:** Chicago benefits from confirmed Overture/USGS
height pilot coverage and a strong open-data portal. The city rate may exceed the national ~12%
free estimate once the zoning portal attributes are probed.

**City-specific complication:** Planned Developments (PDs) — a significant portion of downtown
and major redevelopment sites are governed by PD agreements that supersede the base zone. PD
coverage fraction is the key unknown that determines the ceiling.

---

## The structural gap

Chicago's zoning is governed by Title 17 of the Chicago Municipal Code — one of the more
legible US zoning codes, but still a PDF-based ordinance. Unlike Denmark's Plandata.dk (numeric
fields in a structured API) or Germany's XPlanung (schema defines FAR/height as attributes),
Chicago's ordinance tables exist only in PDF and HTML text. Zoneomics has parsed these tables
commercially; free access requires reading the ordinance text.

The Planned Development complication mirrors Germany's §34 challenge: PD-governed parcels
have no simple numeric lookup — each PD is a separately-adopted ordinance with its own rules.
The correct output for a PD parcel without the PD text is a cited refusal, not a null.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe Chicago `data.cityofchicago.org` zoning dataset for FAR/height attributes | High if present (+15 pts free); confirms commercial dependency if absent | Low — 0.25 dev-days |
| Contract Zoneomics for Chicago | +45–50 pts (zone + FAR + height for all non-PD zones) | Low (integration); cost TBD |
| Confirm Overture/USGS height coverage extent for Chicago | +10–15 pts on building height context | Low — download + inspect |
| Map PD-governed parcel fraction | Calibrates ceiling — if PDs are <10% of parcels, ceiling is high; if >30%, ceiling is lower | Medium |

---

*Last updated: 2026-07-24. Scaffold only — no live probes run. Rate will be re-derived after
the Chicago open-data zoning probe (see `NEXT.md §8`). Maintainer: UNASSIGNED.*
