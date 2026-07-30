# SPEC — City-Completion Rollout Program (audit → map → plan, fan-out)

| Field | Value |
|---|---|
| Status | DRAFT — normative (the method; the per-city numbers are produced BY running it) |
| Version | 1.0 |
| Date | 2026-07-30 |
| Owner | Geospatial / city-replication governance |
| Contract | [C63 §5.1/§5.2/§5.3 + §8.2](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) |
| ADR | [ADR-0282](../../02-decisions/adrs/ADR-0282-equal-jurisdiction-folder-standard-and-city-completion-rollout-program.md) |
| Composes | [SPEC-CITY-COMPLETION-SCORECARD](./SPEC-CITY-COMPLETION-SCORECARD.md) (the 7-axis function this program POPULATES), [C62](../../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) (`not-assessed` honesty) |
| Issue | audit **L-650** (extends L-648/L-649) |
| Reads / writes | per-country `jurisdictions/<cc>/**` (one agent each) → the global `master-execution-tracker.md §CITY-COMPLETION` matrix (orchestrator, single writer) |
| Normalisation plan | [`jurisdictions/_NORMALIZATION.md`](../../04-reference/jurisdictions/_NORMALIZATION.md) (Phase 0) |

---

## §1 — Purpose

Define the **method** for driving every tackled city from "scaffolded / unmeasured" to a fully-populated,
comparable, honest C63 completion dossier — **before** any mass execution begins. C63 defines the ruler (the
7 axes, the weighting, the folder shape); this SPEC defines the **program that applies the ruler at scale**:
a phased, batched, fan-out-safe sequence that (a) first normalises the existing tree to the equal folder
standard, then (b) audits each tackled city cell-by-cell with cited derivations, (c) maps the results into
the dossiers and roll-ups, and (d) plans the per-axis climb.

**Why a program, not ad-hoc work.** The rollout touches ~14 countries and ~30 cities across ~200 files, run
by parallel agents. Without a fixed method, agents would diverge on shape, collide on the shared matrix, and
be tempted to hand-type completeness numbers — the exact §CONTEXT-DATA-HONESTY fabrication C63 §1.1 forbids.
This SPEC removes those failure modes structurally: one method, one fan-out unit, one matrix writer.

## §2 — Definitions

### §2.1 — "Tackled" (which cities MUST appear)
A city is **tackled** — and therefore MUST have a §5-shaped dossier and a matrix row (C63 §1.7) — if **any**
of these predicates holds (independently checkable, no judgement):

| Predicate | Source of truth |
|---|---|
| **bake row** | a `REGIONS` entry (or a national region that contains it) in `tools/context-bake/bake.mjs` |
| **terrain coverage** | a `terrain/<city>/layer.json` tileset (R2) referenced by `terrainCoverage.ts` |
| **registry predicate** | a parcel/zone predicate in `rulepacks/registry.ts` / `siteDispatch.ts` (e.g. `isInBarcelona`) |
| **rule pack** | a `packages/site-parcel-data/src/rulepacks/<jurisdictionId>.ts` |
| **scaffolded folder** | an existing `jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/` dossier |

A city that renders in the app but satisfies none of the first four AND has no folder is a **coverage gap** —
logged in the country's `NEXT.md`, never silently omitted (C63 §1.7).

### §2.2 — The fan-out unit + the single-writer rule
- **Fan-out unit = one agent per country (or per large sub-region).** An agent writes **only** under its own
  `jurisdictions/<cc>/**`. Two agents never share a country folder (the multi-agent shared-tree discipline —
  scoped agents write disjoint subtrees; the orchestrator owns cross-cutting docs).
- **The orchestrator is the SINGLE WRITER of the global matrix** (`master-execution-tracker.md §CITY-COMPLETION`)
  and of the `jurisdictions/_NORMALIZATION.md` execution. Country agents produce their `COUNTRY-RATE.md`
  roll-up + city `RATE.md` cells; the orchestrator merges those into the global matrix. No country agent edits
  the global matrix or another country's folder.
- **Cited derivation, never a guess.** Every cell an agent writes carries the state it read (the C63 §1.1
  "explain-why"): `N`-parcel sample result, `heightSources.mjs impl` value, `layer.json` 200 + verify result,
  the 9-layer probe, the cited-clau count. A cell with no derivation is rejected in review. This is honest
  **ahead of** the automated scorecard function (L-648) precisely because it cites, not guesses.

## §3 — The phases

