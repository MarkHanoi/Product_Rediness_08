# RATE-IMPLEMENTATION-PLAN — Stockholm (kommunkod 0180)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The three cheap axes are already assessed; this plan drives the four human-gated axes off `not-assessed`.

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | TERRAIN (10) | set the free `LANTMATERIET_API_KEY` repo secret → run the `stockholm` terrain bake → `terrain.verify.mjs` round-trip (rung 50→100) | decoder pass |
| P2 | HEIGHTS/LOD (10) | wire the LiDAR nDSM (`lidar_se`) APPEND join for the `stockholm` bbox + re-bake + probe provenance | `tagged` fraction |
| P3 | PARCEL (15) | add an `isInSweden` predicate + Lantmäteriet Fastighetsindelning adapter → run `computeParcelConfidence` over an N-parcel sample | sample distribution |
| P4 | DATA-SOURCES (15) | live-probe NGP detaljplan via an SE proxy → promote the zone-GIS slot `documented`→`live` | live probe |
| P5 | LEGISLATION (25) | count structured provision codes per Stockholm post-2022 detaljplan → cite `sources/SOURCES.md` → sign `VERIFICATION.md` | L-449 |
| P6 | ENVELOPE (20) | author the `se-0180-stockholm` rule pack once P5 + the parcel provider land | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are the human-gated sourcing cost. Stockholm's specific
unlock is dual: the FREE Lantmäteriet key (P1/P2/P3 all wait on it) and an SE-resident proxy for NGP (P4/P5).

*Cross-refs: C63 §4, C58, `./RATE.md`, `./NEXT.md`.*
