<!-- COUNTRY-RATE.md — Netherlands composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`. Authored by the C63 Phase-1 audit; a future scorecard-function re-run replaces
     the manual cells (C63 §1.1/§8.1). -->
# Netherlands (nl) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** `NOT YET ASSESSED` — the legacy
national structured-fill number lives in [`RATE.md`](./RATE.md) (honestly unassessed: the omgevingsplan/DSO
"Regels op de kaart" probe has not been run; the Omgevingswet era began 1 Jan 2024). `RATE.md` is NOT YET
renamed `LEGISLATION-RATE.md` — pending the L-649 migration, owned by governance (mirrors the FR/BE pattern).
See [`README.md`](./README.md) for the national data layer and [`LOD-RATE.md`](./LOD-RATE.md) (LoD2.2 ~97%,
the world's context-data ceiling — 3DBAG).

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (3DBAG wired + live) but the per-city bake is unlanded
(§NL-NATIONWIDE / §3DBAG-WHOLE-COUNTRY-REFUSED) → still not-assessed. **Overall** is renormalised over the
ASSESSED subset only (`partial`). The Netherlands posts the **highest DATA-SOURCES (90 %)** of any country
scaffolded so far (ES 70 · FR 80 · NL 90): it is the only jurisdiction with a **wired + live national
cadastre** (Kadaster BRK via PDOK, `parcelProviders/registry.ts` `pdok-nl`), a **live national measured
building-height source** (3DBAG BAG×AHN LiDAR), and a **keyless national DTM** (AHN via PDOK WCS) all at once.

## §0 — Subdivision + code scheme (documented)

The Netherlands uses **`nl-<province>` = ISO 3166-2:NL province codes (lowercased)** for the `<cc>-<subdiv>`
folder level, and the official **CBS gemeentecode** (4-digit, zero-padded — `<code>` ∈ the NAMING-CONVENTION
§3 join key set) for `<code>`. Spatial planning is national in framework (Omgevingswet) with the operative
plan (omgevingsplan) adopted per **gemeente**, so the gemeente is the right city unit and the province the
subdivision.

| Subdiv folder | ISO 3166-2:NL province | Tackled cities (CBS) |
|---|---|---|
| `nl-nh` | Noord-Holland | Amsterdam (`0363`) — scaffolded, §A |
| `nl-zh` | Zuid-Holland | Rotterdam (`0599`), The Hague / Den Haag (`0518`) — §C |
| `nl-ut` | Utrecht | Utrecht (`0344`) — §C |
| `nl-nb` | Noord-Brabant | Eindhoven (`0772`) — §C |
| `nl-gr` | Groningen | Groningen (`0014`) — §C |

## §A — Per-city completion matrix (1 SCAFFOLDED this pass — the flagship city)

**Bake coverage is NATIONAL, not per-city.** `bake.mjs` REGIONS has ONE Dutch row — `netherlands`
(`netherlands-latest.osm.pbf`, bbox **`3.30,50.75,7.30,53.70`**) — a whole-country context bake that
covers **every** NL city (its own comment enumerates Amsterdam `4.83,52.34,4.97,52.42`, Rotterdam, Utrecht,
The Hague, Eindhoven, Groningen). The per-city granularity comes from `terrain.mjs` REGIONS (Amsterdam,
Rotterdam, Utrecht, The Hague, Eindhoven each a `source:'nl'` AHN row) and `heightSources.mjs`
`REGION_SOURCE.amsterdam:'3dbag'`. **Amsterdam** is the flagship scaffolded this pass — the capital, the one
city explicitly mapped in `REGION_SOURCE`, with a terrain row and national bake coverage.

| City (`CBS`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Noord-Holland (nl-nh)_ | | | | | | | | | |
| Amsterdam (`0363`) | `—` | `—` | **90%** | `—` | **50%** | `—`(cap) | **56%** | **71%** `partial` | [dossier](./nl-nh/0363-amsterdam/RATE.md) |

**Scaffolded totals (this pass):** 1 dossier (Amsterdam), **71 %** overall on the assessed subset
(DATA-SOURCES 90 · TERRAIN 50 · CONTEXT 56) — the highest overall of any city scaffolded so far, driven by
the 90 % DATA-SOURCES. Amsterdam carries measured-**capable** HEIGHTS via 3DBAG `(cap)`, unbaked
(§3DBAG-WHOLE-COUNTRY-REFUSED), and measured-**capable** PARCEL via the wired Kadaster BRK provider, unsampled.

## §C — Tackled but UNSCAFFOLDED (terrain-covered / bake-covered — logged, never silently truncated)

These NL cities are genuinely tackled (national bake coverage + a per-city `terrain.mjs` AHN row) and would
inherit the **identical cheap-axis derivation** as Amsterdam (DATA-SRC ~90 · TERRAIN 50 · CONTEXT 56 →
overall ~71 %), since 3DBAG + AHN + PDOK BRK are national. Scaffold on demand.

| City (`CBS`) | Subdiv | Terrain row (bbox) | 3DBAG height | Note |
|---|---|---|---|---|
| Rotterdam (`0599`) | nl-zh | ✅ `4.42,51.88,4.55,51.96` | measured-capable (national) | terrain `source:'nl'` AHN; per-city 3DBAG bbox resolves |
| Utrecht (`0344`) | nl-ut | ✅ `5.06,52.06,5.16,52.12` | measured-capable | same |
| The Hague / Den Haag (`0518`) | nl-zh | ✅ `4.25,52.04,4.35,52.10` | measured-capable | same |
| Eindhoven (`0772`) | nl-nb | ✅ `5.42,51.40,5.52,51.48` | measured-capable | same |
| Groningen (`0014`) | nl-gr | ❌ (no terrain row) | measured-capable | in the `heightSources.mjs` per-city bbox comment `6.52,53.20,6.60,53.25`; national bake covers it; TERRAIN would be `not-assessed` until a terrain row is added |

**Migration notes:** the country-level legislation number lives in the legacy `nl/RATE.md` (`NOT YET
ASSESSED` — the omgevingsplan/DSO probe has not been run); its rename to `LEGISLATION-RATE.md` is
governance-owned (L-649 migration). The pre-existing `nl/` research files (`README.md`, `LOD-RATE.md`,
`NEXT.md`, `RATE-IMPLEMENTATION-PLAN.md`, `regions/`, `topics/`) were LEFT UNTOUCHED this pass — only the
composite `COUNTRY-RATE.md`, the Amsterdam dossier, and `sources/`+`findings/` were added. All other NL
cities scaffold on demand with the standard 7-file set.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

The single scaffolded city has `honestyOk: true` — it fabricates nothing.

- **Amsterdam** — DOES: national Kadaster BRK parcel routing (wired + live, `pdok-nl`), baked OSM context 5/9
  (`bake.mjs netherlands`), a keyless AHN terrain row (rung-50 unverified), and a live national measured
  building-height source (3DBAG). REFUSES: an envelope (no rule pack) — never a borrowed/invented number.
  UNKNOWN (typed): PARCEL quality `not-queried` (measured-CAPABLE via the wired BRK provider, unsampled);
  LEGISLATION/ENVELOPE `pending-implementation`; HEIGHTS `not-queried` (measured-CAPABLE via 3DBAG, but the
  whole-country bake refuses 3DBAG per-tile → deployed tiles keep OSM; per-city bake unlanded). `honestyOk: true`.
- **Amsterdam-specific** — the 3DBAG measured roof height is the strongest EU building-height source (LoD2-
  capable), but the deployed national tiles render OSM `assumed` until the per-city 3DBAG bbox is baked OR the
  OSM-footprint-join is wired (the named follow-up, exactly Spain's MDS / Paris's BD TOPO story).

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured legislation/data-fill rate (NOT YET ASSESSED) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate (LoD2.2 ~97% — 3DBAG + AHN) | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — Kadaster BRK, 3DBAG, AHN, omgevingsplan/DSO | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |
| [`findings/NETHERLANDS-DATA-SOURCE-STUDY.md`](./findings/NETHERLANDS-DATA-SOURCE-STUDY.md) | source/legal-mechanism study | DATA-SOURCES |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. CBS codes +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts` (`pdok-nl`).*
