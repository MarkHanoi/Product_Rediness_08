# Data Readiness Rate — New York City (`us-ny-3651000`) city

**Headline rate: NOT YET ASSESSED — scaffold only**

> **Structured dimensional fill rate** — identical definition to all other jurisdictions.
> No live endpoint probe has been run for NYC. The key unknown is whether MapPLUTO's
> `MaxAllwFAR` field provides structured parcel-level FAR — if yes, NYC may have a materially
> higher free-source rate than any other US pilot city.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| USA (national, commercial) | ~55% |
| Germany (national) | ~28% |
| USA (national, free) | ~12% |
| **New York City (not yet assessed)** | **NOT YET ASSESSED** |

**NYC rate range (pre-probe estimates):**
- If MapPLUTO `MaxAllwFAR` populated: **~45–55% free** (parcel-level FAR + Microsoft footprints + NYC 3D model + NRHP)
- If MapPLUTO `MaxAllwFAR` not populated: **~20–25% free** (zone code + footprints + heritage; FAR requires Zoning Resolution table reads or Zoneomics)
- Commercial (with Zoneomics): **~60–70%**

---

## Field-by-field breakdown (pre-probe estimates)

| Field | Structured? | Source | Pre-probe estimate |
|---|---|---|---|
| Parcel geometry (tax lot) | ✅ Full | MapPLUTO (NYC Open Data, ODbL) — BBL-keyed tax lots, city-wide | **~95%** (MapPLUTO is near-complete for NYC tax lots) |
| Zone / use code (ZoneDist1) | ✅ Confirmed | MapPLUTO `ZoneDist1` field — confirmed present | **~90%** (MapPLUTO coverage is high; some lots may have null zone) |
| Special Purpose District flag | ✅ Confirmed | MapPLUTO `SPDist1`/`SPDist2`/`SPDist3` fields — present | **~90%** (available; routing to SPD rules is separate) |
| Density metric (FAR — MaxAllwFAR) | ❓ Unknown | MapPLUTO `MaxAllwFAR` field — **KEY UNKNOWN** | **~50% if populated / ~0% if null** |
| Max height | ❌ Unknown | Zoning Resolution height regulations; height not a standard MapPLUTO attribute | **~0% free / ~55% Zoneomics** |
| Setback / sky exposure plane | ❌ Unknown | Zoning Resolution §23-63 et seq. (SEP); not in MapPLUTO | **~0%** |
| Building footprint + height | ✅ Strong | Microsoft footprints (ODbL) + NYC 3D building model (potentially LOD2 free) | **~90%** footprint; **~60%** height (if NYC 3D model confirmed free) |
| Terrain | ✅ Good | USGS 3DEP | **~85%** |
| Heritage | ✅ Strong | NRHP (NPS) + NYC Landmarks Preservation Commission layer | **~85%** (NRHP + NYC landmarks = comprehensive heritage layer) |

**NYC-specific advantage:** MapPLUTO is one of the most detailed, freely-available parcel
datasets in any US city. If `MaxAllwFAR` is populated, NYC's free-source rate for FAR exceeds
every other jurisdiction in the corpus except Denmark.

**NYC-specific complication:** Special Purpose Districts, floor area bonuses, TDR (air rights
transfers), and ULURP-related site-specific approvals create a non-automatable fraction that
cannot be served from any static data source.

---

## The structural gap

NYC's Zoning Resolution is one of the most complex in the world — 80+ SPDs, FAR bonus systems,
sky exposure plane regulations, contextual zoning variants. But NYC also publishes more open
structured data than any other US city:
- MapPLUTO: parcel geometry + zone code + FAR fields (if populated)
- ZOLA: parcel-level zoning lookup by BBL
- NYC 3D building model: LOD2 building volumes

The gap is not absence of data (as in Chicago or LA for FAR) but **verification**: whether
the data fields in MapPLUTO are correctly populated, current, and account for SPD overrides
correctly. This is the NYC equivalent of Germany's XPlanGML "schema ≠ populated" problem.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe MapPLUTO `MaxAllwFAR` null rate | **HIGHEST VALUE** — up to +35–45 pts if populated | Low — 0.25 dev-days |
| Probe ZOLA API for BBL-based structured zoning | May confirm or supplement MapPLUTO FAR | Low — 0.25 dev-days |
| Confirm NYC 3D building model free access + currency | +15–20 pts on building height if LOD2 | Low — portal check |
| Measure SPDist1 coverage fraction in Manhattan | Calibrates ceiling — SPD% determines non-automatable fraction | Low — MapPLUTO query |
| Contract Zoneomics for NYC | +15–25 pts over MapPLUTO (height + SPD handling) | Low (integration); cost TBD |

---

*Last updated: 2026-07-24. Scaffold — no live probes run. The `MaxAllwFAR` probe is the
single highest-value next step for NYC. Maintainer: UNASSIGNED.*
