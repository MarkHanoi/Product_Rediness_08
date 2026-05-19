// @pryzm/constraint-solver — engine (S52 §4.1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.1
//     (lines 1113-1209) — planegcs WASM porter pattern.
//
// SHAPE — three exports:
//   • `SolverPorter`        — porter contract (`solve` + `diagnose`).
//   • `MockSolver`          — deterministic projection-based solver
//                             that handles the five first constraint
//                             kinds for unit tests + the local-dev
//                             path until the real planegcs WASM
//                             binding ships at S53 D1.
//   • `loadSolver({env})`   — selector mirroring `loadRelay` /
//                             `loadTranscriber` from ai-host. Returns
//                             the mock unless `PLANEGCS_WASM_URL` is
//                             set (in which case the real adapter
//                             would be loaded via dynamic import —
//                             that adapter ships at S53 D1, until
//                             then the selector still falls through
//                             to the mock).

import type {
  ConstraintSet,
  DiagnoseResult,
  PointId,
  ScalarOrParam,
  SketchConstraint,
  SolveHints,
  SolveResult,
  SolveStatus,
  VariableId,
} from './types.js';

/** Porter contract. The sketcher / Web Worker / bench all talk to
 *  this interface; the production planegcs adapter is a separate
 *  module loaded only when the WASM URL is present. */
export interface SolverPorter {
  solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult>;
  diagnose(set: ConstraintSet): Promise<DiagnoseResult>;
}

/** Default convergence tolerance in millimetres. Per planegcs's
 *  default; the spec exit criterion at line 1487 ("0.01mm of
 *  expected solution") is the *test* tolerance — the solver tracks
 *  to a tighter ~0.001 internally so the test margin holds. */
export const DEFAULT_TOLERANCE_MM = 0.001;

/** Default maximum iteration count. Tuned so a 50-constraint
 *  sketch always converges within the spec's < 16 ms wall-clock
 *  budget (line 1488). */
export const DEFAULT_MAX_ITERATIONS = 64;

/** Resolve a `ScalarOrParam` against the set's parameter values
 *  per spec lines 1196-1200. */
export function resolveExpr(
  value: ScalarOrParam,
  parameterValues: Readonly<Record<string, number>> = {},
): number {
  if (typeof value === 'number') return value;
  return parameterValues[value] ?? 0;
}

/** Mock solver — deterministic projection-based, handles the five
 *  first constraint kinds. Tactic per planegcs `Newton-Raphson`-style
 *  iteration but greatly simplified:
 *
 *    1. Build per-constraint residual + projector functions.
 *    2. Iterate — at each step, project onto each constraint's
 *       manifold in order. Track the maximum residual.
 *    3. Stop when max residual < tolerance OR iteration cap reached.
 *
 *  For the snapshot test cases (single-constraint sketches with
 *  isolated entities) this converges to within `DEFAULT_TOLERANCE_MM`
 *  in 1-3 iterations. For cyclic systems (multiple coupled
 *  constraints) it tracks slower than the real planegcs but the
 *  S53-pinned canonical 20-snapshot suite uses planegcs proper.
 *
 *  DOF calculation: |variables| − |constraints touching variables|.
 *  This is the simplest possible DOF counter — the real planegcs
 *  Jacobian-rank counter is more accurate but the mock's number
 *  matches for the canonical isolated cases.
 */
export class MockSolver implements SolverPorter {
  readonly kind = 'mock' as const;

