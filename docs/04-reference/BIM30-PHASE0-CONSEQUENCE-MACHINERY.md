# BIM 3.0 · PHASE 0C — CONSEQUENCE MACHINERY INVENTORY

**What safe-mode infrastructure exists today, and precisely where it is hard-coded to walls.**

This is a MEASUREMENT, not a design. Phase 1 writes the universal contract; this document is the
measured basis for it. Where an obvious generalisation is visible it is recorded as an
**OBSERVATION** with its evidence, never as a recommendation.

---

## §0 · PROVENANCE

| | |
|---|---|
| Date | 2026-08-12 |
| Branch | `main` |
| HEAD | `2b6368549d03cb3e476d12dfd8a4d3a8906a6c80` (`Wed Aug 12 17:42:01 2026 +0100`) |
| Method | READ-ONLY. Full reads of the eleven consequence modules; `rg` over the repo for every refusal idiom; delegated per-gate read of all 18 certification gates. Nothing was executed, nothing modified. |

Commands whose output is cited below:

```bash
git rev-parse HEAD
rg -n 'NO_DEPENDENCY_INDEX|ENGINE_NOT_AVAILABLE|UNSUPPORTED_ELEMENT_TYPE|STALE_DERIVED_STATE|\
TOPOLOGY_CHANGE_POSSIBLE|OPEN_LOOP|CURVED_WALL_UNSUPPORTED|MISSING_BOUNDING_WALL|PLAN_STALE|\
NO_PLAN_SUPPLIED|APPROVAL_STALE|APPROVAL_UNKNOWN_PLAN|NO_PLAN_AVAILABLE' -g '*.ts'
#   → 204 occurrences across 25 files
rg -n 'wall-unknown-to-joinedTo-writer|graph-unavailable|unknown-element|\
unsupported-relationship|producer-not-instrumented' -g '*.ts'
rg -n 'createWallCreateConsequencePlanner|wallCreatePlannerComposition' -g '*.ts'
#   → the ONLY hit is the file's own header line. See §3, OBSERVATION 3.
```

**The subject files** (line counts at HEAD):

| File | LOC | Layer |
|---|---|---|
| `packages/command-bus/src/consequence.ts` | 743 | L1 — the contract |
| `apps/editor/src/engine/consequence/WallMoveConsequencePlanner.ts` | 711 | L7 |
| `apps/editor/src/engine/consequence/WallCreateConsequencePlanner.ts` | 956 | L7 |
| `apps/editor/src/engine/consequence/ConsequencePreviewService.ts` | 122 | L7 |
| `apps/editor/src/engine/consequence/ConsequenceExecutionService.ts` | 642 | L7 |
| `apps/editor/src/engine/consequence/consequencePreviewServiceComposition.ts` | 52 | L7 |
| `apps/editor/src/engine/consequence/consequenceExecutionServiceComposition.ts` | 207 | L7 |
| `apps/editor/src/engine/consequence/wallMovePlannerComposition.ts` | 35 | L7 |
| `apps/editor/src/engine/consequence/wallCreatePlannerComposition.ts` | 36 | L7 |
| `apps/editor/src/ui/consequence/confirmationPolicy.ts` | 193 | L7 |
| `apps/editor/src/ui/consequence/ConfirmationFlow.ts` | 322 | L7 |
| `apps/editor/src/ui/consequence/ConfirmationCard.ts` | 279 | L7 |
| `apps/editor/src/ui/consequence/confirmationFlowComposition.ts` | 126 | L7 |
| `apps/editor/src/ui/canvas/ConsequencePreviewOverlay.ts` | 312 | L7 |
| `apps/editor/src/ui/canvas/ConsequenceReportView.ts` | — | L7 |
| `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` | 804 | L7 |

---

## §1 · THE CONTRACT TYPES — generic vs wall-bound

**Headline verdict: the L1 contract is 100 % element-agnostic. Every exported type in
`packages/command-bus/src/consequence.ts` is generic; NOT ONE of them names a wall in its
type shape.** The word "wall" appears in that file only inside prose comments and one worked
example string (`'regeneration of rooms adjacent to wall-42'`, line 78) — never in a field, a
union member, or a type parameter default.

| # | Type | Line | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `ElementId = string` | :41 | **GENERIC** | Comment names `wall-…` as an *example* of an id shape; the type is `string`. |
| 2 | `ElementSet = readonly ElementId[]` | :44 | **GENERIC** | — |
| 3 | `UndeterminedReason` (4-member closed union) | :64–68 | **GENERIC** | `NO_DEPENDENCY_INDEX` / `ENGINE_NOT_AVAILABLE` / `UNSUPPORTED_ELEMENT_TYPE` / `STALE_DERIVED_STATE`. `UNSUPPORTED_ELEMENT_TYPE` is *explicitly* an element-kind-parametric reason (:59). |
| 4 | `UndeterminedImpact` | :75–86 | **GENERIC** | `scope` is a free-text human string; `reason`; optional `detail`. |
| 5 | `ImpactDetermination` | :98–104 | **GENERIC** | `determined \| undetermined`. The known-vs-unknown discriminator; no kind coupling. |
| 6 | `ConsequenceRefusal` | :115–120 | **GENERIC** | `{elementId?, reason: string}`. Free-text reason — see §2 OBSERVATION 5. |
| 7 | `RefusalSet` | :123 | **GENERIC** | — |
| 8 | `ConsequenceCommandRef` | :128–133 | **GENERIC** | `type: string` + `payload: unknown`. `'wall.move'` appears only as a doc example (:130). |
| 9 | `TopologyDelta` | :136–140 | **GENERIC** | added/removed/modified over `ElementSet`. |
| 10 | `ViolationRef` | :143–147 | **GENERIC** | ruleId / elementId / message. |
| 11 | `ValidationDelta` | :156–159 | **GENERIC** | — |
| 12 | `RegenerationPlan` | :166–169 | **GENERIC** | — |
| 13 | `MetricName` (9-member closed union) | :187–196 | **GENERIC but SUPPLY-BOUND** | area/perimeter/volume/height/width/length/thickness/offset/count. Header states the union enumerates only what *a planner in this repo can compute today* (:178–185) — i.e. it grows per family, by contract edit. Nothing wall-named. |
| 14 | `MetricUnit` | :205 | **GENERIC** | `m \| m2 \| m3 \| count`, SI-only per C73. |
| 15 | `PredictedVertex` | :234–237 | **GENERIC but 2-D** | `{x, z}` world-XZ metres. No `y`. See OBSERVATION 1. |
| 16 | `PredictedGeometry` | :255–268 | **GENERIC but PLAN-POLYGON-SHAPED** | `polygon` + `area` + `perimeter` + `centroid` + 2-D `boundingBox {minX,minZ,maxX,maxZ}`. Room-shaped by *construction*, not by naming. See OBSERVATION 1. |
| 17 | `MetricTransition` | :296–303 | **GENERIC** | `{elementId, metric, before?, after, unit}`. |
| 18 | **`ConsequencePlan`** | :314–382 | **GENERIC** | 15 fields; every one is `ElementSet`/`ImpactDetermination`/delta-shaped. No wall field, no wall type param. |
| 19 | `PredictedVsActual` | :391–402 | **GENERIC** | — |
| 20 | `ActualConsequences` | :409–413 | **GENERIC** | — |
| 21 | `UndeterminedOutcome` | :423–437 | **GENERIC** | — |
| 22 | `PlanDivergenceVerdict` | :445–451 | **GENERIC** | `plan-agreed \| plan-fidelity-divergence`. |
| 23 | **`ConsequenceReport`** | :459–551 | **GENERIC** | 14 fields incl. the `*Undetermined` triple (`validationUndetermined` :477, `metricsUndetermined` :498, `geometryUndetermined` :519). |
| 24 | `PlanStaleRefusal` | :565–575 | **GENERIC** | `kind: 'PLAN_STALE'` + 4 hashes + the stale plan as evidence. |
| 25 | `PredictionAbsence` | :583–586 | **GENERIC** | `kind:'absent'`, `reason:'NO_PLAN_SUPPLIED'`. |
| 26 | `ExecutionConsequence` | :595–615 | **GENERIC** | 3 arms: `reconciled \| plan-stale \| unplanned`. |
| 27 | `ReadonlyStoreView` | :627–630 | **GENERIC** | `getAll()` / `getById()` over `unknown`. |
| 28 | `PlanningContext` | :637–640 | **GENERIC** | `getStore(storeId: string)`. Store id is a *string* — `'wall'`, `'room'`, `'door'` are all equally reachable. |
| 29 | **`ConsequencePlanner<TCommand, TPlan>`** | :654–656 | **GENERIC — fully parametric** | `plan(command: TCommand, context: PlanningContext): Promise<TPlan>`. `TCommand` is unconstrained. **The contract itself imposes no wall coupling whatsoever.** |
| 30 | `ConfirmationRequirement` | :661 | **GENERIC** | `none \| recommended \| required`. |
| 31 | `ConfirmationReason` | :668–672 | **GENERIC, OPEN union** | 3 canonical literals + `(string & {})`. The only *open* reason union in the contract. |
| 32 | `ConfirmationPolicy` | :679–682 | **GENERIC** | — |
| 33 | `CommandActor` | :691–695 | **GENERIC** | `human \| ai \| system \| remote`. |
| 34 | `CommandOrigin` | :707–712 | **GENERIC** | — |
| 35 | `CommandApproval` | :719–726 | **GENERIC** | — |
| 36 | `CommandExecutionContext` | :738–742 | **GENERIC** | — |

