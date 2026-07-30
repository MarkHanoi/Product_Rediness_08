# C63 — City Completion Scorecard & Dossier Standard

> **Stamp**: 2026-07-30 · **Status**: DRAFT (schema + scorecard function sequenced). **Weighting RATIFIED**
> (founder, 2026-07-30, L-649 — see §4). **Naming RATIFIED** (L-649): composite master = `RATE.md` /
> `COUNTRY-RATE.md`; legislation sub-rate = `LEGISLATION-RATE.md` (§5, `_TEMPLATE/NAMING-CONVENTION.md`).
> **Ratified by**: [ADR-0281](../adrs/ADR-0281-city-completion-scorecard-and-dossier-standard.md).
> **Spec**: [SPEC-CITY-COMPLETION-SCORECARD](../../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md).
> **Scope**: the ONE way PRYZM answers *"how complete is city X, across every replication layer?"* — a
> **7-axis, 0–100 % completion scorecard** that is a **total function of data / bake / registry state**
> (never a hand-typed number), plus the **dossier folder standard** every tackled city inherits.
> **Companion to**: [C57](./C57-PARCEL-DATA-LAYER.md) (parcel), [C58](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)
> (envelope), [C60](./C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md) (coverage), [C62](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
> (the confidence/unknown vocabulary this contract composes), [C12](./C12-GEOSPATIAL.md), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md).
> Folds in the axes of `CITY-REPLICATION-STANDARD.md` (the 8-layer "Replicate Barcelona" recipe),
> `ENVELOPE-REPLICATION-STANDARD.md` (ADR-0279) and `BUILDING-HEIGHT-REPLICATION-STANDARD.md`.
> **Key principle**: **P5** (schemas pure) + **§CONTEXT-DATA-HONESTY** — an unmeasured axis is
> `not-assessed` with a typed [C62 `UnknownReason`](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md), never a
> fabricated percentage.

---

## §0 — Why this contract exists

PRYZM tackles cities one at a time; each city is eight independent data/geometry layers
(`CITY-REPLICATION-STANDARD.md`). Today "how far along is Madrid vs Barcelona vs Oslo?" is answered by
prose scattered across a dozen docs, a single per-country `RATE.md` (one number — *structured
dimensional fill*), and tribal memory. There is **no single, comparable, honest, machine-derivable
measure of city completeness**, and no enforced folder shape so a new city's evidence lands in the same
place every time. This contract closes both gaps: it defines the **scorecard** (the measure) and the
**dossier** (the evidence container), and binds them to the honesty spine so a completeness number can
never be a guess.

This contract does **not** replace the per-country `RATE.md` structured-fill number — it *subsumes* it
as the **LEGISLATION axis** input and makes it one of seven comparable axes rather than the whole story.

---

## §1 — Invariants

### §1.1 — Completion is a TOTAL FUNCTION of state, never hand-typed (the core invariant)
Every axis percentage MUST be **computed** by the scorecard function from an inspectable input
(registry rows, baked-tile probes, `SOURCES.md`/`VERIFICATION.md` counts, `heightSources.mjs` `impl`
flags, terrain `layer.json` + round-trip result). A number written directly into a `RATE.md` (the
composite master scorecard face) or the master matrix by a human is a **contract violation** — it is exactly the fabrication
§CONTEXT-DATA-HONESTY forbids (a guess presented as a measurement). The scorecard is reproducible: same
state in → same seven numbers out (mirrors C58 §1.1 / C56 determinism).

### §1.2 — Unmeasured is `not-assessed` with a typed reason, never 0 % and never blank
An axis that has not been computed carries the sentinel **`not-assessed`** plus a
[C62 `UnknownReason`](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) (`not-queried | pending-implementation |
outside-coverage | authority-does-not-publish | adapter-limitation | license-restriction |
geometry-incomplete`). **`not-assessed ≠ 0 %`**: 0 % asserts "measured, and nothing is there";
`not-assessed` asserts "not measured". Conflating them is the L-422/L-457/L-467 "failure vs empty are the
same value" defect at the scorecard layer.

### §1.3 — Seven axes, fixed definitions, identical in every city (comparability)
The axes are exactly the seven in §3, each with the FIXED definition given there. A city MUST NOT
redefine an axis, add an eighth, or drop one — the whole value is that Barcelona's TERRAIN and Oslo's
TERRAIN are the same ruler. Per-city commentary lives in prose, never in a redefined metric.

