# AUDIT LANE B — Constraint graph vs procedural · geometry kernel build-vs-adopt · OSS landscape

**Date:** 2026-09-02 · **Auditor stance:** independent principal computational-geometry architect, adversarial, falsification-first · **Repo:** `c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08` (READ-ONLY; nothing in the repo was modified) · **Fresh measurements taken this audit** are marked ⏱; everything else cites a file + line-anchored evidence read this session.

⏱ Two live runs were executed (both pure reads by the tools' own contract):
- `npx tsx tools/ga-gate/check-envelope-never-overstates.ts` → **RC=0 · 6 pack-bearing jurisdictions · 181 zone-solves walked · 138 solved ok · 43 refused · 0 findings**.
- `listJurisdictionCoverage()` enumeration → **115 registered jurisdictions; 6 pack-bearing** (es-08019-barcelona 14 zones, es-28079-madrid 23, es-14021-cordoba 20, es-30030-murcia 16, es-35026-telde 15, sa-ruh-riyadh 2 = 90 zones × 2 edge-classification sets + estimated-default = 181); **109 registered jurisdictions contribute ZERO solves to the gate** — among them `dk`, `fr-75056-paris`, `nl-bestemmingsplan`, `es-46250-valencia`, `es-41091-sevilla`, `es-29067-malaga`, `es-50297-zaragoza`, `ch-national-grundnutzung`, `es-ib-balears`, `es-ct-catalunya`, and ~80 Canary municipalities.

---

## Q1 — CONSTRAINT GRAPH vs PROCEDURAL

### 1.0 First, a frame correction the audit must insist on

**The repo does not ship a constraint graph, and the "declarative evaluator" is not one.** What the E4 wave shipped (`packages/site-parcel-data/src/rulepacks/declarative/`, 1,266 lines across 4 modules + a 135 KB JSON pack) is a **scalar (zone, parameter) resolver**:

- `evaluateDeclarative.ts` (762 ln) — per (zone, parameter, temporal-query): R3 temporal split → R1 basis-ref contract → fact-vocabulary condition gate → tier-6 UNKNOWN split → R1 rank precedence → binding decision through the existing attribution layer (`resolveParameter`, `@pryzm/ordinance-extraction`). Ten typed outcome kinds, of which **seven are refusals**.
- `deriveC58Contract.ts` (173 ln) — compiles the declarative document down to **the same `JurisdictionZoningContract` (C58) the hand-written TS packs produce**, via `JurisdictionZoningContractSchema.parse`. Refusal outcomes **throw** ("failure ≠ absence"); `no-rule`/`unknown-tier6` load as null.
- `factVocabulary.ts` (245 ln) — **exactly 2 declared facts** (`parcelAreaM2`, `ampladaDeVialM`), 7 parameters. Frozen 2026-09-01. **Nothing reads the facts at runtime** — the pilot's migrated rules carry no conditions.

Geometry never enters this layer. Both routes converge on the **one** geometry engine — `ZoningRulesEngine.computeBuildableEnvelope` (1,360 ln) + `envelopeToMassing` (609 ln, STRUCTURAL-SEAM-1). So the as-built comparison is not "graph vs procedural geometry"; it is:

```
A. RULE → declarative doc → evaluator → C58 contract ┐
B. RULE → hand-written TS C58 contract               ├→ ONE shared engine → geometry
C. RULE → per-city procedural bypass (computeParisEnvelope; dkPlandataResolvedPack
          per-parcel pack building; Murcia/Valencia envelope modules) — partially or
          wholly outside the shared engine
```

Route A is proven at **byte parity** with route B for one pack: `lane-e1bc-evaluator-golden-parity.md` records `zones: 10 vs 10 · TS bytes: 25706 · derived bytes: 25706 · BYTE-IDENTICAL: true · field mismatches: 0`, 27 new tests, full-package 3,260 tests green, plus a five-row sever/restore falsification table (each sever names its failing assertion; each restore re-hashed to baseline).

**But the parity covers scalars only.** The lane doc names what was deliberately NOT migrated: the Art. 342.5 amplada-de-vial ladder, the Art. 340.2/343.1 subzona-VI area construction, Art. 343 small-parcel overrides, Art. 255 slope reductions — all stay live TS ("constructions migrate with the body dialect tag, verdict §E LATER"). Conditions are carried as JSON-Logic **but refused, not interpreted** (`condition-not-evaluable`: "silently ignoring a condition converts a conditional rule into an unconditional one"). The §F do-not-add list is explicit: *no DSL, no precedence algorithm in the data model, no new evidence system*.

### 1.1 Expressiveness — as they exist

| Capability | Declarative (A) | Procedural (B/C) |
|---|---|---|
| Scalar caps (height, floors, FAR, coverage, 3 setbacks) | ✅ 7-parameter vocabulary, byte-parity proven | ✅ |
| Temporal validity (legal vs ingestion basis) | ✅ structural (R3; `not-answerable-temporal` is first-class) | ⚠ by convention (dates in comments/ordinanceRef) |
| Precedence | ✅ rank {scheme, level} as a fact; engine-side min-level; refuse on tie / incomparable schemes | ✅ arbitrary, but implicit in code order |
| Zone inheritance | ✅ one level only, cycle-refused (§DEC-2) | ✅ arbitrary |
| Conditions ("applies when parcel < 400 m²") | ⛔ carried but **refused** | ✅ e.g. `resolve20aParcelOverrides` |
| Constructions (value computed from a fact) | ⛔ deferred | ✅ `resolveAlcada20aSubzonaV` (bcnAlcada20aAillada.ts:147): width→(height, floors, edificabilitat) band table **with a band-edge straddle refusal under a measurement-spread guard** — an epistemic guard no rule format sighted anywhere expresses |
| Per-component hybrid answers | ⛔ | ✅ `computeParisEnvelope`: footprint=published ECM polygon, height=min(plafond, ECM graphic, HMC), crown=cited PARTIAL refusal (UG.3.2.4) — per-component structured-vs-refused |
| Scope-dependent withholding | ⛔ | ✅ DK `densityScope` (dkPlandataEnvelope.ts): bebyggelsesprocent at property/planningArea/unknown scope → FAR **withheld with cited reason**, height/storeys still pass |
| Geometric solves | ⛔ (the `geometricRule` triple is reconstructed from 3 scalar rules, `kind:'setback'` only) | ✅ 6 typed engine kinds: setback · alignment · block-derived-alignment · tiered-occupation · explicit-area · occupation-capped-alignment (schemas/src/site/GeometricRule.ts) |

Verdict: **for scalars the declarative form loses nothing and is structurally richer** (temporal + rank + evidence are typed, not conventions). For everything else the procedural form is currently the only one that can speak — and the richest procedural artifacts (the band-edge guard, the DK scope withholding, Paris per-component honesty) are exactly the parts a naive "compile rules to a graph" plan would flatten.

### 1.2 Testability

Declarative wins measurably, and the mechanism is worth naming: **one evaluator, tested once, covers every pack that will ever load through it** (27 tests bind R1/R2/R3/rank/tier-6/chain behaviors for all future documents), while each procedural pack needs its own suite (`packages/site-parcel-data` carries 159 test files / 3,260 tests). The golden-parity harness (3 stacked guards: pre-migration baseline fixture sha-pinned `63f4cb47f0d0…` · per-zone/per-field naming deltas · full byte equality) is the strongest testing artifact in the subsystem. The declared two-copy risk (decl.json restates `bcn20aSubzones.ts` numbers) is held safe **only** by that parity test — the lane doc says so itself ("the parity test is the machinery that makes the two-copy interim safe").

### 1.3 Provenance-carrying

- Declarative: **structural**. Every rule carries source/article/page/derivation/confidence; the evaluator emits an 8-hop evidence chain (zone→plan→document→article→rule→verbatim→calculation→value) that `walkEvidenceChain` verifies mechanically, failing by naming the missing hop. It is the **first producer** for the previously-unwired attribution layer, and a verbatim span is never fabricated (`resolved-unattributed` names the gap). Honest debt: only **10 of 66** migrated rules hold verbatim spans.
- Procedural: provenance by **convention** — `fieldProvenance` maps, `ordinanceRef` strings, derivation rows emitted by the engine (`alignment.depthBinding`, `explicitArea.footprintBinding` → the `block-constructed` confidence stamp, ZoningRulesEngine.ts:~1190). It is a strong convention (this codebase's honesty culture is unusual), but nothing can *walk* a TS function to its article; the citation lives in comments, unreachable by any gate.

### 1.4 Failure modes

- **Declarative:** (i) the expressiveness cliff — what the format cannot say either stays TS (honest, current state) or gets shoehorned into scalars (future risk); (ii) refusal-as-throw in the loader means a single defective rule makes the whole pack unloadable (deliberate for migration; wrong default for production hot-loading later); (iii) vocabulary freeze governance — append-only facts/parameters is a real coordination cost per country.
- **Procedural:** the repo's scar tissue is the catalogue: silent fallback (the strip-slicer lesson — envelope hard-reject fell through to `[]`; now memorialized as §NO-SILENT-FALLBACK in dkEnvelopePlacement.ts:41), the per-city patch treadmill (pre-SEAM-1: each honesty field hand-threaded into the render one defect at a time — envelopeToMassing.ts header), and gate name-blindness (three rival commandManager counters, CLAUDE.md P4 box). Procedural code accumulates honesty only where a defect already burned someone; declarative structure front-loads it.

### 1.5 ⭐ How the never-overstate gate walks each — the decisive asymmetry

`tools/ga-gate/check-envelope-never-overstates.ts` (418 ln) enumerates **live from the registry** — `listJurisdictionCoverage()` → filter `packZoneCodes.length > 0` → `registeredPackZoneCodes()` → `resolveZoneDisposition()` — then solves each pack zone twice (classified/unclassified edges) on one canonical 720 m² rectangle through the REAL `computeBuildableEnvelope` + `envelopeToMassing`, auditing 5 axes (height/FAR/coverage/setback/volume) plus a planted overstating pack (engine teeth) and a tampered-output re-audit (checker teeth, exit 2 if the checker itself is blind). Hard-fail-at-zero from birth; the header forbids it ever acquiring a baseline.

⏱ Measured this audit: **RC=0, 6 jurisdictions, 181 solves, 138 ok, 43 refused.** And the enumeration boundary is now quantified:

1. **109 of 115 registered jurisdictions produce ZERO gate solves.** Paris registers with `packsByZone` DELIBERATELY EMPTY (registry.ts:1671 — "Denmark's shape, not Barcelona's": `computeParisEnvelope` builds per-parcel, live). DK, NL, Balears, Catalunya, Valencia, Sevilla, Málaga, Zaragoza, CH, the Canaries — all live-resolved or refusal-shaped, all invisible to the gate's walk. `computeParisEnvelope` is called from `apps/editor/src/ui/site/siteDispatch.ts` (L5) and is **never executed by any ga-gate**.
2. Within the 6 walked jurisdictions, the geometry-solver kinds mostly land on the **refusal** path (block-derived without a block ring, explicit-area without a footprint → the 43 refusals), so `solveBlockDerivedDepth`/`solveExplicitArea` arithmetic is exercised by the gate only in refusing. Their positive paths are covered by unit suites, not by the invariant gate.
3. The gate names its own value-blindness honestly: "a wrong transcribed number that stays self-consistent passes."

**Conclusion:** the gate can walk exactly what is *data*. A pack that exists as a registered contract is enumerable and auditable by construction; a procedural bypass is auditable only if someone hand-plants a synthetic case for it. **This — not elegance — is the strongest as-built argument for pushing more of the corpus into data**: every rule moved from route C to route A/B adds itself to the 181 automatically. Conversely, every new "answering jurisdiction" in the Paris/DK style silently widens the un-walked surface. Recommendation: a companion gate that enumerates *live-resolved* jurisdictions with per-jurisdiction canonical fixtures (a parcel + a frozen provider payload each), or the never-overstate invariant will structurally lag exactly where the product is heading (DK/FR/NL).

### 1.6 Ordering / precedence / exceptions ("rule B overrides A inside overlay O")

As-built: precedence = `applicability.rank {scheme, level}` — **a fact about the rule, resolved engine-side** (E1A challenge verdict §F.7, quoted in evaluateDeclarative.ts header); min level wins within one scheme; a level tie with disagreeing values **refuses**; ranks from different schemes are **incomparable and refuse**. This is a deliberately non-Turing precedence model, and the refusal-on-tie discipline is anti-overstatement by construction.

The overlay half of the question has a blunt as-built answer: **`ZoningRecord.overlays` is consumed by nothing** — zero references in `ZoningRulesEngine.ts` or `envelopeToMassing.ts` (⏱ grep). "B overrides A inside overlay O" is expressible today only as (i) two rules on one rank scheme with the overlay membership folded into applicability — which requires the **condition seam that currently refuses** — or (ii) a procedural branch. So the declarative story for overlays is *designed* (rank + condition) but half-built.

Assessment: the rank ladder is the right primitive and the graph question is a red herring here. Planning-law precedence is **prioritized default logic** (general rule + exceptions + more-specific-instrument-wins), not constraint propagation. The proven prior art for that shape is Catala (Q3, D27): exceptions first-class, per-article provenance, compile-to-lawyer-readable. What the rank model is still missing vs statutory reality: (a) the condition evaluator (facts exist, evaluation refused); (b) *scoped* ranks — level valid only inside a spatial predicate (overlay), which is rank + condition composed, not a new mechanism; (c) an explicit `overrides(ruleId)` edge for the rare named-exception case, which is cheaper and more auditable than a general partial order. None of this needs a graph engine; all of it needs the condition seam opened, carefully.

### 1.7 Monotonicity — is composition provably shrinking?

The engine's composition is (today) an intersection of caps: per-edge erosion → depth clips → explicit-area ∩ parcel → height = min of candidates → FAR-limited height (`computeFarLimitedHeight`, maxGFA = FAR × parcelArea) → coverage cap → volume = Σ tier area × height. Every operator shrinks or refuses, and the gate's 5 axes are all `≤` assertions. Three qualifications, each evidenced:

1. **Monotonicity was once assumed and was measurably false** — not in the lattice, but in the geometry realizing it. §L-581-MONOTONICITY (blockDerivedDepth.ts:185–224, 292–396): the free-area-vs-depth relation the Art. 242.2 bisection *requires* to be monotone was violated when the mitre-based inset produced garbage ("free area MEASURABLY INCREASED with a DEEPER erosion"). The fix is exemplary: the solver now **checks its own premise across its 40+ bisection samples before publishing** and refuses citing *our* failure, never "the article cannot be satisfied." Lesson for any future graph: intersection-monotonicity of the *rule algebra* does not survive a non-monotone geometric operator; the premise must be gated per solve, not proven once on paper.
2. **Minimum-obligations exist in the vocabulary in exactly one place and it is handled correctly:** `interiorFreeRatio` is a MINIMUM ("com a mínim el 30 per 100", Art. 242.2 — GeometricRule.ts:218). It enters as a constraint on the solver's depth choice (still shrink-only for the envelope). **MIN_FLOORS does not exist anywhere** (⏱ grep: zero hits); density **bonuses** appear only as deliberate refusals-to-fold (NYC `MaxAllwFAR` carried RAW, "bonus-vs-base semantics UNPROBED"; Sevilla top-floor bonus "NOT packed — a conditional bonus"). So the as-built lattice is all-caps *because the curators kept obligations out*, not because the machinery would survive them. When minimum-build obligations, bonuses, or TDRs arrive, they must **not** enter the intersection lattice: model them as a separate annotation/obligation layer that can never enlarge the envelope solid (the `openTop`/posture machinery in envelopeToMassing is the precedent for "assert less, annotate more").
3. **Build-to lines** (alignment kind: `alignmentOffset_m` + `sideTreatment: 'party-wall'`) are handled as relocated insets + depth clips — shrink-only. A true mandatory Baulinie ("must build ON the line") is again an obligation, same treatment.

### 1.8 Cycles — German Abstandsflächen

Repo state: `docs/04-reference/jurisdictions/de/de-nw/05315-koeln/NRW-SETBACK-ENGINE.md` — BauO NRW 2018 §6: setback = **0.4·H** (0.2 GE/GI, 0.25 MK), min 3 m; captured as RESEARCH ONLY, no code; the doc itself states the honest consequence: "does NOT populate a per-zone setback metre… there is a **formula** to code once," and the C58 scalar-setback seat cannot hold it. H-measurement clauses are PENDING a primary-text read.

Adversarial analysis of the "cycle": **for the ENVELOPE (the maximal compliant volume), Abstandsflächen is not a cycle at all.** Two closed routes, both DAG-shaped:
- **Height-field route (no iteration):** the §6 constraint is per-boundary inclined half-spaces — h(x) ≤ dist_i(x)/0.4 for each relevant boundary i, intersected with h(x) ≤ H_zone. The maximal envelope is a **height field over the footprint** = pointwise min of planes. This is exactly the 2.5D-plus-inclined-planes extension Q2 recommends; no fixed point, no cycle. (Caveat: §6's real H-measurement rules — gable contributions, the 16 m privilege, reductions — perturb the coefficients, not the structure.)
- **Fixed-point route (when a design variable feeds back):** setback(H) with H the chosen wall height is a monotone shrinking map; the maximal solution is a bisection — **which the repo already ships as a pattern** (`solveBlockDerivedDepth`: bisect a depth against an admissibility predicate, with the monotonicity premise checked in-run). So a DAG evaluator handles it by admitting a typed **solver node** ("find max t such that predicate(t) holds, premise-checked"), not by admitting cycles.

Verdict: the deferred "body dialect tag" (verdict §E) should mint construction kinds of exactly this shape — table-lookup-with-guard (the amplada ladder), monotone-bisection (242.2, Abstandsflächen-with-feedback), pointwise-min-of-planes (Abstandsflächen closed form, Paris gabarit) — each engine-side, each carrying its own refusal set. **A general constraint-graph/propagation engine is neither needed nor safe**: it would reopen ordering governance (the rank refusal discipline would have to extend to arbitrary edges), forfeit the provable shrink-only composition, and add cycle machinery the domain's actual structure (prioritized defaults + a handful of monotone solves) does not require.

### 1.9 Determinism

No differentiator: both sides commit to byte-determinism (C58 §1.1; evaluator "no eval, byte-deterministic", no clock — the query supplies the date; engine pure, OTel-only surface). The declarative side is *more auditable about it* (schema-parsed at load, one authority for field order), which mattered for byte parity.

### 1.10 Q1 verdict

**RULE → CONSTRAINT → GRAPH → GEOMETRY, as a general architecture: NO — and the repo's own E-batch already litigated this correctly** (§F do-not-add: no DSL, no precedence algorithm in data, conditions refused rather than half-interpreted). **RULE → typed data → shared engine, extended construction-kind by construction-kind: YES**, and it is measurably superior where it exists: byte-parity testability, machine-walkable provenance, structural temporal/rank/unknown handling, and above all **gate enumerability** (§1.5 — the 6-vs-109 split is the number to put in front of the founder). The path is: (1) open the condition seam against the frozen fact vocabulary (JSON-Logic over declared facts, refuse anything else — the machinery is 80% present); (2) mint the first three construction kinds listed in §1.8, porting the amplada ladder as the pilot (its band-edge guard is the acid test — if the format can't say "refuse when the measured width straddles a band edge under the spread guard," it isn't done); (3) give live-resolved jurisdictions their own gate fixtures so route C stops being invisible.

---

## Q2 — GEOMETRY KERNEL: build vs adopt, 2D-first vs 3D-native

### 2.1 Inventory — what exists (⏱ all measured)

**External deps: exactly one.** `manifold-3d ^3.4.1` (root package.json:269; optional peer in geometry-kernel). No turf, no clipper port, no martinez/polygon-clipping, no JSTS, no three-bvh-csg, no earcut as a direct dep — anywhere in any workspace manifest (⏱ grep over git-tracked package.json files + pnpm-lock). `insetPolygon.ts:17-21` states the absence as policy ("the repo has none… no polygon-clipping, martinez, turf, polybooljs, @flatten-js").

**`packages/geometry-kernel` (L2), the BIM kernel:**
- `tolerance.ts` — §C73-EPSILON-POLICY: `EPSILON_ZERO = 1e-9` (dimensionless degenerate-guard), `COINCIDENT_M = 0.001` m (model-space identity). Canonicalized against a measured histogram of **271 rival epsilon declarations** across ~50 values spanning three orders of magnitude; shrink-only ratchet (may tighten, never widen); domain bands (0.05 m snap radii, 0.20 m junction band, 2.0 m room-identity) deliberately kept OUT under their own owners. This is a real epsilon culture, not a folklore constant.
- `pure/polygonOffset.ts` — §W2A-ONE-OFFSET: THE parallel (Minkowski) offset, replacing a centroid-radial dilation whose error was measured per-fixture (spread 0–269 mm on 300 mm requests). Honest limits stated: self-intersection is **detected** (§W2A-FOLD-DETECT → `degenerate: true`), **not resolved** — resolution is "the skeleton's job, Stage 2" (a straight-skeleton is named as the trajectory).
- `pure/polygonBoolean.ts` — §C73-POLY-BOOLEAN: **intersection + union of simple, possibly-concave rings; difference deliberately NOT delivered** ("an unproven boolean silently corrupts every consumer" — it must arrive with its own oracle table); no holes; typed refusals (`self-intersecting-input`, `unresolved-topology`). Algorithm: arrangement + **midpoint classification** + shared-edges-by-endpoint-identity — explicitly chosen over Greiner–Hormann because published footprints share the parcel's street-frontage edge **by construction** (collinear-coincident edges are the *common* case, the exact degeneracy G-H fails on). **No exact predicates, by stated design** ("avoids the classic fragility instead of surviving it"); the COINCIDENT_M merge cost is a **proven area bound** ≤ COINCIDENT_M × (P_A+P_B)/2 (~150 mm² on a 30 m perimeter), verified by a 240-pair differential test arm against the inclusion–exclusion identity.
- `pure/` also: pointInPolygon (even-odd canonical), segmentIntersection (closed-parametric canonical), planarFaceWalk, triangulatePolygon, pointToSegment. `csg/KernelCSG.ts` — manifold-3d WASM adapter, lazily imported (~600 KB), union/subtract/intersect on triangle soup; L4-pure boundary.

**`packages/site-parcel-data/src/geometry/` (the envelope kernel, 5,419 ln, 14 modules):** `insetPolygon` (658) · `blockRing` (804) · `facadeRasantDatum` (735 — the L-584 scar: rasant measured at the façade, not the centroid) · `explicitArea` (574 — multi-part + holes: measured need, **19.4 % of Denmark's 13,629 byggefelter are multi-part, 1.2 % carry holes**, n=1,000 systematic) · `blockDerivedDepth` (402 — bisection + monotonicity gate) · `streetWidth` (423) · `depthBandClip` (311) · `blockConcentricBand` (266) · `buildingLineOffset` (214) · `polygonClip` (149 — convex-only Sutherland–Hodgman, deferring to the kernel boolean) · `occupationCappedDepth` · `ringValidation` · `pointInRingsEvenOdd` · `nativeCrs` (CRS travels with coordinates, never assumed). Plus `@pryzm/site-validators` `polygonArea` consumed by engine and packs.

**The L-581 scar, in numbers (insetPolygon.ts:400–520)** — this is the repo's central robustness lesson and it must gate any adoption decision: the mitre-based inset (offset supporting lines, intersect, then repair) topped out at **55.4 % geometrically sound** on the 65-block Eixample fixture at the 11 m ordinance floor with Art. 242's {front: 11, side: 0} party-wall call — because a dissolved cadastral ring has **49 % of vertices turning < 1° and 20 % of edges < 1 m**, and the mitre identity |M−V| = |a−b|/sin θ throws vertices **630–1,736 m** from legal inputs with no bug anywhere. Douglas–Peucker pre-simplification was measured and does NOT help (49–54 % at 5 cm–1 m). The shipped replacement is the **closed-form capsule-union erosion** (inset = parcel ∖ ⋃ edge_i ⊕ disk(s_i)), with round joins, the a=11/b=0 quarter-turn handled exactly, **every departure from the exact erosion biased INWARD** (inscribed chords, larger-radius hand-over), verified against an independent grid-rasterization oracle. Per-edge *variable* setbacks are native to this construction.

### 2.2 Robustness class needed — the answer the evidence supports

The inputs are dissolved cadastral rings (near-collinear, sub-metre edges) and published footprints that are **collinear-coincident with the parcel by construction**. The legal payload is areas/volumes at planning precision (dm²-scale reporting), under a never-overstate direction-of-error regime. For this domain:

- **Exact predicates (Shewchuk/CGAL-exact) are sufficient but not necessary, and they answer the wrong question.** Exactness removes the refusal class but not the modeling question — source coordinates carry cm-level survey noise, so a 1 mm snap-identity (`COINCIDENT_M`) with a **proven, sub-reportable area bound** and typed refusals is a defensible robustness class, *and it is already implemented and differentially tested*. What exactness cannot give and PRYZM's regime demands is **stated error direction per operation** — the erosion is inward-only; the never-overstate gate checks ≤ on five axes. No off-the-shelf library states error direction at all.
- The discipline to enforce on every NEW primitive (as C73 + the boolean header already do): declared tolerance consumption, an independent oracle (grid rasterization, inclusion-exclusion identity, hand-computed tables), typed refusal over silent repair, and an explicit direction-of-error sentence. Flag for the difference op when it comes: for never-overstate purposes, `A ∖ B` (parcel minus exclusion strip) must bias toward **removing more**, i.e. under-covering — the boolean's symmetric bound is fine at 150 mm² but the sentence must be written.

### 2.3 Is full 3D CSG needed? — No. 2.5D + inclined-plane clipping covers every sighted vocabulary entry.

⏱ The envelope model is strictly 2.5D today: `EnvelopeTier = polygon × [baseHeight_m, maxHeight_m]` (BuildableEnvelope.ts:388–399); zero inclined-plane machinery anywhere (grep). Walking the vocabulary:

| Vocabulary entry | Geometry needed | Covered? |
|---|---|---|
| Setbacks incl. per-edge/party-wall on concave dissolved parcels | capsule-union erosion | ✅ shipped |
| Depth bands / build-to alignment | inset + half-plane clip | ✅ shipped |
| Block-derived depth, concentric bands | erosion + bisection | ✅ shipped |
| Explicit published footprints (multi-part, holes) ∩ parcel | concave boolean | ✅ shipped (+ explicitArea machinery) |
| Stepped profiles (ático setbacks, tiered occupation) | stacked tiers | ✅ shipped (tiers with baseHeight) |
| FAR/coverage/volume caps | arithmetic on areas | ✅ shipped |
| DE Abstandsflächen closed form; FR gabarit-enveloppe / couronnement taper | **height field = pointwise min of inclined planes over the footprint** | ⛔ the one real gap — currently an honest refusal (Paris crown) or no code (NRW) |
| 3D CSG of half-spaces with prisms | — | **Not required for determination.** Required only to materialize a *solid* for display/export once inclined tops exist — and `manifold-3d` is already a dependency (KernelCSG), so that capability costs zero adoption |

Recommendation: extend the envelope model to **prism × piecewise-planar top** (per-tier inclined-plane list, evaluated as a height field). Compute all legal numbers (areas, volumes = integral of the height field) in 2.5D with stated error direction; use manifold only to emit the watertight display/export mesh. Keep the two tolerance regimes (Manifold's internal welding vs COINCIDENT_M) explicitly separate — they are different machines and must never be cross-cited.

### 2.4 Candidate libraries — failure modes and adoption cost

| Candidate | Failure mode for THIS domain | Verdict |
|---|---|---|
| **Clipper2 (JS/WASM ports)** | Integer snap-rounding is robust, but the scaling quantum is an epsilon policy in disguise (must be reconciled with C73's ratchet); its offset does **uniform** delta only — the actual requirement is per-edge variable setback with party-wall zeros, which the shipped capsule construction handles natively and Clipper does not. Port quality varies; wasm supply chain. | **Do not adopt.** The repo's own offset is more expressive where it matters; adopting re-opens the L-581 class at the seam. |
| **polygon-clipping / martinez** | Float Bentley–Ottmann with a long history of degeneracy issues precisely on shared/collinear edges — the domain's *common* case (the boolean header's anti-Greiner–Hormann argument transfers whole). No error-direction statement; sporadic maintenance. | **Do not adopt.** |
| **JSTS** | Full JTS port: huge surface for the two ops needed; its own PrecisionModel to reconcile; GC-heavy object model; no refusal discipline (returns a "fixed" geometry). | **Do not adopt.** |
| **three-bvh-csg** | Render-grade mesh CSG; needs THREE — **a P2 violation by construction outside `packages/renderer-three`** (hard-fail gate). Not robust for legal volumes. | **Ignore.** |
| **CGAL (WASM)** | The gold standard (exact predicates, Minkowski, straight skeleton) — but multi-MB WASM, GPL on the very packages that matter (straight skeleton, Minkowski), a second arithmetic regime to govern, and marshaling cost. | **Not now.** Re-evaluate only if a true weighted straight skeleton becomes load-bearing (roof engine Stage 2) — and then prefer a clean-room Felkel or an external-process wrap over embedding GPL code. |
| **manifold-3d** | Already adopted. ε-welding semantics ≠ COINCIDENT_M; triangulation output carries no error direction — fine for display/export, wrong for legal numbers. | **Keep, in exactly its current role** (L4 mesh booleans; never the determination path). |

### 2.5 Q2 verdict

**Build (keep building), 2D-first — the decision is already made in the code and it is correct.** The repo's kernel is, for this domain, *ahead* of every adoptable JS option on the three axes that matter: per-edge variable erosion with proven inward bias, refusal-typed booleans tuned for the collinear-shared-edge common case with a proven merge bound, and a governed epsilon policy with a shrink-only ratchet. The costed gap list, in priority order: (1) **difference (A ∖ B)** with its own oracle table + an under-coverage direction sentence (unlocks EAL liberation strips, overlay carve-outs); (2) **holes as first-class boolean inputs** (DK's 1.2 % + Madrid/Córdoba multi-part shapes currently route through explicitArea's bespoke machinery); (3) **inclined-plane height-field tops** (unlocks DE §6 closed form and the Paris couronnement, converting two honest refusals into determinations); (4) offset self-intersection **resolution** (straight-skeleton Stage 2) — needed by the roof engine before the envelope path needs it.

---

## Q3 — OPEN-SOURCE LANDSCAPE: adopt / port-patterns / ignore

The repo has already audited most of this field to an unusually high standard — `audit/europe-site-intel/2026-08-31/impl/e5-oss-delta.md` (917 ln, D1–D32 + P-passes), `lanes/oss-and-startups-2024-2026.md`, `impl/e8-extraction-scout.md`. Lane B's verdicts below cite those D-numbers, endorse or sharpen them, and add the two items the audits did not cover (CGA, NYC tooling detail).

| Prior art | Verdict | Grounds |
|---|---|---|
| **XPlanung / XPlanGML** (DE) | **Adopt the STANDARD as an input format; wrap the government validator; the evaluation layer is PRYZM IP** | Write/validate side is mature: SAGisXPlanung (GPL-3, exports 5.3+6.0), xplan-reader/-umring, **ozgxplanung/xPlanBox on openCoDE (AGPL-3.0 — external-process wrap ONLY, never embed)**, deegree-based XPlanValidator. **READ/EVALUATE (XPlanGML → parcel envelope) exists nowhere** — re-confirmed 2026-09-01 (D16); the OSS lane calls the gap "PRYZM-shaped." The deferred repo branch is on record: e8-extraction-scout F-7 — NRW `officialDocument` links resolve through `xplanservices.krzn.de/...getAttachment`; "where XPlanGML exists, **parse the standard, not the PDF**. Not pursued — later lane." Lane B endorses with one sharpening: the XPlanGML *Baugrenze/Baulinie/GRZ/GFZ* attribute model maps almost 1:1 onto the existing `geometricRule` kinds (explicit-area = Baugrenze polygon; build-to = Baulinie), so the DE adapter is a **mapper to the existing C58/geometricRule vocabulary**, not a new engine — the strongest external validation of the ADR-0270 design that exists. |
| **CityGML 3.0 / CityJSON** | **Adopt as interchange only; do NOT import LoD semantics into the envelope model** | Repo verdicts stand (REPORT §H.3: cjio MIT DEPEND-ON pipeline-side; read 2.0 first — 3.0 is a database reality, not a portal reality; FlatCityBuf trial-only). Lane B adds: PRYZM's honesty ladder (confidence tiers + `footprintIsUpperBound` + open-top posture + per-component structured/refused) is **finer-grained than LoD** — LoD grades geometric resolution, not epistemic standing. Map to LoD at export; never inward. |
| **ESRI CityEngine / CGA shape grammars** | **Port two idioms; ignore the architecture** — *not covered by any repo audit (⏱ measured absence); assessed from domain knowledge* | CGA is the closest prior art for rule→geometry *compilation*: rules as data files, split/repeat/comp/extrude productions, attr-driven. Three disqualifiers for PRYZM's problem: (1) **generative, not maximal** — a grammar derives *one* massing; PRYZM's product is the *envelope* (max over all compliant massings). This is exactly the repo's own D20 SimPLU3D verdict ("it SAMPLES compliant buildings rather than COMPILING the envelope") — transfers verbatim. (2) Order-dependent productions with no precedence semantics, no refusal, no provenance — a grammar happily overstates and cannot say why it drew anything. (3) Proprietary (CGA the language; partial OSS reimplementations are research-grade). **Worth porting:** the split/repeat idiom as the authoring surface for *stepped-profile* construction kinds, and the "rule file = versioned data artifact" packaging discipline. |
| **SimPLU3D** (IGN, CeCILL) | **Adapt concepts; cite as prior art; check Brasebin's parameterization before the FR vocabulary freezes** | Repo D20 verdict, endorsed. The one action item is concrete and dated: the FR fact/parameter names should be diffed against Brasebin's PLU parameterization (2014) *before* country #3 freezes the vocabulary. |
| **Delft/3DGI stack** (3dfier, roofer, City4CFD, City3D, val3dity, 3DBAG) | **Consume artifacts; wrap tools as external processes; embed nothing** | Licence wall is uniform: 3dfier/City4CFD AGPL-3, roofer GPL-3 (D9 — DEPEND-ON external process), val3dity GPL-3, City3D dormant (D24). 3DBAG/FlatCityBuf as data. None of it touches the envelope problem — it is reconstruction, PRYZM's *context* layer, already served by context-bake. |
| **NREL COMPASS** (BSD-3) | **Port 4 patterns (~days of work); never the datasets; never a Python service** | e8-extraction-scout §2 verified it mechanically (repo moved to `NatLabRockies/COMPASS`; active 2026-08-31). The patterns: (1) `sentenceNgramContainment` (~30 ln TS; stop-word lists per-country in the grammar adapter); (2) drift threshold keyed off ingestion path (0.9 born-digital / 0.75 OCR) via the existing `DigitisationProfile`; (3) **span-not-value contract** — the LLM retrieves a verbatim span, the deterministic side parses the number (this is already PRYZM's RASE/verbatim doctrine, now with independent production validation); (4) cheap-filter-before-LLM + bounded attempts + honest abandonment. ⛔ Carry the scout's caveat forward: containment is precision-only — an **omitted qualifier scores 1.0**, and for PRYZM omission IS the overstatement (§L-616); the completeness check must be PRYZM's own build (scout §4.3). Citation provenance: PRYZM's sentence-level `RuleCitation` is already strictly stronger than COMPASS's URL-per-record — nothing to adopt there. |
| **Zoning-envelope OSS (incl. NYC)** | **Nothing to adopt — the category is empty for Europe, now proven from two vocabularies** | D—/P-13: category-4 (precomputed buildable envelope) verdict "none found" survived a re-test with envelope/massing/setback vocabulary; corroborated commercially — Autodesk Forma × Zoneomics ships zoning-responsive envelopes **US/Canada only** ("the missing thing in Europe is the DATA SUPPLY, not the envelope UX"). NYC objects: `upzone` (one city, one hackathon), zoning-gpt (Cornell/NZA — licence unspecified, artifacts behind credentialed DVC), ai-zoning (NYU, MIT, no accuracy calibration) — read for question design only (D32). ZoLa and NYC's zoning tools are data/UX, not engines. |
| **Catala** (Inria, Apache-2.0) | ⭐ **Adapt the model — the single most relevant prior art for Q1's precedence question** | D27, endorsed and amplified by Lane B: statute-annotated literate rules, **exceptions/defaults first-class** (prioritized default logic — exactly the "B overrides A in overlay O" semantic), compiles to code AND a lawyer-readable review artifact (the analogue of PRYZM's evidence chain, going the other direction). Read before the rank/condition seam extends to country #3. Not the language — the discipline. |
| **OpenFisca** | **None** (AGPL + population-microsimulation shape) — but proof that "rules-as-code with per-country packages" scales organizationally (D28) | |
| **pyramid_oereb** (BSD-2) | **Consume the data model** — the Swiss ÖREB cadastre (public-law restrictions per parcel, multi-canton production) is the closest governmental analogue of PRYZM's per-parcel restriction report (D23, GREEN confirmed) | |
| **digital-land / planning.data.gov.uk** (MIT) · **hale studio** (LGPL/GPL) · **Geonovum STOP/TPOD** | Adapt collector/spec patterns (D15) · monitor as bake-time ETL only (D12) · cite for NL adapter (D14) | |

**The one-line Q3 synthesis:** parsers, validators, formats, reconstruction, and extraction guardrails all exist and are consumable at their edges (with a hard AGPL/GPL wall around the German and Delft stacks); **the deterministic parcel→envelope evaluator with per-rule provenance exists nowhere else** — the OSS-lane G-verdict survived a second sweep from an orthogonal vocabulary and is corroborated by where Autodesk did and did not ship. PRYZM must not reinvent XPlanGML parsing, CityJSON tooling, or extraction drift-guards; it must not *wait* for anyone to ship the evaluator.

---

## What this audit could NOT establish (honesty section)

1. The declarative test suites (27 tests) were **read, not re-run**; parity claims rest on the lane doc's verbatim transcripts + the code walked this session.
2. The never-overstate gate WAS re-run (RC=0) but its checker-teeth self-test verdict was taken from the exit code, not independently tampered by this audit.
3. `polygonBoolean`'s 240-pair differential bound cites the file header + named test arm; the test was not executed here.
4. The CGA assessment is from domain knowledge — no repo document covers CityEngine (its absence from all three OSS audit docs was itself measured).
5. Which of the 43 gate refusals map to which geometricRule kinds was not broken down per-zone.
6. `esCordobaPGOU2001.ts` (1,320 ln), `esTeldePgo2003.ts`, `esMadridNZ1.ts` were sized and sampled, not read line-by-line; the procedural-pack characterization rests primarily on Paris, DK, Barcelona-20a, and the engine.

## Key file index (all paths absolute under the repo root)

- Declarative: `packages/site-parcel-data/src/rulepacks/declarative/{evaluateDeclarative,deriveC58Contract,factVocabulary,esBarcelona20aAillada.decl}.ts` · parity record `audit/europe-site-intel/2026-08-31/impl/lane-e1bc-evaluator-golden-parity.md`
- Engine + seam: `packages/site-parcel-data/src/ZoningRulesEngine.ts` · `packages/site-parcel-data/src/envelopeToMassing.ts` · `packages/schemas/src/site/GeometricRule.ts` · `packages/schemas/src/site/zoning/BuildableEnvelope.ts`
- Gate: `tools/ga-gate/check-envelope-never-overstates.ts`
- Procedural exemplars: `packages/site-parcel-data/src/rulepacks/{frParisPluBioclimatique,dkPlandataEnvelope,bcnAlcada20aAillada,esBarcelona20aAillada,registry}.ts`
- Kernel: `packages/geometry-kernel/src/{tolerance.ts,pure/polygonOffset.ts,pure/polygonBoolean.ts,csg/KernelCSG.ts}` · `packages/site-parcel-data/src/geometry/{insetPolygon,blockDerivedDepth,blockConcentricBand,explicitArea}.ts`
- OSS audits: `audit/europe-site-intel/2026-08-31/impl/e5-oss-delta.md` · `audit/europe-site-intel/2026-08-31/impl/e8-extraction-scout.md` · `audit/europe-site-intel/2026-08-31/lanes/oss-and-startups-2024-2026.md`
- DE cycle evidence: `docs/04-reference/jurisdictions/de/de-nw/05315-koeln/NRW-SETBACK-ENGINE.md`
