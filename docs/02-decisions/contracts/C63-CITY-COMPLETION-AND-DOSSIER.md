# C63 — City Completion Scorecard & Dossier Standard

> **Stamp**: 2026-08-01 · **Status**: DRAFT (schema + scorecard function sequenced). **Weighting RATIFIED**
> (founder, 2026-07-30, L-649 — see §4). **Naming RATIFIED** (L-649): composite master = `RATE.md` /
> `COUNTRY-RATE.md`; legislation sub-rate = `LEGISLATION-RATE.md` (§5, `_TEMPLATE/NAMING-CONVENTION.md`).
> **AMENDED 2026-08-01 (L-664)**: the ENVELOPE-axis vocabulary is now the schema's `EnvelopeConfidence`
> ladder — §3.2 (the ordered ladder + the total tier→weight map), §3.3 (`authoritative` is **not
> reachable**; a constructed determination is capped at 0.70), §4.1, §8.3. See §8.3 for the
> known-violation record and what was routed out to C58.
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
  produces a **real or honestly-constructed** envelope, as opposed to a cited refusal or no pack. This is
  C58 solver coverage, distinct from Axis 2 (which measures the sourcing *evidence*).
- **Input.** `rulepacks/registry.ts` `packsByZone` disposition per clau × the clau's share of buildable
  land (the Barcelona `BARCELONA-COMPLETE-COVERAGE-PLAN.md` +% table; the per-city
  `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY`). A `*_CERTIFIED=false` gate caps the tier a clau can reach,
  but a cited refusal is counted as **honest**, tracked separately (see §3.1).
- **Score.** `Σ (buildable_land_share × tier_weight) / Σ (buildable_land_share)` over the **measured**
  slices, with `tier_weight` read from the **§3.2 ladder** — the schema's `EnvelopeConfidence`
  vocabulary, not a second one. Renormalised over what was measured: unmeasured buildable land shrinks
  the denominator and flags `partial`; it is never zero-filled (§1.5, one level down).
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
- ⭐ **AXIS-6 SUPPLY IS NOW LIVE AND VERIFIED — 2026-08-02, bake run `30736279532`.** The national
  buildings bake **completed, passed the measured-height gate, published to R2, and verified as publicly
  readable AND range-servable** — all 14 steps green. **Spain, Denmark and Köln all cleared the gate.**
  ⚠ **Per C64 §2.13 the measured shares are NOT transcribed here**: read them from the run's
  `── measured-height gate ──` block, or re-derive per city with `tools/context-height-probe/probe.mjs`
  against the shipped R2 tiles. **Always quote the `--half-deg`** — the same city reads materially
  different fractions at different rings, and a heights figure without its bbox is not a number.
- ⚠ **THIS CHANGES THE SUPPLY, NOT YET ANY CITY'S SCORE.** Every city's `heightsLod` block in
  `tools/city-completion/measurements/*.measurements.json` is an explicitly-labelled **PRE-BAKE
  BASELINE** and is now **stale in the favourable direction**. **A city's Axis 6 remains `not-assessed`
  until it is re-probed against the published bytes** — do not edit the counts to predict the outcome
  (§SIZE-IS-NOT-PROVENANCE: a green bake is precisely what the previous attempt produced while shipping
  nothing).
- ⚠ **AXIS 6 GATES NO ENVELOPE AND NO DETERMINATION.** It is context-massing fidelity. It must never
  appear on an envelope critical path, and a rise here is **infrastructure progress, not product
  progress** (C64 §1.1).
- **WHY IT HAD NEVER PASSED BEFORE — three defects, all closed in `e8254bfa`, recorded because each was
  a *silent* failure and the class recurs (ADR-0292):**
  ① `httpGetBuffer` was **documented** *"never throws at the caller boundary"* and had `try/finally`
  with **no `catch`** — all four national sweeps are written against that contract, so a single network
  throw bypassed per-tile handling and **ended an entire country** mid-sweep.
  ② the verification step pinned an npm version **that has never existed**, so the gate **had never once
  executed in its life** and publish was skipped after a full tiling pass.
  ③ **seven of nine** Spanish stamp bboxes were smaller than the region actually baked, making those
  strips **permanently unstampable** — now pinned by
  `tools/context-bake/__tests__/mdsBboxCoversTerrainRegion.spec.ts`.

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