**Score: 36 exported types · 36 element-agnostic · 0 wall-named.**
All are re-exported from `packages/command-bus/src/index.ts:42–83`.

> **OBSERVATION 1 — `PredictedGeometry` is generic in NAME but room-shaped in STRUCTURE.**
> Evidence: `PredictedVertex` is `{x, z}` with no `y` (:234–237); `boundingBox` is
> `{minX, minZ, maxX, maxZ}` — a 2-D AABB (:262–267); the only three scalars are `area`,
> `perimeter`, `centroid`. A predicted *slab* would fit (also a plan polygon). A predicted
> *stair run*, *roof plane*, *column*, or a wall's own 3-D solid would not — there is no field
> that can carry a height, an elevation, a normal, or a solid. The type does not *say* "room",
> but a second family with 3-D predicted geometry cannot use it as-is. Compare
> `PredictedRoomGeometryApplier` (`ConsequenceExecutionService.ts:152`) which *is* named for
> rooms and consumes exactly this type.

> **OBSERVATION 2 — `ConsequencePlanner<TCommand>` is the generic hinge, and it is already
> in place.** `plan(command: TCommand, context: PlanningContext)` (:654–656) has no wall
> constraint. Every wall coupling measured in §3 lives strictly ABOVE this line, in L7
> composition. That is the single most important measured fact in this document: **L1 does not
> need to change to admit a second family.**

---

## §2 · THE CONSOLIDATED UNDETERMINED / REFUSAL VOCABULARY

This is the artefact Phase 1 needs. Today the reason strings are scattered across **six**
modules in **five different shapes**, only one of which is the contract's own union.

### 2.1 · The contract union (the only one `UndeterminedImpact.reason` accepts)

`packages/command-bus/src/consequence.ts:64–68` — `UndeterminedReason`, 4 members, CLOSED:

| Reason | Line | Meaning (verbatim from the header, :52–62) |
|---|---|---|
| `NO_DEPENDENCY_INDEX` | :65 | The substrate that would answer this (dependency wiring, `joinedTo`, …) has not landed; roadmap phase named in `detail`. |
| `ENGINE_NOT_AVAILABLE` | :66 | The engine exists but is not reachable in this runtime (not composed, not installed, boot order). |
| `UNSUPPORTED_ELEMENT_TYPE` | :67 | The planner has no rule for this element kind. |
| `STALE_DERIVED_STATE` | :68 | The derived state this branch reads is known out-of-date, so an answer would be a guess. |

**Measured usage of each member across the whole repo:**

| Reason | Producing sites | Where |
|---|---|---|
| `ENGINE_NOT_AVAILABLE` | ~14 | `WallMoveConsequencePlanner.ts:393, 433, 507, 621`; `WallCreateConsequencePlanner.ts:365, 454, 478, 517, 591, 802, 853`; `ConsequenceExecutionService.ts:356, 388, 428, 440, 529` |
| `STALE_DERIVED_STATE` | ~9 | `WallMoveConsequencePlanner.ts:211, 219, 292(mapped), 576, 606, 634`; `WallCreateConsequencePlanner.ts:268, 283, 297, 659, 674, 753` |
| `NO_DEPENDENCY_INDEX` | 4 | `WallMoveConsequencePlanner.ts:292(mapped), 528`; `WallCreateConsequencePlanner.ts:737, 894` |
| **`UNSUPPORTED_ELEMENT_TYPE`** | **0 production sites** | Declared at :67, referenced only in `packages/command-bus/__tests__/consequence-types.test.ts`. **The one member reserved for element-kind refusal has never been emitted.** |

> **OBSERVATION 3 — `UNSUPPORTED_ELEMENT_TYPE` has zero producers.** This is the exact reason
> the contract minted for "the planner has no rule for this element kind" — the refusal a
> universal, multi-family system emits constantly — and no code path produces it. Today an
> unrecognised command yields `null` instead (§6). Evidence: the grep above returns only the
> declaration and the type test.

### 2.2 · The room-predictor refusal union — a SECOND, disjoint vocabulary

`packages/room-topology/src/predictRoomGeometry.ts` — `RoomPredictionRefusal`, **8 members,
CLOSED, and structurally incompatible with `UndeterminedReason`**:

