<!-- COUNTRY-RATE.md — Saudi Arabia composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled+bake-covered city, columns = the
     7 axes + overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived)
     or `not-assessed`; the national legislation number lives in RATE.md (legacy ~55 %) — do NOT confuse
     it with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Saudi Arabia (sa) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~55 %` — see [`RATE.md`](./RATE.md) (NOT YET renamed `LEGISLATION-RATE.md`; pending the L-649
migration, owned by governance). See [`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). **Overall** is renormalised over the ASSESSED subset only (`partial`).
**⚠ Saudi Arabia is nationally data-blocked** — the Balady/U-Maps cadastre is IP geo-fenced (403), and
GEOSA publishes no open national DTM. So DATA-SOURCES reads **20 %** (only context-OSM of the 5 slots is
live) and TERRAIN reads a **cited 0 %** (`terrain.mjs` SA rows are `blocked`, no tileset baked). **These
LOW scores are CORRECT, not a failure** — a footprint-fallback cadastre, a geo-fenced height source, and no
open terrain are the honest national reality (memory: *Saudi is nationally data-blocked in several respects*).

## §0 — Subdivision scheme (documented)

Saudi Arabia uses **`sa-<NN>` = ISO 3166-2:SA region codes (lowercased)** for the `<cc>-<subdiv>` folder
level. The `<code>` segment has **no INE/INSEE/DICOFRE/LAU equivalent** — Saudi publishes no open, stable
municipal code — so the dossier uses the **UN/LOCODE location code** (UNECE, international, globally unique,
citable) as `<code>`, lowercased per the playbook. This scheme is documented per-city in each `README.md`
(§municipal-code-choice) and is flagged for replacement if MOMRAH's Amana numeric code (*رمز الأمانة*) is
ever verified as an open, stable identifier.

| Subdiv folder | ISO 3166-2:SA region | Tackled cities (UN/LOCODE) |
|---|---|---|
| `sa-01` | Riyadh Region (*منطقة الرياض*) | Riyadh (`ruh`, UN/LOCODE **RUH**) |
| `sa-02` | Makkah Region (*منطقة مكة المكرمة*) | Jeddah (`jed`, UN/LOCODE **JED**) |
| `sa-04` | Eastern Province (*المنطقة الشرقية*) | Dammam (`dmm`, UN/LOCODE **DMM**) — research-only, §B |

*(Pack id = folder identity, region-less: `sa-ruh-riyadh` / `sa-jed-jeddah` — exactly as `es-08019-barcelona`
omits `es-ct`, `NAMING-CONVENTION.md` §3.)*

## §A — Per-city completion matrix (2 SCAFFOLDED this pass — the bake-covered cities)

The bake-covered Saudi cities are **Riyadh** and **Jeddah** — the only two SA rows in `bake.mjs` REGIONS
(`riyadh` bbox `46.60,24.58,46.83,24.80`; `jeddah` bbox `39.10,21.45,39.28,21.62`; BOTH `buildingsSource:
'overture'` — Saudi is an OSM building-desert, so buildings come from Overture, 5.3×/7.2× OSM density) AND
`terrain.mjs` TERRAIN_CITY (both `source:'sa'`, but **`blocked`** — no open GEOSA DTM). No secondary tackled
municipality sits inside either bbox. Cheap axes cited-derived (see each city's `RATE.md` for the full
derivation); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the human-gated + geo-fenced axes, honestly `not-assessed`.

