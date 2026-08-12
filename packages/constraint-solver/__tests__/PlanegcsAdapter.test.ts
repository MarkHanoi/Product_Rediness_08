// PlanegcsAdapter — scaffold tests.
//
// C74 §3.5 coverage statement — what binds to what:
//   • "delegation (seam)" injects `opts.underlying`, the field production
//     MUST NOT pass. Those tests cover the injection seam ONLY.
//   • "production path" constructs `new PlanegcsAdapter(...)` with NO
//     injection — the `?? new MockSolver()` fallback every production
//     construction takes — and asserts the adapter TELLS THE TRUTH about
//     it (kind='mock', intendedEngine='planegcs', first-call warning).
//   • NOT covered anywhere: a real planegcs engine. None exists in this
//     repo and none is authorised (C74 §4.5).

import { describe, expect, it, vi } from 'vitest';
import {
  createPlanegcsAdapter,
  PlanegcsAdapter,
} from '../src/PlanegcsAdapter.js';
import { loadSolver, MockSolver, type SolverPorter } from '../src/engine.js';
import type { ConstraintSet, DiagnoseResult, SolveHints, SolveResult } from '../src/types.js';

const SAMPLE_SET: ConstraintSet = {
  variables: { 'p-x': 0, 'p-y': 0 },
  constraints: [
    { id: 'c1', kind: 'fixed', p: 'p', x: 5, y: 7 },
  ],
  pointVariables: { p: ['p-x', 'p-y'] },
};

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
});

describe('PlanegcsAdapter — PRODUCTION path (no injection — the config production actually uses)', () => {
  it('reports kind="mock" — the truth about what executes (C74 §3.1)', () => {
    const porter = new PlanegcsAdapter({ wasmUrl: 'file:///x.wasm' });
    expect(porter.kind).toBe('mock');
  });

  it('scaffold retirement guard — FAILS the moment a real engine executes (C74 §3.4)', () => {
    // Referenced by the C74 §3.4 header in src/PlanegcsAdapter.ts. If a real
    // planegcs binding ever lands, kind stops being 'mock' and this test
    // fails, forcing the scaffold header + this guard to be retired together.
    const porter = createPlanegcsAdapter('file:///x.wasm');
    expect(porter.kind).toBe('mock');
    expect((porter as PlanegcsAdapter).intendedEngine).toBe('planegcs');
  });

  it('a consumer can detect the stand-in from OUTSIDE, without reading source (C74 §3.2)', () => {
    // Exactly what a caller holding only the SolverPorter shape can see.
    const porter: SolverPorter = createPlanegcsAdapter('file:///x.wasm');
    const isStandIn = porter.kind === 'mock';
    expect(isStandIn).toBe(true);
    // Intent is a SEPARATE field — never readable as capability.
    expect(porter.kind).not.toBe('planegcs');
  });

  it('emits a one-time console warning on the first call (C74 §3.2 boundary signal)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const porter = new PlanegcsAdapter({ wasmUrl: 'file:///x.wasm' });
      await porter.solve(SAMPLE_SET);
      await porter.solve(SAMPLE_SET);
      await porter.diagnose(SAMPLE_SET);
      const standInWarnings = warn.mock.calls.filter((c) => /SCAFFOLD/.test(String(c[0])));
      expect(standInWarnings).toHaveLength(1);
      expect(String(standInWarnings[0]![0])).toMatch(/kind='mock'/);
    } finally {
      warn.mockRestore();
    }
  });

  it('solves via the mock and says so — mock output is never labelled planegcs output', async () => {
    const porter = new PlanegcsAdapter({ wasmUrl: 'file:///x.wasm' });
    const result = await porter.solve(SAMPLE_SET);
    expect(porter.kind).toBe('mock');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values['p-x']).toBeCloseTo(5, 6);
      expect(result.values['p-y']).toBeCloseTo(7, 6);
      expect(result.status).toBe('well-constrained');
    }
  });
});

describe('PlanegcsAdapter — delegation (seam; injects the field production MUST NOT pass)', () => {
  it('delegates solve() to the injected underlying, and reports ITS declared kind', async () => {
    let solveCalls = 0;
    const stub: SolverPorter = {
      kind: 'test',
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
    // kind reflects the ACTUAL underlying — here the stub's own declared kind.
    expect(adapter.kind).toBe('test');
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
});

describe('PlanegcsAdapter — integration with loadSolver()', () => {
  it('loadSolver returns MockSolver when PLANEGCS_WASM_URL is unset (the stated default)', async () => {
    const porter = await loadSolver({ env: {} });
    expect(porter).toBeInstanceOf(MockSolver);
    expect(porter.kind).toBe('mock'); // labelled, at its own boundary
  });

  it('CONFIGURED is never a silent mock: adapter binds honestly, or the failure is VISIBLE (C74 §3.3)', async () => {
    // Both outcomes below are C74-compliant; the one thing that must never
    // happen — and used to — is a bare MockSolver returned as if nothing
    // went wrong when the caller explicitly configured an engine URL.
    let porter: SolverPorter | undefined;
    let err: unknown;
    try {
      porter = await loadSolver({ env: { PLANEGCS_WASM_URL: 'file:///x.wasm' } });
    } catch (e) {
      err = e;
    }
    if (err !== undefined) {
      // configured-but-failed → a typed, attributable failure
      expect(String(err)).toMatch(/PLANEGCS_WASM_URL/);
      expect(String(err)).toMatch(/could not be loaded/);
      expect(String(err)).toMatch(/file:\/\/\/x\.wasm/);
    } else {
      // the adapter module bound → the porter must tell the truth about itself
      expect(porter).toBeInstanceOf(PlanegcsAdapter);
      expect(porter!.kind).toBe('mock');
      expect((porter as PlanegcsAdapter).intendedEngine).toBe('planegcs');
    }
  });
});
