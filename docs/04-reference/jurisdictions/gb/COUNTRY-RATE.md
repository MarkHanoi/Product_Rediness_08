# United Kingdom (gb) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell.
     A future scorecard-function re-run replaces the manual cells (C63 §1.1/§8.1). -->

**National legislation/data-fill (`LEGISLATION-RATE.md`):** `NOT YET ASSESSED — scaffold only`. GB planning is
**discretionary** (no as-of-right numeric zoning envelope), so the structured-fill ceiling is structurally low —
see [`README.md`](./README.md) for the national data layer (what is solved / achievable / absent) and
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — **RATIFIED (founder, 2026-07-30)**: LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is a
> cited-derived scorecard output or `not-assessed`; NEVER a hand-typed or borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(der)` = HEIGHTS measured-**capable** via EA LiDAR DSM−DTM derive (documented in
`GEO-DATA-SOURCING-MASTER.md`) but NOT wired in `heightSources.mjs` and unbaked → still not-assessed.
**Overall** is renormalised over the ASSESSED subset only (`partial`). DATA-SOURCES reads **50 %** (below
France's 80 % / Spanish-mainland 70 %) because GB has **no keyless national cadastre** wired (HM Land Registry
polygons are OGL but are index polygons, not a parcel cadastre; OS MasterMap is licensed) and **no national
numeric zoning-GIS** (discretionary planning) — only terrain + context are `live`, heights `documented`.

## §0 — Subdivision + code scheme (documented — the DECISION this pass)

GB uses **ONS GSS codes** for `<code>` (the C57/NAMING-CONVENTION §3 join key — the GB analogue of INE/INSEE/LAU)
and the **ISO 3166-2:GB constituent country** for the `<cc>-<subdiv>` folder level:

| Subdiv folder | ISO 3166-2:GB | Tackled cities (GSS `<code>`) |
|---|---|---|
| `gb-eng` | England (GB-ENG) | Greater London (`E12000007`) |

**London code — the DECISION (task-required confirmation).** The tackled unit is **Greater London**, GSS region
code **`E12000007`** ("London", one of the 9 ONS statistical regions of England, coterminous with the Greater
London Authority area GSS `E61000001`). The bake extract is `greater-london-latest.osm.pbf` and the terrain
source is EA England (London), so **Greater London is the right unit** — **NOT** the City of London LAU
(GSS `E09000001`, the ~2.9 km² "square mile"), which would be a single small borough, not the tackled city.
Rejected `gb-lnd` as a subdivision segment because ISO 3166-2:GB-LND resolves ambiguously to the City of
London in some references; `gb-eng` (constituent country) is unambiguous and mirrors France's country→region→city
nesting depth. Pack identity (join key) = **`gb-E12000007-london`** == the folder path (`gb/gb-eng/E12000007-london/`).
⚠ The bake bbox `-0.20,51.44,0.02,51.55` is a **central-London slice** (City · Westminster · Camden · Southwark ·
Tower Hamlets · Islington · Hackney · Lambeth), not the full GLA outer extent — an honest note, not a redefinition.

## §A — Per-city completion matrix (1 SCAFFOLDED this pass — the bake-covered city)

The only bake-covered GB city is **Greater London** — the single GB row in `bake.mjs` REGIONS (`london` =
`greater-london-latest.osm.pbf`, bbox `-0.20,51.44,0.02,51.55`) AND `terrain.mjs` TERRAIN_CITY (`london`,
`source:'gb'` = EA LIDAR Composite DTM 1 m). Cheap axes cited-derived (full derivation in the city's `RATE.md`);
PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the human-gated axes, honestly `not-assessed` until sourced.

| City (`GSS`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _England (gb-eng)_ | | | | | | | | | |
| Greater London (`E12000007`) | `—` | `—` | **50%** | `—` | **50%** | `—`(der) | **56%** | **51%** `partial` | [dossier](./gb-eng/E12000007-london/RATE.md) |

**Scaffolded totals (this pass):** 1 dossier (Greater London), **51 %** overall on the assessed subset
(DATA-SOURCES 50 · TERRAIN 50 · CONTEXT 56). HEIGHTS is measured-**capable** via the EA LiDAR DSM−DTM derive
`(der)` but unwired/unbaked. Full 10-file city scaffold (composite `RATE.md` + `LEGISLATION-RATE.md` +
`ENVELOPE.md` + `HEIGHT.md` + `RISK-REGISTER.md` + `NEXT.md` + `RATE-IMPLEMENTATION-PLAN.md` + `README.md` +
`sources/`) authored this pass; `gb/` country folder created this pass.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

None. `gb/` did not exist before this pass; there are no legacy GB dossiers to normalize.

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Other GB cities** (Manchester, Birmingham, Edinburgh, Glasgow, Cardiff, Belfast …) are **NOT tackled** — no
  `bake.mjs` REGIONS row and no `terrain.mjs` row. ⚠ EA LiDAR/DTM is **England-only**; Scotland (Scottish Remote
  Sensing Portal), Wales (DataMapWales/NRW), and Northern Ireland (DAERA/OpenDataNI) are **separate portals** —
  a Scottish/Welsh/NI city needs its own terrain source row before its cheap axes are computable. Logged here,
  not hidden; scaffold on demand.
- **National legislation** is honestly `NOT YET ASSESSED` (§0) — GB has no national numeric zoning-GIS to fill a
  structured rate against, so the legislation ceiling is structurally low (discretionary planning). No rule pack
  is registered for any GB jurisdiction.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

The one scaffolded city has `honestyOk: true` — it fabricates nothing.

- **Greater London** — DOES: terrain (EA LIDAR Composite DTM 1 m, OGL v3, rung-50 unverified) + baked OSM context
  5/9 layers. REFUSES: a parcel cadastre (no keyless GB cadastre → footprint-fallback, honestly labelled) + an
  envelope (no rule pack; GB permission is discretionary, there is no as-of-right numeric envelope) — never a
  borrowed/invented number. UNKNOWN (typed): PARCEL quality `not-queried`, LEGISLATION/ENVELOPE
  `pending-implementation`, HEIGHTS `not-queried` (measured-CAPABLE via EA DSM−DTM derive, unwired). `honestyOk: true`.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill rate (NOT YET ASSESSED) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — what is solved / achievable / absent | all |
| [`COUNTRY-DATA-STRATEGY.md`](./COUNTRY-DATA-STRATEGY.md) | the reusable data-ceiling reasoning | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | the phased national climb | LEGISLATION (+all) |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| `sources/` | national per-field citations + verification | LEGISLATION |
| `regions/` | England/Scotland/Wales/NI portal routing | DATA-SOURCES |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. GSS codes +
subdivision scheme decided in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` +
`packages/site-parcel-data/src/parcelProviders/registry.ts` (no GB entry → footprint-fallback) +
`GEO-DATA-SOURCING-MASTER.md` (EA DSM−DTM derive).*
