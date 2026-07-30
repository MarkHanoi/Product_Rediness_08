# HEIGHT — Sant Boi de Llobregat (INE 08200) — THE TRUE-HEIGHTS PLAN

> The per-city heights dossier, following `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md` (the
> heights ladder + H1–H5 onboarding) and `tools/context-bake/heightSources.mjs` (the MEASURED source
> per city). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
>
> ⚠ **§CONTEXT-DATA-HONESTY.** No coverage % is stated below — coverage is produced by the H1 probe,
> never guessed. Every height claim is cited or typed-unknown.

---

## 1 — Current provenance state: heights are ESTIMATED

Sant Boi's context buildings are baked from **OSM footprints** via the whole-country `spain` bake
region (`tools/context-bake/bake.mjs`, bbox `-9.55,35.90,4.60,43.90`, which covers every Spanish
jurisdiction). Their heights resolve on the source ladder in
`apps/editor/src/ui/geospatial/contextBuildings.ts` (`resolveContextHeight`):

- **`tagged`** — explicit OSM `height`/`building:height` (surveyed-ish), where present;
- **`derived-levels`** — OSM `building:levels` (a real floor COUNT) × an assumed ~3.2 m storey height
  (an invented storey metre — NOT a measurement, C58 §1.2);
- **`assumed`** — nothing usable tagged → `DEFAULT_BUILDING_HEIGHT_M = 9` m (a fabricated default).

Per the standard's code-confirmed diagnosis, OSM height tagging is sparse outside a few well-mapped
regions, so most buildings fall to `assumed 9 m` → the "uniform low-rise carpet" rendered at a
fabricated height rather than the real skyline. **The tiles carry no MEASURED height for 08200** (see
§3 for why), so the 3D render extrudes them at an estimated/fabricated height, not their true one.
**The split for 08200 is not-queried** — it is the output of the H1 probe (§4), not a number to guess.

## 2 — The MEASURED source that EXISTS for this city

**CNIG MDS Edificación (MDSnE2.5) — building nDSM raster** (`tools/context-bake/heightSources.mjs`,
`SOURCES.mds_edificacion`):

- **Endpoint:** `https://wcs-mds.idee.es/mds` — keyless **CC-BY** WCS 2.0.1 (INSPIRE), live-verified
  2026-07-26.
- **Coverage id / field:** `mdsn_e025` — MDS *normalizado* Edificación, a 2.5 m raster whose pixel
  value **IS the building height above ground** (nDSM already isolated to the building class → no
  DSM−DTM subtraction needed).
- **Grid:** native EPSG:3042 (ETRS89/UTM30N), **one projection covering all of Spain** including the
  Sant Boi/Barcelona metro area.
- **Provenance it yields:** `tagged` (a real MEASURED height) — a strict upgrade over Catastro's floor
  count (`derived-levels`).
- **Coverage over 08200: NOT-QUERIED.** The source is national and *exists*; whether a clean MDS sample
  resolves over Sant Boi's footprints has not been measured. Do NOT state a coverage %.

## 3 — Why the measured height is not on the tiles today, and THE PLAN

Two MDS ingest paths exist in the ES pipeline, and **neither is confirmed to stamp measured heights
over 08200**:

1. **The per-city sample path** (`heightSources.mjs`, `fetchSpainBuildingHeights` / `REGION_SOURCE`):
   samples `mdsn_e025` per Catastro footprint for a **CITY bbox**. The whole-`spain` bbox is **refused
   per-tile** (Catastro has no single whole-country query) → `documented` → keeps OSM. A **city bbox
   resolves exactly** — but the ready per-city bbox list is
   `barcelona, madrid, cordoba, valencia, sevilla, malaga, zaragoza, bilbao`. **Sant Boi is NOT in it.**
