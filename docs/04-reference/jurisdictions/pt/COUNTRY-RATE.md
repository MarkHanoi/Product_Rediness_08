<!-- COUNTRY-RATE.md — Portugal composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Portugal (pt) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · CONTEXT) cited-derived
     per C63 §8.1; TERRAIN blocked (no open PT DTM); all other axes `not-assessed` with a typed C62 reason.
     No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~0 %` — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file). Portugal's numeric planning values (índice, altura da
edificação / cércea, afastamentos) live in PDM/PDMP **PDFs**; no structured machine-readable equivalent
exists, and the Lisboa/Porto cadastral regime for the urban cores is unconfirmed. See [`README.md`](./README.md)
+ [`PORTUGAL-CONTEXT-DEEP-DIVE.md`](./PORTUGAL-CONTEXT-DEEP-DIVE.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(blk)` = TERRAIN `license-restriction` (the `pt` DEM source is `blocked` — no open national
bare-earth DTM published by DGT). `(cap)` = HEIGHTS measured-**capable** (`dgt_pt` national LiDAR nDSM,
impl:`documented`) but **unbaked** → still not-assessed. **Overall** is renormalised over the ASSESSED
subset only (`partial`).

## §A — Per-city completion matrix (2 bake-covered this pass — Lisbon, Porto)

Cheap axes cited-derived (see each city's `RATE.md` for the full derivation); PARCEL/LEGISLATION/ENVELOPE/
TERRAIN/HEIGHTS are the human-gated or blocked axes, honestly `not-assessed` until sourced/unblocked.

| City (`DICOFRE`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Lisboa (pt-11)_ | | | | | | | | | |
| Lisboa (`1106`) | `—` | `—` | **30%** | `—` | `—`(blk) | `—`(cap) | **56%** | **36%** `partial` | [dossier](./pt-11/1106-lisboa/RATE.md) |
| _Porto (pt-13)_ | | | | | | | | | |
| Porto (`1315`) | `—` | `—` | **30%** | `—` | `—`(blk) | `—`(cap) | **56%** | **36%** `partial` | [dossier](./pt-13/1315-porto/RATE.md) |

**Scaffolded totals (this pass):** 2 bake-covered city composites (Lisbon, Porto) — both **36 %** on the
assessed subset (DATA-SOURCES + CONTEXT only). DATA-SOURCES is capped low (30 %) because **no PT cadastre
is wired** (national Carta Cadastral misses the Lisbon/Porto urban cores) and the **national terrain DEM is
blocked**; only the OSM context bake (`live`) and the documented `dgt_pt` height source lift it. TERRAIN is
the one axis that is affirmatively blocked rather than merely un-run (no open DGT bare-earth DTM).

## §B — Pre-existing / tackled but NOT bake-covered this pass (logged, never silently truncated)

- **Braga (`0303`, pt-03)** — has a legacy research dossier (`pt/pt-03/0303-braga/`, DICOFRE 0303) but is
  **NOT in a context bake bbox** (`bake.mjs` REGIONS has only `lisbon` + `porto` for Portugal; Braga
  ~41.55 N, −8.42 W lies outside the `porto` clip `-8.70,41.12,-8.55,41.20`). It is "tackled" per C63 §1.7
  (scaffolded folder) but out of THIS pass's bake-covered scope; its legacy `RATE.md` is the pre-L-649
  legislation number, not yet migrated to a composite. Scaffold on demand once a Braga bake row exists.
- **National composite-RATE migration:** the national `pt/RATE.md` → `pt/LEGISLATION-RATE.md` (legacy
  structured-fill ~0 %) is DONE (L-649: banner + inbound links repointed).
  The two CITY legacy `RATE.md` files (Lisboa, Porto) WERE migrated to `LEGISLATION-RATE.md` this pass.

## §C — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing. One shared shape:

- **Lisboa + Porto** — DOES: baked OSM context (5/9 layers) + a documented (unbaked) national LiDAR height
  source (`dgt_pt`). REFUSES: an envelope (no rule pack), a parcel (no PT provider wired + Carta Cadastral
  misses the cores), and terrain (national DTM `blocked`) — never a borrowed/invented number. UNKNOWN
  (typed): PARCEL `not-queried`, LEGISLATION + ENVELOPE `pending-implementation`, TERRAIN `license-restriction`,
  HEIGHTS `not-queried`. `honestyOk: true`.
  - Porto additionally: its *moda da cércea* height rule needs a C58 `fabricDerivedHeight` kind; Lisboa
    additionally: *créditos de construção* need a C58 `transferableRights` overlay — both block a complete
    pack even after OCR (per each city's `ENVELOPE.md`).

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~0 %) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer | all |
| [`PORTUGAL-CONTEXT-DEEP-DIVE.md`](./PORTUGAL-CONTEXT-DEEP-DIVE.md) | national context/data recon | DATA-SOURCES |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. DICOFRE codes
from the existing dossier folders; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` +
`packages/site-parcel-data/src/{parcelProviders,rulepacks}/registry.ts`.*
