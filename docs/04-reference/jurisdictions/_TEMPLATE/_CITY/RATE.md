<!-- ─────────────────────────────────────────────────────────────────────────────
CITY `RATE.md` — THE MASTER COMPLETION SCORECARD (C63). This is the composite
"how complete is this city" face — the founder's "master RATE" (L-649). It is the
7-axis C63 scorecard; the per-axis `LEGISLATION-RATE.md` / `LOD-RATE.md` FEED it.
Naming rule: `RATE.md` is ALWAYS the composite master; `<AXIS>-RATE.md` is a
per-axis detail rate. See `../NAMING-CONVENTION.md`.

Copy this whole `_CITY/` folder into a municipality dossier and replace every
<PLACEHOLDER>. Delete these comments.

⚠ THE ONE RULE (C63 §1.1): every axis % is COMPUTED by the scorecard function from
inspectable state — NEVER hand-typed. Until the function has run for this city,
EVERY cell stays `not-assessed` + a typed C62 UnknownReason. `not-assessed ≠ 0 %`
(§1.2). A number you type by hand is the §CONTEXT-DATA-HONESTY violation this whole
scorecard exists to prevent.

The 7 axes + their definitions + inputs are FIXED and identical in every city —
see C63 §3. Do NOT redefine, add, or drop an axis.
────────────────────────────────────────────────────────────────────────────── -->
# City RATE — master completion scorecard — <PLACE> (<cc>-<subdiv>, <code>)

<!-- generated-by: MANUAL SCAFFOLD (scorecard function not yet run) — replace with
     `<!-- generated-by: scorecard vN <ISO-timestamp> -->` when computed (C63 §6). -->

**Overall completion: `not-assessed`** (`pending-implementation` — scorecard function not yet run for
this city). `partial: true`. **`honestyOk: true`** (renders no fabricated value; all unknowns are typed).

> **Weighting vector:** `CITY_COMPLETION_WEIGHTS` — **RATIFIED (founder, 2026-07-30)**: LEGISLATION 25 ·
> ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).
> Overall = Σ(axis×weight) renormalised over the ASSESSED subset (C63 §1.5). With zero axes assessed,
> overall is honestly `not-assessed`, not 0 %. (Open: whether `derived-levels` earns partial HEIGHTS/LOD
> credit — a separate founder decision, C63 §3 Axis 6.)

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

## Dossier index — what each sibling file is about (C63 §5)

This `RATE.md` is the composite master; the files below are the evidence + the per-axis detail rates that
FEED it. (Naming rule: `RATE.md` = composite master · `<AXIS>-RATE.md` = per-axis detail rate · see
`../NAMING-CONVENTION.md`.)

| File | What it is about | Feeds axis |
|---|---|---|
| **`RATE.md`** (this file) | the 7-axis composite completion scorecard — the master "how complete is this city" | — (composes all 7) |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (the C58/L-449 comparable ruler — zone+density+height without a PDF) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | building/terrain LOD sub-rate (can we obtain a faithful physical model?) | HEIGHTS/LOD |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (ADR-0279 standard) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (BUILDING-HEIGHT-REPLICATION-STANDARD) | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · TRIP-WIRES · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | fail-safe risk log (the honesty guardrails) | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | the phased plan to raise the master RATE toward 100 % | LEGISLATION (+ all) |
| `sources/` | per-field citations (`SOURCES.md`) + human sign-off (`VERIFICATION.md`, L-449 gate) | LEGISLATION · ENVELOPE |
| `findings/` | substantive L-NNN investigation records | — |

## What moves each axis (link, do not restate)

- PARCEL → `NEXT.md` §parcel · LEGISLATION → `LEGISLATION-RATE.md` + `RATE-IMPLEMENTATION-PLAN.md` + `sources/`
- DATA-SOURCES → `../../GEO-DATA-SOURCING-MASTER.md` · ENVELOPE → `ENVELOPE.md`
- TERRAIN → `../../../CONTEXT-DATA-TERRAIN.md` · HEIGHTS/LOD → `HEIGHT.md` + `LOD-RATE.md` + `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md`
- CONTEXT → `../../../CITY-REPLICATION-STANDARD.md` §3

<!-- Link-depth key (this file = docs/04-reference/jurisdictions/_TEMPLATE/_CITY/RATE.md):
     ../../ = jurisdictions/ · ../../../ = 04-reference/ · ../../../../ = docs/ -->

---
*Last updated: <YYYY-MM-DD>. Maintainer: <UNASSIGNED>. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) + [SPEC-CITY-COMPLETION-SCORECARD](../../../../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md).*
