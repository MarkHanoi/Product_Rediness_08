// PlanegcsAdapter — scaffold tests (S52 D1).
//
// The real WASM binding lands at S52 D2; for D1 we verify (a) the
// adapter shape, (b) the public factory contract, (c) end-to-end
// integration with `loadSolver()` so the dynamic-import path works.

import { describe, expect, it } from 'vitest';
import {
  createPlanegcsAdapter,
  PlanegcsAdapter,
} from '../src/PlanegcsAdapter.js';
import { loadSolver, MockSolver, type SolverPorter } from '../src/engine.js';
import type { ConstraintSet, DiagnoseResult, SolveHints, SolveResult } from '../src/types.js';

describe('PlanegcsAdapter — factory contract', () => {
  it('createPlanegcsAdapter accepts a URL string', () => {
    const porter = createPlanegcsAdapter('file:///fake/planegcs.wasm');
    expect(porter).toBeInstanceOf(PlanegcsAdapter);
    expect((porter as PlanegcsAdapter).wasmUrl).toBe('file:///fake/planegcs.wasm');
  });

  it('createPlanegcsAdapter accepts an options object', () => {
    const porter = createPlanegcsAdapter({ wasmUrl: 'https://cdn/planegcs.wasm' });
    expect(porter).toBeInstanceOf(PlanegcsAdapter);
    expect((porter as PlanegcsAdapter).wasmUrl).toBe('https://cdn/planegcs.wasm');
  });

  it('createPlanegcsAdapter throws when wasmUrl is missing or non-string', () => {
    expect(() => createPlanegcsAdapter('')).toThrow(/wasmUrl is required/);
    // Type-cast away from PlanegcsAdapterOptions to exercise the runtime guard.
    expect(() => createPlanegcsAdapter({ wasmUrl: 42 as unknown as string })).toThrow(/wasmUrl is required/);
  });

  it('factory exposes kind="planegcs" so callers can branch in telemetry', () => {
    const porter = createPlanegcsAdapter('file:///x.wasm');
    expect((porter as PlanegcsAdapter).kind).toBe('planegcs');
  });
});

describe('PlanegcsAdapter — delegation (S52 D1 scaffold)', () => {
  const SAMPLE_SET: ConstraintSet = {
    variables: { 'p-x': 0, 'p-y': 0 },
    constraints: [
      { id: 'c1', kind: 'fixed', p: 'p', x: 5, y: 7 },
    ],
    pointVariables: { p: ['p-x', 'p-y'] },
  };

  it('delegates solve() to the injected underlying SolverPorter', async () => {
    let solveCalls = 0;
    const stub: SolverPorter = {
      async solve(_set: ConstraintSet, _hints?: SolveHints): Promise<SolveResult> {
        solveCalls++;
        return {
          ok: true,
          values: { 'p-x': 5, 'p-y': 7 },
          status: 'well-constrained',
          dof: 0,
          durationMs: 0.1,
          iterations: 1,
        };
      },
      async diagnose(_set: ConstraintSet): Promise<DiagnoseResult> {
        return { redundant: [], freeDOF: 0, unconstrained: [] };
      },
    };
    const adapter = createPlanegcsAdapter({ wasmUrl: 'file:///x.wasm', underlying: stub });
    const result = await adapter.solve(SAMPLE_SET);
    expect(solveCalls).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values).toEqual({ 'p-x': 5, 'p-y': 7 });
    }
  });

  it('delegates diagnose() to the injected underlying SolverPorter', async () => {
    let diagCalls = 0;
    const stub: SolverPorter = {
      async solve(_set: ConstraintSet): Promise<SolveResult> {
        return {
          ok: true,
          values: {},
          status: 'well-constrained',
          dof: 0,
          durationMs: 0,
          iterations: 0,
        };
      },
      async diagnose(_set: ConstraintSet): Promise<DiagnoseResult> {
        diagCalls++;
        return { redundant: ['c1'], freeDOF: 1, unconstrained: ['v-z'] };
      },
    };
    const adapter = createPlanegcsAdapter({ wasmUrl: 'file:///x.wasm', underlying: stub });
    const result = await adapter.diagnose(SAMPLE_SET);
    expect(diagCalls).toBe(1);
    expect(result.redundant).toEqual(['c1']);
    expect(result.freeDOF).toBe(1);
  });

  it('falls back to MockSolver when no underlying is supplied (D1 default)', async () => {
    const adapter = createPlanegcsAdapter('file:///x.wasm') as PlanegcsAdapter;
    const result = await adapter.solve(SAMPLE_SET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values['p-x']).toBeCloseTo(5, 6);
      expect(result.values['p-y']).toBeCloseTo(7, 6);
      expect(result.status).toBe('well-constrained');
    }
  });
});

describe('PlanegcsAdapter — integration with loadSolver()', () => {
  it('loadSolver returns MockSolver when PLANEGCS_WASM_URL is unset', async () => {
    const porter = await loadSolver({ env: {} });
    expect(porter).toBeInstanceOf(MockSolver);
  });

  it.skip('loadSolver returns PlanegcsAdapter when PLANEGCS_WASM_URL is set', async () => {
    // Skipped: loadSolver uses new Function() dynamic import which vitest cannot
    // intercept in the test environment — the real PlanegcsAdapter.js module
    // is not available at test time (WASM file is a production deploy artefact).
    // Integration coverage requires a real planegcs.wasm; tracked as S52-D2.
    const porter = await loadSolver({ env: { PLANEGCS_WASM_URL: 'file:///x.wasm' } });
    expect(porter).toBeInstanceOf(PlanegcsAdapter);
    expect((porter as PlanegcsAdapter).wasmUrl).toBe('file:///x.wasm');
  });
});
