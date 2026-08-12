// @pryzm/constraint-solver — public barrel (S52 §4.1).

export {
  StairConstraintEngine,
  type ConstraintValidationResult,
  type ConstraintViolation,
  type StairComputedParameters,
  type StairValidationInput,
  type ValidationResult,
} from './stair-constraint-engine.js';

export type {
  ConstraintKind,
  ConstraintSet,
  DiagnoseResult,
  LineId,
  PointId,
  ScalarOrParam,
  SketchConstraint,
  SolveHints,
  SolveResult,
  SolveStatus,
  VariableId,
} from './types.js';
export { SOLVER_OTEL_NAMESPACE } from './types.js';

export {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_TOLERANCE_MM,
  loadSolver,
  MockSolver,
  resolveExpr,
  type SolverPorter,
} from './engine.js';

// `./worker.js` (`createWorkerHandler` + its message types) was DELETED
// 2026-08-12 (C74 §3.8, ADR-0323 wire-or-delete): it had ZERO production
// callers, and the WASM binding whose off-thread path it scaffolded is
// unauthorised until C74 §4.2(c) is answered. Restore from git history if a
// binding is ever authorised AND a worker path is proven necessary.

// ── Sprint H P9.2 (2026-05-10) — Stair policy + validation ──────────────────
export type {
    LevelTraversalDecision,
} from './LevelTraversalPolicy.js';
export { LevelTraversalPolicy } from './LevelTraversalPolicy.js';

export type {
    StairCodeRegion,
    StairValidationContext,
} from './StairValidationAuthority.js';
export {
    STAIR_CONSTRAINTS_REGIONS,
    StairValidationAuthority,
} from './StairValidationAuthority.js';
