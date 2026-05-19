// @pryzm/constraint-solver — type surface (S52 §4.1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.1
//     (lines 1109-1294) — planegcs WASM + Web Worker integration.
//   • `[ADR-029-pdf-to-bim-scope.md]` — PDF-to-BIM moat depends on
//     the same constraint solver for downstream Stage 4 review-queue
//     consistency checks (S60).
//
// PURE — zero deps on @pryzm/command-bus, @pryzm/stores, THREE,
// DOM, or Node primitives. Bake-worker safe.
//
// SHAPE — `ConstraintSet` flows in (variables + constraints +
// optional parameter values), `SolveResult` flows out (well /
// under / over-constrained + new variable values + diagnostics).

/** The five first constraint kinds the S52 sketcher integration
 *  exposes per spec line 1486. The full planegcs catalogue (~30
 *  kinds) lands incrementally at S53–S55 alongside the sketcher's
 *  construction-geometry tools. */
export type ConstraintKind =
  | 'distance-pp'      // distance between two points
  | 'parallel'         // two lines parallel
  | 'perpendicular'    // two lines perpendicular
  | 'coincident-pp'    // two points share position
  | 'fixed';           // point pinned to (x, y)

/** Variable id — by convention the sketcher uses `${entityId}-x${i}`
 *  and `${entityId}-y${i}` so each entity-endpoint gets two
 *  variables. The solver treats them as opaque strings. */
export type VariableId = string;

/** Point id — by convention `${entityId}-${vertexIndex}`. The
 *  solver expands it into the matching `-x` / `-y` variable pair. */
export type PointId = string;

/** Line id — by convention `${entityId}` for a single-segment line
 *  primitive. The solver dereferences via the line's two points. */
export type LineId = string;

/** A scalar value for distance / angle constraints. Either a
 *  literal number (mm or radians) OR the name of a parameter from
 *  `ConstraintSet.parameterValues`. The solver resolves the name
 *  lookup via `resolveExpr` per spec lines 1196-1200. */
export type ScalarOrParam = number | string;

/** Discriminated union — one variant per kind. Field names match
 *  the planegcs API per spec lines 1142-1170. */
export type SketchConstraint =
  | { readonly id: string; readonly kind: 'distance-pp'; readonly p1: PointId; readonly p2: PointId; readonly value: ScalarOrParam }
  | { readonly id: string; readonly kind: 'parallel'; readonly l1: LineId; readonly l2: LineId }
  | { readonly id: string; readonly kind: 'perpendicular'; readonly l1: LineId; readonly l2: LineId }
  | { readonly id: string; readonly kind: 'coincident-pp'; readonly p1: PointId; readonly p2: PointId }
  | { readonly id: string; readonly kind: 'fixed'; readonly p: PointId; readonly x: number; readonly y: number };

/** The input to `solve()`. Variables map to initial values; the
 *  solver computes new values that satisfy the constraints (or
 *  reports under / over-constrained). */
export interface ConstraintSet {
  /** All scalar variables in the system (e.g. `wall-1-x0` → 1234.5).
   *  Initial values come from the sketcher's current entity
   *  positions. */
  readonly variables: Readonly<Record<VariableId, number>>;
  /** All constraints to satisfy. */
  readonly constraints: readonly SketchConstraint[];
  /** Named parameter values used by `ScalarOrParam` lookups. */
  readonly parameterValues?: Readonly<Record<string, number>>;
  /** Mapping from `PointId` → its `[x-var, y-var]` pair. The
   *  sketcher builds this when it walks its entity tree. */
  readonly pointVariables?: Readonly<Record<PointId, readonly [VariableId, VariableId]>>;
  /** Mapping from `LineId` → `[startPoint, endPoint]`. */
  readonly lineEndpoints?: Readonly<Record<LineId, readonly [PointId, PointId]>>;
}

/** Optional hints the caller can pass — e.g. "this constraint was
 *  the most-recently-edited so prefer leaving it satisfied at the
 *  expense of others". The mock solver ignores hints; the real
 *  planegcs adapter uses them as starting-point preferences. */
export interface SolveHints {
  /** Maximum iterations (mock solver default 32). */
  readonly maxIterations?: number;
  /** Convergence tolerance (mock solver default 0.001 mm). */
  readonly tolerance?: number;
  /** Constraint id to bias toward when the system is
   *  over-constrained. */
  readonly favourConstraintId?: string;
}

/** Status of a solve attempt. Per planegcs convention:
 *   - `'well-constrained'`  → DOF == 0, unique solution found.
 *   - `'under-constrained'` → DOF > 0, solution exists but not unique.
 *   - `'over-constrained'`  → DOF < 0, redundant constraints.
 *   - `'singular'`          → numerical failure (Jacobian singular).
 */
export type SolveStatus =
  | 'well-constrained'
  | 'under-constrained'
  | 'over-constrained'
  | 'singular';

/** Result of one `solve()` call — discriminated on `ok`. */
export type SolveResult =
  | {
      readonly ok: true;
      /** New variable values after solving — keys match
       *  `ConstraintSet.variables`. */
      readonly values: Readonly<Record<VariableId, number>>;
      /** Final status. */
      readonly status: SolveStatus;
      /** Degrees of freedom remaining (0 = fully determined,
       *  positive = under-constrained, negative = over-constrained). */
      readonly dof: number;
      /** Wall-clock time in milliseconds for this solve. */
      readonly durationMs: number;
      /** Iteration count — debug / diagnostics. */
      readonly iterations: number;
    }
  | {
      readonly ok: false;
      readonly error: { readonly code: 'Singular' | 'NoVariables' | 'InvalidConstraint'; readonly message: string };
      readonly durationMs: number;
    };

/** Result of one `diagnose()` call — used by the sketcher to highlight
 *  redundant constraints in red and report the running DOF in the
 *  status bar (per spec line 1100 exit criterion). */
export interface DiagnoseResult {
  /** Constraint ids the solver judges redundant — removing any of
   *  them would not under-constrain the system. */
  readonly redundant: readonly string[];
  /** Remaining DOF (degrees of freedom). */
  readonly freeDOF: number;
  /** Variables touched by zero constraints — fully free. */
  readonly unconstrained: readonly VariableId[];
}

/** Telemetry attribute namespace per VI-AI-ELEMENT-CREATOR §3 line
 *  2220. Exported as a const so worker + bench + handler share one
 *  source of truth. */
export const SOLVER_OTEL_NAMESPACE = 'pryzm.solver' as const;
