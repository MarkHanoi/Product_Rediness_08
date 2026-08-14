// PlanegcsAdapter — scaffold tests.
//
// C74 §3.5 coverage statement — what binds to what:
//   • EVERY test constructs the adapter exactly as production does
//     (`new PlanegcsAdapter({ wasmUrl })` / `createPlanegcsAdapter(url)`,
//     no injection). This suite substitutes NO double for the production
//     subject: the injection seam an earlier version used — an
//     `underlying?:` options field whose own docstring forbade production
//     to pass it, flagged M-C ×2 on check-no-hidden-mock's ledger — was
//     DELETED from the adapter on 2026-08-14 (CO-03). Delegation is proven
//     by spying on the REAL `MockSolver` the production construction
//     creates (`vi.spyOn(MockSolver.prototype, …)`), so the delegation
//     tests and the production configuration are the SAME configuration.
//   • NOT covered anywhere: a real planegcs engine. None exists in this
//     repo and none is authorised (C74 §4.5) — `kind` reads 'mock' and the
//     scaffold retirement guard below fails the moment that stops being
//     true.

import { describe, expect, it, vi } from 'vitest';
import {
  createPlanegcsAdapter,
  PlanegcsAdapter,
} from '../src/PlanegcsAdapter.js';
import { loadSolver, MockSolver, type SolverPorter } from '../src/engine.js';
import type { ConstraintSet, SolveHints } from '../src/types.js';

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

describe('PlanegcsAdapter — delegation (production construction; spies on the real MockSolver)', () => {
  it('solve() reaches the MockSolver the production construction creates, arguments intact', async () => {
    const solveSpy = vi.spyOn(MockSolver.prototype, 'solve');
    try {
      const adapter = createPlanegcsAdapter({ wasmUrl: 'file:///x.wasm' });
      const hints: SolveHints = { tolerance: 0.5, maxIterations: 7 };
      const result = await adapter.solve(SAMPLE_SET, hints);
      // The call reached the REAL MockSolver — not a double — with the
      // caller's own arguments.
      expect(solveSpy).toHaveBeenCalledTimes(1);
      expect(solveSpy).toHaveBeenCalledWith(SAMPLE_SET, hints);
      // And the adapter handed back the mock's own result object, unrelabelled.
      expect(result).toBe(await solveSpy.mock.results[0]!.value);
      expect(adapter.kind).toBe('mock');
    } finally {
      solveSpy.mockRestore();
    }
  });

  it('diagnose() reaches the same MockSolver, and its result is returned unaltered', async () => {
    const diagSpy = vi.spyOn(MockSolver.prototype, 'diagnose');
    try {
      const adapter = createPlanegcsAdapter({ wasmUrl: 'file:///x.wasm' });
      // A set with a duplicate constraint and an untouched variable, so
      // "came from the real mock" is checkable on content as well as on the
      // spy: only MockSolver's own redundancy/unconstrained analysis
      // produces exactly this shape.
      const set: ConstraintSet = {
        variables: { 'p-x': 0, 'p-y': 0, 'q-x': 3 },
        constraints: [
          { id: 'c1', kind: 'fixed', p: 'p', x: 5, y: 7 },
          { id: 'c2', kind: 'fixed', p: 'p', x: 5, y: 7 },
        ],
        pointVariables: { p: ['p-x', 'p-y'] },
      };
      const viaAdapter = await adapter.diagnose(set);
      expect(diagSpy).toHaveBeenCalledTimes(1);
      expect(viaAdapter).toBe(await diagSpy.mock.results[0]!.value);
      expect(viaAdapter.redundant).toEqual(['c2']);
      expect(viaAdapter.unconstrained).toEqual(['q-x']);
      // Independent replication: a bare MockSolver on the same input agrees.
      expect(viaAdapter).toEqual(await new MockSolver().diagnose(set));
    } finally {
      diagSpy.mockRestore();
    }
  });

  it('kind is DERIVED from the constructed underlying, not asserted as prose', () => {
    // The adapter reads `kind` off the solver it constructs. With the
    // injection seam deleted, the only constructible underlying is
    // MockSolver, so the derivation is pinned against the one
    // configuration that exists — and the retirement guard above pins
    // that it flips the day a real engine replaces the construction.
    expect(new PlanegcsAdapter({ wasmUrl: 'file:///x.wasm' }).kind).toBe(new MockSolver().kind);
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
