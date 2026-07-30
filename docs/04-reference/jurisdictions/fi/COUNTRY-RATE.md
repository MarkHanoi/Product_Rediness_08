<!-- COUNTRY-RATE.md — Finland composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in RATE.md (legacy) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Finland (fi) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~55–65 %` (Ryhti live regions, est.) / `~30–35 %` (non-Ryhti) — see [`RATE.md`](./RATE.md)
(NOT YET renamed `LEGISLATION-RATE.md`; pending the L-649 migration, owned by governance). See
[`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (open LoD2 documented) but UNWIRED + unbaked → still
not-assessed. **Overall** is renormalised over the ASSESSED subset only (`partial`). Helsinki's DATA-SOURCES
reads **60 %** (not Oslo's 80 %) because Finland's parcel provider is UNWIRED (`documented`, falls to OSM
footprint), the terrain DEM is key-gated (`documented`), and no height source is wired (open LoD2 is a
documented candidate) — where Norway's Matrikkelen + Kartverket terrain are keyless-`live`. Finland's
zone-GIS (Ryhti) is nonetheless the strongest-documented Nordic feed after Denmark — live+public, just not
yet wired.

## §0 — Subdivision scheme (documented)

Finland uses **`fi-<NN>` = the two-digit Tilastokeskus maakunta (region) code** for the `<cc>-<subdiv>` folder
level, and the **three-digit Tilastokeskus kuntanumero** for `<code>` (the C57/NAMING-CONVENTION §3 join key).
This mirrors the Norwegian/Swedish numeric layout:

| Subdiv folder | Maakunta (Tilastokeskus NN · ISO) | Tackled cities (kuntanumero) |
|---|---|---|
| `fi-01` | Uusimaa (ISO FI-18) | Helsinki (`091`) |

*(Helsinki `091` sits in Uusimaa maakunta `01`. The kuntanumero is a flat 3-digit municipal code — the region
is a separate axis — so `fi-01/091-helsinki` carries both. Espoo `049` / Vantaa `092` / Tampere `837` land
under their own maakunta folders when tackled — Espoo/Vantaa also `fi-01` Uusimaa.)*

## §A — Per-city completion matrix (1 SCAFFOLDED this pass — the bake-covered city)

The only bake-covered Finnish city is **Helsinki** — the sole FI row in `bake.mjs` REGIONS (`helsinki` =
`finland-latest.osm.pbf` extract, bbox `24.88,60.14,25.02,60.20`) AND `terrain.mjs` TERRAIN_CITY (`source:'fi'`
= MML WCS). No other tackled kunta sits inside the Helsinki bbox — Espoo (`~24.65E`, west of `24.88`) and
Vantaa (`~60.29N`, north of `60.20`) both fall OUTSIDE the clip. Cheap axes cited-derived (see Helsinki's
`RATE.md`); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the human-gated axes, honestly `not-assessed` until sourced.

| City (`kuntanumero`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Uusimaa (fi-01)_ | | | | | | | | | |
| Helsinki (`091`) | `—` | `—` | **60%** | `—` | **50%** | `—`(cap) | **56%** | **56%** `partial` | [dossier](./fi-01/091-helsinki/RATE.md) |

**Scaffolded totals (this pass):** 1 dossier (Helsinki), **56 %** overall on the assessed subset
(DATA-SOURCES 60 · TERRAIN 50 · CONTEXT 56). Helsinki carries measured-**capable** HEIGHTS via open LoD2
`(cap)` — a documented candidate, UNWIRED. It is a NEW scaffold (Finland had no prior city dossier) — full
7-file set + README + sources.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

None. Finland had no city-level dossier before this pass (only the national `RATE.md` + `README.md` +
`RATE-IMPLEMENTATION-PLAN.md` + `NEXT.md`).

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Espoo (`049`, fi-01)** — to enter §A it needs a `bake.mjs` REGIONS row (`finland-latest.osm.pbf`, bbox
  `~24.60,60.16,24.76,60.24`) + a `terrain.mjs` row (`source:'fi'`), then the full 7-file scaffold. Logged
  here, not hidden.
- **Tampere (`837`, fi-06 Pirkanmaa)** — same: needs a REGIONS row (bbox `~23.70,61.47,23.86,61.53`) + a
  terrain row. Logged, not hidden.
- **National-level migration** — the country-level `fi/RATE.md` (legacy national ~55–65 %/~30–35 %) is not yet
  renamed `LEGISLATION-RATE.md`; owned by the governance/migration track (out of this pass's write-fence).
- **Other Finnish kunnat** (~309) are TACKLED for legislation only at the national level (Ryhti reaches live
  regions nationally but the item schema is unconfirmed — see `RATE.md`). They inherit the identical cheap-axis
  derivation once bake-covered; scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

The one scaffolded city has `honestyOk: true` — it fabricates nothing.

- **Helsinki** — DOES: baked OSM context 5/9 + a national terrain DEM (MML WCS, key-gated, rung-50 unverified)
  + a live+public national zone-GIS (Ryhti `kaavatietomalli`, documented — not wired). REFUSES: an envelope
  (no rule pack) + a legal parcel (no wired cadastral provider — falls to labelled OSM footprint) + a wired
  height source (open LoD2 exists as a candidate, unwired) — never a borrowed/invented number. UNKNOWN
  (typed): PARCEL quality `not-queried` (provider UNWIRED), LEGISLATION/ENVELOPE `pending-implementation`,
  HEIGHTS `not-queried` (LoD2 candidate, unwired). `honestyOk: true`.
- **Helsinki-specific** — the national ~55–65 % Ryhti prior is NOT reported as the Axis-2 score (item schema
  unconfirmed); the FREE `MML_API_KEY` gates the terrain bake; the open LoD2 must be WIRED before HEIGHTS is
  even measured-live — none is asserted as complete.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured-fill (~55–65 %/~30–35 %) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`README.md`](./README.md) | national data layer — Ryhti / MML / open LoD2 reach + item-schema gap | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |
| [`NEXT.md`](./NEXT.md) | national resume steps · blockers | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. Kuntanumero +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