### §3.2 — The ENVELOPE tier ladder (AMENDED 2026-08-01, L-664 — the vocabulary is the SCHEMA's)

> **⚠ AMENDMENT — this section replaces a vocabulary that never existed in code.** Until 2026-08-01 the
> Axis-4 **Score** line above weighted tiers called **`certified`** (1.0) and **`constructed-amber`**
> (0.7). **Neither name has ever been an `EnvelopeConfidence` member.** The schema
> (`packages/schemas/src/site/zoning/ProvenanceFlags.ts`, C58 §1.2) declares six tiers, and the contract
> named none of them. Two consequences, both load-bearing: (a) contract compliance was **unprovable** —
> the contract described a vocabulary nothing implements; (b) the ENVELOPE axis could not be scored
> **even once a coverage measurement existed**, because no defensible tier→weight map could be written.
> That is why Barcelona's Axis 4 reads `not-assessed` and its headline renormalises over 3 of 7 axes —
> and **a city cannot be declared CLOSED on an axis that cannot be scored**, for any city, not just
> Barcelona. Audit row **L-664**.

**THE VERDICT: the SCHEMA is authoritative and this contract was stale.** The governance default is
"when code disagrees with a contract, the code is wrong" — but the exception applies here, and it is
argued rather than assumed: **the code encodes distinctions the contract lost.**

1. **`structured` ≠ `authoritative`, and one word cannot hold both.** *Structured* means the numbers
   were **published** (the authority emits them as data — DK Plandata). *Authoritative* means a
   determination was **issued**. `certified` collapses them, and the collapse is not cosmetic: it would
   let a published-but-undetermined value score a perfect ENVELOPE axis, i.e. read as a compliance
   fact. For a compliance product that is the single most damaging failure mode (C58 §1.2 "Why").
2. **`block-constructed` names a *constructed* determination — precisely what `certified` cannot
   describe.** Barcelona's PGM Art. 242.2 depth is *solved* from real cadastral geometry under an
   accepted rule (ADR-0271). It is real and citable, and it is **not** a municipal certificate. C58
   §1.2/L-518/L-572 make the wording condition normative: it reads "Real · constructed", never
   "certified"/"verified"/"authoritative" (Barcelona `RISK-REGISTER.md` R1). Naming that tier
   `certified` in the scorecard would contradict the render contract it is scoring.
3. **`pipeline-extracted-unverified` has no contract name at all**, and it is a *legal* control: a
   machine-extracted, human-unverified number is **our** error if wrong, so it must never share a tier
   with a curated human estimate (`ORDINANCE-EXTRACTION-PIPELINE.md` §3, L-590f §6). Two shipped packs
   (Madrid PGOUM-97, Córdoba PGOU-2001) publish exactly this tier.
4. **`not-determined` ≠ "a weak envelope."** It is a **cited refusal** — a positive legal answer, 0 %
   complete and **100 % honest** (§3.1). The contract's `cited-refusal` label captured the arithmetic
   but not the vocabulary.

The honest resolution was therefore to **amend this contract**, not to fabricate a translation from the
dead names to the live ones. No runtime alias for `certified`/`constructed-amber` exists or may be
added; the historic mapping below is **read-only prose**, so old references stay legible.

**THE ORDERED LADDER (weakest → strongest).** Single source of truth:
`ENVELOPE_CONFIDENCE_ORDER` in `packages/schemas/src/site/zoning/ProvenanceFlags.ts` (L0, beside the
enum it orders). Contract → schema → packs → scorecard → UI all read this one list.

| # | Tier (`EnvelopeConfidence`) | Meaning | Axis-4 weight | Weight status | Historic C63 name |
|--:|---|---|---:|---|---|
| 6 | `authoritative` | An official, certificate-grade determination was **ISSUED**. | **1.00** | inherited | `certified` |
| 5 | `structured` | The authority **PUBLISHED** the numbers as data (DK Plandata). Published ≠ determined. | **0.90** | ⚠ PROVISIONAL | — (had no name) |
| 4 | `block-constructed` | A real determination **CONSTRUCTED** from real cadastral geometry + an accepted rule (PGM Art. 242.2). Not a certificate. | **0.70** | inherited | `constructed-amber` |
| 3 | `estimated-ruleset` | Resolved from a curated, cited zone-class rule pack. Carries the C58 §1.4 "verify before relying" caveat. | **0.40** | ⚠ PROVISIONAL | — (had no name) |
| 2 | `pipeline-extracted-unverified` | MACHINE-extracted from an ordinance, **not human-verified**. A determination was produced, but it must not be relied on. Permanently below a curated estimate. | **0.10** | ⚠ PROVISIONAL | — (had no name) |
| 1 | `not-determined` | **No determination was made, and that is the answer** — a cited refusal (C58 §1.13). | **0.00** | inherited | `cited-refusal` |
| — | `no-pack` *(sentinel, not a confidence)* | PRYZM's own coverage gap: the registry produced nothing for this land. | **0.00** | inherited | `no-pack` |

