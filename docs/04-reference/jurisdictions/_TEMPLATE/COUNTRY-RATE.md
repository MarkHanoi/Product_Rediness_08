<!-- COUNTRY `COUNTRY-RATE.md` — THE MASTER COMPLETION ROLL-UP (C63 §5). This is the
     country-level composite master rate (the founder's "master RATE" at the country
     level, L-649): one row per tackled city in the country, columns = the 7 axes +
     overall. Named `COUNTRY-RATE.md` (not `RATE.md`) so it does not clash with a
     city-level composite `RATE.md`, while both remain "the master rate" at their level.
     The per-axis `LEGISLATION-RATE.md` / `LOD-RATE.md` FEED it. See `NAMING-CONVENTION.md`.
     Copy to jurisdictions/<cc>/COUNTRY-RATE.md, replace <PLACEHOLDER>s, delete this
     comment. Same honesty rule: every cell is COMPUTED, never hand-typed; unknown =
     `not-assessed` (C63 §1.1/§1.2). -->
# <COUNTRY> (<cc>) — Country RATE (master completion roll-up)

**National legislation/data-fill (`LEGISLATION-RATE.md`):** `<NN>% | NOT YET ASSESSED`. See
[`README.md`](./README.md) for the national data layer (what is solved / achievable / absent) and
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) for the number.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — **RATIFIED (founder, 2026-07-30)**: LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is a
> scorecard-function output; `not-assessed` where unmeasured — NEVER a hand-typed or borrowed number.

## Per-city completion matrix

| City (`code`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| <PLACE> (`<code>`) | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | [dossier](./<cc>-<subdiv>/<code>-<slug>/RATE.md) |

<!-- Add one row per tackled city. A city with a bake row / registry predicate / rule pack / scaffolded
     folder is "tackled" (C63 §1.7) and MUST appear. Fill a cell only from the scorecard function. The
     Dossier link points at the city's composite master `RATE.md`. -->

## Dossier index — the country-level files (what each is about)

`COUNTRY-RATE.md` (this file) is the country composite master; the files below sit beside it in the country
folder and FEED / support it. Each city's own dossier index lives in its `RATE.md` (C63 §5).

| File | What it is about | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this file) | the per-city 7-axis roll-up — the country composite master rate | — (rolls up all cities) |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill rate (the C58 comparable ruler) | LEGISLATION axis |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD axis |
| [`README.md`](./README.md) | the national data layer — what is solved / achievable / absent | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | the phased national climb toward the maximum rate | LEGISLATION (+ all) |
| `sources/` | national per-field citations + verification | LEGISLATION |
| `findings/` | national data-source studies + recon spikes | DATA-SOURCES |

## Honesty ledger
For each city, one line: what it DOES vs REFUSES vs LEAVES-UNKNOWN, and `honestyOk` (C63 §3.1). A city may
be low-completion and 100 % honest (all cited refusals).

- <PLACE>: `<does … / refuses … / unknown …>` · `honestyOk: true`.

---
*Last updated: <YYYY-MM-DD>. Maintainer: <UNASSIGNED>.*