  async solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult> {
    const t0 = nowMs();
    const tolerance = hints?.tolerance ?? DEFAULT_TOLERANCE_MM;
    const maxIterations = hints?.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    const variableKeys = Object.keys(set.variables);
    if (variableKeys.length === 0) {
      return {
        ok: false,
        error: { code: 'NoVariables', message: 'ConstraintSet has no variables.' },
        durationMs: nowMs() - t0,
      };
    }

    // Mutable working copy.
    const values: Record<VariableId, number> = { ...set.variables };

    // Validate constraint shape early — loud about malformed input.
    for (const c of set.constraints) {
      if (!isKnownKind(c)) {
        return {
          ok: false,
          error: { code: 'InvalidConstraint', message: `Unknown constraint kind: ${(c as { kind: string }).kind}` },
          durationMs: nowMs() - t0,
        };
      }
    }

    // Iterate.
    let iterations = 0;
    let maxResidual = Infinity;
    for (let i = 0; i < maxIterations; i++) {
      iterations++;
      maxResidual = 0;
      for (const c of set.constraints) {
        const r = projectConstraint(c, values, set);
        if (r > maxResidual) maxResidual = r;
      }
      if (maxResidual < tolerance) break;
    }

    // DOF — variables minus active independent constraints. The mock
    // counts each constraint as removing 1 DOF for non-fixed kinds
    // and 2 for fixed (which pins both x and y). This matches the
    // planegcs convention for the five first kinds.
    const dof = computeDOF(set, variableKeys.length);

    let status: SolveStatus;
    if (maxResidual >= tolerance) {
      // Did not converge. If DOF < 0 the system is over-constrained;
      // otherwise it's a singularity (e.g. unsolvable cyclic system).
      status = dof < 0 ? 'over-constrained' : 'singular';
    } else if (dof === 0) {
      status = 'well-constrained';
    } else if (dof > 0) {
      status = 'under-constrained';
    } else {
      status = 'over-constrained';
    }

    return {
      ok: true,
      values: Object.freeze({ ...values }),
      status,
      dof,
      durationMs: nowMs() - t0,
      iterations,
    };
  }

