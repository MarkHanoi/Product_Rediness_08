<!-- COUNTRY-RATE.md — Norway composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in RATE.md (legacy) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Norway (no) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~32 %` — see [`RATE.md`](./RATE.md) (NOT YET renamed `LEGISLATION-RATE.md`; pending the L-649
migration, owned by governance). See [`README.md`](./README.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (national nDSM source wired/documented) but the per-city
bake is unlanded → still not-assessed. **Overall** is renormalised over the ASSESSED subset only
(`partial`). Oslo's DATA-SOURCES reads **80 %** — the highest of the Nordic set — because Norway's national
Matrikkelen parcel WFS is genuinely `live`-wired (`parcelProviders/registry.ts` `isInNorway`) and the
Kartverket NHM DTM terrain source is keyless-live, where Sweden/Finland's parcel + terrain feeds are
key-gated or unwired (`documented`).

## §0 — Subdivision scheme (documented)

Norway uses **`no-<NN>` = the two-digit Kartverket fylke (county) code** for the `<cc>-<subdiv>` folder level,
and the **four-digit Kartverket kommunenummer** for `<code>` (the C57/NAMING-CONVENTION §3 join key). This
reuses the pre-existing `no/` folder layout:

| Subdiv folder | Fylke (Kartverket NN) | Tackled cities (kommunenummer) |
|---|---|---|
| `no-03` | Oslo | Oslo (`0301`) |
| `no-46` | Vestland | Bergen (`4601`) — research-only, §B |
| `no-50` | Trøndelag | Trondheim (`5001`) — research-only, §B |

*(Oslo kommune `0301` sits in Oslo fylke `03`; the kommunenummer's first two digits carry the fylke — `03`/`46`/`50`
— so no information is lost. Kartverket retained the historic `0301` code for Oslo through the 2020 reform.)*

## §A — Per-city completion matrix (1 SCAFFOLDED this pass — the bake-covered city)

The only bake-covered Norwegian city is **Oslo** — the sole NO row in `bake.mjs` REGIONS (`oslo` =
`norway-latest.osm.pbf` extract, bbox `10.66,59.88,10.83,59.96`) AND `terrain.mjs` TERRAIN_CITY (`source:'no'`
= Kartverket NHM DTM). No other tackled kommune sits inside the Oslo bbox (Bergen `~5.32E/60.39N` and
Trondheim `~10.4E/63.43N` are far outside). Cheap axes cited-derived (see Oslo's `RATE.md` for the full
derivation); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the human-gated axes, honestly `not-assessed` until
sourced.

| City (`kommune`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Oslo (no-03)_ | | | | | | | | | |
| Oslo (`0301`) | `—` | `—` | **80%** | `—` | **50%** | `—`(cap) | **56%** | **66%** `partial` | [dossier](./no-03/0301-oslo/RATE.md) |

**Scaffolded totals (this pass):** 1 dossier (Oslo), **66 %** overall on the assessed subset
(DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56). Oslo carries measured-**capable** HEIGHTS via NDH nDSM `(cap)`,
unbaked. Oslo migrated its legacy `RATE.md` (legislation, ~33 %) → `LEGISLATION-RATE.md` this pass and gained a
composite `RATE.md` + `ENVELOPE.md` + `HEIGHT.md` + `RISK-REGISTER.md` + `RATE-IMPLEMENTATION-PLAN.md`.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

| City (`kommune`) | Kind | Dossier | Note |
|---|---|---|---|
| Bergen (`4601`, no-46) | research-only, **NOT bake-covered** | [dossier](./no-46/4601-bergen/) | Legacy dossier (`RATE.md` legislation prior). NO `bake.mjs` REGIONS row and NO `terrain.mjs` TERRAIN_CITY row → TERRAIN + CONTEXT would be `not-assessed`/`outside-coverage`; DATA-SOURCES lower (no terrain/context feed, though Matrikkelen parcel is national-live). Out of this pass's bake-covered scope. Cells = `see dossier`. |
| Trondheim (`5001`, no-50) | research-only, **NOT bake-covered** | [dossier](./no-50/5001-trondheim/) | Legacy dossier (`RATE.md` legislation prior ~35 %). Same as Bergen — no bake/terrain row → cheap axes not computable until added. Cells = `see dossier`. |

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Bergen (`4601`)** — to enter §A it needs a `bake.mjs` REGIONS row (`norway-latest.osm.pbf`, bbox
  `~5.24,60.36,5.38,60.42`) + a `terrain.mjs` row (`source:'no'`) so its cheap axes become computable, then
  the same 7-file scaffold + the legacy `RATE.md`→`LEGISLATION-RATE.md` migration. Logged here, not hidden.
- **Trondheim (`5001`)** — same: needs a REGIONS row (bbox `~10.35,63.40,10.50,63.46`) + a terrain row, then
  scaffold + migrate. Logged, not hidden.
- **Composite-RATE / legislation-rename migration** for Bergen + Trondheim (§B) and the country-level
  `no/RATE.md` (legacy national ~32 %, not yet `LEGISLATION-RATE.md`) is owned by the governance/migration
  track (out of this pass's write-fence). Oslo was migrated this pass because it was the bake-covered city.
- **Other Norwegian kommuner** (~356) are TACKLED for legislation only at the national level (Matrikkelen +
  SOSI Plan reach nationally, but numeric utilisation lives in bestemmelser PDFs — see `RATE.md`). They inherit
  the identical cheap-axis derivation once bake-covered; scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

The one scaffolded city has `honestyOk: true` — it fabricates nothing.

- **Oslo** — DOES: terrain (Kartverket NHM DTM, keyless, rung-50 unverified) + national Matrikkelen parcel
  routing (LIVE) + baked OSM context 5/9 + a national SOSI Plan zone-GIS framework (Planinnsyn viewer-confirmed).
  REFUSES: an envelope (no rule pack) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality
  `not-queried` (provider LIVE), LEGISLATION/ENVELOPE `pending-implementation`, HEIGHTS `not-queried`
  (measured-CAPABLE via NDH nDSM, unbaked; FKB-Bygning licence-gated). `honestyOk: true`.
- **Oslo-specific** — the ~33 % structured-fill prior is NOT reported as the Axis-2 score; the numeric
  utilisation lives in bestemmelser prose (the national `BestemmelseUtnyttingsgrad` SOSI object is an unfilled
  stub); Planinnsyn is a click-viewer, not a queryable WFS — so the zone-GIS slot is `documented`, never `live`.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured-fill (~32 %) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — Matrikkelen / SOSI Plan / NDH / Kartverket reach + bestemmelser-PDF bottleneck | all |
| [`NEXT.md`](./NEXT.md) | national resume steps · blockers | all |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. Kommunenummer +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
