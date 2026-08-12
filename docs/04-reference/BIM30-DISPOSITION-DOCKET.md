# BIM30 Disposition Docket — R0, dead machinery

> **Stamp**: 2026-08-12 · **Authority**: STR-06 → ADR-0323 (the disposition rule + the
> four-state ladder) → [`BIM30-REASONING-LOOP-PLAN.md`](../03-execution/plans/BIM30-REASONING-LOOP-PLAN.md) R0.
> This file is the committed artefact ADR-0323 requires: every review-discovered
> authored-but-unwired item, its ladder rung, its disposition, an owner, and a review
> date. **"Later" is not a disposition** — an expired undecided row fails the run that
> discovers it (ADR-0323 rule 4).
>
> Ladder vocabulary (ADR-0323 rule 3): **AUTHORED** (exists in source) → **REACHABLE**
> (production can invoke) → **COMPOSABLE** (participates in the canonical command path)
> → **CERTIFIED** (an executable invariant proves it). ✓/✗ below are measured, not claimed.

## 1 · CascadeRunner — the promotion test (STR-06 §6)

| | |
|---|---|
| Item | `packages/command-bus/src/cascade.ts` (`CascadeRunner`) + `plugins/cross` rules |
| Ladder | AUTHORED ✓ · REACHABLE ✗ (registered nowhere in production) · COMPOSABLE ✗ · CERTIFIED ✓ *for the mechanism itself* — the promotion test below is an executable invariant over its behaviour |
| Disposition | **PROMOTE** — as the **cascade branch of the future ConsequencePlanner** (plan R2), NOT as the planner. Registration stays deferred to R2; global registration before that is explicitly out of scope (STR-06 §18). |
| Owner | R2 implementer (reasoning-loop plan) |
| reviewBy | R2 exit (or 2026-10-12, whichever first) |
| This pass | **EXECUTED**: promotion test written and green; misleading wiring comment in `cascade.ts` corrected; 16 "inert" handler headers corrected (see §1.2). |

**The test** — `packages/command-bus/__tests__/cascade-promotion.test.ts`, run 2026-08-12:
`2 files, 15 tests passed` (4 new + the 11 pre-existing cascade tests). Fixture: `wall.move w1`
over a wall with two hosted openings, two junction-adjacent walls, one of which hosts a third
opening (transitive cascade). All three clauses pass:

- **(a) Determinism** — two dispatches over identical state are byte-equal (commands + stats).
- **(b) No mutation** — stores deep-frozen (any write throws in strict mode) and byte-identical
  pre/post snapshot.
- **(c) Stability** — the predicted command SET and all stats survive reversal of rule
  registration order AND of every adjacency/hosting list and record-key insertion order.

**The verdict on ADR-0322's question** — *is CascadeRunner the planner, or one mechanism a
planner would use?* **One mechanism.** It emits a flat follow-on command list; it cannot express
UNDETERMINED (STR-06 §6-bis), excluded/untouched sets, violations, refusals, or a plan hash —
the ConsequencePlan's load-bearing fields. Within its scope it is exactly the deterministic,
pure cascade walker R2's junction branch needs → PROMOTE as that branch. Two caveats the R2
integration must own (both pinned in the test file):

1. **Visited-set keys are raw entity ids with no family namespace** — a wall and a room sharing
   an id string would dedupe against each other and silently drop a legitimate cascade.
2. **Emission SEQUENCE follows rule-registration order** (the SET is stable; the sequence is
   not — pinned by the `(c-finding)` test). Canonical ordering is the planner's job.

### 1.2 · The "inert" headers — plan said eleven, measured sixteen

The R0 exit named 11 headers; `grep -l 'inert: .CascadeRunner.' plugins/` returns **16** files
carrying the identical sentence. All 16 were corrected in this pass to state the recorded
disposition (PROMOTE, deferred to R2) instead of bare "inert":
wall/{MoveWall,TransformWall} · door/MoveDoor · window/MoveWindow · slab/MoveSlab ·
stair/RotateStair · furniture/{MoveFurniture,RotateFurniture} · structural/MoveStructural ·
section-view/MoveSectionLine · dimensions/MoveDimension · **plus the five the plan under-counted**:
beam/MoveBeam · column/MoveColumn · lighting/MoveLighting · plumbing/MovePlumbing · roof/MoveRoof.

