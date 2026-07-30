# RATE-IMPLEMENTATION-PLAN — Copenhagen / København (kommune 0101)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The two cheap axes are already assessed; this plan drives the five probe-/human-gated axes off `not-assessed`.
Denmark's differentiator is that LEGISLATION rests on a **live keyless structured source** — the cost is the
per-city measurement + the human sign-off, not the sourcing.

| Phase | Axis (weight) | Action | Gate |
|---|---|---:|---|
| P1 | DATA-SOURCES (15) | confirm `DATAFORDELER_API_KEY` + `DATAFORDELER_USERNAME/PASSWORD` are set in the bake/deploy env → lift the 3 `documented` slots toward `live` | secret present + one live probe |
| P2 | TERRAIN (10) | with the apikey set, run the `copenhagen` DHM bake → `terrain.verify.mjs` round-trip → lift `not-assessed` → rung 50/100 | decoder pass + `layer.json` 200 |
| P3 | HEIGHTS/LOD (10) | re-bake with the DHM nDSM join enabled + probe the deployed provenance histogram at the 0101 bbox | `tagged` fraction |
| P4 | PARCEL (15) | set the Matrikel credential + run `computeParcelConfidence` over an N-parcel sample in the 0101 bbox | sample distribution |
| P5 | LEGISLATION (25) | run the byzone click-weighted fill probe scoped to 0101, cite per-clau values in `sources/SOURCES.md`, land the Danish-planner `VERIFICATION.md` sign-off | L-449 |
| P6 | ENVELOPE (20) | measure per-city solver coverage (buildable-land share × tier); replace the `dkPerimeterBlock` STUDY band with cited per-plan setback/coverage once P5 lands | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are last: DK holds the rule *path* live, but the per-city
measurement + the human sign-off cannot be automated.

*Cross-refs: C63 §4, C58, `./RATE.md`, `../../RATE-IMPLEMENTATION-PLAN.md` (national climb).*
