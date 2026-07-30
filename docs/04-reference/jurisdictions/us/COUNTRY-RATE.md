<!-- COUNTRY-RATE.md — USA composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it with
     this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run replaces the
     manual cells (C63 §1.1/§8.1). -->
# United States (us) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill number
is **`~12 % (free sources)` / `~55 % (with commercial APIs)`** — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (the pre-existing
national legislation file; renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file).
See [`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — **RATIFIED (founder, 2026-07-30)**: LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is a cited-derived
> scorecard output or `not-assessed`; NEVER a hand-typed or borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (Overture height + USGS 3DEP nDSM documented) but unwired/
unbaked → still not-assessed. **Overall** renormalised over the ASSESSED subset only (`partial`). DATA-SOURCES
reads **50 %** (below France's 80 % / Spanish-mainland 70 %) because the US has **no keyless national cadastre**
wired (county parcels are fragmented across ~3,143 counties; `registry.ts` has no US entry → footprint-fallback)
and **no national numeric zoning-GIS** (~33,000 independent ordinances) — only terrain + context are `live`,
heights `documented`.

## §0 — Subdivision + code scheme (documented)

US uses **FIPS place codes** for `<code>` (the C57/NAMING-CONVENTION §3 join key — 7-digit `<state-FIPS><place-FIPS>`)
and the **ISO 3166-2:US state** for the `<cc>-<subdiv>` folder level (this reuses the pre-existing `us/` layout,
`us/README.md §5`):

| Subdiv folder | ISO 3166-2:US state | Tackled cities (FIPS place) |
|---|---|---|
| `us-ny` | New York | New York City (`3651000`) — **bake-covered** |
| `us-ca` | California | San Francisco (`0667000`) — **bake-covered** · Los Angeles (`0644000`) — research-only |
| `us-il` | Illinois | Chicago (`1714000`) — research-only |

## §A — Per-city completion matrix (2 SCAFFOLDED this pass — the bake-covered cities)

The bake-covered US cities are **New York City** and **San Francisco** — the only two US rows in `bake.mjs`
REGIONS (`newyork` = New York state extract, bbox `-74.03,40.70,-73.91,40.82`; `sanfrancisco` = California
extract, bbox `-122.52,37.70,-122.36,37.83`) AND `terrain.mjs` TERRAIN_CITY (both `source:'us'` = USGS 3DEP 1 m
DEM). Cheap axes cited-derived (see each city's `RATE.md`); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the
human-gated axes, honestly `not-assessed` until sourced.

| City (`FIPS`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _New York (us-ny)_ | | | | | | | | | |
| New York City (`3651000`) | `—` | `—` | **50%** | `—` | **50%** | `—`(cap) | **67%** | **53%** `partial` | [dossier](./us-ny/3651000-new-york-city/RATE.md) |
| _California (us-ca)_ | | | | | | | | | |
| San Francisco (`0667000`) | `—` | `—` | **50%** | `—` | **50%** | `—`(cap) | **67%** | **53%** `partial` | [dossier](./us-ca/0667000-san-francisco/RATE.md) |

**Scaffolded totals (this pass):** 2 dossiers (New York City, San Francisco), both **53 %** overall on the
assessed subset (DATA-SOURCES 50 · TERRAIN 50 · CONTEXT 67 — both are coastal, so the `sea` layer is present via
the baked `natural=coastline` ways → 6/9). Both carry measured-**capable** HEIGHTS via Overture height + USGS
3DEP nDSM `(cap)`, unwired/unbaked. NYC migrated its legacy `RATE.md` (legislation) → `LEGISLATION-RATE.md` this
pass and gained a composite `RATE.md` + `ENVELOPE.md` + `HEIGHT.md` + `RISK-REGISTER.md`; San Francisco was fully
scaffolded this pass (baked but previously unscaffolded — per governance).

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

| City (`FIPS`) | Kind | Dossier | Note |
|---|---|---|---|
| Los Angeles (`0644000`, us-ca) | research-only, **NOT bake-covered** | [dossier](./us-ca/0644000-los-angeles/) | Legacy legislation dossier. NO `bake.mjs` REGIONS row and NO `terrain.mjs` row → TERRAIN + CONTEXT would be `not-assessed`/`outside-coverage`; DATA-SOURCES lower. Out of this pass's bake-covered scope. Cells = `see dossier`. |
| Chicago (`1714000`, us-il) | research-only, **NOT bake-covered** | [dossier](./us-il/1714000-chicago/) | Legacy legislation dossier (strong open-data city). No bake/terrain row → cheap axes not computable. Cells = `see dossier`. |

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Los Angeles + Chicago (§B)** — to enter §A each needs a `bake.mjs` REGIONS row (California / Illinois extract)
  + a `terrain.mjs` row (`source:'us'`) so its cheap axes become computable, then the full 7-file scaffold + the
  legacy `RATE.md`→`LEGISLATION-RATE.md` migration. Logged here, not hidden.
- **Legislation-rename migration** for the country-level `us/RATE.md` → `us/LEGISLATION-RATE.md` (legacy
  national ~12 % free / ~55 % commercial) — DONE (L-649: banner + inbound links repointed). NYC was migrated this pass
  because it was a worked bake-covered city.
- **Other US municipalities** (~33,000 zoning authorities) are TACKLED for legislation only at the national/
  commercial level; they inherit the identical cheap-axis derivation once bake-covered. Scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing.

- **New York City + San Francisco** — DOES: terrain (USGS 3DEP 1 m DEM, public domain, rung-50 unverified) +
  baked OSM context 6/9 (coastal → sea present). REFUSES: a parcel cadastre (no keyless US cadastre →
  footprint-fallback; NYC MapPLUTO / SF county assessor exist but are NOT wired into `parcelProviders/registry.ts`)
  + an envelope (no rule pack; per-municipality zoning not packed) — never a borrowed/invented number. UNKNOWN
  (typed): PARCEL quality `not-queried`, LEGISLATION/ENVELOPE `pending-implementation`, HEIGHTS `not-queried`
  (measured-capable via Overture + 3DEP nDSM, unwired). `honestyOk: true`.
- **NYC-specific** — MapPLUTO's `MaxAllwFAR`/`ResidFAR` is an unusually rich free FAR source (858,602 parcels,
  99.5 % FAR fill per the national probe) but it is NOT wired as a zone-GIS/parcel provider, so it does not lift
  the DATA-SOURCES or LEGISLATION axes today; Special Purpose Districts + air-rights make even MapPLUTO's FAR
  non-final per parcel.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~12 % free / ~55 % commercial) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — fragmentation, commercial ceiling, institutional-graph model | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. FIPS codes +
subdivision scheme in §0 (reuses `us/README.md §5`); axis state from
`tools/context-bake/{bake,terrain,heightSources}.mjs` + `packages/site-parcel-data/src/parcelProviders/registry.ts`
(no US entry → footprint-fallback).*