2. **The whole-country OSM-footprint JOIN** (`bake.mjs` `spain` region declares `heightJoin: 'mds'` →
   `stampMdsHeightsOnGeojsonseq`): stamps the MDS raster onto bake's OWN OSM footprints. This is the
   intended whole-country real-height path and it *geographically* spans 08200 — but whether it has run
   in the shipped tiles and stamped clean heights over Sant Boi specifically is **NOT-QUERIED**.

**THE PLAN to reach true heights (LoD1 real-height render):**

1. Run the **H1** coverage probe for 08200 (measure the tagged/derived/assumed split — the
   "default-fire rate").
2. **Add Sant Boi's per-city bbox to the MDS height-join** — either a new per-city row in
   `heightSources.mjs REGION_SOURCE`, or confirm the whole-`spain` `heightJoin:'mds'` join already
   covers 08200 with clean samples.
   - ⚠ **The bbox is a TODO — do NOT fabricate it.** A **candidate lower bound** is the router core box
     `SANT_BOI_BBOX` = `2.020,41.328,2.058,41.358` (`[minLon,minLat,maxLon,maxLat]`, cited from
     `providers/santBoiBbox.ts`), **but that box deliberately UNDER-COVERS** the municipality (a tight
     proximity gate on the east bank of the Llobregat, west of L'Hospitalet). The true height bbox must
     be derived from Sant Boi's **full municipal boundary** and sanity-checked on the first bake.
3. **Re-bake.** The measured nDSM heights stamp onto the tiles → the client's
   `resolveHeightWithProvenance` reads them as `tagged` (measured) → the buildings render as
   **real-height solid prisms (LoD1)** instead of the 9 m assumed carpet.

## 4 — The H1–H5 onboarding steps + sign-off

Per `BUILDING-HEIGHT-REPLICATION-STANDARD.md` §2:

1. **H1 — OSM coverage probe.** Measure the `tagged` + `derived-levels` vs `assumed` split for 08200's
   baked buildings. *(NOT STARTED.)*
2. **H2 — Authority height source.** CNIG MDS Edificación (`mdsn_e025`) — identified (§2); wire/confirm
   the per-08200 join (§3). *(source identified; join for 08200 NOT STARTED.)*
3. **H3 — Ordinance height (massing prism).** Sant Boi's own *alçada reguladora* (street-width →
   height) — a `derived-ordinance` rung, per rule-pack. **Barcelona's table does NOT transfer** (see
   [`ENVELOPE.md`](./ENVELOPE.md)). *(BLOCKED on the human sourcing in [`NEXT.md`](./NEXT.md) §3.1.)*
4. **H4 — Confidence stamping.** Every resolved height carries the C62 `DomainConfidence` of its rung.
   *(engine-level, shared; per-city N/A.)*
5. **H5 — VERIFICATION sign-off.** A human confirms the source ladder + coverage for 08200 and signs
   `sources/VERIFICATION.md` (the L-449-style gate) → the city's heights graduate to **verified**.
   *(NOT STARTED.)*

**Who signs off:** the same human-verification gate (L-449) that governs the envelope — a
Spanish-planning / geodata reviewer signs `sources/VERIFICATION.md`; no silent graduation.

## 5 — Note: all four Catalan cities share the SAME ES MDS source

Barcelona, L'Hospitalet, Badalona and Sant Boi all draw measured heights from the **one** CNIG MDS
Edificación raster (`mdsn_e025`, EPSG:3042, national), so the PLAN above is near-identical across them.
The only per-city work is (a) the H1 probe and (b) the per-city bbox — stated here as a TODO because it
must be derived from each municipal boundary, never fabricated.

---

*Cross-refs: `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md` (audit L-646, H1–H5, the ladder),
`tools/context-bake/heightSources.mjs` (`mds_edificacion`, `REGION_SOURCE`, per-city bboxes),
`tools/context-bake/bake.mjs` (`spain` region, `heightJoin:'mds'`),
`apps/editor/src/ui/geospatial/contextBuildings.ts` (`resolveContextHeight`), C62 · C58 §1.2 ·
`GEO-DATA-SOURCING-MASTER.md`.*
