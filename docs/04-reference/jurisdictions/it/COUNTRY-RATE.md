<!-- COUNTRY-RATE.md — Italy composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Italy (it) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all other axes `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~9–11 %` — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file). Every numeric PRG/PGT parameter requires the NTA PDF;
Italy's cadastre (Agenzia delle Entrate INSPIRE WFS) is verified-live but building-rule structure is
PDF-locked. See [`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(nw)` = the national Agenzia Entrate Catasto WFS is verified-LIVE but **not wired** into
`parcelProviders/registry.ts`, so the DATA-SOURCES cadastre slot scores `documented` (0.5), not `live`,
and PARCEL stays not-assessed. `(ns)` = HEIGHTS structural **no-source** (only ARPA Piemonte/Turin has a
real building-height layer). **Overall** is renormalised over the ASSESSED subset only (`partial`).

## §A — Per-city completion matrix (2 bake-covered this pass — Rome, Milan)

Cheap axes cited-derived (see each city's `RATE.md` for the full derivation); PARCEL/LEGISLATION/ENVELOPE/
HEIGHTS are the human-gated / no-source axes, honestly `not-assessed` until sourced.

| City (`ISTAT`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Lazio (it-laz)_ | | | | | | | | | |
| Roma (`058091`) | `—`(nw) | `—` | **50%** | `—` | **50%** | `—`(ns) | **56%** | **51%** `partial` | [dossier](./it-laz/058091-rome/RATE.md) |
| _Lombardia (it-lom)_ | | | | | | | | | |
| Milano (`015146`) | `—`(nw) | `—` | **50%** | `—` | **50%** | `—`(ns) | **56%** | **51%** `partial` | [dossier](./it-lom/015146-milan/RATE.md) |

**Scaffolded totals (this pass):** 2 bake-covered city composites (Rome, Milan) — both **51 %** on the
assessed subset (DATA-SOURCES + TERRAIN + CONTEXT). DATA-SOURCES (50 %) is lifted above Portugal's by the
**TINITALY national terrain DEM** (live, keyless — covers both) and the verified-live (but unwired) Catasto
WFS; it is held back by the building-height **no-source** for Lazio/Lombardy. TERRAIN is rung-50
(baked-but-unverified) for both, versus Portugal where the DEM is outright blocked.

## §B — Pre-existing / tackled but NOT bake-covered this pass (logged, never silently truncated)

- **Torino / Turin (`001272`, it-pie)** — has a legacy research dossier (`it/it-pie/001272-turin/`) and is
  the ONE Italian city with a **real building-height source** (`heightSources.mjs` `piedmont_it` = ARPA
  Piemonte Edifici 3D, LoD1-real-height). BUT Turin is **NOT in a context bake bbox** (`bake.mjs` REGIONS has
  only `rome` + `milan` for Italy; Turin ~45.07 N, 7.69 E lies outside the `milan` clip `9.10,45.40,9.28,45.55`)
  and has **no `terrain.mjs` city row**. It is "tackled" per C63 §1.7 (scaffolded folder) but out of THIS
  pass's bake-covered scope — a future pass that adds a `turin` bake + terrain row should scaffold its
  composite (its HEIGHTS axis would then be measurable, unlike Rome/Milan). Its legacy `RATE.md` (~12 %
  contingent) is the pre-L-649 legislation number, not yet migrated.
- **National composite-RATE migration:** the national `it/RATE.md` → `it/LEGISLATION-RATE.md` (legacy
  structured-fill ~9–11 %) is DONE (L-649: banner + inbound links repointed). The two CITY legacy `RATE.md` files
  (Rome, Milan) WERE migrated to `LEGISLATION-RATE.md` this
  pass.

## §C — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing. One shared shape:

- **Roma + Milano** — DOES: baked OSM context (5/9 layers) + TINITALY national terrain (rung-50 unverified)
  + points at a verified-live national Catasto WFS. REFUSES: an envelope (no rule pack), a parcel (Catasto
  not wired, no sample), a measured height (Lazio/Lombardy no-source) — never a borrowed/invented number.
  UNKNOWN (typed): PARCEL `not-queried`, LEGISLATION + ENVELOPE `pending-implementation`, HEIGHTS
  `not-queried`. `honestyOk: true`.
  - Rome additionally: the direct/indirect-intervention classifier + the contested *Carta per la Qualità*
    precedence are unresolved. Milan additionally: TUC/perequation is parcel-and-ledger, not zone-and-table,
    so a conventional pack cannot represent it (per each city's `ENVELOPE.md`).

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~9–11 %) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. ISTAT codes from
the existing dossier folders; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` +
`packages/site-parcel-data/src/{parcelProviders,rulepacks}/registry.ts`.*
