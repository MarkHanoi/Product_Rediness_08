# RATE-IMPLEMENTATION-PLAN — Oslo (kommune 0301)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

The three cheap axes are already assessed; this plan drives the four human-gated axes off `not-assessed`.

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | TERRAIN (10) | run `terrain.verify.mjs --tileset` round-trip for `oslo` → lift rung 50→100 | decoder pass |
| P2 | HEIGHTS/LOD (10) | wire the NDH nDSM APPEND join for the `oslo` bbox + re-bake + probe provenance histogram | `tagged` fraction |
| P3 | PARCEL (15) | run `computeParcelConfidence` over an N-parcel sample in the `oslo` bbox (Matrikkelen live) | sample distribution |
| P4 | DATA-SOURCES (15) | confirm/raise the zone-GIS slot: probe for an Oslo planregister WFS (Geonorge / data.oslo.kommune.no) → `documented`→`live` | live WFS probe |
| P5 | LEGISLATION (25) | source the governing reguleringsplan + kommuneplan zones → cite `sources/SOURCES.md` → sign `VERIFICATION.md` | L-449 |
| P6 | ENVELOPE (20) | author the `no-0301-oslo` rule pack once P5 lands (grad av utnytting + plan-set height + §29-4 default) | C58 certifiability |

The expensive axes (LEGISLATION 25 · ENVELOPE 20) are the human-gated sourcing cost — the whole
differentiator. They are LAST because they cannot be automated. Oslo's specific unlock is the Planinnsyn
WFS / faktaark automation probe (P4) — it decides whether the numeric values are ever machine-readable.

*Cross-refs: C63 §4, C58, `./RATE.md`, `./NEXT.md`.*