| Reason | Line | Meaning |
|---|---|---|
| `NO_WALL_LINKAGE` | :110 | The room declares no wall linkage at all. |
| `MISSING_BOUNDING_WALL` | :112 | A declared bounding wall is absent from the supplied wall set. |
| `CURVED_WALL_UNSUPPORTED` | :114 | A bounding wall is curved; arc prediction out of scope. |
| `DEGENERATE_BOUNDARY` | :116 | Fewer than 3 usable segments — nothing that could be a ring. |
| `OPEN_LOOP` | :118 | The traced chain does not close within `COINCIDENT_M`. |
| `SELF_INTERSECTING` | :120 | The predicted ring self-intersects. |
| `COLLAPSED` | :122 | The predicted ring has (near-)zero area. |
| `TOPOLOGY_CHANGE_POSSIBLE` | :128 | The move may SPLIT or MERGE rooms; only re-detection (a mutation) can resolve. |

Emitted at `:274, :278, :283, :292, :306, :312, :316, :321`.

**These 8 are LOSSILY DOWNCAST into the contract's 4 at one site**, and the mapping is a
single ternary:

```ts
// WallMoveConsequencePlanner.ts:292
reason: p.reason === 'TOPOLOGY_CHANGE_POSSIBLE' ? 'NO_DEPENDENCY_INDEX' : 'STALE_DERIVED_STATE',
detail: `${p.reason}: ${p.detail}. …`   // :293 — the precise reason survives only as PROSE
```

> **OBSERVATION 4 — seven distinct geometric refusals collapse into `STALE_DERIVED_STATE`.**
> `CURVED_WALL_UNSUPPORTED`, `OPEN_LOOP`, `SELF_INTERSECTING`, `COLLAPSED`,
> `DEGENERATE_BOUNDARY`, `MISSING_BOUNDING_WALL`, `NO_WALL_LINKAGE` all become the same typed
> value. A consumer branching on `reason` cannot distinguish "the room collapsed to zero area"
> from "a cache is stale" — the precise reason is recoverable only by string-parsing `detail`,
> which is the same class of defect as the `regeneration.skipped[].reason` stopgap that
> `consequence.ts:271–295` documents as retired.

### 2.3 · The graph-query refusal union — a THIRD vocabulary

`packages/ai-host/src/graph/GraphQueryService.ts:91–93` — `GraphQueryRefusalReason`:
`'graph-unavailable' | 'unknown-element' | 'unsupported-relationship'`.
Emitted at `:210, 219, 233, 264, 276, 289, 338, 351, 360`; re-emitted at
`apps/editor/src/engine/graphQueryBusHandlers.ts:198, 206`. **Lowercase-kebab convention** —
the contract's is SCREAMING_SNAKE. `unknown-element` and `unsupported-relationship` are near-
duplicates of `UNSUPPORTED_ELEMENT_TYPE`'s intent with no typed bridge between them.

### 2.4 · The semantic-graph joinedTo refusal — a FOURTH

`packages/core-app-model/src/SemanticGraph.ts:161, 338` — the single literal
`'wall-unknown-to-joinedTo-writer'`. **This is the one reason string in the entire vocabulary
that NAMES A WALL in its identifier.** It reaches the plan only as free-text `detail`
(`WallMoveConsequencePlanner.ts:408`, `detail: probe.detail`).
`WallCreateConsequencePlanner.ts:24` documents *not* using this reader precisely because it
refuses for every create, forever.

### 2.5 · The provenance-unknown union — a FIFTH

`packages/schemas/src/provenance/ValueOrigin.ts:167, 191` — `producer-not-instrumented`
(and siblings). Consumed by `apps/editor/src/engine/provenance/ElementProvenanceIndex.ts:268,
462` and gated by `tools/ga-gate/check-provenance-not-invented.ts:225`. Lowercase-kebab.

### 2.6 · The execution/consent refusal kinds (a SIXTH shape: `kind`, not `reason`)

These are discriminated-union *tags*, not `reason` fields, and they live in three files:

| Kind | Declared | Meaning |
|---|---|---|
| `PLAN_STALE` | `consequence.ts:566` | The plan's `planHash` did not re-verify against the live pre-state. |
| `NO_PLAN_SUPPLIED` | `consequence.ts:585` (as `PredictionAbsence.reason`) | Executed with no plan; the prediction side is a typed absence. |
| `APPROVAL_STALE` | `ConfirmationFlow.ts:78` | The model moved while the card was on screen; the approval no longer applies. |
| `APPROVAL_UNKNOWN_PLAN` | `ConfirmationFlow.ts:98` | The approval names a plan the flow is not holding (replay/forgery/superseded). |
| `NO_PLAN_AVAILABLE` | `ConfirmationFlow.ts:106` | No planner answers for this command type — the flow refuses to ask for approval of what it cannot describe. |

Plus **two untyped sentinel strings** minted inline in the execution service:

```ts
// ConsequenceExecutionService.ts:239
stale = { livePlanHash: 'UNVERIFIABLE:no-planner-for-type',
          liveStateHash: 'UNVERIFIABLE:no-planner-for-type' };
```

> **OBSERVATION 5 — `'UNVERIFIABLE:no-planner-for-type'` is a reason encoded as a hash.**
> `ConsequenceExecutionService.ts:239` reports "there is no planner for this type" by writing a
> sentinel string into two fields typed `string` that everywhere else hold FNV-1a hashes. A
> consumer comparing hashes sees a mismatch and reports `PLAN_STALE`; the actual fact — *no
> planner exists for this family* — is `UNSUPPORTED_ELEMENT_TYPE` wearing a hash's clothes.
> This is the single clearest instance of the missing typed reason (§2.1) forcing an
> improvisation, and it is on the multi-family path by construction.

### 2.7 · THE CONSOLIDATED VOCABULARY — all reason values, one table

**23 distinct reason values across 6 modules and 5 naming conventions.**

