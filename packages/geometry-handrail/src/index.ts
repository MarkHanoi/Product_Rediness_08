/**
 * @pryzm/geometry-handrail — the free-standing HANDRAIL family.
 *
 * ─── WHY THIS PACKAGE EXISTS (C95 §14.2 / §15.0 Q1, ISSUE-LOG L-988) ─────────
 *
 * Every other element family has its own `packages/geometry-<family>`. Handrail
 * did not: five of its source files sat inside `packages/geometry-stair/`. That
 * was measured, in both directions, and the measurement is what decided the move:
 *
 *   · handrail → stair: **ZERO.** `HandrailFragmentBuilder`, `HandrailTool`,
 *     `HandrailLevelCleanupHandler` and `handrailRunGenerators` imported only
 *     `@pryzm/core-app-model`, `@pryzm/renderer-three`, `@pryzm/command-registry`,
 *     `@pryzm/snapping` and `@thatopen/components`. No `./Stair*` import existed.
 *   · stair → handrail: **ZERO.** The only `./Handrail*` references anywhere in
 *     that package were five re-export lines in its `index.ts`. The two stair
 *     files that mention "Handrail" (`StairRailingTypeMapping`,
 *     `StairRailingTypes`) read `HandrailTypeDefinition` from
 *     `@pryzm/core-app-model` — the shared catalogue, not the neighbour.
 *
 * ⇒ The co-location was **accidental filing**, not design. With standalone
 * railings now a first-class requirement (C95 §15), a family-sized subsystem
 * living inside another family's package is a C84 **EI-1** problem: the family's
 * authority had no home of its own.
 *
 * ⚠ THIS IS NOT THE SAME QUESTION AS "which railing concept is this?".
 * C95 §1.1 measures THREE railing concepts, and only one of them is this family:
 *
 *   · `HandrailFragmentBuilder` — **THIS PACKAGE.** Free-standing handrails and
 *     guards, `handrailStore`, `HandrailData`.
 *   · `StairRailingBuilder` — a **genuinely different family** that belongs in
 *     `@pryzm/geometry-stair` and stays there. It has its own store
 *     (`stairRailingStore`), its own record (`StairRailingConfig`), and it slopes
 *     correctly where this one historically could not.
 *   · `produceHandrail` (`geometry-kernel`) — Stack B, unreachable, and ⛔ NOT
 *     deletable while ADR-0331 §D5 is an open founder question.
 *
 * ⛔ ONE HOME, NOT TWO. `@pryzm/geometry-stair` no longer re-exports any handrail
 * symbol. Leaving a compatibility re-export would be the duplication C84 §3.5
 * exists to prevent, and this family already carries one of those (C95 §3.2's
 * duplicate persistence pair) plus had a second (L-987's three byte-identical
 * snapshot helpers) — of which the geometry-stair copy is **deleted in this move**,
 * since a file with zero importers has no consumers to break.
 */

export { HandrailFragmentBuilder } from './HandrailFragmentBuilder';
export { HandrailLevelCleanupHandler } from './HandrailLevelCleanupHandler';
export { HandrailTool } from './HandrailTool';

// §FEAT-HANDRAIL-CREATION-PARITY (C95 §14.1) — pure run geometry for the seven
// creation modes (linear / ortho / curved / by-slab / square / circular / ellipse).
// No store, no THREE, no DOM, so every mode is provable by a unit test that runs
// the same function the plan tool runs.
export * from './handrailRunGenerators';
// §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5) — the ONE pure station
// function, its three end conditions, and the DERIVED post id. Named exports,
// not a wildcard: a `export *` cannot be audited by grepping for the names you
// know, which cost this lane a red tree once already.
export { postStations, derivedPostId, DEFAULT_HANDRAIL_END_CONDITION } from './postStations';
export type { HandrailEndCondition } from './postStations';

// ⚠ `HandrailRunGeometry.ts` is NOT exported. It is C95 §11 row 25's open item:
// 338 lines, 282 of them specification, with exactly ONE importer — its own test —
// and `handrailRunGenerators.ts` now occupies part of its intended ground. Wiring
// it or deleting it is a decision, and exporting it here would quietly make it
// look adopted. It moved with the family so the decision has one place to happen.

// §FEAT-HANDRAIL-TYPE-PROJECTION (L-1105) — THE ONE answer to "what does applying
// this railing type mean?". The property panel, the `element.changeType` bus branch
// and RAC all call it; there is no second copy of the 13-field materialisation.
export { resolveHandrailTypeFields, HANDRAIL_TYPE_FIELD_NAMES } from './handrailTypeProjection';
export type { HandrailTypeLike, HandrailTypeFields } from './handrailTypeProjection';

// ─── §FIX-HANDRAIL-3D-MODE-BLIND (L-1106 / C95 §15.13) ───────────────────────
//
// The 3-D `HandrailTool` had NO mode awareness: the bar offered seven modes in
// 3-D and the pipeline implemented one. The four modules below are the fix, and
// they are here — in the GEOMETRY package — for a structural reason, not a
// filing one: `HandrailTool` lives in this package and cannot import `apps/editor`,
// so an authoring store filed under `apps/editor/.../plantools/` was, by
// construction, unreadable from one of the two surfaces that had to agree.
//
// ⭐ This mirrors `@pryzm/geometry-stair`, where `getStairToolConfig` and
// `StairPathToolController` live beside the geometry for exactly this reason and
// the plan / 3-D handlers are thin. `elementCreationMatrix` already names
// `stair-path` as the dual-view reference implementation.
export {
    setActiveHandrailDrawMode,
    resolveActiveHandrailDrawMode,
    setActiveHandrailTypeId,
    resolveActiveHandrailTypeId,
    isHandrailDrawMode,
    captureHandrailBySlabSelection,
    setHandrailBySlabTarget,
    resolveHandrailBySlabTarget,
    __resetActiveHandrailAuthoringForTests,
} from './handrailAuthoring';
export type { HandrailDrawMode } from './handrailAuthoring';

export {
    resolveArmedHandrailSpec,
    handrailSharedPayload,
    UNTYPED_HANDRAIL_HEIGHT,
    UNTYPED_HANDRAIL_THICKNESS,
} from './handrailSpec';
export type { ResolvedHandrailSpec } from './handrailSpec';

export { dispatchHandrailRun, executeHandrailBySlab } from './handrailCommit';
export type { HandrailBySlabOutcome, HandrailDispatcher } from './handrailCommit';

export { HandrailSketchController } from './HandrailSketchController';
export type {
    HandrailSketchHost,
    HandrailSketchPreviewPort,
    HandrailSketchPreviewState,
} from './HandrailSketchController';
