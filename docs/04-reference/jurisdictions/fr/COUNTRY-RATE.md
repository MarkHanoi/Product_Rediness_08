<!-- COUNTRY-RATE.md — France composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in RATE.md (legacy) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# France (fr) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~22 %` — see [`RATE.md`](./RATE.md) (NOT YET renamed `LEGISLATION-RATE.md`; pending the L-649
migration, owned by governance). See [`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (BD TOPO® wired + live) but the per-city bake is unlanded
(§BDTOPO-CAP-TRUNCATE) → still not-assessed. **Overall** is renormalised over the ASSESSED subset only
(`partial`). DATA-SOURCES reads **80 %** (not the Spanish-mainland 70 %) because France has a genuine
national urban-planning zone-GIS (GPU `zone-urba`) that most Spanish CCAAs lack — rated `documented` (0.5),
not `live`, since `siteDispatch.ts` wiring is unconfirmed.

## §0 — Subdivision scheme (documented)

France uses **`fr-<region>` = ISO 3166-2:FR region codes (lowercased)** for the `<cc>-<subdiv>` folder
level, and the **official INSEE commune code** for `<code>` (the C57/NAMING-CONVENTION §3 join key —
`<code>` ∈ INE/INSEE/DICOFRE/LAU). This reuses the pre-existing `fr/` folder layout:

| Subdiv folder | ISO 3166-2:FR région | Tackled cities (INSEE) |
|---|---|---|
| `fr-idf` | Île-de-France | Paris (`75056`) |
| `fr-ara` | Auvergne-Rhône-Alpes | Lyon (`69123`) |
| `fr-pac` | Provence-Alpes-Côte d'Azur | Marseille (`13055`) — research-only, §B |

*(Département `fr-NN` is the finer administrative axis but the ISO-region level matches how the pre-existing
dossiers were laid down and keeps the tree shallow; the INSEE `<code>` already carries the département in
its first two digits — 75/69/13 — so no information is lost.)*

## §A — Per-city completion matrix (2 SCAFFOLDED this pass — the bake-covered cities)

The bake-covered French cities are **Paris** and **Lyon** — the only two FR rows in `bake.mjs` REGIONS
(`paris` = Île-de-France extract, bbox `2.22,48.80,2.47,48.91`; `lyon` = Rhône-Alpes extract, bbox
`4.78,45.70,4.92,45.80`) AND `terrain.mjs` TERRAIN_CITY (both `source:'fr'` = RGE ALTI). No secondary
tackled commune sits inside either bbox (the Paris bbox is the 75056 commune core; the Lyon bbox the 69123
core — inner-ring communes are not separately tackled). Cheap axes cited-derived (see each city's `RATE.md`
for the full derivation); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the human-gated axes, honestly
`not-assessed` until sourced.

| City (`INSEE`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Île-de-France (fr-idf)_ | | | | | | | | | |
| Paris (`75056`) | `—` | `—` | **80%** | `—` | **50%** | `—`(cap) | **56%** | **66%** `partial` | [dossier](./fr-idf/75056-paris/RATE.md) |
| _Auvergne-Rhône-Alpes (fr-ara)_ | | | | | | | | | |
| Lyon (`69123`) | `—` | `—` | **80%** | `—` | **50%** | `—`(cap) | **56%** | **66%** `partial` | [dossier](./fr-ara/69123-lyon/RATE.md) |

**Scaffolded totals (this pass):** 2 dossiers (Paris, Lyon), both **66 %** overall on the assessed subset
(DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56). Both carry measured-**capable** HEIGHTS via BD TOPO® `(cap)`,
unbaked (§BDTOPO-CAP-TRUNCATE). Both migrated their legacy `RATE.md` (legislation) → `LEGISLATION-RATE.md`
this pass and gained a composite `RATE.md` + `ENVELOPE.md` + `HEIGHT.md` + `RISK-REGISTER.md`.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

| City (`INSEE`) | Kind | Dossier | Note |
|---|---|---|---|
| Marseille (`13055`, fr-pac) | research-only, **NOT bake-covered** | [dossier](./fr-pac/13055-marseille/) | Legacy legislation dossier (`RATE.md` ~18 % structured-fill; graphic-primacy PLU). NO `bake.mjs` REGIONS row and NO `terrain.mjs` row → TERRAIN + CONTEXT would be `not-assessed`/`outside-coverage`; DATA-SOURCES lower (no terrain/context feed). Out of this pass's bake-covered scope. Cells = `see dossier`. |

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Marseille (`13055`)** — to enter §A it needs a `bake.mjs` REGIONS row (Provence extract, bbox
  `~5.30,43.20,5.45,43.35`) + a `terrain.mjs` row (`source:'fr'`) so its cheap axes become computable, then
  the same 7-file scaffold + the legacy `RATE.md`→`LEGISLATION-RATE.md` migration. Logged here, not hidden.
- **Composite-RATE / legislation-rename migration** for Marseille (§B) and the country-level `fr/RATE.md`
  (legacy national ~22 %, not yet `LEGISLATION-RATE.md`) is owned by the governance/migration track
  (out of this pass's write-fence). Paris + Lyon were migrated this pass because they were the worked cities.
- **Other French communes** (~34,900) are TACKLED for legislation only at the national level (GPU/BD TOPO
  reach ~95 % of communes for zone + parcel, but numeric rules are per-commune PDF règlements — see
  `RATE.md`). They inherit the identical cheap-axis derivation once bake-covered; scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing.

- **Paris + Lyon** — DOES: terrain (RGE ALTI, rung-50 unverified) + national IGN cadastre parcel routing +
  baked OSM context 5/9 + a national/metropole zone-GIS endpoint (GPU / Grand Lyon). REFUSES: an envelope
  (no rule pack) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality `not-queried`,
  LEGISLATION/ENVELOPE `pending-implementation`, HEIGHTS `not-queried` (measured-CAPABLE via BD TOPO, unbaked).
  `honestyOk: true`.
- **Paris-specific** — the ~35 % structured-fill prior is NOT reported as the Axis-2 score; the gabarit
  envelope needs the ADR-0274 engine KIND; ABF/PSMV refusal overlays are mandatory before any envelope.
- **Lyon-specific** — `pluhauteur` gives direct numeric heights (cheapest FR pack path) but its parcel
  coverage fraction is UNPROBED and the Lyon/Villeurbanne overlay is a structural exception — neither is
  asserted as complete.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured-fill (~22 %) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — GPU/BD TOPO/RGE ALTI reach + per-commune PDF bottleneck | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. INSEE codes +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