⚠ **`not-determined` and `no-pack` score the same and mean opposite things**, so they stay two words:
one is a correct legal answer, the other is our gap. Collapsing them is the §CONTEXT-DATA-HONESTY
failure (L-422/457/467/469) at the scorecard layer. And note the denominator rule (L-656): land the
ordinance removes from private buildability is **excluded** from Axis 4 entirely, never scored zero —
`not-applicable ≠ 0 %`, as `not-assessed ≠ 0 %` (§1.2).

**TOTALITY IS STRUCTURAL, NOT CONVENTIONAL.** The mapping is a `Record<EnvelopeCoverageTier, number>`
(`packages/schemas/src/site/completion/EnvelopeAxisWeight.ts`) with **no default branch**: an unmapped
tier is a `tsc` error in the schema and a hard `throw` in the tool, never a silent 0. Tests assert the
ladder is a *permutation* of `EnvelopeConfidenceSchema` and that the weight map is total over it, so a
seventh tier cannot ship unscored.

### §3.3 — ⚠ IS `authoritative` REACHABLE? NO — and every city's ENVELOPE ceiling depends on it

**Measured on the tree (2026-08-01, L-664): no production code path anywhere assigns
`confidence: 'authoritative'`.** The literal appears only in the enum itself, in membership sets
(`TRUSTED_CONFIDENCE`, the GA gate's `AUTHORITATIVE`), and in test fixtures. The reachable tiers are:

| Tier | Reachable today? | The one path that produces it |
|---|---|---|
| `authoritative` | **NO** | *none* — no assignment exists |
| `structured` | yes | `ZoningRulesEngine` when **every** resolved number came from the provider (DK Plandata) |
| `block-constructed` | yes | `ZoningRulesEngine`, on the `alignment.depthBinding` derivation row (Art. 242.2) |
| `estimated-ruleset` | yes | the engine default; every curated pack |
| `pipeline-extracted-unverified` | pack-declarable (Madrid PGOUM-97, Córdoba) | see the ⚠ below |
| `not-determined` | yes | `zoneRefusal.ts` |

**Consequences, stated plainly:**

1. **For a CONSTRUCTED determination (the Barcelona Art. 242.2 case) the honest ceiling is
   `block-constructed` = 0.70, and "certify it to 1.0" is a lever that does not exist.** Not because
   the code is incomplete, but because the *thing itself* is not a certificate: the engine is pure and
   cannot verify that the block ring it was handed is real cadastral geometry, so it certifies "solved
   under an accepted rule" and nothing more (C58 §1.2 HONEST LIMIT; RISK-REGISTER R1). Reaching 1.00
   on such land would require PRYZM to hold an *issued municipal determination*, which is a
   data-acquisition question, not an engineering one. **Every city whose envelope rests on a
   constructed rule is capped near 0.70 on ENVELOPE, and city-completion ceiling arithmetic must be
   restated accordingly.**
2. **`isIndicativeOnly` is true for every envelope PRYZM has ever produced.**
   `capacityComparison.ts` sets `isIndicativeOnly: envelope.confidence !== 'authoritative'`. Since no
   path assigns `authoritative`, that flag is a constant `true` today. It is *correct* — but it is
   currently a tautology, not a discriminator, and the roadmap should not assume it will ever flip
   without an issued-determination data source.
3. ⚠ **A pack's `defaultConfidence` never reaches the envelope.** `ZoningRulesEngine` hard-codes
   `let confidence = 'estimated-ruleset'` and promotes only to `structured` / `block-constructed`; it
   never reads `JurisdictionZoningContract.defaultConfidence`. So the two OCR-seeded packs that
   correctly declare `pipeline-extracted-unverified` would surface an envelope labelled
   `estimated-ruleset` — a **silent promotion** past the ⚠ red "machine-extracted, unverified" badge
   the render already implements. Logged under **L-664** as a routed defect; it is a C58 engine
   concern, not a C63 one, and is deliberately **not** fixed by this amendment.


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

### §4.1 — TWO weight vectors, and they are not the same kind of thing (L-664)

There are **two** weightings in this contract and conflating them is a category error:

| | What it weights | Config | Status |
|---|---|---|---|
| **The AXIS vector** (§4 above) | how much each of the seven axes contributes to `overall` | `CITY_COMPLETION_WEIGHTS` (`CityCompletionScorecard.ts`) | **RATIFIED** (founder, 2026-07-30, L-649) |
| **The ENVELOPE TIER ladder** (§3.2) | how much each `EnvelopeConfidence` tier contributes to the ENVELOPE axis | `ENVELOPE_AXIS_TIER_WEIGHT` (`EnvelopeAxisWeight.ts`) | 3 values **inherited**, 3 ⚠ **PROVISIONAL** — pending founder ratification (§8) |

Both are config, never hard-coded at a call site (§1.5), and both stamp their version into the record
(`weightsVersion`, `ENVELOPE_AXIS_TIER_WEIGHT_VERSION`) so two cities are never compared across
vectors. **A ratified axis vector over an unratified tier ladder is still an honest number** — the
provenance travels with it — but the ENVELOPE axis MUST NOT be read as final until §8's tier question
is closed.

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

### §5.1 — The EQUAL-SHAPE invariant (a folder is comparable only if it is identical)

The dossier standard exists so any two cities — and any two countries — are **comparable by construction**:
Oslo's folder has the same files in the same places as Barcelona's, so a reviewer, an agent, or the future
scorecard function reads them the same way. This yields the load-bearing rule (the folder analogue of §1.3's
"same ruler" invariant):

> **Every country folder is IDENTICAL in shape to every other country folder; every city dossier is
> IDENTICAL in shape to every other city dossier.** A file that exists is either **in the standard set**
> (§5, §5.2) or it is **misplaced** (belongs in `findings/`, `archive/`, or another standard slot). There is
> no third category. A missing standard file is a scaffold gap, logged — not an alternate shape.

Idiosyncratic top-level files (a city's `BARCELONA-DATA-PIPELINE.md`, a `L-525-*` investigation, a raw
research note) are **not** part of the standard set: they are `findings/` records that landed at the folder
root. Normalisation (moving them to their standard home) is a mechanical, comparability-restoring act, not a
content change. The one-time survey + move plan for the existing tree is
[`jurisdictions/_NORMALIZATION.md`](../../04-reference/jurisdictions/_NORMALIZATION.md) (Phase 0 of the
rollout program, [SPEC-CITY-COMPLETION-ROLLOUT](../../03-execution/specs/SPEC-CITY-COMPLETION-ROLLOUT.md)).

### §5.2 — The country folder standard (the fixed country shape)

A **country** folder `jurisdictions/<cc>/` (ISO 3166-1 alpha-2, lowercase) MUST contain the following, and
nothing else at its root except the subdivision directories and the `regions/`/`topics/`/`sources/`/`findings/`
subfolders below (templates: `jurisdictions/_TEMPLATE/`):

| Slot | File / dir | Purpose | Standard |
|---|---|---|---|
| **composite master** | `COUNTRY-RATE.md` | the per-city 7-axis roll-up — the country "master RATE" (§5, `NAMING-CONVENTION.md`) | this contract §3/§4 |
| README | `README.md` | national data layer: what is solved / achievable / absent | jurisdictions-README §authoring |
| legislation detail | `LEGISLATION-RATE.md` | national structured-fill rate (feeds LEGISLATION) | jurisdictions-README §LEGISLATION-RATE |
| LOD detail | `LOD-RATE.md` | national building/terrain LOD sub-rate (feeds HEIGHTS/LOD) | jurisdictions-README |
| strategy | `COUNTRY-DATA-STRATEGY.md` | the reusable 7-step data-ceiling reasoning | `_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md` |
| plan | `RATE-IMPLEMENTATION-PLAN.md` | the phased national climb | jurisdictions-README |
| resume | `NEXT.md` | where we stopped · blockers · resume steps | JURISDICTION-PLAYBOOK §5 |
| evidence | `sources/SOURCES.md` + `sources/VERIFICATION.md` | national citations + human sign-off (L-449) | C58 §1.6 |
| research | `findings/` | national data-source studies + recon spikes | — |
| region index | `regions/README.md` | regional services, layer names, data currency | jurisdictions-README |
| context topics | `topics/{buildings-lod-height,parks-trees,roads-pedestrian,water}.md` | per-context-layer national source notes (feed CONTEXT/HEIGHTS) | — (optional but standard where present) |
| **subdivisions** | `<cc>-<subdiv>/` | one dir per region/CCAA/state, holding the `<code>-<slug>/` **city dossiers** (§5) | this contract §5 + §1.7 |

**The nesting is fixed:** `jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/` — country → subdivision → city.
The subdivision segment is `<cc>-<subdiv>` (e.g. `es-ct`, `de-by`, `no-03`); the city segment is
`<code>-<slug>` (INE / INSEE / DICOFRE / AGS / LAU code + slug) and MUST equal the pack `jurisdictionId`
identity (§1.7, `jurisdictions/README.md` join-key rule). A city placed directly under `<cc>/` (skipping the
subdivision dir) is misplaced.

### §5.3 — Where `findings/` and `sources/` sit (both levels)

`findings/` and `sources/` appear at **both** the country level and the city level, and mean the same thing at
each: `sources/` holds the **citable** evidence (`SOURCES.md` per-field citations + `VERIFICATION.md` human
sign-off, the L-449 trust gate); `findings/` holds the **substantive investigation records** (the `L-NNN-*`
spikes, data-source studies, OCR pilots) that are not themselves a citation. The rule (§5.1): a research doc or
an `L-NNN` record at a folder **root** is misplaced — its home is that folder's `findings/`. Source PDFs never
belong in either (they live on object storage per L-450; the dossier links to them). `archive/` (superseded
handoffs, one-shot sourcing prompts) is the third permitted subfolder and is optional.

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
- **AMENDED (§3.2/§3.3/§4.1, L-664, 2026-08-01):** the ENVELOPE-axis vocabulary is the SCHEMA's
  `EnvelopeConfidence`, not the never-implemented `certified`/`constructed-amber` pair. The ladder is
  ordered once, in L0, and the tier→weight map is total. The axis is now **scoreable**.
- **OPEN FOUNDER DECISION (1):** whether `derived-levels` earns partial HEIGHTS/LOD credit (§3 Axis 6).
- **OPEN FOUNDER DECISION (2) — L-664:** the **three PROVISIONAL ENVELOPE tier weights** (§3.2):
  `structured` 0.90, `estimated-ruleset` 0.40, `pipeline-extracted-unverified` 0.10. The other four
  (`authoritative` 1.00, `block-constructed` 0.70, `not-determined` 0.00, `no-pack` 0.00) are inherited
  unchanged from the pre-amendment §3 and need no re-ratification. What L-664 settles is the
  *vocabulary* and the *ordering*; the three interior magnitudes are a weighting question of exactly
  the kind the founder ratified for §4.
- **⚠ CEILING FACT (§3.3, L-664):** `authoritative` is **not reachable by any production code path**,
  so a city whose envelope rests on a CONSTRUCTED rule (Barcelona Art. 242.2 and every city that
  copies the pattern) is capped at **0.70** on ENVELOPE. "Certify it to 1.0" is not an engineering
  lever; it needs an *issued* determination as a data source. All ceiling arithmetic must say so.
- **Sequencing:** DATA-SOURCES + TERRAIN + CONTEXT axes are cheap first computes (state already inspectable);
  PARCEL + HEIGHTS/LOD need a sampling run; LEGISLATION + ENVELOPE need the per-clau audit + the L-449 gate.
  ⚠ ENVELOPE's remaining blocker is now **only** the per-clau × buildable-land-share measurement — the
  ruler exists (§3.2); the reading does not. The scorecard tool stays honestly `not-assessed` until a
  breakdown is supplied, and will never synthesise one (§1.1).

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

### §8.2 — Extension L-650: the EQUAL folder standard (§5.1/§5.2/§5.3) + the rollout program

Founder 2026-07-30 (audit **L-650**): before mass execution, the whole city-completion rollout is GOVERNED as a
program — the equal country/city folder standard is made normative (this section's §5.1/§5.2/§5.3), and the
audit→map→plan method is specified as a phased, fan-out-safe program. This EXTENDS this contract; it mints no new
contract (the dossier standard's authority stays here). Ratified by
[ADR-0282](../adrs/ADR-0282-equal-jurisdiction-folder-standard-and-city-completion-rollout-program.md).

- **The equal folder standard** (§5.1/§5.2/§5.3): the country folder shape is now normative alongside the §5 city
  shape; the EQUAL-SHAPE invariant makes "a file is either in the standard set or misplaced" a contract rule.
- **The rollout program** — the phased method (Phase 0 normalise → Phase 1 per-country AUDIT batches → Phase 2 MAP →
  Phase 3 PLAN) is specified in [SPEC-CITY-COMPLETION-ROLLOUT](../../03-execution/specs/SPEC-CITY-COMPLETION-ROLLOUT.md).
  The **fan-out unit is one agent per country/region; the orchestrator is the single writer of the global matrix**
  (the multi-agent single-writer discipline — a scoped agent writes only its own `jurisdictions/<cc>/**`).
- **Phase 0 normalisation** of the existing tree (loose files → their standard home; missing standard files
  scaffolded) is planned, file-by-file, in
  [`jurisdictions/_NORMALIZATION.md`](../../04-reference/jurisdictions/_NORMALIZATION.md) — a plan only; the
  orchestrator executes the moves (no code, no `git mv` by a scoped agent).

### §8.3 — Amendment L-664: ONE confidence ontology (contract → schema → packs → scorecard → UI)

**KNOWN VIOLATION, NOW CLOSED — audit row [L-664](../../04-reference/ISSUE-LOG.md).**
This contract named an ENVELOPE-axis vocabulary (`certified` / `constructed-amber`) that **no code has
ever implemented**. The governance rule is "when code disagrees with a contract, the code is wrong" —
here the exception applied, and it is argued rather than assumed in **§3.2**: the code encoded
distinctions (`structured` vs `authoritative`; `block-constructed`; `pipeline-extracted-unverified`)
that the contract's two names could not express, and collapsing them would let a
published-but-undetermined value read as a compliance fact. **The contract was therefore amended in
place** (this file — no derivative `*-AUDIT.md`, per the governance rule).

**What changed (docs + code, one change-set):**

| | Before | After |
|---|---|---|
| Axis-4 vocabulary | `certified` / `constructed-amber` / `cited-refusal` / `no-pack` — 2 of 4 fictional | the six `EnvelopeConfidence` tiers + the `no-pack` sentinel (§3.2) |
| The ordered ladder | stated only in **L2** `@pryzm/ordinance-extraction/src/confidence.ts`, unreachable from the L0 scorecard | `ENVELOPE_CONFIDENCE_ORDER` in **L0** `ProvenanceFlags.ts`; the L2 rank map now delegates (order unchanged) |
| Tier → axis weight | none that could be applied | `ENVELOPE_AXIS_TIER_WEIGHT` — **total**, no default branch, monotone in the ladder |
| ENVELOPE axis | unscoreable | scoreable; still honestly `not-assessed` until a coverage breakdown is supplied |
| Pack confidences | — | **unchanged**, asserted by `packages/site-parcel-data/__tests__/packPublishedConfidenceUnchanged.test.ts` |

**Deliberately NOT done:** (a) no runtime alias from the historic names — a live translation table is
the "paper over the mismatch" move that was forbidden; (b) no pack's published confidence moved;
(c) no coverage measurement invented (§1.1).

**ROUTED OUT of C63 (C58 concerns, logged under L-664, deliberately not fixed here):**
1. `ZoningRulesEngine` never reads a pack's `defaultConfidence`, so the two OCR-seeded packs
   (Madrid PGOUM-97, Córdoba PGOU-2001) would surface `estimated-ruleset` on machine-extracted
   numbers — a silent promotion past the ⚠ red "machine-extracted, unverified" badge (§3.3 item 3).
2. **C58 §1.2 still calls the enum "complete" at five members**; it has six
   (`pipeline-extracted-unverified` was added later). C62 §3 correctly says "6-tier". C58 owns the
   vocabulary and must be corrected there, in place.
