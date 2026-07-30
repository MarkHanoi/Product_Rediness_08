# Building-height status — Greater London (E12000007)

> Feeds C63 **HEIGHTS/LOD** axis (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646). **Last updated:** 2026-07-30.
> **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE but UNWIRED**

**A measured height is DERIVABLE for London but the join is not wired and not baked.** The Environment Agency
publishes a **LIDAR Composite DSM 1 m** alongside the **DTM 1 m** already live in `terrain.mjs` (`gb`), both OGL
v3 and keyless (England). `GEO-DATA-SOURCING-MASTER.md` names the UK path explicitly: "derive **EA DSM − DTM** +
OS Open Buildings/OSM footprints … skip OS's commercial attribute". That DSM−DTM subtraction is a real nDSM =
a MEASURED per-building height (`tagged`).

**Why still `not-assessed`:** `heightSources.mjs` maps `london → {source:null, status:'no-source',
reason:'OS Building Heights is licensed; GB not in LOD-RATE-MASTER'}` — the derive is **not implemented**, so no
national real height is stamped and the bake renders the OSM `assumed` 9 m carpet. No per-building
`heightProvenance` histogram has been probed. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY).

## Height source ladder (which rung London sits on)

| Rung | Source | Provenance tag | Present here? |
|---|---|---|---|
| measured | EA DSM 1 m − DTM 1 m nDSM (derive) | `tagged` | **derivable, NOT wired** (`heightSources.mjs` = no-source) |
| measured | OS Building Heights | `tagged` | ❌ commercial — deliberately skipped |
| measured | OSM `height` | `tagged` | partial (inner-London coverage, unprobed) |
| derived | OSM `building:levels` × 3.2 m | `derived-levels` | partial |
| fallback | the 9 m carpet | `assumed` | ⚠ what renders today |

## Provenance distribution (the axis input)

Not probed — the deployed London tiles render OSM footprints at the `assumed` default until the DSM−DTM derive is
wired + baked. No fabricated height is emitted.

## What would raise the HEIGHTS/LOD axis

`Wire the EA DSM−DTM nDSM stamp (reuse the DK DHM / ES MDS engine) onto London OSM footprints, re-bake, probe the
histogram · effort medium` — cross-ref `GEO-DATA-SOURCING-MASTER.md` + `../../LOD-RATE.md`.

---
*Authority: `BUILDING-HEIGHT-REPLICATION-STANDARD.md` · C62 · C63 §3 Axis 6. Feeds: `RATE.md` · `../../LOD-RATE.md`.*