| City (`UN/LOCODE`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Riyadh Region (sa-01)_ | | | | | | | | | |
| Riyadh (`RUH`) | `—` | `—` | **20%** | `—` | **0%** | `—` | **56%** | **19%** `partial` | [dossier](./sa-01/ruh-riyadh/RATE.md) |
| _Makkah Region (sa-02)_ | | | | | | | | | |
| Jeddah (`JED`) | `—` | `—` | **20%** | `—` | **0%** | `—` | **56%** | **19%** `partial` | [dossier](./sa-02/jed-jeddah/RATE.md) |

**Scaffolded totals (this pass):** 2 dossiers (Riyadh, Jeddah), both **19 %** overall on the assessed subset
(DATA-SOURCES 20 · TERRAIN 0 · CONTEXT 56). Both migrated their legacy `RATE.md` (legislation, ~54 %/~53 %)
→ `LEGISLATION-RATE.md` this pass and gained a composite `RATE.md` + `ENVELOPE.md` + `HEIGHT.md` +
`RISK-REGISTER.md`. Both have an authored-but-unwired national footprint pack (`saRiyadhDemo.ts`, L-606) — so
LEGISLATION/ENVELOPE are `pending-implementation`, NOT empty. The low overall is the honest national
data-block, not a coverage gap.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

| City (`UN/LOCODE`) | Kind | Dossier | Note |
|---|---|---|---|
| Dammam (`DMM`, sa-04) | scaffold, **NOT bake-covered** | [dossier](./sa-04/dmm-dammam/) | Legacy legislation dossier (`RATE.md` ~55 % = national; the cleanest of the three, no overlay). **NO `bake.mjs` REGIONS row and NO `terrain.mjs` row** → its cheap axes (DATA-SOURCES/TERRAIN/CONTEXT) are `outside-coverage`, not computable this pass. Out of the bake-covered scope. Cells = `see dossier`. |

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Dammam (`DMM`)** — to enter §A it needs a `bake.mjs` REGIONS row (GCC-states extract, bbox
  `~49.95,26.35,50.20,26.55`, likely `buildingsSource:'overture'`) + a `terrain.mjs` row so its cheap axes
  become computable, then the same 7-file scaffold + the legacy `RATE.md`→`LEGISLATION-RATE.md` migration.
  Logged here, not hidden.
- **Composite-RATE / legislation-rename migration** for Dammam (§B) and the country-level `sa/RATE.md`
  (legacy national ~55 %, not yet `LEGISLATION-RATE.md`) is owned by the governance/migration track (out of
  this pass's write-fence). Riyadh + Jeddah were migrated this pass because they are the bake-covered cities.
- **Other Saudi municipalities** — TACKLED for legislation only at the NATIONAL level (the 2024 MOMRAH
  footprint is country-wide, one formula, binding on all Amanas). They inherit the identical cheap-axis
  derivation once bake-covered; scaffold on demand. NEOM/ROSHN/Diriyah/Qiddiya development-authority zones
  are a §1 cl.3 override surface (a trust overlay, not a fill) — see the Riyadh `LEGISLATION-RATE.md` R1 row.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing. Every geo-fenced field is scored
reachable-in-principle, not-from-here — never as absent (L-606; the §CONTEXT-DATA-HONESTY spine).

- **Riyadh + Jeddah (shared)** — DOES: baked OSM/Overture context 5/9 (dense Overture buildings). REFUSES:
  an envelope (national pack authored but unwired/unsigned) + the exact vertical (field-level BOUNDED
  cited-null, national ceiling cited: villa ≤14 m / apt ≤23 m) — never a borrowed/invented number. UNKNOWN
  (typed): PARCEL `license-restriction` (Balady geo-fenced), LEGISLATION/ENVELOPE `pending-implementation`,
  HEIGHTS `license-restriction` (Overture height ≈ 0 % in Saudi). TERRAIN = cited 0 (no open GEOSA DTM).
  `honestyOk: true`.
- **Riyadh-specific** — the RCRC/ROSHN/ADA §1 cl.3 development-authority pervasiveness is a −1 pt legislation
  drag AND the in-SA source that would unblock the exact vertical; not asserted as complete.
- **Jeddah-specific** — the Al-Balad (Historic Jeddah) UNESCO overlay is a CORRECT conservation refusal
  surface (removes parcels from the national-footprint denominator), not a blank; the JHD 651-building GIS is
  not confirmed open.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured-fill (~55 %) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — national MOMRAH footprint + geo-fenced Balady + GEOSA-licensed context | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb (Phase 1 ships the footprint pack; Phases 2–3 BLOCKED on the geo-fence) | LEGISLATION (+all) |
| `sources/` | national per-field citations + verification | LEGISLATION |
| `findings/` | national data-source study + recon spike | DATA-SOURCES |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. UN/LOCODE +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts` (`isInSaudiArabia`, footprint-fallback).*