  async diagnose(set: ConstraintSet): Promise<DiagnoseResult> {
    const variableKeys = Object.keys(set.variables);
    const dof = computeDOF(set, variableKeys.length);

    // Redundant detection: a constraint is redundant if removing it
    // would not change the DOF. The mock identifies this by
    // detecting duplicate constraint shapes (two constraints that
    // touch the same variables with the same kind / value).
    const seen = new Map<string, string>();
    const redundant: string[] = [];
    for (const c of set.constraints) {
      const sig = constraintSignature(c, set);
      const prior = seen.get(sig);
      if (prior !== undefined) {
        redundant.push(c.id);
      } else {
        seen.set(sig, c.id);
      }
    }

    // Unconstrained variables — those not touched by any constraint.
    const touched = collectTouchedVariables(set);
    const unconstrained: VariableId[] = [];
    for (const v of variableKeys) {
      if (!touched.has(v)) unconstrained.push(v);
    }

    return {
      redundant,
      freeDOF: dof,
      unconstrained,
    };
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isKnownKind(c: SketchConstraint): boolean {
  switch (c.kind) {
    case 'distance-pp':
    case 'parallel':
    case 'perpendicular':
    case 'coincident-pp':
    case 'fixed':
      return true;
    default:
      return false;
  }
}

/** Resolve a PointId to its [x, y] variable pair. Falls back to
 *  the convention `${pointId}-x` / `${pointId}-y` when the set
 *  doesn't supply a `pointVariables` map. */
function resolvePoint(
  pointId: PointId,
  set: ConstraintSet,
): readonly [VariableId, VariableId] {
  const map = set.pointVariables;
  if (map && map[pointId]) return map[pointId];
  return [`${pointId}-x`, `${pointId}-y`];
}

/** Resolve a LineId to its [startPoint, endPoint] pair. Falls
 *  back to the convention `${lineId}-p0` / `${lineId}-p1` when the
 *  set doesn't supply a `lineEndpoints` map. */
function resolveLine(
  lineId: string,
  set: ConstraintSet,
): readonly [PointId, PointId] {
  const map = set.lineEndpoints;
  if (map && map[lineId]) return map[lineId];
  return [`${lineId}-p0`, `${lineId}-p1`];
}

/** Project values onto the constraint's manifold. Returns the
 *  residual (distance from current values to the manifold) BEFORE
 *  projection, so the iterator can decide when to stop. */
function projectConstraint(
  c: SketchConstraint,
  values: Record<VariableId, number>,
  set: ConstraintSet,
): number {
  switch (c.kind) {
    case 'fixed': {
      const [vx, vy] = resolvePoint(c.p, set);
      const dx = values[vx] !== undefined ? c.x - values[vx]! : c.x;
      const dy = values[vy] !== undefined ? c.y - values[vy]! : c.y;
      values[vx] = c.x;
      values[vy] = c.y;
      return Math.hypot(dx, dy);
    }
    case 'coincident-pp': {
      const [vx1, vy1] = resolvePoint(c.p1, set);
      const [vx2, vy2] = resolvePoint(c.p2, set);
      const x1 = values[vx1] ?? 0;
      const y1 = values[vy1] ?? 0;
      const x2 = values[vx2] ?? 0;
      const y2 = values[vy2] ?? 0;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      values[vx1] = mx;
      values[vy1] = my;
      values[vx2] = mx;
      values[vy2] = my;
      return Math.hypot(x1 - x2, y1 - y2);
    }
    case 'distance-pp': {
      const [vx1, vy1] = resolvePoint(c.p1, set);
      const [vx2, vy2] = resolvePoint(c.p2, set);
      const x1 = values[vx1] ?? 0;
      const y1 = values[vy1] ?? 0;
      const x2 = values[vx2] ?? 0;
      const y2 = values[vy2] ?? 0;
      const target = resolveExpr(c.value, set.parameterValues);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const current = Math.hypot(dx, dy);
      const residual = Math.abs(current - target);
      if (current < 1e-9) return residual; // degenerate — leave alone
      // Move p2 along the (p1→p2) direction so the new distance
      // equals target. Keeps p1 fixed (locally — the iteration
      // averages over multiple constraints).
      const ux = dx / current;
      const uy = dy / current;
      values[vx2] = x1 + ux * target;
      values[vy2] = y1 + uy * target;
      return residual;
    }
    case 'parallel': {
      const [pa, pb] = resolveLine(c.l1, set);
      const [pc, pd] = resolveLine(c.l2, set);
      const [vxa, vya] = resolvePoint(pa, set);
      const [vxb, vyb] = resolvePoint(pb, set);
      const [vxc, vyc] = resolvePoint(pc, set);
      const [vxd, vyd] = resolvePoint(pd, set);
      const ax = values[vxa] ?? 0;
      const ay = values[vya] ?? 0;
      const bx = values[vxb] ?? 0;
      const by = values[vyb] ?? 0;
      const cx = values[vxc] ?? 0;
      const cy = values[vyc] ?? 0;
      const dx = values[vxd] ?? 0;
      const dy = values[vyd] ?? 0;
      const v1x = bx - ax;
      const v1y = by - ay;
      const v2x = dx - cx;
      const v2y = dy - cy;
      const cross = v1x * v2y - v1y * v2x;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 < 1e-9 || len2 < 1e-9) return Math.abs(cross);
      // Rotate l2 so it's parallel to l1, preserving l2's length
      // and start point.
      const u1x = v1x / len1;
      const u1y = v1y / len1;
      // Sign: if v2 dotted with v1 is positive, keep direction;
      // else flip.
      const sign = u1x * v2x + u1y * v2y >= 0 ? 1 : -1;
      values[vxd] = cx + u1x * len2 * sign;
      values[vyd] = cy + u1y * len2 * sign;
      return Math.abs(cross) / (len1 * len2 + 1e-9);
    }
    case 'perpendicular': {
      const [pa, pb] = resolveLine(c.l1, set);
      const [pc, pd] = resolveLine(c.l2, set);
      const [vxa, vya] = resolvePoint(pa, set);
      const [vxb, vyb] = resolvePoint(pb, set);
      const [vxc, vyc] = resolvePoint(pc, set);
      const [vxd, vyd] = resolvePoint(pd, set);
      const ax = values[vxa] ?? 0;
      const ay = values[vya] ?? 0;
      const bx = values[vxb] ?? 0;
      const by = values[vyb] ?? 0;
      const cx = values[vxc] ?? 0;
      const cy = values[vyc] ?? 0;
      const dx = values[vxd] ?? 0;
      const dy = values[vyd] ?? 0;
      const v1x = bx - ax;
      const v1y = by - ay;
      const v2x = dx - cx;
      const v2y = dy - cy;
      const dot = v1x * v2x + v1y * v2y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 < 1e-9 || len2 < 1e-9) return Math.abs(dot);
      // Rotate l2 to be perpendicular to l1 — use the +90° rotation
      // of l1's direction (or -90° if v2 was closer to the negative
      // perpendicular, to minimise rotation).
      const u1x = v1x / len1;
      const u1y = v1y / len1;
      // Perpendicular options: (-u1y, u1x) and (u1y, -u1x).
      const optAx = -u1y;
      const optAy = u1x;
      const optBx = u1y;
      const optBy = -u1x;
      const v2u_x = v2x / len2;
      const v2u_y = v2y / len2;
      const dotA = optAx * v2u_x + optAy * v2u_y;
      const dotB = optBx * v2u_x + optBy * v2u_y;
      const useA = dotA >= dotB;
      const px = useA ? optAx : optBx;
      const py = useA ? optAy : optBy;
      values[vxd] = cx + px * len2;
      values[vyd] = cy + py * len2;
      return Math.abs(dot) / (len1 * len2 + 1e-9);
    }
  }
}

