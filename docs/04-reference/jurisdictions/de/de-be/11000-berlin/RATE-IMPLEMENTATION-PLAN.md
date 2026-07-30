# RATE-IMPLEMENTATION-PLAN — Berlin (AGS 11000)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

Two cheap axes are already assessed (DATA-SOURCES 40 %, CONTEXT 56 %). This plan drives the five
`not-assessed` axes — Berlin is the most expensive German city (regime classifier + Baunutzungsplan legacy).

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | TERRAIN (10) | wire a Berlin/Brandenburg DTM (Geobasis BE/BB WCS) as a `terrain.mjs` source + city row, then bake | `layer.json` 200 |
| P2 | HEIGHTS/LOD (10) | wire a Berlin LoD2-DE CityGML fetcher (post-FIS-Broker endpoint), add `berlin` heightJoin, re-bake + probe | `tagged` fraction |
| P3 | DATA-SOURCES (15) | ↑ from 40 %: land the terrain + height wiring above → cadastre remains footprint until a Berlin ALKIS WFS/licence | slot re-score |
| P4 | PARCEL (15) | resolve a Berlin ALKIS route (or accept footprint-fallback cap); run `computeParcelConfidence` over an N-parcel sample in the 11000 bbox | sample distribution |
| P5 | LEGISLATION (25) | build the 4-regime classifier (§30/Baunutzungsplan/§34/§35); source XPlanGML zones; measure the §34 fraction; cite `sources/SOURCES.md`; sign `VERIFICATION.md` | L-449 |
| P6 | ENVELOPE (20) | author `de-11000-berlin` rule pack once P5 lands (with the Baunutzungsplan voidance protocol) | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are the human-gated cost and are LAST: Berlin's
regime classifier + Baustufen translation table + §34 measurement + case-law voidance checks cannot be
automated. See `NEXT.md` for the exact resume probes.

*Cross-refs: C63 §4, C58, `./RATE.md`, `./NEXT.md`.*
