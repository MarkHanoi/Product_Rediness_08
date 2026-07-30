# HEIGHT — Madrid (INE 28079)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
>
> ⚠ **§CONTEXT-DATA-HONESTY.** No coverage % is stated below — coverage is the output of the H1 probe,
> never guessed. Every height claim is cited or typed-unknown.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**No measured height baked.** Context buildings render OSM/assumed (Catastro footprint is national;
height coarse; nDSM ❌ per [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)). Heights resolve on the ladder
in `contextBuildings.ts` (`tagged` → `derived-levels` `building:levels`×3.2 m → `assumed` 9 m), so most
fall to the fabricated default rather than the real skyline. **The split for 28079 is not-queried** — it
is the H1 probe output, not a number to guess.

## The MEASURED source that EXISTS for this city

**CNIG MDS Edificación (`mdsn_e025`) — building nDSM raster** (`tools/context-bake/heightSources.mjs`):
keyless CC-BY WCS 2.0.1, native EPSG:3042 (one projection over all Spain incl. Madrid), 2.5 m, pixel
value = building height above ground. **Madrid's per-city bbox IS configured**
(`REGION_SOURCE.madrid = 'mds_edificacion'`; sampled real bldg-only P90 ~28 m *centro*, documented in
`heightSources.mjs`). **Coverage over 28079: NOT-QUERIED** — the source is wired, but whether a clean MDS
sample resolves over Madrid's footprints, and whether it has landed on the shipped tiles, has not been
measured. Do NOT state a coverage %.

## The NZ 1 tie-in (envelope ≠ context height)

Distinct from the context-bake ladder above: Madrid's NZ 1 envelope is an `explicit-area` zone whose
**buildable footprint** (not a per-building height) is the published `Fondo de la Edificación` polyline;
NZ 1 height *conditions* ride with that plane. That is an ordinance-massing concern (see
[`ENVELOPE.md`](./ENVELOPE.md)), not the measured building-height render this file tracks.

## Resume (H1–H5)

1. **H1** — run the coverage probe for the 28079 bbox (the `tagged`/`derived-levels`/`assumed` split — the default-fire rate). *(NOT STARTED.)*
2. **H2** — confirm/land the per-city `mds_edificacion` join for Madrid; re-bake. *(source configured; landing NOT confirmed.)*
3. **H3** — ordinance height (NZ 4/8 *altura de cornisa / nº plantas*) is grado-structured in the NNUU Compendio 2023 PDF, unsourced (see [`ENVELOPE.md`](./ENVELOPE.md)). *(BLOCKED on human sourcing.)*
4. **H4/H5** — confidence stamping (shared) + a human signs `sources/VERIFICATION.md` (L-449) → heights graduate to verified. *(NOT STARTED.)*

A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `tools/context-bake/heightSources.mjs`
(`mds_edificacion`, `REGION_SOURCE.madrid`), `apps/editor/src/ui/geospatial/contextBuildings.ts`,
C62 · C58 §1.2, C63 §3 Axis 6.*
