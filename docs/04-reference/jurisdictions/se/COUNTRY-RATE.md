<!-- COUNTRY-RATE.md — Sweden composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Sweden (se) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~40 %` post-2022 optimistic / `~20–30 %` land-area-weighted conservative — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)
(renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file). See
[`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (national LiDAR nDSM documented) but the per-city bake is
unlanded → still not-assessed. **Overall** is renormalised over the ASSESSED subset only (`partial`).
Stockholm's DATA-SOURCES reads **60 %** (not Oslo's 80 %) because Sweden's parcel provider is UNWIRED
(`documented`, falls to OSM footprint) and both the terrain DEM and the zone-GIS are key-gated / geo-blocked
(`documented`), where Norway's Matrikkelen + Kartverket terrain are keyless-`live`.

## §0 — Subdivision scheme (documented)

Sweden uses **`se-<NN>` = the two-digit SCB län (county) code** for the `<cc>-<subdiv>` folder level, and the
**four-digit SCB kommunkod** for `<code>` (the C57/NAMING-CONVENTION §3 join key). This mirrors the Norwegian
numeric layout (`no-<NN>`/kommunenummer):

| Subdiv folder | Län (SCB NN · ISO) | Tackled cities (kommunkod) |
|---|---|---|
| `se-01` | Stockholms län (ISO SE-AB) | Stockholm (`0180`) |

*(Stockholm kommun `0180` sits in Stockholms län `01`; the kommunkod's first two digits carry the län — `01` —
so no information is lost. Gothenburg `1480` / Malmö `1280` would land under `se-14` / `se-12` when tackled.)*

## §A — Per-city completion matrix (1 SCAFFOLDED this pass — the bake-covered city)

The only bake-covered Swedish city is **Stockholm** — the sole SE row in `bake.mjs` REGIONS (`stockholm` =
`sweden-latest.osm.pbf` extract, bbox `17.98,59.28,18.14,59.37`) AND `terrain.mjs` TERRAIN_CITY (`source:'se'`
= Lantmäteriet Höjddata). No other tackled kommun sits inside the Stockholm bbox (Gothenburg `~11.97E` and
Malmö `~13.0E` are far outside). Cheap axes cited-derived (see Stockholm's `RATE.md`); PARCEL/LEGISLATION/
ENVELOPE/HEIGHTS are the human-gated axes, honestly `not-assessed` until sourced.

| City (`kommunkod`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Stockholms län (se-01)_ | | | | | | | | | |
| Stockholm (`0180`) | `—` | `—` | **60%** | `—` | **50%** | `—`(cap) | **56%** | **56%** `partial` | [dossier](./se-01/0180-stockholm/RATE.md) |

**Scaffolded totals (this pass):** 1 dossier (Stockholm), **56 %** overall on the assessed subset
(DATA-SOURCES 60 · TERRAIN 50 · CONTEXT 56). Stockholm carries measured-**capable** HEIGHTS via LiDAR nDSM
`(cap)`, unbaked. It is a NEW scaffold (Sweden had no prior city dossier) — full 7-file set + README + sources.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

None. Sweden had no city-level dossier before this pass (only the national `RATE.md` + `README.md` +
`LOD-RATE.md` + `NEXT.md`).

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Gothenburg (`1480`, se-14)** — to enter §A it needs a `bake.mjs` REGIONS row (`sweden-latest.osm.pbf`,
  bbox `~11.90,57.66,12.05,57.75`) + a `terrain.mjs` row (`source:'se'`), then the full 7-file scaffold.
  Logged here, not hidden.
- **Malmö (`1280`, se-12)** — same: needs a REGIONS row (bbox `~12.95,55.56,13.06,55.62`) + a terrain row.
  Logged, not hidden.
- **National-level migration** — the country-level `se/RATE.md` → `se/LEGISLATION-RATE.md` (legacy national
  ~40 %/~20–30 %) — DONE (L-649: reconciliation banner + inbound links repointed).
- **Other Swedish kommuner** (290 total) are TACKLED for legislation only at the national level (NGP reaches
  post-2022 plans nationally but is geo-blocked + land-area-weighted low — see `LEGISLATION-RATE.md`). They inherit the
  identical cheap-axis derivation once bake-covered; scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

The one scaffolded city has `honestyOk: true` — it fabricates nothing.

- **Stockholm** — DOES: baked OSM context 5/9 + a national terrain DEM (Lantmäteriet Höjddata, key-gated,
  rung-50 unverified) + a documented national zone-GIS (NGP) + a documented national LiDAR height source.
  REFUSES: an envelope (no rule pack) + a legal parcel (no wired cadastral provider — falls to labelled OSM
  footprint) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality `not-queried` (provider
  UNWIRED), LEGISLATION/ENVELOPE `pending-implementation`, HEIGHTS `not-queried` (measured-CAPABLE via LiDAR
  nDSM, unbaked). `honestyOk: true`.
- **Stockholm-specific** — the national ~40 %/~20–30 % structured-fill prior is NOT reported as the Axis-2
  score (NGP is geo-blocked from non-SE IPs, unprobed for Stockholm); the FREE `LANTMATERIET_API_KEY` gates
  TERRAIN + HEIGHTS + the cadastral adapter simultaneously — none is asserted as complete.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~40 %/~20–30 %) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — NGP / Lantmäteriet / LiDAR reach + geo-block + post-2022 bimodality | all |
| [`NEXT.md`](./NEXT.md) | national resume steps · blockers | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. Kommunkod +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
