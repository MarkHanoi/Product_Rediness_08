/**
 * @pryzm/speculative-engine — RETIRED (BIM30 R3, 2026-08-12).
 *
 * This package's preview path (`speculativeEngine.preview` + the `SpeculativeAction`
 * vocabulary + `ConsequencePreview` / `SemanticReadRefusal` types) has been retired per
 * ADR-0322 §8 / ADR-0323. See `./SpeculativeEngine.ts` for the dated removal header and the
 * new homes of what it became:
 *
 *   contract → @pryzm/command-bus (packages/command-bus/src/consequence.ts)
 *   planner  → apps/editor/src/engine/consequence/WallMoveConsequencePlanner.ts
 *   preview  → apps/editor/src/engine/consequence/ConsequencePreviewService.ts
 *
 * The barrel exports nothing — every former consumer has migrated. The package directory is
 * kept only until its scheduled deletion (2026-11-12) to avoid a pnpm-lock desync.
 */

export {};
