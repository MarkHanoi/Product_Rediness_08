# City RATE — master completion scorecard — Turin (it-pie, 001272)

<!-- generated-by: MANUAL C63 dossier normalization 2026-07-30 (L-649/L-650 Phase-0) — RESEARCH-ONLY
     city, NOT bake-covered. The scorecard function has NOT run and its cheap axes (DATA-SOURCES ·
     TERRAIN · CONTEXT) are NOT computable here (no bake REGION, no terrain row). EVERY axis is
     `not-assessed` with a typed C62 reason. NO cell is a fabricated number (§CONTEXT-DATA-HONESTY). -->

**Overall completion: `not-assessed`** — this is a **research-only dossier, NOT bake-covered** (C63 §1.7):
no `bake.mjs` REGION, no `terrain.mjs` row, no wired city height `REGION_SOURCE` key, no rule pack → the
cheap axes (DATA-SOURCES · TERRAIN · CONTEXT) are **not computable**, and no scorecard has run.
`partial: true`. **`honestyOk: true`** (renders no fabricated value; every axis is a typed `not-assessed`).
Logged in the country roll-up [`COUNTRY-RATE.md`](../../COUNTRY-RATE.md) **§B** (Turin is the one Italian
city with a real building-height source but is out of the bake-covered scope this pass). The legislation
detail (the legacy ~12 % contingent prior) lives in [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and
FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). With zero axes assessed,
> overall is honestly `not-assessed`, not 0 % (C63 §1.2/§1.5).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | No Italian cadastre is wired (`parcelProviders/registry.ts` has no `isInItaly`) → universal footprint-fallback. The Agenzia delle Entrate INSPIRE WFS was verified-live for Turin (ISTAT L219; see `LEGISLATION-RATE.md`) but is not wired, and no `computeParcelConfidence` sample was drawn (C57 §2.4). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Legacy structured-fill prior only — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (~12 % **contingent** on the unconfirmed PRG NTA zone-letter mechanism; PRG in active 2026 rewrite). No rule pack (`rulepacks/registry.ts` is ES/DK/NL/SA-only), no signed `sources/VERIFICATION.md`, no clau-inventory scorecard run. |
| 3 | **DATA-SOURCES** | 15 % | `not-assessed` | `not-checked` | `outside-coverage` | Not bake-covered: no `bake.mjs` REGION (only `rome` + `milan` for Italy), no `terrain.mjs` row for Turin, no wired city height `REGION_SOURCE` key. The 5-slot checklist is not computable. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered (`rulepacks/registry.ts`); solver coverage unmeasured (C58). |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `outside-coverage` | No `terrain.mjs` TERRAIN_CITY row for Turin → no baked quantized-mesh to verify. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `not-queried` | Turin is the ONE Italian city with a documented real building-height source — `heightSources.mjs` source catalogue `piedmont_it` = ARPA Piemonte Edifici 3D (Turin-only, LoD1-real-height, impl `documented`) — but it is NOT wired to a `REGION_SOURCE` key (no `turin` entry), so no provenance histogram has been probed. A future bake would make this axis measurable (unlike Rome/Milan, which are structural no-source). |
| 7 | **CONTEXT** | 5 % | `not-assessed` | `not-checked` | `outside-coverage` | Not inside any `bake.mjs` REGION bbox (Turin ~45.07 N, 7.69 E lies outside the `milan` clip) → no baked context layers to probe. |

## §CONTEXT-DATA-HONESTY note

Research-only, not bake-covered. DOES: nothing rendered in 3D Site (no bake/terrain). REFUSES: an envelope
(no rule pack), a measured height (ARPA Piemonte documented but unwired), any scorecard number it cannot
compute. UNKNOWN (typed): all 7 axes `not-assessed` — `outside-coverage` for the three cheap axes,
`not-queried`/`pending-implementation` for the rest. No fabricated value anywhere. `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard — research-only stub (no scorecard computed) | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (was legacy `RATE.md`; renamed L-649) | LEGISLATION |
| [`README.md`](./README.md) | what governs here · instrument chain · open questions | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | LEGISLATION (+ all) |
| `sources/` | per-field citations + human sign-off (L-449 gate) | LEGISLATION |

> **Not scaffolded (research-only):** `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` are the TACKLED-city
> standard files (C63 §5); Turin is not bake-covered, so they are deliberately omitted rather than shipped
> as empty placeholders. A future pass that adds a `bake.mjs` REGION + `terrain.mjs` row + the ARPA
> Piemonte height wiring for Turin should scaffold them from `_TEMPLATE/_CITY/` (see `COUNTRY-RATE.md` §B).

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Research-only dossier normalized to C63 naming under audit L-649/L-650 (Phase-0).*