## 2 · Orphaned events (ADR-0323 rule 2: consumer, contract, or delete dispatch + catalog entry)

Zero listeners were found for every event below (grep for `addEventListener('<name>'` and
`.on('<name>'` across apps/packages/plugins/tools/server/src/tests, 2026-08-12).

| Event | Dispatch site(s) | Invariant / product behaviour requiring it | Ladder | Disposition | Owner | reviewBy | This pass |
|---|---|---|---|---|---|---|---|
| `switch-tab` | `packages/ai-host/src/QueryEngine.ts` (`triggerActionsTab`) | None — the live tab-switch channel is `ai-switch-tab` (AICreatePanel → AIAreaLayout, runtime events); this DOM dispatch on `ribbon-component` never had a listener, and the function's direct `.ai-tab-btn` click fallback (retained) serves the behaviour | AUTHORED ✓ · REACHABLE ✗ (no consumer) | **REMOVE** | — (closed) | — | **EXECUTED** — dispatch + catalog entry deleted |
| `dim-tool-status` | `plugins/annotations/src/tools/LinearDimensionAnnotationTool.ts` | None — dispatched for a status-bar component never built; console status retained | AUTHORED ✓ · REACHABLE ✗ | **REMOVE** | — (closed) | — | **EXECUTED** — dispatch deleted (was never in the catalog) |
| `dim-opt-face-type` / `dim-opt-unit` / `dim-opt-lock` / `dim-opt-string` / `dim-opt-eq` | `plugins/annotations/src/plantools/LinearDimOptionsBar.ts` | None — consumers (LinearDimensionAnnotationTool, LinearDimPlanToolHandler) read the bar's getters directly; the window broadcasts were a redundant second channel | AUTHORED ✓ · REACHABLE ✗ | **REMOVE** | — (closed) | — | **EXECUTED** — all five dispatches deleted (never in the catalog) |
| `bim-wall-system-error` | `packages/geometry-wall/src/errors.ts` (every `WallSystemError` ctor) + `packages/geometry-slab/src/SlabWallConnectivityService.ts` (O3 no-CommandManager warning) | None — the typed throw is the contract carrier; the event fed a "future error-reporter UI" that was never built. The O3 warning's consumed surface is its `console.error`, retained | AUTHORED ✓ · REACHABLE ✗ | **REMOVE** | — (closed) | — | **EXECUTED** — both dispatches + catalog entry deleted; `DOMEventBus` instances removed from both files |
| `bim-model-healed` | `packages/core-app-model/src/BimKernel.ts` (post-reconciliation) | None — pure notification, zero listeners since authoring; the reconciliation console summary remains | AUTHORED ✓ · REACHABLE ✗ | **REMOVE** | — (closed) | — | **EXECUTED** — dispatch + catalog entry deleted |
| `pryzm-ambient-observation` | `packages/ai-host/src/AmbientIntelligence.ts` (`_emit`) | None as a window event — `AmbientIntelligence` already delivers through its registered-listener API, which is the consumed channel; the window dispatch was a parallel orphan | AUTHORED ✓ · REACHABLE ✗ (window channel) | **REMOVE** (window channel only; listener API untouched) | — (closed) | — | **EXECUTED** — dispatch + catalog entry deleted |
| `pryzm-render-registry-isolation-leak` | `apps/editor/src/engine/initScene.ts:1492` | **YES — this is the C13 isolation-violation alarm.** The invariant (project isolation, C13) requires the *detection to be heard*; today the alarm fires into silence alongside its `[C13 VIOLATION]` console.error. Deleting an alarm is a policy statement needing founder sign-off (ADR-0323 rule 5) | AUTHORED ✓ · REACHABLE ✗ (dispatched, unheard) | **WIRE-PENDING** — recommendation: a listener registered at editor bootstrap that (1) increments an OTel counter / telemetry event so leaks are visible in production, and (2) surfaces a dev-mode toast. Alternative (removal) requires explicit founder sign-off | Editor bootstrap owner; escalation: founder | 2026-09-12 | **RECORDED-ONLY** — code untouched by instruction |
| `pryzm-dep-cascade` · `pryzm-hosted-reval` · `pryzm-room-reval` · `pryzm-structural-cascade` | catalog-typed, dead dispatch surface | Owned by roadmap **Phase 5 wire-or-delete** (dependency wiring) | AUTHORED ✓ · REACHABLE ✗ | **HELD-FOR-PHASE-5** — not touched here; Phase 5 decides wire-or-delete | Roadmap Phase 5 owner | Phase 5 exit | **RECORDED-ONLY** — untouched by instruction |

