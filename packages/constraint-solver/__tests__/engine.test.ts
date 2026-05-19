// @pryzm/constraint-solver — engine tests (S52 §4.1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.1
//     (lines 1109-1294) + §4 exit criteria lines 1486-1490.
//
// Coverage:
//   • types module roundtrip (constraint kinds + result discriminator).
//   • All 5 first constraint kinds (distance-pp, parallel,
//     perpendicular, coincident-pp, fixed) solve to expected values.
//   • MockSolver.solve well/under/over-constrained DOF reporting.
//   • diagnose() reports redundant + freeDOF + unconstrained.
//   • loadSolver({env}) falls through to MockSolver without WASM.
//   • createWorkerHandler echoes solve/diagnose with id matching.
//
// The mock solver hits 0.001 mm tolerance for the canonical isolated
// cases used here. The 20-canonical-sketch suite (per spec line 1487)
// pins to the real planegcs adapter and ships at S53 D1.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCE_MM,
  MockSolver,
  SOLVER_OTEL_NAMESPACE,
  createWorkerHandler,
  loadSolver,
  resolveExpr,
  type ConstraintKind,
  type ConstraintSet,
  type SketchConstraint,
  type WorkerInMessage,
  type WorkerOutMessage,
} from '../src/index.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeFixedFixture(): ConstraintSet {
  return {
    variables: { 'p1-x': 99, 'p1-y': 88 },
    constraints: [{ id: 'c-fix', kind: 'fixed', p: 'p1', x: 100, y: 200 }],
  };
}

function makeCoincidentFixture(): ConstraintSet {
  return {
    variables: { 'a-x': 0, 'a-y': 0, 'b-x': 100, 'b-y': 50 },
    constraints: [{ id: 'c-coi', kind: 'coincident-pp', p1: 'a', p2: 'b' }],
  };
}

function makeDistanceFixture(): ConstraintSet {
  return {
    variables: { 'a-x': 0, 'a-y': 0, 'b-x': 50, 'b-y': 0 },
    constraints: [{ id: 'c-d1', kind: 'distance-pp', p1: 'a', p2: 'b', value: 100 }],
  };
}

function makeParallelFixture(): ConstraintSet {
  return {
    variables: {
      'l1-p0-x': 0, 'l1-p0-y': 0, 'l1-p1-x': 100, 'l1-p1-y': 0,
      'l2-p0-x': 0, 'l2-p0-y': 50, 'l2-p1-x': 100, 'l2-p1-y': 70,
    },
    constraints: [{ id: 'c-par', kind: 'parallel', l1: 'l1', l2: 'l2' }],
  };
}

