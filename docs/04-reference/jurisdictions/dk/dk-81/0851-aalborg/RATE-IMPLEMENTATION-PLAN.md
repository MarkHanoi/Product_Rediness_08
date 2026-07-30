# RATE-IMPLEMENTATION-PLAN — Aalborg (kommune 0851)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The two cheap axes are already assessed; this plan drives the five probe-/human-gated axes off `not-assessed`.
Denmark's differentiator is a **live keyless structured** legislation source — the cost is the per-city
measurement + the human sign-off, not the sourcing.

| Phase | Axis (weight) | Action | Gate |
|---|---|---:|---|
| P1 | DATA-SOURCES (15) | confirm `DATAFORDELER_API_KEY` + `DATAFORDELER_USERNAME/PASSWORD` in the bake/deploy env → lift the 3 `documented` slots | secret present + one live probe |
| P2 | TERRAIN (10) | add a aalborg bbox row to `terrain.mjs` TERRAIN_CITIES (source `dk`), bake DHM, run `terrain.verify.mjs` | decoder pass + `layer.json` 200 |
| P3 | HEIGHTS/LOD (10) | re-bake with the DHM nDSM join + probe the deployed provenance histogram at the 0851 bbox | `tagged` fraction |
| P4 | PARCEL (15) | set the Matrikel credential + run `computeParcelConfidence` over an N-parcel sample in the 0851 bbox | sample distribution |
| P5 | LEGISLATION (25) | run the byzone fill probe scoped to 0851, cite per-clau values in `sources/SOURCES.md`, land the Danish-planner sign-off | L-449 |
| P6 | ENVELOPE (20) | measure per-city solver coverage; author cited per-plan setback/coverage once P5 lands | C58 certifiability |

*Cross-refs: C63 §4, C58, `./RATE.md`, `../../RATE-IMPLEMENTATION-PLAN.md` (national climb).*