| Value | Shape | Convention | Home module | Layer | Reaches `ConsequencePlan` typed? |
|---|---|---|---|---|---|
| `NO_DEPENDENCY_INDEX` | `reason` | SCREAM | command-bus | L1 | ✅ native |
| `ENGINE_NOT_AVAILABLE` | `reason` | SCREAM | command-bus | L1 | ✅ native |
| `UNSUPPORTED_ELEMENT_TYPE` | `reason` | SCREAM | command-bus | L1 | ✅ native — **0 producers** |
| `STALE_DERIVED_STATE` | `reason` | SCREAM | command-bus | L1 | ✅ native |
| `NO_WALL_LINKAGE` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `MISSING_BOUNDING_WALL` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `CURVED_WALL_UNSUPPORTED` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `DEGENERATE_BOUNDARY` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `OPEN_LOOP` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `SELF_INTERSECTING` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `COLLAPSED` | `reason` | SCREAM | room-topology | L2 | ❌ → `STALE_DERIVED_STATE` |
| `TOPOLOGY_CHANGE_POSSIBLE` | `reason` | SCREAM | room-topology | L2 | ❌ → `NO_DEPENDENCY_INDEX` |
| `graph-unavailable` | `reason` | kebab | ai-host | L2 | ❌ never — separate channel |
| `unknown-element` | `reason` | kebab | ai-host | L2 | ❌ never |
| `unsupported-relationship` | `reason` | kebab | ai-host | L2 | ❌ never |
| `wall-unknown-to-joinedTo-writer` | `reason` | kebab, **wall-named** | core-app-model | L2 | ❌ → prose in `detail` |
| `producer-not-instrumented` | `unknownReason` | kebab | schemas | L0 | ❌ never |
| `PLAN_STALE` | `kind` | SCREAM | command-bus | L1 | n/a — execution arm |
| `NO_PLAN_SUPPLIED` | `reason` | SCREAM | command-bus | L1 | n/a — execution arm |
| `APPROVAL_STALE` | `kind` | SCREAM | apps/editor UI | L7 | n/a — consent arm |
| `APPROVAL_UNKNOWN_PLAN` | `kind` | SCREAM | apps/editor UI | L7 | n/a — consent arm |
| `NO_PLAN_AVAILABLE` | `kind` | SCREAM | apps/editor UI | L7 | n/a — consent arm |
| `UNVERIFIABLE:no-planner-for-type` | **hash sentinel** | ad-hoc | apps/editor engine | L7 | ❌ — see OBSERVATION 5 |

Plus the **free-text** channel: `ConsequenceRefusal.reason: string` (`consequence.ts:119`) —
deliberately untyped, because it must carry the producer's own numbers verbatim
(`confirmationPolicy.ts:150–160` states the rule: surface the producer's sentence, never
re-derive it). And `ConfirmationReason` (`consequence.ts:668–672`) is an OPEN union: 3
canonical literals plus `(string & {})`; the live producers add
`plan_refuses_part_of_the_operation`, `creates_rule_violations`, `broad_impact`
(`confirmationPolicy.ts:134–141`), so **6 confirmation reasons exist against 3 declared**.

---

## §3 · WALL-SPECIFIC COUPLINGS IN THE PIPELINE

Classification key:
**(a)** genuinely wall-specific logic · **(b)** a type parameter that should be generic ·
**(c)** a registry keyed by command type that ALREADY works generically.

### 3.1 · `ConsequencePreviewService.ts` (122 LOC) — the front door

| # | Site | Line | Class | Note |
|---|---|---|---|---|
| 1 | `import type { WallMoveCommand } from './WallMoveConsequencePlanner.js'` | :35 | **(b)** | An L7 planner's command type imported by the generic routing service. |
| 2 | `type WallMovePayload = WallMoveCommand['payload']` | :62 | **(b)** | — |
| 3 | `interface UpdateBaselinePayload {wallId, newBaseLine, prevBaseLine}` | :65–69 | **(a)** | The `wall.updateBaseline` verb's literal payload shape. |
| 4 | `export function normalizeToWallMove(command): WallMoveCommand \| null` | :81–93 | **(a)** | Hard-coded: `if (type === 'wall.move')` (:82), `if (type === 'wall.updateBaseline')` (:87), `return null` otherwise (:92). **This is the verb→semantic map for the ENTIRE system, and it knows exactly two verbs.** |
| 5 | **`ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>`** | **:103** | **(b) — THE BLOCKER** | The registry key is `string` (generic) but the VALUE is hard-typed to `WallMoveCommand`. A `ConsequencePlanner<RoomRegenerateCommand>` cannot be inserted without a cast. **This single type parameter is what prevents any second family from registering.** |
| 6 | `preview(): Promise<ConsequencePlan \| null>` | :107–116 | **(b)** | Return type. See §6. |
| 7 | `private normalize()` delegating to :81 | :119–121 | **(a)** | — |

**Not coupled:** `PreviewCommand` (:45–48) is `{type: string, payload: unknown}` — fully
generic. `ConsequencePreviewProvider` (:56–59) is generic except for the `null` return.

### 3.2 · `ConsequenceExecutionService.ts` (642 LOC)

| # | Site | Line | Class | Note |
|---|---|---|---|---|
| 8 | `import type {WallMoveCommand}` / `import {stableStringify}` from the wall planner | :61–62 | **(b)** + **(c)** | `stableStringify` is a pure, generic hashing helper that merely *lives* in the wall planner file. |
| 9 | `import {normalizeToWallMove, type PreviewCommand}` | :63 | **(a)** | — |
| 10 | `planners: ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>` | :92 | **(b)** | Same blocker as #5, second copy. |
| 11 | `DEFAULT_READBACK_STORES = ['wall','room','door','window','stair']` | :185 | **(a)-ish** | Five *element-family* store ids hard-coded. Overridable via `deps.readbackStores` (:100), so it is a **default**, not a constraint — but a sixth family is invisible to read-back until this list or the override grows. |
| 12 | `const semantic = normalizeToWallMove(command)` in binding | :224 | **(a)** | Binding is verifiable only for the two wall verbs. |
| 13 | `'UNVERIFIABLE:no-planner-for-type'` sentinel | :239 | **(a)/defect** | See OBSERVATION 5. |
| 14 | `newGestureId('wall-move-consequence')` | :258 | **(a)** | Gesture-id label. Cosmetic but wall-named. |
| 15 | `PredictedRoomGeometryApplier` type + `applyPredictedRoomGeometry` dep | :133, :152–156 | **(a)** | ROOM-specific, not wall-specific — the reshape half is room-bound. |
| 16 | `RoomGeometryReader` + `readRoomGeometry` | :148, :165–167 | **(a)** | Room-bound read-back. |
| 17 | `RedetectSuppressor.markPlanCoveredLevels` | :142, :159–162 | **(a)** | Room-topology-observer-specific. |
| 18 | `applyReshape()` — the whole method | :335–398 | **(a)** | Named "room geometry" throughout; scope strings say `room(s)`. |
| 19 | `geometryReadback()` | :411–459 | **(a)** | Same. |

**Genuinely generic in this file:** `fingerprint()` (:468–483), `readback()` (:493–517),
`validationDelta()` (:520–545), `reconcile()` (:549–641). All four operate purely over
`ElementSet` / store-id strings and contain **no wall or room reference at all**. That is
~200 of the file's 642 lines — the reconciliation engine itself is family-agnostic.

### 3.3 · `ConsequenceReportView.ts` — **ZERO wall couplings**

`rg 'wall|Wall'` over the file: **no matches**. It renders an `ExecutionConsequence` purely
through the contract's vocabulary. **This is the one L7 surface that is already universal.**

### 3.4 · `ConsequencePreviewOverlay.ts` (312 LOC)

| # | Site | Line | Class | Note |
|---|---|---|---|---|
| 20 | Header naming the `wall.move` planner as its source | :17 | **(a)** doc-only | — |
| 21 | Usage doc-comment `{type:'wall.updateBaseline', …}` | :274–276 | **(a)** doc-only | — |
| 22 | `if (!plan) return;` | :202 | **defect** | The overlay's entire handling of the three-way `null`. See §6. |

