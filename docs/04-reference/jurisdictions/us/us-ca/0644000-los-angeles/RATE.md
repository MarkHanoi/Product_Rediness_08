# Data Readiness Rate — Los Angeles (`us-ca-0644000`) city

**Headline rate: NOT YET ASSESSED — scaffold only**

> **Structured dimensional fill rate** — identical definition to all other jurisdictions.
> No live endpoint probe has been run for LA. Rates below are pre-probe estimates.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| USA (national, commercial) | ~55% |
| Germany (national) | ~28% |
| USA (national, free) | ~12% |
| **Los Angeles (not yet assessed)** | **NOT YET ASSESSED** |

---

## Field-by-field breakdown (pre-probe estimates)

| Field | Structured? | Source | Pre-probe estimate |
|---|---|---|---|
| Parcel geometry | ⚠️ Partial | LA County Assessor (LARIAC / ArcGIS Hub) + `geohub.lacity.org` | **~75%** |
| Zone / use code | ⚠️ Unknown | `geohub.lacity.org` Zoning Information layer (code confirmed; numeric attributes unknown) | **~55%** zone code (free); **~0%** numeric FAR/height free |
| Height district resolution | ⚠️ Partial | Zone code encodes height district suffix — static lookup from LAMC §12.21.1 tables possible | **~50%** (derivable from zone code + lookup table once LAMC tables are read) |
| Density metric (FAR) | ❌ Unknown | LAMC tables; Zoneomics (paid) | **~0% free / ~45% Zoneomics** |
| Max height (parcel-level) | ⚠️ Partial | Derivable from zone + height district lookup table; Specific Plans override | **~30% free (height district derivation); ~45% Zoneomics** |
| California Coastal overlay | ❌ Unknown | CCC boundary GIS layer (free); CCC permit requirements not automatable | **~0%** (CCC permits are not machine-readable) |
| Specific Plan flag | ❌ Unknown | `geohub.lacity.org` Specific Plan Areas layer — not probed | **~0%** (Specific Plan rules require individual ordinance reads) |
| Building footprint + height | ✅ Footprint; partial height | Microsoft footprints (ODbL); LARIAC LiDAR products (status TBD) | **~85%** footprint; **~25%** height (national Overture + potential LARIAC) |
| Terrain | ✅ Good | USGS 3DEP | **~80%** |
| Heritage | ✅ Good | NRHP (NPS) | **~70%** |

**LA-specific complications vs Chicago:**

1. **Height district system:** the zone code suffix (`-1`, `-2`, etc.) encodes the height
   district, which determines FAR and height. This is partially derivable from the zone code
   via a static lookup — unlike Chicago where FAR/height require reading the ordinance table
   row by row, LA's height district system is more regularised.

2. **Specific Plans:** LA's ~50+ active Specific Plans are more numerous than Chicago's PDs.
   A parcel in a Specific Plan requires individual ordinance sourcing; neither Zoneomics nor
   a zoning map yields the correct answer.

3. **Coastal Commission:** the CCC overlay adds a second legal authority layer for Coastal
   Zone parcels. No commercial API is known to resolve CCC-governed development standards
   automatically.

---

## The structural gap

LA's height district suffix system is a partial advantage: once LAMC §12.21.1 tables are read
and built into a static lookup, base zone + height district → FAR/max_height can be derived
without reading individual B-Plan-equivalent PDFs. This is more structured than Germany (each
B-Plan sets its own GRZ/GFZ without a national ceiling enforced at the plan level) and more
automated than Chicago (where FAR tables are per-zone, not per-zone-suffix).

However, Specific Plans (LA's equivalent of Chicago PDs and Germany's §34) create a
non-automatable fraction that must be refused or individually sourced.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read LAMC §12.21.1 and build zone × height_district lookup table | +15–20 pts (height + FAR derivable from zone code) | Low — 0.5 dev-days |
| Probe `geohub.lacity.org` zoning layer for numeric FAR/height attributes | Confirms if free; if not, Zoneomics required | Low — 0.25 dev-days |
| Confirm LARIAC LiDAR/LOD2 access and currency | +10–15 pts on building height | Low — 1 portal check |
| Contract Zoneomics for LA | +30–35 pts on top of height-district derivation | Low (integration); cost TBD |
| Map Specific Plan coverage fraction | Calibrates ceiling — high PD% lowers ceiling | Medium |

---

*Last updated: 2026-07-24. Scaffold — no live probes run. Maintainer: UNASSIGNED.*