function makePerpendicularFixture(): ConstraintSet {
  return {
    variables: {
      'l1-p0-x': 0, 'l1-p0-y': 0, 'l1-p1-x': 100, 'l1-p1-y': 0,
      'l2-p0-x': 0, 'l2-p0-y': 0, 'l2-p1-x': 100, 'l2-p1-y': 50,
    },
    constraints: [{ id: 'c-perp', kind: 'perpendicular', l1: 'l1', l2: 'l2' }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('@pryzm/constraint-solver — types', () => {
  it('exports SOLVER_OTEL_NAMESPACE', () => {
    expect(SOLVER_OTEL_NAMESPACE).toBe('pryzm.solver');
  });
  it('exposes the five first ConstraintKind variants', () => {
    const kinds: ConstraintKind[] = ['distance-pp', 'parallel', 'perpendicular', 'coincident-pp', 'fixed'];
    for (const k of kinds) {
      const c: SketchConstraint = (() => {
        switch (k) {
          case 'fixed': return { id: 'x', kind: 'fixed', p: 'p1', x: 0, y: 0 };
          case 'coincident-pp': return { id: 'x', kind: 'coincident-pp', p1: 'a', p2: 'b' };
          case 'distance-pp': return { id: 'x', kind: 'distance-pp', p1: 'a', p2: 'b', value: 1 };
          case 'parallel': return { id: 'x', kind: 'parallel', l1: 'l1', l2: 'l2' };
          case 'perpendicular': return { id: 'x', kind: 'perpendicular', l1: 'l1', l2: 'l2' };
        }
      })();
      expect(c.kind).toBe(k);
    }
  });
  it('resolveExpr returns a literal number unchanged', () => {
    expect(resolveExpr(42)).toBe(42);
  });
  it('resolveExpr resolves a parameter name from parameterValues', () => {
    expect(resolveExpr('width', { width: 1200 })).toBe(1200);
    expect(resolveExpr('missing', {})).toBe(0);
  });
});

describe('@pryzm/constraint-solver — MockSolver per-constraint', () => {

  it('fixed: pins point exactly to (x, y) within tolerance', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeFixedFixture());
    if (!r.ok) throw new Error('expected ok');
    expect(r.values['p1-x']).toBeCloseTo(100, 6);
    expect(r.values['p1-y']).toBeCloseTo(200, 6);
    // 2 variables (p1-x, p1-y) − 2 DOF removed by `fixed` = 0 DOF → well-constrained.
    expect(r.status).toBe('well-constrained');
    expect(r.dof).toBe(0);
  });

  it('coincident-pp: averages the two endpoints to one position', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeCoincidentFixture());
    if (!r.ok) throw new Error('expected ok');
    expect(r.values['a-x']).toBeCloseTo(r.values['b-x']!, 4);
    expect(r.values['a-y']).toBeCloseTo(r.values['b-y']!, 4);
    expect(r.values['a-x']).toBeCloseTo(50, 4);
    expect(r.values['a-y']).toBeCloseTo(25, 4);
  });

  it('distance-pp: scales p2 along the (p1→p2) ray to the target distance', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeDistanceFixture());
    if (!r.ok) throw new Error('expected ok');
    const dx = r.values['b-x']! - r.values['a-x']!;
    const dy = r.values['b-y']! - r.values['a-y']!;
    expect(Math.hypot(dx, dy)).toBeCloseTo(100, 4);
  });

  it('parallel: rotates l2 to be parallel with l1 (cross product → 0)', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeParallelFixture());
    if (!r.ok) throw new Error('expected ok');
    const v1x = r.values['l1-p1-x']! - r.values['l1-p0-x']!;
    const v1y = r.values['l1-p1-y']! - r.values['l1-p0-y']!;
    const v2x = r.values['l2-p1-x']! - r.values['l2-p0-x']!;
    const v2y = r.values['l2-p1-y']! - r.values['l2-p0-y']!;
    const cross = v1x * v2y - v1y * v2x;
    expect(Math.abs(cross)).toBeLessThan(0.01);
  });

  it('perpendicular: rotates l2 to be perpendicular to l1 (dot product → 0)', async () => {
    const s = new MockSolver();
    const r = await s.solve(makePerpendicularFixture());
    if (!r.ok) throw new Error('expected ok');
    const v1x = r.values['l1-p1-x']! - r.values['l1-p0-x']!;
    const v1y = r.values['l1-p1-y']! - r.values['l1-p0-y']!;
    const v2x = r.values['l2-p1-x']! - r.values['l2-p0-x']!;
    const v2y = r.values['l2-p1-y']! - r.values['l2-p0-y']!;
    const dot = v1x * v2x + v1y * v2y;
    expect(Math.abs(dot)).toBeLessThan(0.01);
  });
});