### Phase 0 — NORMALISE the existing tree (prerequisite; blocks Phase 1)
Bring every existing country + city folder to the equal C63 §5/§5.2 shape **before** auditing, so the audit
reads a uniform tree. Governed by [`jurisdictions/_NORMALIZATION.md`](../../04-reference/jurisdictions/_NORMALIZATION.md):
each loose/misplaced file → its standard home (one line); each folder's missing standard files listed for
scaffolding. **The orchestrator executes the moves** (`git mv` + inbound-link rewrite); country agents do not
move files. Exit criterion: every country folder passes the §5.2 shape check; every city folder passes the
§5 shape check (or its gap is logged in the country `NEXT.md`).

### Phase 1 — AUDIT (per-country batch, cheap axes first)
For each tackled city in the batch, inspect real state and record each of the 7 axes **cell-by-cell with a
cited derivation**, in the sequencing SPEC-CITY-COMPLETION-SCORECARD §5 mandates:

1. **Cheap first computes** (state already inspectable — no new upstream, no sampling):
   - **DATA-SOURCES** — read `heightSources.mjs` `impl`/`REGION_SOURCE` + `registry.ts` + `bake.mjs REGIONS` + terrain DEM wiring.
   - **TERRAIN** — probe `terrain/<city>/layer.json` (HTTP 200 + extent) + the `terrain.verify.mjs` round-trip + white-mask flags.
   - **CONTEXT** — probe the 9 context layers `{buildings,roads,water,parks,landuse,rail,trees,pedestrian,sea}` (a `206` + non-empty tile) at the city bbox.
2. **One sampling run each:** **PARCEL** (`computeParcelConfidence` over N parcels), **HEIGHTS/LOD** (the `heightProvenance` `tagged` fraction from the bake output / context panel).
3. **Human-gated:** **LEGISLATION** (per-clau `SOURCES.md` cited-row audit), **ENVELOPE** (coverage measurement) — each reaching `human-reviewed` only behind a signed `sources/VERIFICATION.md` (L-449).

An axis with no measurement stays **`not-assessed`** + a typed C62 `UnknownReason` — **never 0 %, never blank**
(C63 §1.2). Scaffold any missing dossier for a tackled city first (Phase 0 shape), then audit its cheap axes.

### Phase 2 — MAP (into dossiers + roll-ups + global matrix)
Write each audited cell into: (a) the city's composite master `RATE.md`; (b) the country `COUNTRY-RATE.md`
roll-up; (c) — orchestrator only — the global `master-execution-tracker.md §CITY-COMPLETION` matrix. Each
write carries the `<!-- generated-by: … -->` provenance stamp (a Phase-1 cited-audit stamp until the L-648
function ships, then the function's stamp). The three faces MUST agree (the matrix cell == the city `RATE.md`
cell == the `COUNTRY-RATE.md` cell); a disagreement is a merge error the orchestrator resolves.

### Phase 3 — PLAN (per-axis, per-city L-items)
For every axis below its ceiling, author a per-axis, per-city climb step in that city's
`RATE-IMPLEMENTATION-PLAN.md`, and surface the cross-city ones as new `L-NNN` items in the V1 audit +
impl-plan (this program is recursive: Phase 3 output feeds back as new tracked work). The plan states the
realistic ceiling per axis (never 100 % where a discretionary/graphic-primacy residuum remains — the
COUNTRY-DATA-STRATEGY honesty rule) and the effort/owner.

## §4 — The batches (over the 23 baked regions)

The 23 `bake.mjs REGIONS` (2 national ES + national DK + national NL + 20 city clips) group into **10
country/region batches**. One agent per batch; batches are independent and run in parallel. The `+scaffold`
cities are tackled by folder/registry but not individually baked (they ride a national bake or await one).

