# HEIGHT — Barcelona (INE 08019) — THE TRUE-HEIGHTS PLAN (PILOT)

> The per-city heights dossier, following `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md` (the
> heights ladder + H1–H5 onboarding) and `tools/context-bake/heightSources.mjs` (the MEASURED source
> per city). Barcelona is the pilot: unlike the Phase-2 cities, its per-city MDS bbox is **already in
> the ready list**. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
>
> ⚠ **§CONTEXT-DATA-HONESTY.** Every height figure below is cited to its finding or typed-unknown; no
> coverage % is invented.

---

## 1 — Current provenance state: heights are ESTIMATED (measured share ~1%)

Barcelona's context buildings are baked from OSM footprints. Their measured-vs-estimated split is one
of the few that HAS been measured — per `RATE.md` / **L-582**:

- **0.9% surveyed** (`tagged`, explicit OSM `height`) ·
- **79.3% `building:levels` × 3.2 m** (`derived-levels` — a real floor COUNT × an invented storey
  metre, NOT a measurement, C58 §1.2) ·
- **19.8% fabricated 9 m** (`assumed`, `DEFAULT_BUILDING_HEIGHT_M`).

So **~1% of Barcelona's context heights are a real MEASURED value today**; the rest are estimated or
fabricated, and the massing prism has the sibling gap (L-525): the 13a *alçada reguladora* is a
function of STREET WIDTH the prism does not fetch, so it too falls back to a default. This is why the
render is a low-rise carpet at estimated heights, not the real skyline.

## 2 — The MEASURED source that EXISTS for this city

**CNIG MDS Edificación (MDSnE2.5) — building nDSM raster** (`tools/context-bake/heightSources.mjs`,
`SOURCES.mds_edificacion`):

- **Endpoint:** `https://wcs-mds.idee.es/mds` — keyless **CC-BY** WCS 2.0.1 (INSPIRE), live-verified
  2026-07-26.
- **Coverage id:** `mdsn_e025` — a 2.5 m raster whose pixel value **IS the building height above
  ground** (nDSM isolated to the building class → no DSM−DTM subtraction).
- **Grid:** native EPSG:3042 (ETRS89/UTM30N), one projection covering all Spain including Barcelona.
- **Provenance it yields:** `tagged` (MEASURED) — a strict upgrade over `derived-levels`.
- **Measured sample recorded in the source note:** Barcelona Eixample building-only **P90 ≈ 31 m**
  (`heightSources.mjs`, `SOURCES.mds_edificacion.note`). ⚠ That is a sampled statistic from the source
  probe, NOT a per-08019 coverage %; **coverage over Barcelona's full footprint set is not-queried.**

## 3 — Why the measured height is not fully on the tiles today, and THE PLAN

Barcelona is the **best-positioned** of the four Catalan cities because its per-city MDS bbox already
exists:

- `heightSources.mjs REGION_SOURCE` lists **`barcelona: 'mds_edificacion'`** and the ready per-city
  bbox **`barcelona '2.05,41.32,2.24,41.47'`** (`[minLon,minLat,maxLon,maxLat]`). The per-city sample
  path (`fetchSpainBuildingHeights`) resolves exactly for this bbox.
- The whole-`spain` bake region declares `heightJoin: 'mds'` (`stampMdsHeightsOnGeojsonseq`) — the
  whole-country OSM-footprint join.

**What is still not-confirmed:** whether the shipped `buildings.pmtiles` for Barcelona actually carry
the stamped MDS heights end-to-end (the join having run, and the client resolving them `tagged`) — this
is **not-queried** and is exactly what the H1 probe (§4) measures. The ~1% measured figure in §1
predates a confirmed MDS re-bake.

**THE PLAN to reach true heights (LoD1 real-height render):**

1. Run the **H1** coverage probe for 08019 (measure the tagged/derived/assumed split on the shipped
   tiles — confirm whether the MDS join has landed).
2. **Confirm / re-run the MDS height-join for the Barcelona bbox** (`2.05,41.32,2.24,41.47`) — the row
   already exists, so this is a re-bake + verify, not a sourcing task.
3. **Re-bake.** Measured nDSM heights stamp onto the tiles → the client's `resolveHeightWithProvenance`
   reads them as `tagged` (measured) → buildings render as **real-height solid prisms (LoD1)** instead
   of the 9 m assumed carpet.
4. **Ordinance rung (H3, L-525):** wire the 13a street-width → *alçada reguladora* as a
   `derived-ordinance` rung for the massing prism (distinct from the context-building nDSM path).

## 4 — The H1–H5 onboarding steps + sign-off

Per `BUILDING-HEIGHT-REPLICATION-STANDARD.md` §2:

1. **H1 — OSM coverage probe.** Measure the split on Barcelona's baked buildings (the L-582 split is the
   prior; re-measure after any MDS re-bake). *(prior measured; post-MDS re-measure NOT DONE.)*
2. **H2 — Authority height source.** CNIG MDS Edificación (`mdsn_e025`) — identified, bbox row exists,
   join `heightJoin:'mds'`. *(source + bbox ready; end-to-end tile confirmation NOT DONE.)*
3. **H3 — Ordinance height.** 13a street-width → *alçada reguladora* (L-525, `bcnAlcadaReguladora.ts`) —
   a `derived-ordinance` rung. *(ordinance table sourced; wired to the context/massing height path: NOT
   DONE.)*
4. **H4 — Confidence stamping.** Every resolved height carries the C62 `DomainConfidence` of its rung.
   *(engine-level, shared.)*
5. **H5 — VERIFICATION sign-off.** A human confirms the source ladder + coverage and signs
   `sources/VERIFICATION.md` (the L-449-style gate) → Barcelona's heights graduate to **verified**.
   *(NOT DONE.)*

**Who signs off:** the L-449 human-verification gate — a geodata/planning reviewer signs
`sources/VERIFICATION.md`; no silent graduation.

## 5 — Note: all four Catalan cities share the SAME ES MDS source

Barcelona, L'Hospitalet, Badalona and Sant Boi all draw measured heights from the **one** CNIG MDS
Edificación raster (`mdsn_e025`, EPSG:3042, national). Barcelona already has its per-city bbox row; the
other three have it as a TODO (derive from each municipal boundary — do NOT fabricate). See each city's
`HEIGHT.md`.

---

*Cross-refs: `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md` (audit L-646, H1–H5, the ladder),
`tools/context-bake/heightSources.mjs` (`mds_edificacion`, `REGION_SOURCE`, `barcelona` bbox),
`tools/context-bake/bake.mjs` (`spain` region, `heightJoin:'mds'`),
`apps/editor/src/ui/geospatial/contextBuildings.ts` (`resolveContextHeight`), L-582 (the measured
split), L-525 (ordinance-height gap), L-459 (provenance), C62 · C58 §1.2 ·
`GEO-DATA-SOURCING-MASTER.md`. Siblings: `RATE.md`, `ENVELOPE.md`, `NEXT.md`.*
