# RATE-IMPLEMENTATION-PLAN — Helsinki (kuntanumero 091)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The three cheap axes are already assessed; this plan drives the four human-gated axes off `not-assessed`.

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | TERRAIN (10) | set the free `MML_API_KEY` repo secret → run the `helsinki` terrain bake → `terrain.verify.mjs` round-trip (rung 50→100) | decoder pass |
| P2 | HEIGHTS/LOD (10) | add the Helsinki open LoD2 source to `heightSources.mjs` + wire the REPLACE join + re-bake + probe provenance | `tagged` fraction |
| P3 | PARCEL (15) | add an `isInFinland` predicate + MML Kiinteistörekisteri adapter → run `computeParcelConfidence` over an N-parcel sample | sample distribution |
| P4 | DATA-SOURCES (15) | confirm the Ryhti item-level schema + wire the zone-GIS → promote the zone slot `documented`→`live` | item schema resolved |
| P5 | LEGISLATION (25) | count structured provisions per Helsinki asemakaava (Ryhti) → cite `sources/SOURCES.md` → sign `VERIFICATION.md` | L-449 |
| P6 | ENVELOPE (20) | author the `fi-091-helsinki` rule pack once P4/P5 + the parcel provider land | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are the human-gated sourcing cost. Helsinki is unusually
favourable: Ryhti (P4/P5) + open LoD2 (P2) + open municipal GIS mean the ceiling is high once the item schema
and the FREE `MML_API_KEY` are resolved.

*Cross-refs: C63 §4, C58, `./RATE.md`, `./NEXT.md`.*
