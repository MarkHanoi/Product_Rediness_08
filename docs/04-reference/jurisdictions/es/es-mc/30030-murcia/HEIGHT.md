# HEIGHT — Murcia (INE 30030)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**No measured height baked.** Context buildings render OSM/assumed (9 m default). The national CNIG MDS Edificación raster (`heightSources.mjs` `mds_edificacion`, impl:`live`) is joined via the `spain` `heightJoin:'mds'` (`bake.mjs`), but no per-city provenance histogram has been probed here.

## ⚠ §MURCIA-HEIGHT-STAMP-GAP — the "confirm/add the per-city MDS join" resume step below was REAL, and it is now DONE (2026-08-01)

Murcia was **absent from `MDS_CITY_BBOXES`** (`tools/context-bake/heightSources.mjs`), and the
omission was **silent and total** — not a de-prioritisation:

- that list is passed as **both** the join's `priorityBboxes` (stamped first, uncapped) **and** its
  `retainBboxes` working set (`bake.mjs stampBboxesFor` → §HEIGHT-STAMP-BUDGET, L-659);
- footprints outside the retain set are **streamed straight through** the join with their original
  OSM tags and are never eligible for a sample.

⇒ Murcia would have measured **zero** heights after a national re-bake, while `bake.mjs`'s
§MEASURED-HEIGHT-GATE reported a green outcome for the `spain` region (the gate asserts the *region*
stamped something, and Barcelona/Córdoba would have satisfied it). A green bake would have been
read as "Murcia has heights".

**Fixed:** Murcia is now a `PHASE-4` row with bbox `[-1.2007, 37.9322, -1.0607, 38.0522]` — the
canonical `terrain.mjs` REGIONS `murcia` row, **not re-invented** (0.14°×0.12°, well under the 0.7°
whole-country refusal guard). `REGION_SOURCE.murcia = 'mds_edificacion'` is declared alongside it.

**Resume:** re-bake (`cd tools/context-bake && node bake.mjs --layer buildings`), upload
`out/buildings.pmtiles` to R2, then probe the deployed provenance histogram for the 30030 bbox (the
H1 step). Until that probe runs this axis stays `not-assessed` — a config row is not a measurement
(§SIZE-IS-NOT-PROVENANCE). A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs`, C63 §3 Axis 6.*