| # | Batch | Baked regions in `bake.mjs` | Tackled cities (dossiers) | Notes |
|---|---|---|---|---|
| 1 | **Spain (es)** | `spain` (national) | Barcelona `08019` · Madrid `28079` · Córdoba `14021` · + 3 Catalan (Hospitalet/Badalona/Sant Boi) | ⚠ `jurisdictions/es/**` is the **Spain agent's** disjoint subtree — coordinate; do not double-write. Reference batch (most mature). |
| 2 | **Nordics (dk, no, se, fi)** | `denmark` (national) · `oslo` · `stockholm` · `helsinki` | Oslo `0301` (+ Bergen `4601`, Trondheim `5001` scaffolds) · Braga is PT not here | Copenhagen rides national `denmark` (no separate clip). DK = the ~96 % legislation ceiling model. |
| 3 | **DACH (de, ch, at)** | `berlin` · `munich` · `zurich` · `geneva` · `bern` | Berlin `11000` · Munich `09162` · Hamburg `02000` (scaffold) · Zürich | No `at/` (Austria) folder yet — scaffold if a bake lands. Zürich dossier lives at `ch/regions/zurich` (non-standard — normalise, see _NORMALIZATION). |
| 4 | **France (fr)** | `paris` · `lyon` | Paris `75056` · Lyon `69123` · Marseille `13055` (scaffold) | FR = the worked COUNTRY-DATA-STRATEGY reference. |
| 5 | **Italy (it)** | `rome` · `milan` | Rome `058091` · Milan `015146` · Turin `001272` (scaffold) | Turin baked? no — rides no clip yet. |
| 6 | **Iberia-PT (pt)** | `lisbon` · `porto` | Lisboa `1106` · Porto `1315` · Braga `0303` (scaffold) | Separate jurisdiction from ES (PDM ≠ PGOU, L-443). |
| 7 | **UK (gb)** | `london` | — **no `gb/` folder yet** | ⚠ **Scaffold gap:** London is baked but no `jurisdictions/gb/` country dir exists. Phase 0 must scaffold `gb/` + `gb-eng/e09000001-city-of-london` (or Greater-London LAU). |
| 8 | **BeNeLux (be, nl)** | `brussels` · `netherlands` (national) | Brussels `bru` · Antwerp `ant` · Liège `lie` (scaffolds) · Amsterdam rides national NL | NL national bake ⊇ Amsterdam/Rotterdam/Utrecht; scaffold an Amsterdam dossier if demoed. |
| 9 | **US (us)** | `newyork` · `sanfrancisco` | New York `3651000` · Los Angeles `0644000` (scaffold) · Chicago `1714000` (scaffold) | ⚠ San Francisco is baked but has **no dossier** — scaffold `us-ca/….-san-francisco` (coverage gap, §2.1). No national US parcel layer. |
| 10 | **Saudi (sa)** | `riyadh` · `jeddah` | Riyadh `ruh` · Jeddah `jed` · Dammam `dmm` (scaffold) | Buildings from Overture (OSM desert). LIVE gov parcel data geo-fenced (nationally blocked). |

**Sequencing across batches:** run **Spain first** as the reference (most mature, already-normalised city
dossiers) to validate the method, then the remaining 9 in parallel. Each batch's exit = its `COUNTRY-RATE.md`
roll-up populated (cheap axes at minimum) + every tackled city has a §5-shaped dossier.

## §5 — Invariants (merge-blocking discipline)

- **INV-1 — Equal shape (C63 §5.1).** Every country/city folder is identical in shape; a file is in the
  standard set or misplaced. Phase 0 restores this before Phase 1.
- **INV-2 — Single-writer matrix.** Only the orchestrator writes the global matrix + executes normalisation
  moves; country agents write only their own `jurisdictions/<cc>/**`.
- **INV-3 — Cited derivation, never a guess (C63 §1.1).** Every mapped cell carries the state it read; a
  hand-typed completeness number is a contract violation.
- **INV-4 — `not-assessed ≠ 0 %` (C63 §1.2).** An unmeasured axis is `not-assessed` + a typed reason.
- **INV-5 — Honesty is the launch gate (C63 §3.1).** `honestyOk`, not a completion threshold, blocks launch;
  a city may ship low-completion + 100 % honest (all cited refusals).
- **INV-6 — No source PDFs, no code changes.** The dossiers link to object-storage PDFs (L-450); the rollout
  is docs-only — no `git mv` by scoped agents, no code edits.

## §6 — Non-goals

- **Not** the scorecard function itself (that is L-648 / SPEC-CITY-COMPLETION-SCORECARD §2–§4). This program
  POPULATES the dossiers by hand-with-citations until the function ships, then re-derives from it.
- **Not** a re-derivation of any axis's own contract (PARCEL=C57, LEGISLATION/ENVELOPE=C58, TERRAIN=C12).
- **Not** a ranking/leaderboard — completeness is descriptive (C63 §7).

---
*Authority: C63 §5/§8.2 + ADR-0282. Composes SPEC-CITY-COMPLETION-SCORECARD. Issue: L-650.*
