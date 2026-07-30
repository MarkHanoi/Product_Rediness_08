<!-- COUNTRY-LEVEL COMPLETION ROLL-UP TEMPLATE (C63 §5). Copy to
     jurisdictions/<cc>/COUNTRY-COMPLETION.md, replace <PLACEHOLDER>s, delete this
     comment. This is the per-country face of the same 7-axis scorecard: one row per
     tackled city in the country, columns = the 7 axes + overall. Same honesty rule:
     every cell is COMPUTED, never hand-typed; unknown = `not-assessed` (C63 §1.1/§1.2). -->
# <COUNTRY> (<cc>) — city-completion roll-up

**National structured-fill (`RATE.md`):** `<NN>% | NOT YET ASSESSED`. See [`README.md`](./README.md) for
the national data layer (what is solved / achievable / absent) and [`RATE.md`](./RATE.md) for the number.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` (C63 §4, FOUNDER DECISION). Every cell is a scorecard-function
> output; `not-assessed` where unmeasured — NEVER a hand-typed or borrowed number.

## Per-city completion matrix

| City (`code`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| <PLACE> (`<code>`) | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | `not-assessed` | [dossier](./<cc>-<subdiv>/<code>-<slug>/COMPLETION.md) |

<!-- Add one row per tackled city. A city with a bake row / registry predicate / rule pack / scaffolded
     folder is "tackled" (C63 §1.7) and MUST appear. Fill a cell only from the scorecard function. -->

## Honesty ledger
For each city, one line: what it DOES vs REFUSES vs LEAVES-UNKNOWN, and `honestyOk` (C63 §3.1). A city may
be low-completion and 100 % honest (all cited refusals).

- <PLACE>: `<does … / refuses … / unknown …>` · `honestyOk: true`.

---
*Last updated: <YYYY-MM-DD>. Maintainer: <UNASSIGNED>.*
