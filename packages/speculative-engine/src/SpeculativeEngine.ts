/**
 * ⛔ RETIRED — 2026-08-12 (BIM30 R3, ADR-0322 §8 / ADR-0323 disposition ladder).
 *
 * ── REMOVAL HEADER (dated) ───────────────────────────────────────────────────
 * Scheduled deletion of this package: **2026-11-12** (or the first cleanup pass
 * after the golden `wall.move` loop closes end-to-end, whichever is sooner). The
 * package directory is retained until then ONLY to avoid a pnpm-lock churn that
 * would desync every agent sharing this tree; it exports nothing runnable.
 *
 * ── WHAT HAPPENED TO IT ──────────────────────────────────────────────────────
 * The disposition recorded at R1 was MINE-FOR-PARTS. R2 mined the violation core
 * (clone → apply-to-clone → `constraintEngine.validateAll` before/after →
 * diff-by-`ruleId:elementId`) into the `wall.move` aggregate planner's VIOLATIONS
 * branch — `apps/editor/src/engine/consequence/WallMoveConsequencePlanner.ts`
 * (`violationsBranch`), fed by the contract's caller-supplied `PlanningContext`
 * store views instead of `window.*`. R3 retired the PREVIEW PATH:
 *
 *   • `SpeculativeEngine.preview()` and the 4-verb `SpeculativeAction` vocabulary
 *     are DELETED. A planner answers for `executeCommand(type, payload)` as
 *     dispatched (ADR-0324 §1: one funnel, never a parallel action taxonomy) —
 *     the preview surface is now `ConsequencePreviewService`
 *     (`apps/editor/src/engine/consequence/ConsequencePreviewService.ts`), which
 *     routes to the registered planner and returns a `ConsequencePlan`.
 *   • Its only production consumer, `ConsequencePreviewOverlay`, was repointed at
 *     that service in the same phase (the R0 WIRE-PENDING-R3 disposition).
 *   • The `SemanticReadRefusal` idiom (W2-3) — "I found nothing" and "I could not
 *     look" are never the same value — was generalised into the contract's
 *     `ImpactDetermination` / `UndeterminedImpact` (reason `ENGINE_NOT_AVAILABLE`
 *     / `STALE_DERIVED_STATE`). Its 6 pinning tests migrated with the algorithm to
 *     `apps/editor/src/engine/__tests__/WallMovePlannerRefusals.spec.ts`.
 *
 * There is now ONE preview implementation (ADR-0322 §8: converge, not accrete).
 * Do not add a `preview()` back here — new consequence work goes to the contract
 * (`packages/command-bus/src/consequence.ts`) and its planners.
 *
 * ── NEW CONSEQUENCE WORK GOES HERE, NOT THIS FILE ────────────────────────────
 *   contract  → packages/command-bus/src/consequence.ts
 *   planner   → apps/editor/src/engine/consequence/WallMoveConsequencePlanner.ts
 *   preview   → apps/editor/src/engine/consequence/ConsequencePreviewService.ts
 *   purity    → tools/rac-conformance/certification/gates/check-preview-purity.ts
 */

export {};
