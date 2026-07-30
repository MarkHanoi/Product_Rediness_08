<!-- MASTER RATE TRACKER — copyable TEMPLATE face of the global completion matrix.
     The live tracker is `docs/03-execution/plans/master-execution-tracker.md §CITY-COMPLETION`;
     THIS file is the reusable template shape (columns = 7 C63 axes + Overall, one row per
     tackled city, every cell `not-assessed` until the scorecard function computes it).
     Copy / adapt; replace <PLACEHOLDER>s; delete this comment. See NAMING-CONVENTION.md. -->
# Master RATE tracker — global city-completion matrix (template)

> **Authority**: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (7-axis scorecard) +
> [ADR-0281](../../../02-decisions/adrs/ADR-0281-city-completion-scorecard-and-dossier-standard.md). Naming:
> [`NAMING-CONVENTION.md`](./NAMING-CONVENTION.md). Live instance: `master-execution-tracker.md §CITY-COMPLETION`.
>
> ⚠ **§CONTEXT-DATA-HONESTY (C63 §1.1/§1.2).** Every axis cell is a **scorecard-function output — NEVER
> hand-typed**. Until the function computes a city, its cells stay **`not-assessed`** (`pending-implementation`),
> and **`not-assessed ≠ 0 %`**. A hand-typed or borrowed number is the fabrication this tracker exists to prevent.

## Weighting (RATIFIED — founder, 2026-07-30, C63 §4)

`CITY_COMPLETION_WEIGHTS` = **LEGISLATION 25 · ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 ·
TERRAIN 10 · CONTEXT 5** (Σ 100). `Overall = Σ(axis×weight)` renormalised over the **assessed** subset
(C63 §1.5); any `not-assessed` axis flags the overall `partial:true`. Stored as config, never hard-coded.
(Open founder decision: whether `derived-levels` earns partial HEIGHTS/LOD credit — C63 §3 Axis 6.)

## The matrix (7 axes + overall)

Axes: **PAR**=Parcel · **LEG**=Legislation · **SRC**=Data-sources · **ENV**=Envelope · **TER**=Terrain ·
**HGT**=Heights/LOD · **CTX**=Context. Each cell → the city's composite master [`RATE.md`](#); `not-assessed`
until computed. A city with a bake row / registry predicate / rule pack / scaffolded folder is "tackled"
(C63 §1.7) and MUST appear.

| City (`code`) | PAR | LEG | SRC | ENV | TER | HGT | CTX | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| <PLACE> (`<code>`) | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | **`not-assessed`** | [`<cc>-<subdiv>/<code>-<slug>`](#) |

## Honesty ledger

One line per city: what it DOES vs REFUSES vs LEAVES-UNKNOWN, plus `honestyOk` (C63 §3.1). A city may be
low-completion and 100 % honest (all cited refusals). Launch-blocking is `honestyOk`, not a completion %.

- <PLACE>: `<does … / refuses … / unknown …>` · `honestyOk: true`.

## How a cell gets filled (C63 §8 sequencing)

1. **Cheap first computes** — DATA-SOURCES (`heightSources.mjs` `impl` + `registry.ts` + `bake.mjs REGIONS`),
   TERRAIN (`layer.json` + `terrain.verify.mjs`), CONTEXT (9-layer PMTiles probe): state already inspectable.
2. **PARCEL + HEIGHTS/LOD** — one sampling run each (`computeParcelConfidence`; `heightProvenance` histogram).
3. **LEGISLATION + ENVELOPE** — per-clau `SOURCES.md` audit + the L-449 `VERIFICATION.md` gate + C58 coverage.

Each computed cell is written into that city's `RATE.md` (composite master) + the country `COUNTRY-RATE.md`
roll-up + this global matrix, **each citing the state it read** (honest ahead of the automated function).

---
*Template. Last updated: 2026-07-30. Authority: C63 + ADR-0281. Convention: NAMING-CONVENTION.md.*