The overlay's runtime code (`_computeAndShow` :191–204, `_show` :224+) is otherwise
family-agnostic — it takes a `ConsequencePreviewProvider` by injection (:161–165).

### 3.5 · `ConfirmationFlow.ts` (322 LOC) — **near-generic**

| # | Site | Line | Class | Note |
|---|---|---|---|---|
| 23 | `planners: ReadonlyMap<string, ConsequencePlanner<never>>` | :169 | **(c)** | **Typed `never`, not `WallMoveCommand`** — this map already accepts ANY planner. The flow is the one service whose registry is genuinely generic. |
| 24 | `normalize: (command: PreviewCommand) => {type: string} \| null` | :171 | **(c)** | Normalisation is an **injected function**, not an import. The flow does not know about walls. |
| 25 | `planner.plan(semantic as never, …)` | :320 | **(b)** cast | The `never` typing forces a cast at the call site — the cost of #23's genericity. |

**Verdict: `ConfirmationFlow` contains ZERO wall references.** `rg 'wall'` finds none. It is
already element-agnostic; only its *composition* (§3.7) binds it to walls.

### 3.6 · `confirmationPolicy.ts` (193 LOC) — **generic with one declared heuristic**

| # | Site | Line | Class | Note |
|---|---|---|---|---|
| 26 | `HOSTED_PREFIXES = ['door','window','opening']` | :105 | **(a)** | Element-kind detection by ID PREFIX. The file *declares* this weakness at length (:85–103) and records that `'w_'`/`'d_'` were removed because `'w_'` matched every WALL fixture and made every plan `recommended`. |
| 27 | `looksHosted(id)` | :112–115 | **(a)** | Consumes #26. |
| 28 | `BROAD_CHANGE_THRESHOLD = 8` | :83 | generic | Family-independent. |

`computeConfirmationPolicy` itself (:124–144) reads only `plan.refused`,
`plan.validation.violationsCreated`, `plan.topology.removed`, `plan.undetermined`,
`plan.changed` — **all contract fields**. No wall reference. `blockingItems` (:172–193) same.

### 3.7 · The composition sites — where the walls actually are

| # | Site | Line | Class |
|---|---|---|---|
| 29 | `consequencePreviewServiceComposition.ts` — `planners.set('wall.move', createWallMoveConsequencePlanner())` | :50 | **(c)** — the registry works; only one entry is put in it |
| 30 | `consequenceExecutionServiceComposition.ts` — same one-entry map | :64–65 | **(c)** |
| 31 | `confirmationFlowComposition.ts` — same one-entry map + `normalize: (c) => normalizeToWallMove(c)` | :56–57, :68 | **(c)** + **(a)** |
| 32 | `confirmationFlowComposition.ts` — `requestWallMoveConfirmation(bus, command)` | :100–105 | **(a)** naming |
| 33 | `confirmationFlowComposition.ts` — cast `planners as unknown as ReadonlyMap<string, ConsequencePlanner<never>>` | :67 | **(b)** — the cast that bridges #5's `WallMoveCommand` typing to #23's `never` typing. Evidence the two registries disagree on their own type. |
| 34 | `wallMovePlannerComposition.ts` / `wallCreatePlannerComposition.ts` | whole files | **(a)** — correctly wall-specific |

### 3.8 · `MovePlanToolHandler.ts` (804 LOC) — the live trigger

| # | Site | Line | Class | Note |
|---|---|---|---|---|
| 35 | `_emitWallConsequencePreview()` guarded `if (this._targetType !== 'wall'…) return;` | :242, :243 | **(a)** | Preview is emitted for walls ONLY. Doors, windows, slabs, stairs, columns, beams, furniture, plumbing, roofs move through this handler with **no consequence preview at all**. |
| 36 | `triggerConsequencePreview({type:'wall.updateBaseline', …})` | :254–257 | **(a)** | — |
| 37 | `_commitMove` switch — `case 'wall'` → `_moveWall`; `case 'door'/'window'` → `_moveHosted`; `default:` → shared translate | :~525–540 | **(a)** | Only the `wall` arm reaches the confirmation flow. |
| 38 | `_commitWallMoveThroughConfirmation()` | :~518–570 | **(a)** | Calls `requestWallMoveConfirmation`. Fallback `dispatchDirect()` dispatches plan-less when no plan is produced — deliberate and documented (:~508–515). |
| 39 | `window.wallStore` reads | :245, :~572 | **(a)** + P4 cast debt | `// TODO(TASK-08)` |

