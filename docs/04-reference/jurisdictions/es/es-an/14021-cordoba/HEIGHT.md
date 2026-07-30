# HEIGHT — Córdoba (INE 14021)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
>
> ⚠ **§CONTEXT-DATA-HONESTY.** No coverage % is stated below — coverage is the output of the H1 probe,
> never guessed. Every height claim is cited or typed-unknown.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`)

**No measured height baked.** Context buildings render OSM/assumed (Catastro footprint is national; the
building nDSM is ❌ per [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)). Heights resolve on the ladder in
`contextBuildings.ts` (`tagged` OSM height → `derived-levels` OSM `building:levels`×3.2 m → `assumed` 9 m),
so most fall to the fabricated default rather than the real skyline.

## The MEASURED source that EXISTS for this city

**CNIG MDS Edificación (`mdsn_e025`) — building nDSM raster** (`tools/context-bake/heightSources.mjs`):
keyless CC-BY WCS 2.0.1, native EPSG:3042 (one projection over all Spain incl. Córdoba), 2.5 m, pixel
value = building height above ground. **Córdoba's per-city bbox IS configured**
(`REGION_SOURCE.cordoba = 'mds_edificacion'`, sampled real bldg-only P90 ~documented in
`heightSources.mjs`). **Coverage over 14021: NOT-QUERIED** — the source exists and is wired, but whether a
clean MDS sample resolves over Córdoba's footprints, and whether it has landed on the shipped tiles, has
not been measured. Do NOT state a coverage %.

## Resume (H1–H5)

1. **H1** — run the coverage probe for the 14021 bbox (measure the `tagged`/`derived-levels`/`assumed`
   split on the baked buildings — the default-fire rate). *(NOT STARTED.)*
2. **H2** — confirm/land the per-city `mds_edificacion` join for Córdoba; re-bake. *(source configured;
   landing NOT confirmed.)*
3. **H3** — ordinance height (Manzana Cerrada per-street-width table) needs a Córdoba street-width
   resolver, not built (same gap as Barcelona). *(BLOCKED.)*
4. **H4/H5** — confidence stamping (shared) + a human signs `sources/VERIFICATION.md` (L-449) → heights
   graduate to verified. *(NOT STARTED.)*

A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

*Cross-refs: `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `tools/context-bake/heightSources.mjs`
(`mds_edificacion`, `REGION_SOURCE.cordoba`), `apps/editor/src/ui/geospatial/contextBuildings.ts`,
C62 · C58 §1.2, C63 §3 Axis 6.*
