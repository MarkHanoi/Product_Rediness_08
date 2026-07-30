<!-- ─────────────────────────────────────────────────────────────────────────────
CITY-COMPLETION SCORECARD TEMPLATE (C63). Copy this whole `_CITY/` folder into a
municipality dossier and replace every <PLACEHOLDER>. Delete these comments.

⚠ THE ONE RULE (C63 §1.1): every axis % is COMPUTED by the scorecard function from
inspectable state — NEVER hand-typed. Until the function has run for this city,
EVERY cell stays `not-assessed` + a typed C62 UnknownReason. `not-assessed ≠ 0 %`
(§1.2). A number you type by hand is the §CONTEXT-DATA-HONESTY violation this whole
scorecard exists to prevent.

The 7 axes + their definitions + inputs are FIXED and identical in every city —
see C63 §3. Do NOT redefine, add, or drop an axis.
────────────────────────────────────────────────────────────────────────────── -->
# City Completion Scorecard — <PLACE> (<cc>-<subdiv>, <code>)

<!-- generated-by: MANUAL SCAFFOLD (scorecard function not yet run) — replace with
     `<!-- generated-by: scorecard vN <ISO-timestamp> -->` when computed (C63 §6). -->

**Overall completion: `not-assessed`** (`pending-implementation` — scorecard function not yet run for
this city). `partial: true`. **`honestyOk: true`** (renders no fabricated value; all unknowns are typed).

> **Weighting vector:** `CITY_COMPLETION_WEIGHTS` default (C63 §4 — a FOUNDER DECISION, DRAFT).
> Overall = Σ(axis×weight) renormalised over the ASSESSED subset (C63 §1.5). With zero axes assessed,
> overall is honestly `not-assessed`, not 0 %.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** — cadastre geometry quality | 15 % | `not-assessed` | `not-checked` | `not-queried` | run `computeParcelConfidence` over an N-parcel sample (C57 §2.4). |
| 2 | **LEGISLATION** — ordinance sourcing depth + VERIFY | 25 % | `not-assessed` | `not-checked` | `not-queried` | cited `SOURCES.md` rows ∩ signed `VERIFICATION.md` ÷ MUC clau inventory. |
| 3 | **DATA-SOURCES** — authoritative feeds wired | 15 % | `not-assessed` | `not-checked` | `not-queried` | `heightSources.mjs impl` + parcel `registry.ts` + zone-GIS + `bake.mjs REGIONS` + terrain DEM. |
| 4 | **ENVELOPE** — buildable-envelope solver coverage | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | `registry.ts packsByZone` × buildable-land share. |
| 5 | **TERRAIN** — baked quantized-mesh present + verified | 10 % | `not-assessed` | `not-checked` | `not-queried` | `terrain/<city>/layer.json` 200 + `terrain.verify.mjs` + white-mask flags. |
| 6 | **HEIGHTS/LOD** — measured vs estimated buildings | 10 % | `not-assessed` | `not-checked` | `not-queried` | baked PMTiles `heightProvenance` histogram at city bbox (`tagged` fraction). |
| 7 | **CONTEXT** — feature-layer checklist (of 9) | 5 % | `not-assessed` | `not-checked` | `not-queried` | probe `{buildings,roads,water,parks,landuse,rail,trees,pedestrian,sea}` at bbox. |

<!-- When an axis IS computed, replace `not-assessed` with the 0–100 % the function emitted, set the
     validation state (C63 §1.6 — `human-reviewed` for legislation/envelope needs a signed
     VERIFICATION.md), drop the unknown reason, and fill the derivation with the actual N / registry
     rows / probe result. The number must match the scorecard function output, byte for byte. -->

## §CONTEXT-DATA-HONESTY note (mandatory)

Completion (how much is done) and honesty (do we fabricate) are two different questions (C63 §3.1). This
city may score LOW on completion and remain 100 % honest — e.g. every buildable clau returns a **cited
refusal**. `honestyOk` flips `false` ONLY if a value is rendered where the state says unknown. State
here, in one line, what this city currently DOES vs REFUSES vs LEAVES-UNKNOWN: `<…>`.

## What moves each axis (link, do not restate)

- PARCEL → `NEXT.md` §parcel · LEGISLATION → `RATE.md` + `RATE-IMPLEMENTATION-PLAN.md` + `sources/`
- DATA-SOURCES → `../../GEO-DATA-SOURCING-MASTER.md` · ENVELOPE → `ENVELOPE.md`
- TERRAIN → `../../../CONTEXT-DATA-TERRAIN.md` · HEIGHTS/LOD → `HEIGHT.md` + `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md`
- CONTEXT → `../../../CITY-REPLICATION-STANDARD.md` §3

<!-- Link-depth key (this file = docs/04-reference/jurisdictions/_TEMPLATE/_CITY/COMPLETION.md):
     ../../ = jurisdictions/ · ../../../ = 04-reference/ · ../../../../ = docs/ -->

---
*Last updated: <YYYY-MM-DD>. Maintainer: <UNASSIGNED>. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) + [SPEC-CITY-COMPLETION-SCORECARD](../../../../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md).*