/** Compute degrees of freedom. Each variable contributes +1 DOF;
 *  each constraint contributes -N DOF where N is the constraint's
 *  rank (1 for distance/parallel/perpendicular/coincident scalar
 *  reductions, 2 for fixed which pins both x and y). The mock
 *  uses a simplified formula that's accurate for the canonical
 *  isolated test cases. */
function computeDOF(set: ConstraintSet, variableCount: number): number {
  let removed = 0;
  for (const c of set.constraints) {
    switch (c.kind) {
      case 'fixed':
        removed += 2;
        break;
      case 'coincident-pp':
        removed += 2;
        break;
      case 'distance-pp':
      case 'parallel':
      case 'perpendicular':
        removed += 1;
        break;
    }
  }
  return variableCount - removed;
}

function collectTouchedVariables(set: ConstraintSet): Set<VariableId> {
  const touched = new Set<VariableId>();
  for (const c of set.constraints) {
    switch (c.kind) {
      case 'fixed': {
        const [vx, vy] = resolvePoint(c.p, set);
        touched.add(vx);
        touched.add(vy);
        break;
      }
      case 'coincident-pp':
      case 'distance-pp': {
        const [vx1, vy1] = resolvePoint(c.p1, set);
        const [vx2, vy2] = resolvePoint(c.p2, set);
        touched.add(vx1);
        touched.add(vy1);
        touched.add(vx2);
        touched.add(vy2);
        break;
      }
      case 'parallel':
      case 'perpendicular': {
        const [pa, pb] = resolveLine(c.l1, set);
        const [pc, pd] = resolveLine(c.l2, set);
        for (const p of [pa, pb, pc, pd]) {
          const [vx, vy] = resolvePoint(p, set);
          touched.add(vx);
          touched.add(vy);
        }
        break;
      }
    }
  }
  return touched;
}

/** Build a stable signature for redundancy detection. Two constraints
 *  with the same kind + same variable references + same scalar
 *  values produce the same signature. */
function constraintSignature(c: SketchConstraint, set: ConstraintSet): string {
  switch (c.kind) {
    case 'fixed':
      return `fixed|${c.p}|${c.x}|${c.y}`;
    case 'coincident-pp': {
      const [a, b] = [c.p1, c.p2].sort();
      return `coincident|${a}|${b}`;
    }
    case 'distance-pp': {
      const [a, b] = [c.p1, c.p2].sort();
      return `distance|${a}|${b}|${resolveExpr(c.value, set.parameterValues)}`;
    }
    case 'parallel': {
      const [a, b] = [c.l1, c.l2].sort();
      return `parallel|${a}|${b}`;
    }
    case 'perpendicular': {
      const [a, b] = [c.l1, c.l2].sort();
      return `perpendicular|${a}|${b}`;
    }
  }
}

/** Selector mirroring `loadRelay` from `@pryzm/ai-host`. Returns
 *  the mock unless `PLANEGCS_WASM_URL` is set (in which case the
 *  real planegcs adapter would be loaded via dynamic import — that
 *  adapter ships at S53 D1 alongside the sketcher canvas, until
 *  then the selector still falls through to the mock). */
export async function loadSolver(
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<SolverPorter> {
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {});
  const url = env.PLANEGCS_WASM_URL;
  if (!url) return new MockSolver();
  // Real adapter lands at S53 D1; for now fall through.
  // Indirect-eval `Function('s', 'return import(s)')` + non-literal
  // specifier so Vite/Rollup cannot statically resolve the missing
  // module at bundle time (which would break `vite build`).
  try {
    const dynImport = (new Function('s', 'return import(s)') as (s: string) => Promise<unknown>);
    const specifier = './' + 'PlanegcsAdapter.js';
    const mod = await dynImport(specifier);
    if (mod && typeof (mod as { createPlanegcsAdapter?: unknown }).createPlanegcsAdapter === 'function') {
      return (mod as { createPlanegcsAdapter: (u: string) => SolverPorter }).createPlanegcsAdapter(url);
    }
  } catch {
    // Adapter not yet shipped — fall through to mock.
  }
  return new MockSolver();
}
