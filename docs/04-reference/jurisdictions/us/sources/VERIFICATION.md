# USA (`us`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified. No live endpoint probe has been run.
This file will be completed once endpoint probes are run and the first city zoning attributes
are confirmed against a primary source (ordinance text or Zoneomics API response).

---

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method (viewer / PDF read / endpoint response) | Verdict |
|---|---|---|---|
| Legal basis — *Euclid v. Ambler* (1926) | US Supreme Court decision 272 U.S. 365 | Citation confirmed in legal database | ✅ confirmed |
| NZA browse-only policy ("no bulk download, maybe 2026") | NZA FAQ (zoningatlas.org/faq), accessed 2026-07-24 | Direct text read | ✅ confirmed |
| NZA AI-rejection statement | NZA FAQ | Direct text read | ✅ confirmed |
| Zoneomics — 20,000+ cities claim | Zoneomics product page, 2026-07-24 | Marketing claim read | ⚠ `corroborated` — not independently verified; field schema not probed |
| Zoneomics — Sidewalk Labs enterprise customer | Published reference | Secondary corroboration | ⚠ `corroborated` — reference exists; contract terms unknown |
| Regrid — 160M parcels / 99% of Americans | Regrid product page, 2026-07-24 | Marketing claim read | ⚠ `corroborated` — not independently verified; API not probed |
| Regrid — MCP server | Regrid product announcement | Secondary corroboration | ⚠ `corroborated` |
| Microsoft US Building Footprints — 129.6M / ODbL | GitHub repository `microsoft/USBuildingFootprints` | Repository + licence read | ✅ confirmed |
| Overture + USGS height model — 20M+ buildings | Overture Maps Foundation announcement | Published announcement read | ⚠ `corroborated` — figure not live-verified |
| USGS 3DEP — national LiDAR programme | USGS programme documentation | Published document read | ✅ confirmed |
| NRHP — ~100,000 properties, NPS, free, weekly | NPS NRHP documentation | Published document read | ✅ confirmed |
| NRHP — pre-1983 UTM/NAD27 caveat | NPS NRHP technical notes | Published document read | ✅ confirmed |
| NRHP — NRIS separate join required | NPS NRHP/NRIS documentation | Published document read | ✅ confirmed |

---

## What I could NOT confirm (and why it stays unshippable)

- **Any numeric zoning rule (FAR, height, setback) for any specific US parcel** — requires a
  live Zoneomics API query or primary municipal ordinance text read.
- **Zoneomics field completeness (FAR, height null-rate)** — requires a live API probe with a
  sample of parcels across zone types.
- **Regrid API field schema and jurisdiction routing** — requires a live API probe.
- **City open-data portal zoning attribute completeness** (Chicago, LA, NYC) — requires direct
  dataset inspection.
- **Overture/USGS height coverage for specific city bboxes** — requires downloading and
  inspecting the Overture building layer for the target area.
- **NRHP ArcGIS feature service endpoint** — URL confirmed in research; not curl-tested.
- **FEMA NFHL ArcGIS endpoint** — confirmed to exist; not probed.

## Caveats that must remain visible in the product

- Zoneomics and Regrid coverage claims are marketing figures; actual parcel coverage and field
  completeness must be probed before committing a pipeline.
- NRHP spatial attributes are minimal; the full heritage record requires a NRIS join — never
  ship an NRHP assessment from spatial-layer attributes alone.
- Pre-1983 NRHP records use UTM/NAD27 — reproject before spatial joins to avoid positional
  errors of up to ~200 m.
- Microsoft Building Footprints are ML-derived (not surveyed) — treat as LOD1 estimated, not
  certified geometry.
- Overture/USGS building heights are modelled/estimated — same caveat tier as Germany's LoD2-DE
  LiDAR-derived heights.

**Sign-off:** NOT SIGNED — awaiting live probe results and first primary source read of a US
municipal ordinance or Zoneomics API response for a specific parcel.
