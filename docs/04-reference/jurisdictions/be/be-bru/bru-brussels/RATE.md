# City RATE — master completion scorecard — Brussels-Capital Region (be-bru, bru · NIS 21000)

<!-- generated-by: MANUAL C63 dossier normalization 2026-07-30 (L-649/L-650 Phase-0) — RESEARCH-ONLY
     region-level legacy dossier, NOT itself bake-covered. The scorecard function has NOT run. EVERY axis
     is `not-assessed` with a typed C62 reason. NO cell is a fabricated number (§CONTEXT-DATA-HONESTY). -->

**Overall completion: `not-assessed`** — this is the **pre-C63 legacy region dossier** for Brussels-Capital
(`bru-brussels`, NIS 21000), a **research-only** scaffold ("research complete; no pack implemented"). It is
**NOT itself bake-covered**: the `bake.mjs` `brussels` REGION + `terrain.mjs` row + `heightSources.mjs`
`brussels` key describe the **City-of-Brussels municipality**, whose C63-standard dossier is the sibling
[`21004-brussels`](../21004-brussels/RATE.md) (scored there, ~44 % on the assessed subset — do not
double-count here). `partial: true`. **`honestyOk: true`** (renders no fabricated value; every axis is a
typed `not-assessed`). Logged in the country roll-up [`COUNTRY-RATE.md`](../../COUNTRY-RATE.md) **§C**
(legacy folder; its move/merge into `21004-brussels` is orchestrator-owned Phase-0, C63 §8.2). The
legislation detail (the legacy ~5–10 % RRU Titre I structured-fill prior) lives in
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and FEEDS Axis 2.

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). With zero axes assessed,
> overall is honestly `not-assessed`, not 0 % (C63 §1.2/§1.5).

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | No Belgian cadastre provider is wired (`parcelProviders/registry.ts` has no BE entry) → universal footprint-fallback. Unsampled (C57 §2.4). |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | Legacy structured-fill prior only — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (RRU Titre I `H = P + 3.00 + D` formula, needs a new engine KIND; PRAS/RRU/RRUZ/PPAS precedence unresolved). No rule pack (`rulepacks/registry.ts` is ES/DK/NL/SA-only), no signed `sources/VERIFICATION.md`, no clau-inventory scorecard run. |
| 3 | **DATA-SOURCES** | 15 % | `not-assessed` | `not-checked` | `outside-coverage` | This region dossier is not itself the bake-covered entity — the `bake.mjs` `brussels` REGION, `terrain.mjs` `brussels` row (verdict `blocked`), and `heightSources.mjs` `brussels` key (`grb_be`, `blocked`) are scored on the municipality dossier `21004-brussels` (§A). Not re-derived here to avoid double-counting. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered (`rulepacks/registry.ts`); RRU Titre I is a formula-in-PDF, not a zone-table (C58). |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `outside-coverage` | `terrain.mjs` `be` verdict is `blocked` (Brussels-Capital DTM route/licence unsourced); scored on `21004-brussels`. |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `adapter-limitation` | `heightSources.mjs` `brussels` = `grb_be` status `blocked` (UrbIS height unprobed; GRB LiDAR height is Flanders-only). No provenance histogram probed. |
| 7 | **CONTEXT** | 5 % | `not-assessed` | `not-checked` | `outside-coverage` | The `brussels` context bake is scored on `21004-brussels`; not re-derived here. |

## §CONTEXT-DATA-HONESTY note

Research-only region dossier, not itself bake-covered. DOES: nothing rendered in 3D Site from THIS folder
(the municipality dossier `21004-brussels` carries the baked context). REFUSES: an envelope (no rule pack;
RRU formula needs a new engine KIND), a real parcel (no BE cadastre wired), a measured height (UrbIS
unprobed / GRB Flanders-only), any scorecard number it cannot compute. UNKNOWN (typed): all 7 axes
`not-assessed`. No fabricated value anywhere. `honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard — research-only stub (no scorecard computed) | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (was legacy `RATE.md`; renamed L-649) | LEGISLATION |
| [`README.md`](./README.md) | what governs here · instrument-precedence chain · open questions | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | LEGISLATION (+ all) |
| `sources/` | per-field citations + human sign-off (L-449 gate) | LEGISLATION |

> **Not scaffolded (research-only):** `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` are the TACKLED-city
> standard files (C63 §5); this legacy region dossier is not itself bake-covered, so they are deliberately
> omitted. The C63-standard Brussels dossier is the municipality sibling
> [`21004-brussels`](../21004-brussels/); the move/merge of this legacy `bru-brussels` folder into it is
> **orchestrator-owned Phase-0** (C63 §8.2 — no folder `git mv` by a scoped agent), logged in
> `COUNTRY-RATE.md` §C.

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Research-only legacy region dossier normalized to C63 naming under audit L-649/L-650 (Phase-0).*