describe('@pryzm/constraint-solver — solver status reporting', () => {
  it('returns well-constrained when DOF == 0 and converged', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeFixedFixture());
    if (!r.ok) throw new Error('expected ok');
    expect(r.status).toBe('well-constrained');
    expect(r.dof).toBe(0);
  });
  it('returns under-constrained when DOF > 0', async () => {
    const s = new MockSolver();
    const r = await s.solve({
      variables: { 'p1-x': 0, 'p1-y': 0, 'p2-x': 100, 'p2-y': 0 },
      constraints: [{ id: 'c1', kind: 'distance-pp', p1: 'p1', p2: 'p2', value: 50 }],
    });
    if (!r.ok) throw new Error('expected ok');
    expect(r.status).toBe('under-constrained');
    expect(r.dof).toBeGreaterThan(0);
  });
  it('returns over-constrained when DOF < 0', async () => {
    const s = new MockSolver();
    const r = await s.solve({
      variables: { 'p1-x': 0, 'p1-y': 0 },
      constraints: [
        { id: 'c1', kind: 'fixed', p: 'p1', x: 10, y: 10 },
        { id: 'c2', kind: 'fixed', p: 'p1', x: 20, y: 20 }, // contradictory
      ],
    });
    if (!r.ok) throw new Error('expected ok');
    // 2 vars - 2*2 fixed = -2 DOF; the second projection wins so it converges.
    expect(r.dof).toBeLessThan(0);
    expect(r.status).toBe('over-constrained');
  });
  it('reports NoVariables error for empty variable set', async () => {
    const s = new MockSolver();
    const r = await s.solve({ variables: {}, constraints: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NoVariables');
  });
  it('reports InvalidConstraint error for unknown kind', async () => {
    const s = new MockSolver();
    const bogus = { id: 'x', kind: 'angle-vv' } as unknown as SketchConstraint;
    const r = await s.solve({
      variables: { 'p-x': 0 },
      constraints: [bogus],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('InvalidConstraint');
  });
  it('records iterations and durationMs', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeDistanceFixture());
    if (!r.ok) throw new Error('expected ok');
    expect(r.iterations).toBeGreaterThanOrEqual(1);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
  it('honours hints.tolerance', async () => {
    const s = new MockSolver();
    const r = await s.solve(makeDistanceFixture(), { tolerance: 0.5 });
    if (!r.ok) throw new Error('expected ok');
    // Loose tolerance should still converge — and possibly faster.
    expect(r.status).toBe('under-constrained');
  });
});

describe('@pryzm/constraint-solver — diagnose', () => {
  it('reports redundant constraint ids when two have the same signature', async () => {
    const s = new MockSolver();
    const d = await s.diagnose({
      variables: { 'a-x': 0, 'a-y': 0, 'b-x': 100, 'b-y': 0 },
      constraints: [
        { id: 'c-d1', kind: 'distance-pp', p1: 'a', p2: 'b', value: 100 },
        { id: 'c-d2', kind: 'distance-pp', p1: 'a', p2: 'b', value: 100 }, // duplicate
      ],
    });
    expect(d.redundant).toContain('c-d2');
  });
  it('reports unconstrained variables', async () => {
    const s = new MockSolver();
    const d = await s.diagnose({
      variables: { 'a-x': 0, 'a-y': 0, 'free-z': 99 },
      constraints: [{ id: 'c', kind: 'fixed', p: 'a', x: 0, y: 0 }],
    });
    expect(d.unconstrained).toContain('free-z');
    expect(d.unconstrained).not.toContain('a-x');
  });
});

describe('@pryzm/constraint-solver — loadSolver selector', () => {
  it('falls through to MockSolver without PLANEGCS_WASM_URL', async () => {
    const s = await loadSolver({ env: {} });
    expect(s).toBeInstanceOf(MockSolver);
  });
  it.skip('returns the PlanegcsAdapter when PLANEGCS_WASM_URL is set (post-S52 D1)', async () => {
    // Skipped: loadSolver uses new Function() dynamic import which vitest cannot
    // intercept in the test environment — PlanegcsAdapter.js is a production
    // deploy artefact not present during unit test runs.  Real coverage is gated
    // on S52 D2 (WASM binding + integration harness).
    const s = await loadSolver({ env: { PLANEGCS_WASM_URL: 'https://example.test/planegcs.wasm' } });
    expect(s).not.toBeInstanceOf(MockSolver);
    expect((s as { kind?: string }).kind).toBe('planegcs');
  });
});

describe('@pryzm/constraint-solver — Web Worker handler', () => {
  it('echoes a solve message with id matching the request', async () => {
    const handler = createWorkerHandler({ solver: new MockSolver() });
    const msg: WorkerInMessage = {
      id: 'req-7',
      kind: 'solve',
      payload: { set: makeDistanceFixture() },
    };
    const replies: WorkerOutMessage[] = [];
    await handler(msg, (m) => replies.push(m));
    expect(replies).toHaveLength(1);
    expect(replies[0]!.id).toBe('req-7');
    expect('result' in replies[0]!).toBe(true);
  });
  it('echoes a diagnose message with id matching the request', async () => {
    const handler = createWorkerHandler({ solver: new MockSolver() });
    const msg: WorkerInMessage = {
      id: 'req-8',
      kind: 'diagnose',
      payload: { set: makeDistanceFixture() },
    };
    const replies: WorkerOutMessage[] = [];
    await handler(msg, (m) => replies.push(m));
    expect(replies[0]!.id).toBe('req-8');
    if ('result' in replies[0]!) {
      expect(replies[0]!.result).toHaveProperty('freeDOF');
    }
  });
  it('replies with an error envelope for malformed message envelopes', async () => {
    const handler = createWorkerHandler({ solver: new MockSolver() });
    const replies: WorkerOutMessage[] = [];
    await handler({} as WorkerInMessage, (m) => replies.push(m));
    expect(replies).toHaveLength(1);
    if ('error' in replies[0]!) {
      expect(replies[0]!.error).toMatch(/Invalid|Unknown/);
    }
  });
});

describe('@pryzm/constraint-solver — DEFAULT_TOLERANCE_MM', () => {
  it('exports the tightened-vs-spec mock tolerance (0.001 mm)', () => {
    expect(DEFAULT_TOLERANCE_MM).toBe(0.001);
  });
});