## 3 · Orphaned packages (wire-or-remove, per rule 1)

Importer counts measured 2026-08-12 by grepping `@pryzm/<name>` across
apps/packages/plugins/tools/server/src/tests (excluding the package itself and node_modules).

| Package | Facts | Ladder | Disposition | Owner | reviewBy | This pass |
|---|---|---|---|---|---|---|
| `@pryzm/expr-eval` | 0 importers. Two rival engines exist and both explain *why* in-source: `packages/family-runtime/src/expression/parser.ts` ("Grammar (tighter than expr-eval…") and `packages/formula-library/src/types.ts` ("Why a separate package and not just expr-eval directly…"). STR-06 §18 explicitly rejects "a second expression engine" | AUTHORED ✓ · REACHABLE ✗ | **REMOVE** — delete the workspace. The rivals' comments should be updated in the same commit so they don't cite a deleted package | R0 follow-up (dedicated commit) | 2026-09-12 | **RECORDED-ONLY** — deleting a workspace requires `pnpm-lock.yaml` churn; per the R0 brief that executes in a dedicated commit with `pnpm install` + `pnpm install --frozen-lockfile` verified (shared live tree today) |
| `@pryzm/wcag-audit` | 0 importers, no runner script anywhere; the a11y sibling gate `scripts` runner exists (`check-a11y-token-contrast.mjs` pattern) | AUTHORED ✓ · REACHABLE ✗ | **WIRE-or-REMOVE** — WIRE means a `tools/scripts/check-wcag-audit.mjs` runner in the a11y-check family invoked from CI; if no owner claims it by reviewBy, default is REMOVE | A11y/gate owner (unclaimed) | 2026-09-12 | **RECORDED-ONLY** |
| `@pryzm/legacy-shim` | Deliberately zero-importer **process package**: the named violation surface for `pryzm/no-raf` / `pryzm/store-single-channel` lint fixtures; load-bearing for `tools/scripts/check-lint-fixtures.mjs`, `packages/eslint-plugin-pryzm/__tests__`, and `eslint.config.js` overrides; already in `.changeset/config.json` ignore list (line 12 checked); README states all of this. The stale `"deprecated": "Wave-12 DROP"` field in its package.json contradicted its own README | AUTHORED ✓ · REACHABLE ✓ (via the lint-fixture runner — reachability is *process*, not product) | **RECLASSIFY** — process-only fixture package, keep; README already documents purpose | eslint-plugin owner | 2027-02-12 | **EXECUTED** — stale `deprecated: DROP` verdict removed from package.json; RECLASSIFIED note added to its description |
| `@pryzm/bench-visual-diff` | **Not actually 0-importer**: `packages/release/src/ga-gate.mjs` runs `packages/bench-visual-diff/src/index.mjs --no-fixtures` (`checkVisualDiffSmoke`) and counts it in the `packages_count` grow-floor (49). The consumer is the legacy release gate (continue-on-error in ci.yml, per CLAUDE.md) | AUTHORED ✓ · REACHABLE ✓ (release-gate smoke) | **RECLASSIFY** — release-gate infrastructure, keep; deleting it would hard-fail `checkVisualDiffSmoke` (configError) | Release-gate owner | 2027-02-12 | **RECORDED-ONLY** (nothing to change; the "orphan" claim was measured false) |
| `plugins/ai-generative` descriptor | 0 importers outside the package; `enabled: false`; registers nothing (no composition root or plugin host consumes it); the `Generate3Options` workflow it names is real in `@pryzm/ai-host` and reached via `getAiHost()` without this shell | AUTHORED ✓ · REACHABLE ✗ | **REMOVE at reviewBy unless wired** — dated scaffold header added per C74 §3.8's spirit; if no owner wires the descriptor into the plugin host by reviewBy, delete the package (lockfile-churn commit, same protocol as expr-eval) | AI-host owner (unclaimed) | 2026-09-12 | **EXECUTED** — dated scaffold header added to `src/descriptor.ts`; package retained pending reviewBy |
| `@pryzm/pdf-to-bim` | 0 importers; BUT a live parallel PDF flow exists in `apps/editor` + `apps/ai-worker` — this is a product-scope decision (two rival extraction paths), the exact "five overlapping systems" pattern STR-06 §5 warns about | AUTHORED ✓ · REACHABLE ✗ | **WIRE-or-REMOVE — FOUNDER DECISION.** Recommendation: REMOVE unless the confidence-model/review-queue design is wanted as the successor to the live flow — in which case WIRE means the live flow consumes this package's review-queue, and the loser is deleted in the same change (REPLACE semantics, rule 1) | **Founder** | 2026-09-12 | **RECORDED-ONLY** — explicitly not deleted per R0 brief |

