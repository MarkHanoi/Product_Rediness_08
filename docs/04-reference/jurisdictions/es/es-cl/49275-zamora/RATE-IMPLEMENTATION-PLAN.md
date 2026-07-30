# RATE-IMPLEMENTATION-PLAN — Zamora (INE 49275)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The three cheap axes are already assessed; this plan drives the four human-gated axes off `not-assessed`.

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | DATA-SOURCES (15) | confirm the per-city MDS height bbox | probe |
| P2 | TERRAIN (10) | run `terrain.verify.mjs` round-trip for `zamora` → lift rung 50→100 | decoder pass |
| P3 | HEIGHTS/LOD (10) | wire an MDS join for this bbox + probe | `tagged` fraction |
| P4 | PARCEL (15) | run `computeParcelConfidence` over an N-parcel sample in the 49275 bbox | sample distribution |
| P5 | LEGISLATION (25) | source the governing instrument + zones → cite `sources/SOURCES.md` → sign `VERIFICATION.md` | L-449 |
| P6 | ENVELOPE (20) | author `es-49275-zamora` rule pack once P5 lands | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are the human-gated sourcing cost — the whole
differentiator. They are LAST because they cannot be automated.

*Cross-refs: C63 §4, C58, `./RATE.md`.*
