<!-- COUNTRY-RATE.md — Germany composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Germany (de) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · CONTEXT)
     cited-derived per C63 §8.1; TERRAIN is not-assessed for both cities (no DTM wired for their Land —
     DE terrain covers NRW only); all human-gated axes `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~28 %` — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (national; renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file). See [`README.md`](./README.md) (national data layer, four-regime structure)
and [`COUNTRY-DATA-STRATEGY.md`](./COUNTRY-DATA-STRATEGY.md).

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

## §0 — Subdivision scheme (documented, C63 §1.7)

- **Country ISO 3166-1:** `DE`. **Folder:** `jurisdictions/de/`.
- **Subdivision (Land):** the 16 Bundesländer, keyed by **ISO 3166-2:DE code, lowercased** → `de-<subdiv>`
  (`de-be` Berlin · `de-by` Bayern · `de-hh` Hamburg · `de-nw` Nordrhein-Westfalen · …). This matches the
  existing folders and `de/README.md` ("Subdivision law: Länder (ISO 3166-2)").
- **City code:** the **AGS5** — the 5-digit prefix of the Amtlicher Gemeindeschlüssel / Regionalschlüssel
  (Germany's INE-equivalent municipality key). Berlin `11000`, München `09162`, Hamburg `02000`. Folder =
  `de/<de-subdiv>/<AGS5>-<slug>/` (matches `de/README.md` join-key; the full AGS is 8-digit, `<AGS5>000`).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `⚑` = **footprint-fallback** cadastre (open ALKIS is NRW-only; other Länder per-Land licence-gated).
`(T-out)` = TERRAIN `outside-coverage` — no DTM wired for that Land (DE terrain source = DGM1 **NRW only**;
Berlin/Munich explicitly BLOCKED in `terrain.mjs`). **Overall** is renormalised over the ASSESSED subset only (`partial`).

## §A — Per-city completion matrix (2 tackled = the bake-region set)

Tackled German cities = those the `bake.mjs` REGIONS cover: **Berlin** (`13.28,52.44,13.55,52.58`, `berlin-latest.osm.pbf`)
and **Munich** (`11.44,48.09,11.66,48.20`, `bayern-latest.osm.pbf`). Both bboxes are tight city-centre clips —
**no other city falls inside either** (verified against `bake.mjs` L106-107). Only DATA-SOURCES + CONTEXT are
assessed; PARCEL/LEGISLATION/ENVELOPE/TERRAIN/HEIGHTS are the human-gated axes, honestly `not-assessed`.

| City (`AGS5`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Berlin (de-be)_ | | | | | | | | | |
| Berlin (`11000`) ⚑ | `—` | `—` | **40%** | `—` | `—`(T-out) | `—` | **56%** | **44%** `partial` | [dossier](./de-be/11000-berlin/RATE.md) |
| _Bayern (de-by)_ | | | | | | | | | |
| München (`09162`) ⚑ | `—` | `—` | **20%** | `—` | `—`(T-out) | `—` | **56%** | **29%** `partial` | [dossier](./de-by/09162-munich/RATE.md) |

**Why so much lower than the Spanish capitals (~61 %):** two axes that "port free" in Spain are BLOCKED in
Germany's federal data reality. (1) **PARCEL** — Spain has one keyless national Catastro; Germany's open ALKIS is
**NRW-only**, so Berlin/Munich fall to footprint-fallback (DATA-SOURCES cadastre slot = 0). (2) **TERRAIN** — Spain
has one national PNOA MDT (every capital = rung-50); Germany is 16 per-Land DTM portals, only NRW (Köln) is wired,
so Berlin/Munich have **no terrain at all** (not the Spanish rung-50). Munich is further depressed by a
licence-blocked LoD2 and no discovered B-Plan WFS. These are honest structural gaps, not scoring choices.

## §B — Pre-existing / out-of-bake-scope dossiers (NOT bake-covered this pass — C63 §1.7)

| City (`AGS5`) | Kind | Dossier | Note |
|---|---|---|---|
| Hamburg (`02000`, de-hh) | pre-existing (older schema) | [dossier](./de-hh/02000-hamburg/) | Rich legislation research (~30 % fill) + `RATE-IMPLEMENTATION-PLAN.md`, but **NOT a `bake.mjs` REGION** (no baked context/terrain) → out of the "tackled = bake-covered" set this pass. Composite `RATE.md` migration pending (its `RATE.md` is still the legacy legislation number). |
| Köln / Cologne (NRW, de-nw) | reference (no dossier) | — | The **DE reference city**: the ONLY German city with wired terrain (`terrain.mjs koln`, DGM1 NRW), open cadastre (`alkis-nrw`, keyless Flurstück), and a **live** LoD2-DE fetcher (`fetchLod2DeNrw`). NOT a `bake.mjs` REGION (no OSM context bake) and has no dossier folder yet — a strong scaffold candidate (would score highest of any DE city on DATA-SOURCES). |

## §C — Tackled but UNSCAFFOLDED / migration debt (logged, never silently truncated — C63 SCALE clause)

- **Composite-RATE migration** — Berlin + Munich were migrated this pass (old `RATE.md` → `LEGISLATION-RATE.md`,
  new 7-axis composite `RATE.md` authored). **Hamburg (`02000`) still carries the legacy `RATE.md`** (legislation
  number, not the 7-axis composite) — migrating it mirrors the Berlin/Munich move but is deferred (Hamburg is not
  bake-covered). Owned by the governance/migration track.
- **Köln / NRW** — the strongest DE data city (open ALKIS + DGM1 terrain + live LoD2-DE) has **no bake region and no
  dossier**. Adding a `bake.mjs` `koln` REGION + a `de-nw/05315-koln` dossier would produce the highest DE completion
  and unlock the NRW reference implementation end-to-end. Scaffold on demand.
- **Other Länder capitals** (Stuttgart de-bw, Düsseldorf de-nw, Frankfurt de-he, Dresden de-sn, …) are NOT tackled —
  no bake region, no cadastre outside NRW, no dossier. They inherit the federal per-Land blockers documented above.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing.

- **Berlin (`11000`)** — DOES: baked OSM context 5/9 (`bake.mjs berlin`) + honestly-labelled OSM footprint selection.
  REFUSES: an envelope (no rule pack; Baunutzungsplan-1958/60 *funktionslos* voidance risk, OVG 2020). UNKNOWN (typed):
  PARCEL `not-queried` (footprint-fallback ⚑), LEGISLATION/ENVELOPE `pending-implementation` (~28 % unverified prior),
  TERRAIN `outside-coverage` (no Berlin/Brandenburg DTM wired), HEIGHTS `not-queried` (LoD2-DE documented-not-wired).
- **München (`09162`)** — DOES: baked OSM context 5/9 (`bake.mjs munich`) + footprint selection. REFUSES: an envelope
  (no pack; §34 fraction unknown). UNKNOWN (typed): PARCEL `not-queried` (footprint-fallback ⚑), LEGISLATION/ENVELOPE
  `pending-implementation` (~18 % prior — no WFS endpoint found), TERRAIN `outside-coverage` (no Bavaria DTM),
  HEIGHTS `license-restriction` (Bavaria LoD2 blocked, ZSHH INSPIRE-restricted).

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~28 %) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — four-regime BauGB/BauNVO structure, federal sources | all |
| [`COUNTRY-DATA-STRATEGY.md`](./COUNTRY-DATA-STRATEGY.md) | national data-sourcing strategy | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. AGS/subdivision from
`de/README.md`; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` +
`packages/site-parcel-data/src/parcelProviders/registry.ts`.*