> **OBSERVATION 6 — the safe-mode surface reaches exactly ONE gesture on ONE family.**
> Measured: `MovePlanToolHandler` handles ≥11 element families (`wall`, `door`, `window`, plus
> the `default:` shared-translate path covering slab, stair, column, beam, roof, plumbing,
> lighting, structural, furniture, dimensions, section-line — each with a `Move*` handler under
> `plugins/*/src/handlers/`). Only the `wall` arm previews (#35) and only the `wall` arm
> confirms (#37–38). Everything else dispatches unplanned, with no preview, no policy, no
> report.

> **OBSERVATION 7 — `WallCreateConsequencePlanner` (956 LOC) is AUTHORED but UNREACHABLE.**
> Measured: `rg 'createWallCreateConsequencePlanner|wallCreatePlannerComposition'` across
> `apps/`, `packages/`, `tools/` returns exactly ONE hit — the composition file's own header
> comment (`wallCreatePlannerComposition.ts:1`). Nothing imports the factory. It is registered
> in no preview map, no execution map, no confirmation map. Its only exercise is
> `apps/editor/__tests__/WallCreateConsequencePlanner.test.ts`. This is the
> `[[authored-but-unwired-is-the-bottleneck]]` pattern: the second planner *exists* and is
> *not reachable*, so the claim "only 2 planners exist" understates the problem — **only 1
> planner is composed.**

### 3.9 · Coupling summary

| Class | Count | Where |
|---|---|---|
| **(a)** genuinely wall/room-specific logic | 22 | normalizer (#4), the two planners, the reshape/room half of the executor (#15–19), `HOSTED_PREFIXES` (#26–27), the tool handler (#35–39) |
| **(b)** a type parameter that should be generic | 9 | **#5 and #10 are the two that block registration**; #1, #2, #6, #8, #25, #33 follow from them |
| **(c)** already generic, only one entry supplied | 6 | #23, #24, #29, #30, #31, and the `PlanningContext.getStore(string)` seam |

**The minimum measured change to admit a second family:** widen #5 and #10 (`ReadonlyMap<string,
ConsequencePlanner<WallMoveCommand>>`), and replace #4 (`normalizeToWallMove`) with a
registry-driven normaliser — because #29/#30/#31 already route by string key and
`ConfirmationFlow` (#23/#24) is already generic. That is **2 type parameters + 1 function**
between the current state and a multi-family registry. Everything else in §3 is either
correctly family-specific implementation, or already generic.

---

## §4 · THE GATES

### 4.1 · Certification gates — `tools/rac-conformance/certification/certify.ts:392`

The gates array, verbatim (18 entries):

```ts
const gates = ['check-identity-roundtrip', 'check-propagation-reaches',
'check-derived-regenerable', 'check-propagation-trackers-reach', 'check-preview-purity',
'check-execution-plan-agreement', 'check-room-identity-survives-wall-move',
'check-room-reshape-fidelity', 'check-room-reshape-undo',
'check-undo-resume-flushes-topology', 'check-consequence-report-completeness',
'check-approval-binding', 'check-ai-human-parity', 'check-authored-state-protection',
'check-authoritative-state', 'check-two-client-convergence', 'check-topology-survives',
'check-derived-classification'];
```

Runner: `certify.ts:395–411` (each spawned via `npx tsx`; a missing script file is
`EXIT_MISCONFIGURED`, never absorbable — `:397–402`).

| Gate | G-REASON | Subject | Scope | Level | To cover a 2nd family |
|---|---|---|---|---|---|
| check-identity-roundtrip | — | Every element kind restores with original `id` + `ifcData.guid` | **AGNOSTIC** (hdr :5; declared 0 at :116) | HARD-0 | nothing — already covers all kinds |
| check-propagation-reaches | — | Each declared cascade event has ≥1 listener + emitter carries `prevState` | **AGNOSTIC** — static scan over `cascade-events.json` (:51, :159) | ratchet (:175) | add the family's events to the ledger |
| check-derived-regenerable | — | Rebuild-from-authoritative vs restored snapshot | **AGNOSTIC** — field-level over `derived-ledger.json` | HARD-0 undeclared (:103) | add fields to the ledger |
| check-propagation-trackers-reach | — | 4 bespoke propagation pairs still reach their pairs | **FAMILY-BROAD** (door/window/delete/room; wall only as `_computeWallSig` input :472–495) | ratchet (:539) | add a tracker pair |
| **check-preview-purity** | **G-REASON-01** | A real preview mutates nothing | **WALL-SCOPED** — imports `WallMoveConsequencePlanner` :32; mints `wall-1` :52; `COMMAND={type:'wall.move'}` :73; map key :85 | HARD-0 (:169) | **new fixture + new planner import per family** |
| **check-execution-plan-agreement** | **G-REASON-03** | Plan previewed ≡ plan executed | **WALL-SCOPED** — dynamic import of the planner :122–123, instantiated :186, `new Map([['wall.move', planner]])` :191 | HARD-0 (:331) | **new fixture + map entry per family** |
| check-room-identity-survives-wall-move | — | Moving a bounding wall never re-mints a room id/GUID | **WALL-SCOPED by fixture** — `wall()` factory :68–70, drives real `RoomDetectionEngine` :59 | HARD-0 (:265) | inherently wall→room; a sibling gate per relationship |
| check-room-reshape-fidelity | — | Preview polygon byte-identical to committed polygon | **WALL-SCOPED** — wall-baseline moves through room interiors :237–249; imports `predictRoomGeometry` + `ApplyPredictedRoomGeometryCommand` :61–63 | HARD-0 (:277) | needs a per-family predictor + applier pair |
| check-room-reshape-undo | — | One wall drag + room consequences = ONE undo unit | **WALL-SCOPED** — hard-codes `{type:'wall.move', payload:{id:'wall-n'}}` :157, `Map([['wall.move', stub]])` :176 | HARD-0 (:277) | new gesture fixture per family |
| check-undo-resume-flushes-topology | — | `resume()` discharges suppressed notifications | **WALL-ADJACENT** — subject is wall-baseline inverse patch + `bim-wall-mutation-committed` :20–21; no planner import | HARD-0 (:230) | generalise the event name |
| **check-consequence-report-completeness** | **G-REASON-06** | A real report carries all declared R5 sections; undetermined items named | **WALL-SCOPED** — planner import :140–141, instantiated :195, map :200, `wall-1` fixtures :258–271 | HARD-0 (:379) | **new fixture + map entry per family** |
| **check-approval-binding** | **G-REASON-05** | Approval binds `planHash` + state hash; stale → refuse/replan | **WALL-SCOPED** — planner import :130–131, :222, :227; `{type:'wall.move'}` :435, :453–459 | HARD-0 (:487) | **new fixture + map entry per family** |
| **check-ai-human-parity** | **G-REASON-04** | `normalize(human) === normalize(ai)` via real `normalizeForParity` | **WALL-SCOPED** — exit condition is for `wall.move` :6; `wall.move` refusal in ChatCapabilityRegistry :239; dual dispatch compares wall baselines :358–391 | `declared: 1` (:530–532) | **per-family dual-dispatch fixture** |
| check-authored-state-protection | R8 (no G-REASON) | Regeneration leaves authored state byte-intact | **AGNOSTIC** — walls, openings, rooms, AI elements (hdr :17–21) | ratchet `declared: 7` (:480) | add elements to the scenario |
| check-authoritative-state | — | Every certified verb reporting success moved the owning store | **AGNOSTIC** — per-kind `baselineByKind`/`kindsReached` :144–145, floor ≥12 records :212 | ratchet (:381) | add verbs to `authoritative-state-ledger.json` |
| check-two-client-convergence | — | Two clients converge; identity not re-minted; undo respects user boundary | **AGNOSTIC** — wall named only as an example :46 | hard-0 default (:213–221) | nothing |
| check-topology-survives | — | Junction records retained with identity across move/resize/regen/save-load/undo | **WALL-TOPOLOGY-SCOPED, verb-agnostic** — subject is `WallJunctionRecord`/JunctionResolverV2 (hdr :14–19) | HARD-0 (:628) | a sibling for each topology kind |
| check-derived-classification | — | Every field carries an ADR-0319 class and it is ENFORCED | **AGNOSTIC** — field scan :507, :721 | ratchet (:721, :759) | classify the family's fields |

**Tally: 8 WALL-SCOPED · 3 wall-adjacent · 7 family-agnostic.**
**All five G-REASON gates (01, 03, 04, 05, 06) are wall.move-driven.** G-REASON-02
(determinism) has **no gate file in this suite** — see OPEN QUESTIONS.

### 4.2 · GA-gates — `tools/ga-gate/run-all.ts`

No ga-gate has a consequence-plan / preview / approval subject. The seven nearest neighbours:

| Line | Gate | Subject |
|---|---|---|
| :164 | `report-payload-discard (R4/W2-B)` | Dispatch sites DISCARDING an engine report payload (C68 §5.g) — the reporting layer printing "Done" over an honest partial. Target 0, not a ratchet (:46–48, :161–163) |
| :180 | `refusal-identity (C58 §1.13/§6)` | A refusal that loses its code is indistinguishable from "not applicable"; **88 NAMED offenders** keyed by file+fragment (:177–179) |
| :227 | `provenance-not-invented (C75 §2.1)` | Provenance recorded, never synthesised at read time |
| :235 | `prevstate-contract (C72 §3, §6.2)` | Emitters carry a real pre-mutation `prevState` |
| :236 | `suppression-is-reversible (C72 §4, §6.3)` | A pause/suppression must be releasable and must discharge what it suppressed |
| :250 | `constraint-honesty (C70 G-INV-1/2; C74 §3.1/3.2/3.5)` | Adapter delegation matches declared `kind`; every rule family has executable evidence at its declared strength |
| :276 | `graph-write-coverage (C71 §6 · C-INV-1/4)` | Every graph-mutating path actually writes the semantic graph; carries a `gate-newly-measured.json` entry |
| :278 | `check-gate-subject-floors` | Meta-gate, runs last over the others |

> **OBSERVATION 8 — `check-refusal-identity` is the closest existing instrument to §2's
> problem, and it does not cover the consequence path.** It exists precisely because "a refusal
> that loses its code is indistinguishable from a generic not-applicable" (`run-all.ts:177–179`)
> — which is exactly what §2.2's ternary downcast and §6's `null` do. Its 88 named offenders do
> not include the consequence modules.

---

## §5 · BLIND MODE — `computeConfirmationPolicy`

**CONFIRMED: it is a pure function of the plan, not a UI condition.**

`apps/editor/src/ui/consequence/confirmationPolicy.ts:124`:

```ts
export function computeConfirmationPolicy(plan: ConsequencePlan): ConfirmationPolicy
```

Evidence that it is pure and plan-only:

1. **Signature.** One argument, `ConsequencePlan`. No command, no store, no runtime, no DOM
   handle, no clock. Return is data (`{requirement, reasons}`), not a rendering side effect.
2. **Body** (:124–144). Reads exactly five plan fields and nothing else:
   `plan.refused.length` (:134), `plan.validation.violationsCreated.length` (:135),
   `plan.topology.removed.length` (:136), `plan.undetermined.length` (:139),
   `plan.changed` (:140, :141). No `document`, no `window`, no import of a DOM module — the
   file's only imports are four `import type` from `@pryzm/command-bus` (:71–76).
3. **The rule is stated as a prohibition** (:8–21): *"STR-06 §10 forbids the shortcut BY NAME:
   'Never `if (command.isDestructive) showConfirm()` — that reproduces the gap.'"* And :123:
   *"It does not consult the command type, a destructive-verb list, the store, the user, or the
   clock."*
4. **The card renders the verdict; it never reaches one.** `ConfirmationFlow.ts:221` computes
   the policy, then `:227` `if (policy.requirement !== 'none') this.deps.prompt?.show(plan, policy)`
   — the prompt receives the already-computed policy. `ConfirmationPrompt.show(plan, policy)`
   (`ConfirmationFlow.ts:161`) takes the verdict as an argument.
5. **Referential transparency is a stated design constraint** (:23–32): the policy is
   deliberately NOT a field on `ConsequencePlan` so that a policy tweak does not change the plan
   hash and invalidate every outstanding approval — *"`computeConfirmationPolicy(plan)` is
   referentially transparent over the plan."*
6. **A gate can assert it without a DOM** (:19–21) — and `check-approval-binding` does.

**Would it work unchanged for a NON-WALL plan? — YES, with one degradation.**

- The three REQUIRED clauses (:134–136) read `refused`, `violationsCreated`, `topology.removed`
  — all contract fields, all element-kind-independent. **Fully family-agnostic.**
- Two of three RECOMMENDED clauses (`undetermined` :139, `broad_impact` :141) are likewise
  contract-only. **Fully family-agnostic.**
- **The one degradation:** `changes_hosted_elements` (:140) calls `looksHosted` (:112–115),
  which prefix-tests element ids against `HOSTED_PREFIXES = ['door','window','opening']` (:105).
  For a family whose hosted children are not door/window/opening (a curtain-wall panel, a roof
  penetration, a duct fitting), this clause silently does not fire.

**That degradation is DECLARED, not hidden, and its direction is stated as the safe one**
(:85–103): *"a `ConsequencePlan` carries element IDS, not element KINDS … `changes_hosted_elements`
only ever raises the requirement to `recommended`, never to `required`, so a miss costs a nudge
— it never lets a blocker through, because blockers come from `refused` and `violationsCreated`,
which are kind-independent."* The file also records that the two-character prefixes `'d_'`/`'w_'`
were removed after the certification gate caught `'w_'` matching every WALL fixture and making
every plan `recommended` (:96–103).

> **OBSERVATION 9 — the exit condition for the prefix heuristic is already written in the
> source.** `confirmationPolicy.ts:102–103`: *"When the contract grows a kind-carrying change
> set, this function reads that instead and the constant goes away."* Measured: `ConsequencePlan`
> carries `changed: ElementSet = readonly string[]` (`consequence.ts:334`, `:44`) — no kind is
> carried anywhere on the plan.

---

## §6 · THE `null` ENUMERATION

### 6.1 · `ConsequencePreviewService.preview()` — `ConsequencePreviewService.ts:107–116`

```ts
async preview(command: PreviewCommand): Promise<ConsequencePlan | null> {
  const normalized = this.normalize(command);
  if (!normalized) return null;                    // ← N1 / N2 / N3 (three causes, one value)
  const planner = this.planners.get(normalized.type);
  if (!planner) return null;                       // ← N4
  return planner.plan(normalized, this.context());
}
```

**Two `return null` STATEMENTS. FOUR distinct causes.** The first statement is reached from
three structurally different failures inside `normalizeToWallMove` (:81–93):

| # | Cause | Site | The fact | Today's value | Typed reason it should carry |
|---|---|---|---|---|---|
| **N1** | Command type is neither `wall.move` nor `wall.updateBaseline` | `:92` (`return null` at the end of the normaliser) → `:109` | **No planner family recognises this verb.** Every non-wall command in the system lands here. | `null` | `UNSUPPORTED_ELEMENT_TYPE` (0 producers today — §2.1) |
| **N2** | `type === 'wall.move'` but payload malformed (`!p \|\| typeof p.id !== 'string' \|\| !p.baseLine`) | `:84` → `:109` | **The payload is invalid** — a caller bug or a schema drift. | `null` | a payload-invalid reason; **no member of `UndeterminedReason` fits** |
| **N3** | `type === 'wall.updateBaseline'` but payload malformed (`!p \|\| typeof p.wallId !== 'string' \|\| !p.newBaseLine`) | `:89` → `:109` | Same as N2, different verb. | `null` | same |
| **N4** | Normalisation succeeded, but `planners.get('wall.move')` returned `undefined` | `:110–111` | **The planner is not composed in this runtime** — the composition root did not register it. | `null` | `ENGINE_NOT_AVAILABLE` (has 14 producers elsewhere) |

**N1 and N4 are semantically opposite** — "no such family exists" vs "the family exists but is
not wired here" — and they are the same value. **N2/N3 are a third thing entirely** (a malformed
request), and the contract has **no reason member for it at all**: `UndeterminedReason`'s four
members are all about the *system's* capability, none about the *caller's* input.

### 6.2 · The declared contract for that `null` is already narrower than reality

`ConsequencePreviewProvider.preview` (`:57–58`) documents the return as:

> *"Compute the plan for `command`, or `null` when **no planner is registered for its type**."*

That describes **N4 only**. N1, N2 and N3 all return the same value while meaning something the
doc-comment does not admit.

### 6.3 · What consumers do with it

| Consumer | Site | Handling |
|---|---|---|
| `ConsequencePreviewOverlay._computeAndShow` | `:202` | `if (!plan) return;` — **silent**. The overlay simply does not appear. Indistinguishable from "hover produced no consequences", from "the preview is still debouncing" (`:185–188`, 300 ms), and from a caught throw (`:196–199` warns, then returns identically). |
| `ConfirmationFlow.planNow` | `:315–321` | Independently re-implements the same three-way collapse: `if (!semantic) return null;` (:317) and `if (!planner) return null;` (:319). |
| `ConfirmationFlow.request` | `:208–219` | **The one place that recovers.** `if (!plan)` mints a typed `NoPlanRefusal {kind:'NO_PLAN_AVAILABLE', commandType, message}` — but the message says only *"No consequence planner answers for '<type>'"*, i.e. it re-labels all four causes as N4. |
| `ConfirmationFlow.confirm` | `:262`, `:269–271` | A `null` live re-plan becomes the string `'UNPLANNABLE'` in `livePlanHash`/`liveStateHash` — a **second hash-sentinel improvisation**, sibling to OBSERVATION 5. |
| `MovePlanToolHandler._commitWallMoveThroughConfirmation` | `:~544` | `if (request.kind === 'refused') { dispatchDirect(request.refusal.kind); return; }` — dispatches the move **plan-less**, logging only the kind. |
| `ConsequenceExecutionService.execute` (binding arm) | `:224–240` | Does NOT use `preview()`, but reproduces the same collapse: `normalizeToWallMove` returning `null` OR `planners.get()` returning `undefined` both fall into the single `else` at `:235` and mint `'UNVERIFIABLE:no-planner-for-type'` for BOTH. |

### 6.4 · Summary of untyped absence values in the pipeline

| Value | Site | Distinct causes collapsed |
|---|---|---|
| `null` from `preview()` | `ConsequencePreviewService.ts:109, :111` | **4** (N1–N4) |
| `null` from `planNow()` | `ConfirmationFlow.ts:317, :319` | **4** (same four, re-implemented) |
| `'UNVERIFIABLE:no-planner-for-type'` | `ConsequenceExecutionService.ts:239` | **2** (N1/N2/N3 vs N4) |
| `'UNPLANNABLE'` | `ConfirmationFlow.ts:269–271` | **4** |
| silent `return` | `ConsequencePreviewOverlay.ts:202` | **5** (N1–N4 + the caught throw at :196) |

> **OBSERVATION 10 — this is the failure-as-emptiness defect at the entry point of the system
> built to eliminate it.** `consequence.ts:36–38` states the contract's founding rule: *"'I found
> nothing' and 'I could not look' are never the same value (ADR-0322 §5 — known + unknown = [] is
> forbidden by construction)."* The plan BODY honours it exhaustively (`ImpactDetermination`,
> `UndeterminedImpact`, the three `*Undetermined` report fields, the three-armed
> `ExecutionConsequence`, the three-armed `ReshapeOutcome` at
> `ConsequenceExecutionService.ts:193–200`). The function that decides whether a plan exists at
> all does not: it returns a bare `null` for four causes, and every downstream consumer either
> drops it silently or re-labels it as the one cause it recognises.

---

## §OPEN QUESTIONS

1. **Does `UndeterminedReason` need a fifth member for MALFORMED INPUT?** N2/N3 (§6.1) are
   caller-payload failures. All four current members describe the *system's* capability
   (`NO_DEPENDENCY_INDEX`, `ENGINE_NOT_AVAILABLE`, `UNSUPPORTED_ELEMENT_TYPE`,
   `STALE_DERIVED_STATE`); none describes the *request*. Measured: no existing reason fits.

2. **Should the 8 `RoomPredictionRefusal` members be promoted, or should the contract carry a
   sub-reason?** Today seven of eight collapse to `STALE_DERIVED_STATE` and survive only as
   prose in `detail` (§2.2). A universal contract will have N such per-family unions
   (wall-junction, slab-boundary, roof-plane…). Open: one flat union that grows per family, or a
   `{reason: UndeterminedReason, familyReason?: string}` pair.

3. **Is `PredictedGeometry`'s 2-D plan-polygon shape (`{x,z}`, 2-D AABB, area/perimeter/centroid)
   the universal predicted-geometry type, or the ROOM one?** (OBSERVATION 1.) A predicted stair,
   roof plane or wall solid does not fit. This decides whether the reshape half of
   `ConsequenceExecutionService` generalises or needs a per-family applier.

4. **What replaces `normalizeToWallMove`?** It is the system's only verb→semantic map and it
   knows two verbs (§3.1 #4). Open: does each planner declare the verbs it answers for (a
   registry-driven normaliser), or does the command registry carry the semantic type?

5. **Do the five G-REASON gates become per-family fixtures, or one parametric harness?**
   Measured: all five hard-code `wall.move` and import `WallMoveConsequencePlanner` (§4.1). At
   one fixture per family per gate, a five-family system is 25 fixtures. Open: parametrise over
   a family table, or accept the multiplication.

6. **Where is G-REASON-02?** G-REASON-01, 03, 04, 05 and 06 all have gate files in
   `certify.ts:392`. G-REASON-02 (plan determinism — *"same state + same command ⇒ byte-equal
   plan"*, `consequence.ts:651–653`) is cited by six source files as the reason for
   `stableStringify`, sorted element sets and the deterministic `planId`, and has **no gate in
   the array**. It is the invariant a second planner is most likely to break silently.

7. **What surfaces consequences for the other ~10 element families?** (OBSERVATION 6.) Only the
   `wall` arm of `MovePlanToolHandler` previews or confirms. Open: is unplanned dispatch for
   door/window/slab/stair/roof/column/beam/furniture/plumbing/lighting/structural an accepted
   interim state, or a gap that needs its own tracked item?

8. **Does `WallCreateConsequencePlanner` get composed, or is it evidence the registry must change
   first?** (OBSERVATION 7.) 956 LOC, zero importers. It cannot register in the preview or
   execution map without a cast, because both are typed `ConsequencePlanner<WallMoveCommand>`
   (§3.1 #5, §3.2 #10) — so the type parameter and the unreachability may be the same fact.

9. **Should `check-refusal-identity`'s subject extend to the consequence path?** (OBSERVATION 8.)
   It exists to catch refusals that lose their code; §2.2 and §6 are exactly that, and are
   outside its 88 named offenders.