## 4 · Items on the R0 table owned elsewhere (cross-references, not decided here)

| Item | Status |
|---|---|
| `SpeculativeEngine` | Owned by **R1** (ADR-0323 rule 5: finish / mine-for-parts / retire, decided by whether its ownership boundary fits the consequence contract; its clone-and-validate core is the leading mining candidate per plan R1). Not assessed here. |
| Consequence-preview trigger surface | **WIRE** at R3 (already recorded in ADR-0323 rule 5). |
| `getEdgesForRoom` / `getConnectedComponent` / `TemporalGraph.getEdgesForElement` | **WIRE-PENDING-R2** — impact-surface inputs, HOLD per the R0 table; do not delete. Owner: R2 implementer. reviewBy: R2 exit. |
| Provenance export | **WIRE, after ownership** (R8 / roadmap Phase 8; recorded in ADR-0323 rule 5). |

## 5 · Executed vs recorded — the one-screen summary

**EXECUTED in this pass** (working tree, not committed — orchestrator verifies and commits):
- `packages/command-bus/__tests__/cascade-promotion.test.ts` — NEW; 4 tests, green.
- `packages/command-bus/src/cascade.ts` — misleading "See apps/editor/src/bootstrap.ts for wiring" comment replaced with the recorded disposition.
- 16 plugin handler headers — disposition appended to the "inert" sentence.
- Deleted dispatches: `switch-tab` (QueryEngine) · `dim-tool-status` · 5× `dim-opt-*` ·
  `bim-wall-system-error` (2 sites, + dead `DOMEventBus` instances) · `bim-model-healed` ·
  `pryzm-ambient-observation` (window channel).
- Deleted catalog entries (`packages/event-bus/src/catalog.ts`): `switch-tab`,
  `bim-wall-system-error`, `bim-model-healed`, `pryzm-ambient-observation` (each replaced by a
  dated tombstone comment).
- `packages/legacy-shim/package.json` — stale `deprecated: DROP` removed; RECLASSIFY recorded.
- `plugins/ai-generative/src/descriptor.ts` — dated scaffold header.

**RECORDED-ONLY** (no code change): `pryzm-render-registry-isolation-leak` (WIRE-PENDING,
founder-gated removal) · 4 cascade events (HELD-FOR-PHASE-5) · `expr-eval` REMOVE (lockfile
commit) · `wcag-audit` WIRE-or-REMOVE · `bench-visual-diff` RECLASSIFY (measured reachable) ·
`pdf-to-bim` founder decision · §4 cross-references.
