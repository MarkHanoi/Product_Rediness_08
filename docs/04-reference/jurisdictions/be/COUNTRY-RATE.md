<!-- COUNTRY-RATE.md — Belgium composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Belgium (be) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~10–14 %` (blended across the 3 constitutionally-independent regional systems) — see
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file). See [`README.md`](./README.md) for the national data layer and
[`findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`](./findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md).

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). **Overall** is renormalised over the ASSESSED subset only (`partial`). Belgium's DATA-SOURCES
reads **40 %** (well below France's 80 % and NL's 90 %) because — despite a genuine federal cadastre and
strong regional zone-GIS — the building-height and terrain feeds for Brussels-Capital are both `blocked`
(the GRB LiDAR height product is Flanders-only; no Brussels-Capital DTM route is located — `terrain.mjs`
`be` verdict `blocked`), and the federal CADMAP cadastre WFS, though live-verified, is **not yet wired**
into `parcelProviders/registry.ts` (rated `documented`, not `live`).

## §0 — Subdivision + code scheme (documented)

Belgium uses **`be-<region>` = ISO 3166-2:BE region codes (lowercased)** for the `<cc>-<subdiv>` folder
level (`be-bru` Brussels-Capital, `be-vlg` Flanders, `be-wal` Wallonia), and the official **NIS/INS
municipality code** (6-digit, `<code>` ∈ the NAMING-CONVENTION §3 join key set) for `<code>`. This is the
constitutional fracture line: spatial planning is an **exclusive regional competence** (special laws of
8 Aug 1980 + 12 Jan 1989), so the subdivision axis is legally load-bearing, not merely administrative.

| Subdiv folder | ISO 3166-2:BE region | Planning code | Tackled cities (NIS) |
|---|---|---|---|
| `be-bru` | Brussels-Capital (BE-BRU) | CoBAT / PRAS / RRU | City of Brussels (`21004`) — bake-covered, §A |
| `be-vlg` | Flanders (BE-VLG) | VCRO / gewestplan + RUP | Antwerp (`11002`) — research-only, §B |
| `be-wal` | Wallonia (BE-WAL) | CoDT / plan de secteur | Liège (`62063`) — research-only, §B |

*(Code choice for Brussels: the bake bbox `4.30,50.80,4.42,50.90` spans the whole 19-commune Brussels-Capital
Region — the real planning unit, since PRAS/RRU are region-wide — but a `<code>-<slug>` dossier needs a single
municipal code, so the representative core commune **City of Brussels / Ville de Bruxelles / Stad Brussel, NIS
`21004`** is used. The region aggregate NIS `21000` in `README.md §5` is not a commune code.)*

## §A — Per-city completion matrix (1 SCAFFOLDED this pass — the bake-covered city)

The only bake-covered Belgian city is **Brussels** — the sole BE row in `bake.mjs` REGIONS
(`brussels`, `belgium-latest.osm.pbf`, bbox `4.30,50.80,4.42,50.90`). There is **no** `terrain.mjs`
REGIONS row for Brussels and the `be` terrain source is `blocked` (§CONTEXT below). Cheap axes
cited-derived (see the city `RATE.md` for the full derivation); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are
the human-gated axes, honestly `not-assessed`.

| City (`NIS`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Brussels-Capital (be-bru)_ | | | | | | | | | |
| Brussels (`21004`) | `—` | `—` | **40%** | `—` | `—` | `—` | **56%** | **44%** `partial` | [dossier](./be-bru/21004-brussels/RATE.md) |

**Scaffolded totals (this pass):** 1 dossier (Brussels), **44 %** overall on the assessed subset
(DATA-SOURCES 40 · CONTEXT 56). TERRAIN + HEIGHTS + PARCEL + LEGISLATION + ENVELOPE all honestly
`not-assessed`. Brussels' DATA-SOURCES (40 %) is the lowest of the four European countries scaffolded so
far (ES 70 · FR 80 · NL 90) — a true reading of the region-split data reality, not a defect.

## §B — Pre-existing / research-only dossiers (NOT re-scaffolded this pass)

| City (`NIS`) | Kind | Legacy dossier | Note |
|---|---|---|---|
| Antwerp (`11002`, be-vlg) | research-only, **NOT bake-covered** | [legacy](./be-vlg/ant-antwerp/) | Flanders / VCRO. NO `bake.mjs` REGIONS row + NO `terrain.mjs` row → cheap axes `not-assessed`/`outside-coverage`. Legacy folder uses non-standard naming (`ant-antwerp`, not `11002-antwerp`) — pending Phase-0 normalisation (governance-owned). Cells = `see dossier`. |
| Liège (`62063`, be-wal) | research-only, **NOT bake-covered** | [legacy](./be-wal/lie-liege/) | Wallonia / CoDT. Same as Antwerp: no bake/terrain row → cheap axes `not-assessed`. Legacy naming `lie-liege` pending normalisation. Cells = `see dossier`. |

## §C — Tackled but UNSCAFFOLDED / migration notes (logged, never silently truncated — C63 SCALE clause)

- **Legacy `be-bru/bru-brussels/` folder** — the pre-C63 Brussels folder uses non-standard naming
  (`bru-brussels`, no NIS code) and holds a legacy legislation-only dossier. This pass scaffolds the
  C63-standard `be-bru/21004-brussels/` alongside it; **the move/merge of the legacy folder is Phase-0
  normalisation, orchestrator-owned** (no `git mv` by a scoped agent — C63 §8.2). Logged here, not hidden.
- **Antwerp + Liège** — to enter §A each needs a `bake.mjs` REGIONS row (Flanders/Wallonia extract, city
  bbox) + a `terrain.mjs` row so its cheap axes become computable, then the standard 7-file scaffold + the
  NIS-coded folder rename. Both are the recommended Tier-2/Tier-3 regions (README §5).
- **Composite-RATE / legislation-rename migration** for the country-level legislation file — DONE (L-649):
  `be/RATE.md` → `be/LEGISLATION-RATE.md` (legacy national ~10–14 %) with a reconciliation banner + inbound links repointed.
- **Belgium's ~581 municipalities** are TACKLED for legislation only at the regional level; they inherit
  the identical cheap-axis derivation once bake-covered. The real cost driver is **three independent
  legal-system integrations** (VCRO / CoDT / CoBAT), not municipality count — see `findings/`.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

The single scaffolded city has `honestyOk: true` — it fabricates nothing.

- **Brussels** — DOES: baked OSM context 5/9 (`bake.mjs` `brussels`). REFUSES: an envelope (no rule pack;
  RRU Titre I `H = P + 3.00 + D` is a formula-in-PDF needing a new engine KIND) — never a borrowed/invented
  number. UNKNOWN (typed): PARCEL quality `not-queried` (no BE cadastre provider wired → footprint-fallback,
  unsampled); LEGISLATION + ENVELOPE `pending-implementation`; TERRAIN `pending-implementation` (no Brussels-
  Capital DTM route located — `terrain.mjs` `be` verdict `blocked`); HEIGHTS `adapter-limitation` (UrbIS
  height unprobed, GRB LiDAR height is Flanders-only). `honestyOk: true`.
- **Brussels-specific** — the ~5–10 % Brussels structured-fill prior is NOT reported as the Axis-2 score;
  the RRU Titre I baseline is legally subordinate to the discretionary *bon aménagement des lieux* test
  (a value the engine cannot itself evaluate) and to a PRAS/RRU/RRUZ/PPAS precedence check — both mandatory
  caveats before any envelope.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~10–14 %) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — federal cadastre + three regional planning codes | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |
| [`findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`](./findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md) | full source/legal-mechanism study | DATA-SOURCES |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. NIS codes +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts`.*