### §1.4 — Each axis composes C62, and cites its own inputs
Each axis value is a [`DomainConfidence`](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) instance
(`score` = the 0–1 fraction, `unknownReason?`, `validationState`, `provenance`). The scorecard record is
a **composition of `MetadataEnvelope`-wrapped axis values** (C62 §1.5) — the honesty rule lives in the
wrapper, not re-hand-rolled per axis. Every axis MUST record *which* state it read (the "explain-why",
C58 §1.3): a bare `72 %` with no derivation is non-conformant.

### §1.5 — The OVERALL number is a declared weighting, and the weighting is CONFIG not code
`overall = Σ (axis.score × weight[axis])` over the axes that are assessed, **renormalised over the
assessed subset** (an unassessed axis neither counts as 0 nor silently inflates the rest — it shrinks
the denominator and the result is flagged `partial`). The weight vector is a **single config value**
(`CITY_COMPLETION_WEIGHTS`), not hard-coded at the call site, so re-weighting is one edit. The default
vector in §4 is **RATIFIED** (founder, 2026-07-30, L-649).

### §1.6 — Validation state is orthogonal to the score (who checked ≠ how complete)
An axis carries a C62 [`ValidationState`](./C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
(`not-checked → auto-validated → cross-validated → human-reviewed → authority-confirmed`). A 100 % that
is `auto-validated` (the probe ran) is weaker than a 100 % that is `human-reviewed` (a person confirmed
the tiles render correctly). The LEGISLATION and ENVELOPE axes MUST NOT report `human-reviewed` without
a signed `sources/VERIFICATION.md` (the C58 L-449 gate) — completeness never launders the legal sign-off.

### §1.7 — Every tackled city has a dossier of the FIXED shape (§5)
A "tackled" city (any city with a `REGIONS` bake row, a parcel registry predicate, a rule pack, OR a
scaffolded folder) MUST have a dossier at `docs/04-reference/jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/`
containing at least the §5 required file set, with `RATE.md` as the composite master scorecard face. The folder
identity MUST equal the pack `jurisdictionId` (the C58/jurisdictions-README join-key rule). A city that
renders in the app but has no dossier is a coverage gap, logged, not hidden.

### §1.8 — Pure L0 schema; the scorecard reads state but the CONTRACT mandates no rendering
The completion schema lives in `packages/schemas/src/site/completion/` (P5-pure: no THREE/DOM/I-O). The
scorecard *function* that reads registry/tile/dossier state is an impure tool (`tools/` or a build
script), never in the schema package. How a UI displays a scorecard is a consumer decision; this
contract only guarantees the seven words and the arithmetic.

---

## §2 — The two artefacts

| Artefact | What it is | Where | Authority |
|---|---|---|---|
| **The scorecard** | 7 axis scores + overall, computed | `CityCompletionScorecard` schema (L0) + the scorecard function (tool); face = each city's `RATE.md` (composite master; country roll-up = `COUNTRY-RATE.md`); aggregate = the master matrix in `master-execution-tracker.md` | this contract §3/§4 + the SPEC |
| **The dossier** | the city's evidence container | `jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/` | this contract §5 + `jurisdictions/README.md` + `JURISDICTION-PLAYBOOK.md` |

---

## §3 — The seven axes (FIXED definitions)

Each axis is 0–100 % (stored 0–1). For each: the **definition** (what is measured), the **input** (the
state the function reads — this is where the number comes from), and the **typed-unknown default** when
the input has not been probed. **No axis number is ever authored by hand** (§1.1).

### Axis 1 — PARCEL (cadastre geometry quality)
- **Definition.** The fraction of a representative parcel sample that resolves to a **high-quality
  cadastral parcel**: cadastral (not footprint-fallback) **∧** `geometryComplete` **∧** official area
  published **∧** click-inside-ring (containment). Footprint-fallback jurisdictions are **capped low by
  construction** (a footprint is never a legal parcel — C57 §L-640).
- **Input.** `computeParcelConfidence` + `computeParcelMetrics` (`parcelConfidence.ts`) run over an
  N-parcel sample in the city bbox → the distribution of `ParcelConfidence.match` (`high|medium|low`) +
  containment (`pointToParcelM` in-ring), per C57 §2.4. Block-dissolve success (L-635/L-641) contributes.
- **Score.** `high` weight 1.0, `medium` 0.5, `low` 0.0, averaged over the sample. `authorityRank` from
  the provider (`national-cadastre > inspire > osm`).
- **Unknown default.** `not-assessed` / `not-queried` (no sample has been drawn for this city).

### Axis 2 — LEGISLATION (ordinance/rule sourcing depth + VERIFICATION gate)
- **Definition.** The fraction of the city's governing clauses (claus / zones) that are **sourced to a
  cited primary ordinance article AND human-verified** — i.e. the *structured dimensional fill* rate
  (`RATE.md`) hardened by the L-449 sign-off. Answers "how much of the law do we actually hold, cited?"
- **Input.** Count `sources/SOURCES.md` rows carrying a full citation (value·unit·article·document·URL)
  AND covered by a signed `sources/VERIFICATION.md`, over the clau inventory the MUC/zone-GIS returns for
  the municipality. The per-country `RATE.md` structured-fill number is the coarse prior; the per-clau
  count is the fidelity read.
- **Score.** `verified_cited_claus / total_claus_present`. `validationState` = `human-reviewed` only with
  a signed VERIFICATION (§1.6).
- **Unknown default.** `not-assessed` / `not-queried` (clau audit not run) — the honest Barcelona-borrow
  trap (Hospitalet RATE.md).

### Axis 3 — DATA-SOURCES (authoritative feeds wired)
- **Definition.** The fraction of the canonical **source-slot checklist** that is WIRED + LIVE for the
  city: `{ cadastre-parcel, regional-zone-GIS (MUC-equivalent), building-height nDSM/LiDAR, terrain DEM,
  context OSM extract }`. Each slot ∈ `{ live | documented | blocked | none }`.
- **Input.** `heightSources.mjs` `SOURCES[*].impl` + `REGION_SOURCE` (heights + terrain DEM), the parcel
  `registry.ts` predicate (cadastre), the zone-GIS wiring in `siteDispatch.ts` (regional GIS), the
  `bake.mjs` `REGIONS` row (OSM extract). Cross-ref `GEO-DATA-SOURCING-MASTER.md`.
- **Score.** `live` 1.0, `documented` 0.5, `blocked`/`none` 0.0, averaged over the 5 slots.
- **Unknown default.** `not-assessed` / `not-queried`. (Note: this axis is often the CHEAPEST to compute
  — the state is already in `heightSources.mjs`.)

### Axis 4 — ENVELOPE (buildable-envelope solver coverage)
- **Definition.** The fraction of the city's **private-buildable land** for which a registered rule pack
  produces a **certified or honestly-constructed** envelope (green/amber), as opposed to a cited refusal
  or no pack. This is C58 solver coverage, distinct from Axis 2 (which measures the sourcing *evidence*).
- **Input.** `rulepacks/registry.ts` `packsByZone` disposition per clau × the clau's share of buildable
  land (the Barcelona `BARCELONA-COMPLETE-COVERAGE-PLAN.md` +% table; the per-city
  `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY`). A `*_CERTIFIED=false` gate contributes 0 to *certified* but
  a cited refusal is counted as **honest**, tracked separately (see §3.1).
- **Score.** `Σ (buildable_land_share × pack_tier_weight)` where `certified`=1.0, `constructed-amber`=0.7,
  `cited-refusal`=0.0-for-completion (but 100 % for honesty), `no-pack`=0.0.
- **Unknown default.** `not-assessed` / `pending-implementation` where no coverage measurement exists.

### Axis 5 — TERRAIN (baked quantized-mesh present + verified)
- **Definition.** Graduated presence-and-correctness of the Cesium quantized-mesh terrain tileset for
  the city bbox: **0** none · **50** baked but unverified OR baked-with-known-defect (the high-relief
  white-mask, L-636) · **100** baked + independent-decoder round-trip pass (`terrain.verify.mjs`) +
  renders lit-and-correct.
- **Input.** `…/terrain/<city>/layer.json` HTTP 200 + extent match, `terrain.verify.mjs --tileset`
  round-trip result, the white-mask status (`enableLighting` + octvertexnormals presence), and
  `terrainCoverage.ts` `TERRAIN_TILESET_VERSION`.
- **Score.** the 0/50/100 rung as 0.0/0.5/1.0. `validationState` = `cross-validated` when the
  independent decoder passed (C12 §10).
- **Unknown default.** `not-assessed` / `not-queried`.

### Axis 6 — HEIGHTS / LOD (measured vs estimated buildings)
- **Definition.** The fraction of context buildings in the city bbox whose height is **`tagged`** (real
  measured — nDSM / LiDAR / roof / hauteur), as opposed to `derived-levels` (floor-count × 3.2 m) or
  `assumed` (the 9 m carpet). This is the "low assumed fraction" of `CITY-REPLICATION-STANDARD §3.4`,
  hardened by `BUILDING-HEIGHT-REPLICATION-STANDARD` (L-646/L-647).
- **Input.** the per-building `heightProvenance` distribution in the baked PMTiles for the city bbox
  (`heightSources.mjs` stamp result; the in-app context-panel provenance histogram; `contextHeightConfidence()`).
- **Score.** `tagged_count / total_count`. `derived-levels` may contribute a partial (0.5) sub-credit
  **only if** explicitly declared in the SPEC weighting; v1 counts `tagged` only.
- **Unknown default.** `not-assessed` / `not-queried`.

### Axis 7 — CONTEXT (feature-layer checklist)
- **Definition.** The fraction of the context-layer checklist **present + non-empty** for the city bbox:
  `{ buildings, roads, water, parks, landuse, rail, trees, pedestrian, sea }` (9 layers).
- **Input.** the baked layer set (`bake.mjs` `LAYERS` → PMTiles) probed at the city bbox (a `206` + a
  non-empty tile per layer), plus the always-on sea/terrain standing layers (L-637/L-642). Rail / trees /
  pedestrian are the L-642 additions — currently absent everywhere until that bake lands (an honest 0,
  not a fabricated presence).
- **Score.** `present_layers / 9`.
- **Unknown default.** `not-assessed` / `not-queried`.

### §3.1 — The honesty companion: a refusal is 100 % HONEST even at 0 % COMPLETE
Completion and honesty are two different questions (the memory `context-data-honesty-family` spine). A
city where every buildable clau returns a **cited refusal** scores **low on ENVELOPE completion** but
**100 % on honesty** — it fabricates nothing. The scorecard record therefore carries a second scalar per
city, `honestyOk: boolean` (default `true`), that flips `false` ONLY if the city renders a fabricated
value (a number where the state says unknown). **Launch-blocking is `honestyOk`, not a completion
threshold** — PRYZM ships honest-but-incomplete, never complete-but-fabricated.

---

## §4 — The OVERALL number + the weighting (RATIFIED — founder, 2026-07-30)

`overall = Σ (axis.score × weight[axis]) / Σ (weight[axis] over assessed axes)` — renormalised over the
**assessed** subset (§1.5); if any axis is `not-assessed` the result is flagged `partial:true` and the
missing axes named. **The weight vector below is RATIFIED (founder, 2026-07-30, audit L-649).** It is
stored as the config `CITY_COMPLETION_WEIGHTS`, never hard-coded (§1.5) — re-weighting is one edit.

| Axis | Weight (RATIFIED 2026-07-30) | Rationale (why this weight) |
|---|---:|---|
| LEGISLATION | **25 %** | The rule pack is "the whole cost" — human-gated legal sourcing, PRYZM's differentiator (`barcelona-data-pipeline-map`). The most expensive axis is weighted heaviest. |
| ENVELOPE | **20 %** | The core compliance value-prop (C58) — a certified buildable envelope is what the product sells. |
| PARCEL | **15 %** | Without a trustworthy parcel, every downstream number is on the wrong land (C57 / L-641). |
| DATA-SOURCES | **15 %** | Which authoritative feeds are wired gates every other axis's ceiling. |
| HEIGHTS / LOD | **10 %** | Real skyline fidelity; ports cheaply once the national nDSM is mapped. |
| TERRAIN | **10 %** | Relief correctness; ports cheaply via one `REGIONS` row + a bake. |
| CONTEXT | **5 %** | Ports essentially free (OSM extract + bake); lowest marginal cost, lowest weight. |
| **Σ** | **100 %** | |

**Why not equal weights (1/7 each)?** Because the axes are not equally expensive or equally
load-bearing: three axes (context/terrain/heights) "port free" to any covered country while two
(legislation/envelope) are the human-gated cost. Equal weighting would let a city look ~43 % "done" from
the three free axes alone while holding zero certified law — a misleading completeness. The ratified
vector front-loads the expensive, differentiating axes. **RATIFIED by the founder on 2026-07-30 (L-649).**
The one remaining open weighting question is separate: whether `derived-levels` earns partial HEIGHTS/LOD
credit (§3 Axis 6, §8).

---

## §5 — The dossier standard (the fixed folder shape)

Every tackled city's folder MUST contain (templates: `jurisdictions/_TEMPLATE/_CITY/`):

> **Naming (RATIFIED — founder, 2026-07-30, L-649):** the composite master scorecard face is **`RATE.md`**
> (the founder's "master RATE"); the narrower structured legislation/data-fill metric is **`LEGISLATION-RATE.md`**
> (was `RATE.md`). Rule: `RATE.md` is always the composite master; `<AXIS>-RATE.md` is a per-axis detail rate
> that FEEDS it. Full convention: `jurisdictions/_TEMPLATE/NAMING-CONVENTION.md`. The legislation metric's
> C58/L-449 semantics are UNCHANGED — only the filename moved.

| File | Purpose | Standard |
|---|---|---|
| `README.md` | what governs here, pack status, open questions | jurisdictions-README §"authoring contract" |
| **`RATE.md`** | **the 7-axis composite completion scorecard — the master RATE (this contract)** | **§3/§4 + the SPEC** |
| `LEGISLATION-RATE.md` | structured legislation/data-fill rate (feeds Axis 2) | jurisdictions-README §LEGISLATION-RATE standard |
| `LOD-RATE.md` | building/terrain LOD sub-rate (feeds Axis 6) | jurisdictions-README |
| `NEXT.md` | where we stopped · blockers · TRIP-WIRES · resume steps | JURISDICTION-PLAYBOOK §5 |
| `ENVELOPE.md` | the L3 envelope status (feeds Axis 4) | ENVELOPE-REPLICATION-STANDARD |
| `HEIGHT.md` | the building-height status (feeds Axis 6) | BUILDING-HEIGHT-REPLICATION-STANDARD |
| `RISK-REGISTER.md` | the fail-safe risk log (the honesty guardrails) | Barcelona RISK-REGISTER pattern |
| `RATE-IMPLEMENTATION-PLAN.md` | how to raise the (master) rate | jurisdictions-README |
| `sources/SOURCES.md` | per-field citations (feeds Axis 2) | jurisdictions-README §authoring |
| `sources/VERIFICATION.md` | the human sign-off (L-449; gates Axes 2/4 `human-reviewed`) | C58 §1.6 |
| `findings/` | the substantive L-NNN investigation records | — |

A **country** folder carries the roll-up `COUNTRY-RATE.md` (the per-city matrix for that country, same
axes — the country composite master) + `README.md` (national data layer) + `LEGISLATION-RATE.md` (national
structured-fill). Templates: `jurisdictions/_TEMPLATE/` + `_TEMPLATE/NAMING-CONVENTION.md` +
`_TEMPLATE/MASTER-RATE-TRACKER.md`.

---

## §6 — CI gate (planned)

`tools/ga-gate/check-city-completion.ts` (SHOULD, sequenced): (a) fails any `RATE.md` (composite master) whose axis
cells are hand-authored numbers not emitted by the scorecard function (§1.1 — detected by a required
`<!-- generated-by: scorecard vN … -->` provenance stamp + a re-run diff); (b) fails a city that renders
a value while its scorecard says the backing axis is `not-assessed` / refusal (the `honestyOk` gate,
§3.1); (c) fails a tackled city with no dossier of the §5 shape. Until wired, this is a soft
review-discipline gate. Mirrors the C58 §1.4 fidelity-label gate + the L-647 `check-height-fidelity.ts`.

---

## §7 — Relationship to existing docs (folds in, does not duplicate)

- **`CITY-REPLICATION-STANDARD.md`** — the 8-layer recipe; its L1–L8 layers map onto the 7 axes (L1/L2→PARCEL,
  L3→LEGISLATION+ENVELOPE, L4→CONTEXT, L5→HEIGHTS/LOD, L6→TERRAIN, DATA-SOURCES spans L1/L3/L5/L6). This
  contract is the *measure* of that recipe's per-city completeness.
- **`ENVELOPE-REPLICATION-STANDARD.md`** (ADR-0279) — the L3 authority; the ENVELOPE axis reads its state.
- **`BUILDING-HEIGHT-REPLICATION-STANDARD.md`** (L-646) — the HEIGHTS/LOD authority; that axis reads its state.
- **`LEGISLATION-RATE.md`** (per country/city; was `RATE.md` before L-649) — the structured-fill number; becomes the LEGISLATION axis input, not a rival to the composite master `RATE.md`.
- **`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md`** — the jurisdiction WHAT/WHEN axis; the completion matrix is its
  per-city quantitative face and links back to it.
- **C62** — the confidence/unknown vocabulary each axis is an instance of; C63 is a *consumer*, not a rival scale.

---

## §8 — Status & open decisions

- **DRAFT.** The schema + scorecard function are sequenced (SPEC §4), not yet shipped — so today **every
  matrix cell is honestly `not-assessed` / `pending-implementation`** (§1.2). This is the correct
  current state, not a shortfall: the contract defines the ruler before any city is measured with it.
- **RATIFIED (§4):** the `CITY_COMPLETION_WEIGHTS` weight vector — founder, 2026-07-30 (L-649).
- **RATIFIED (§5/§8.1):** the RATE naming convention — composite master `RATE.md` / `COUNTRY-RATE.md`,
  legislation sub-rate `LEGISLATION-RATE.md` (founder, 2026-07-30, L-649).
- **OPEN FOUNDER DECISION:** whether `derived-levels` earns partial HEIGHTS/LOD credit (§3 Axis 6).
- **Sequencing:** DATA-SOURCES + TERRAIN + CONTEXT axes are cheap first computes (state already inspectable);
  PARCEL + HEIGHTS/LOD need a sampling run; LEGISLATION + ENVELOPE need the per-clau audit + the L-449 gate.

### §8.1 — Extension L-649: "master RATE" naming + tracker template + audit→map→plan

Founder 2026-07-30 (audit **L-649**) asked for a "master RATE file per city and per country + a master RATE
tracker under template, with sections cross-referencing the individual files," executed as **audit → map → plan**.
This EXTENDS this contract.

**NAMING — DECIDED (founder, 2026-07-30): Option B (literal to the ask).** The composite 7-axis master face is
**`RATE.md`** (city) / **`COUNTRY-RATE.md`** (country) — the founder's "master RATE"; the narrower structured
legislation/data-fill metric (the C58 standard that FEEDS the LEGISLATION axis) is renamed **`LEGISLATION-RATE.md`**.
Rule: `RATE.md` is always the composite master; `<AXIS>-RATE.md` (`LEGISLATION-RATE.md`, `LOD-RATE.md`) is a
per-axis detail rate. The legislation metric's C58/L-449 semantics are UNCHANGED — only the filename moved. The
renames were applied to `_TEMPLATE/`, `_TEMPLATE/_CITY/`, and the four shipped Catalan dossiers (Barcelona,
L'Hospitalet, Badalona, Sant Boi); other country/city scaffolds still on the legacy `RATE.md` name are pending
migration (the audit→map→plan phases). Convention master: `_TEMPLATE/NAMING-CONVENTION.md`.
*(Rejected Option A — keep `COMPLETION.md` as the composite + `RATE.md` as the legislation sub-metric — because
the founder wanted the composite literally called "RATE".)*

**STRUCTURE — DONE (L-649):** (1) `_TEMPLATE/NAMING-CONVENTION.md` (the master naming reference) +
`_TEMPLATE/MASTER-RATE-TRACKER.md` (a copyable face of the global `master-execution-tracker.md §CITY-COMPLETION`
matrix) authored; (2) explicit **Dossier index** cross-ref sections added to the city composite master
(`_TEMPLATE/_CITY/RATE.md`) and the country roll-up (`_TEMPLATE/COUNTRY-RATE.md`) — each dossier file listed with
its one-line purpose + the axis it feeds.

**REMAINING (sequenced):** (2) **Phase 1 AUDIT** every tackled country+city cell-by-cell WITH CITED DERIVATION
(honest ahead of the automated scorecard function because each cell cites the state it read, never a guess — §1.1);
(3) **Phase 2 MAP** into the dossiers + roll-ups + global matrix; (4) **Phase 3 PLAN** a per-axis, per-city plan to
drive each section → 100 %.
