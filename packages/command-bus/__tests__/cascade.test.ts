// Cascade runner tests (S10-T6).
//
// Coverage matches the spec test catalog (PHASE-1B-Q2-M4-M6 §S10, line 1141):
//   • single-step cascade fires
//   • 2-wall T-junction recomputes both miters
//   • cycle of 3 walls drops second visit (OTel attribute set)
//   • MAX_CASCADE_DEPTH (16) throws CascadeDepthExceededError
//   • cascade for unrelated cmd is no-op

import { describe, it, expect } from 'vitest';
import {
  CascadeRunner,
  CascadeRunnerError,
  CascadeDepthExceededError,
  MAX_CASCADE_DEPTH,
  defaultExtractEntityId,
  type CascadeRule,
  type CascadeContext,
  type CascadeCommand,
  type CascadeOtelSpan,
} from '../src/cascade.js';

// ── Tiny in-memory OTel-span double for cycle-drop assertions ──────
function makeSpan(): CascadeOtelSpan & {
  events: Array<{ name: string; attrs?: Readonly<Record<string, unknown>> }>;
  attrs: Map<string, string | number | boolean>;
} {
  const events: Array<{ name: string; attrs?: Readonly<Record<string, unknown>> }> = [];
  const attrs = new Map<string, string | number | boolean>();
  return {
    events,
    attrs,
    addEvent(name, a) { events.push({ name, attrs: a }); },
    setAttribute(k, v) { attrs.set(k, v); },
  };
}

// ── A canonical "wall.baseline" cascade — wall.move triggers a
//    wall.recomputeMiter on every neighbour that shares an endpoint.
//    The neighbours table is supplied via ctx.stores so each test can
//    inject its own topology without standing up a real WallStore. ──
type Topology = Readonly<Record<string, readonly string[]>>;

function wallBaselineRule(): CascadeRule {
  return {
    key: 'wall.baseline',
    appliesTo(t) { return t === 'wall.move' || t === 'wall.recomputeMiter'; },
    resolveAffected(cmd, ctx) {
      const topology = (ctx.stores.topology as Topology | undefined) ?? {};
      const id = (cmd.payload as { id: string }).id;
      return topology[id] ?? [];
    },
    synthesize(affectedId) {
      return {
        type: 'wall.recomputeMiter',
        payload: { id: affectedId },
      };
    },
  };
}

describe('CascadeRunner — register / unregister', () => {
  it('register dedupes by key — second register throws', () => {
    const runner = new CascadeRunner();
    runner.register(wallBaselineRule());
    expect(() => runner.register(wallBaselineRule())).toThrow(CascadeRunnerError);
    expect(runner.has('wall.baseline')).toBe(true);
    expect(runner.registeredKeys).toEqual(['wall.baseline']);
  });

  it('register validates that all 3 rule methods are functions', () => {
    const runner = new CascadeRunner();
    expect(() => runner.register({
      key: 'broken',
      appliesTo: () => true,
      resolveAffected: () => [],
      // @ts-expect-error — synthesize missing on purpose
      synthesize: undefined,
    })).toThrow(CascadeRunnerError);
  });

  it('unregister removes the rule', () => {
    const runner = new CascadeRunner();
    runner.register(wallBaselineRule());
    expect(runner.unregister('wall.baseline')).toBe(true);
    expect(runner.has('wall.baseline')).toBe(false);
    expect(runner.unregister('missing')).toBe(false);
  });
});

describe('CascadeRunner.dispatch — happy paths', () => {
  it('cascade for an unrelated cmd is a no-op (returns just the root)', () => {
    const runner = new CascadeRunner();
    runner.register(wallBaselineRule());
    const ctx: CascadeContext = { stores: { topology: {} } };
    const root: CascadeCommand = { type: 'door.create', payload: { id: 'd1' } };
    const { commands, stats } = runner.dispatch(root, ctx);
    expect(commands).toEqual([root]);
    expect(stats.entitiesVisited).toBe(1);
    expect(stats.cyclesDropped).toBe(0);
    expect(stats.maxDepth).toBe(0);
  });

  it('single-step cascade fires (root + 1 follow-on)', () => {
    const runner = new CascadeRunner();
    runner.register(wallBaselineRule());
    const ctx: CascadeContext = {
      stores: { topology: { w1: ['w2'] } as Topology },
    };
    const { commands, stats } = runner.dispatch(
      { type: 'wall.move', payload: { id: 'w1' } },
      ctx,
    );
    expect(commands.map(c => c.type)).toEqual(['wall.move', 'wall.recomputeMiter']);
    expect(commands.map(c => (c.payload as { id: string }).id)).toEqual(['w1', 'w2']);
    expect(stats.entitiesVisited).toBe(2);
    expect(stats.maxDepth).toBe(1);
  });

  it('2-wall T-junction recomputes both miters (wall.move on the stem cascades to crossing wall, which then cascades back — visited-set drops the back-edge)', () => {
    const runner = new CascadeRunner();
    runner.register(wallBaselineRule());
    const ctx: CascadeContext = {
      stores: { topology: { w1: ['w2'], w2: ['w1'] } as Topology },
    };
    const span = makeSpan();
    const { commands, stats } = runner.dispatch(
      { type: 'wall.move', payload: { id: 'w1' } },
      { ...ctx, otel: span },
    );
    expect(commands.map(c => (c.payload as { id: string }).id)).toEqual(['w1', 'w2']);
    expect(stats.entitiesVisited).toBe(2);
    expect(stats.cyclesDropped).toBe(1);
    expect(span.events.some(e => e.name === 'cascade.cycle.dropped')).toBe(true);
    expect(span.attrs.get('cascade.cycles.dropped')).toBe(1);
  });
});

describe('CascadeRunner.dispatch — cycle handling', () => {
  it('cycle of 3 walls drops the back-edge silently and emits the OTel event', () => {
    const runner = new CascadeRunner();
    runner.register(wallBaselineRule());
    // w1 → w2 → w3 → w1   (the back-edge to w1 is a cycle)
    const topology: Topology = { w1: ['w2'], w2: ['w3'], w3: ['w1'] };
    const span = makeSpan();
    const { commands, stats } = runner.dispatch(
      { type: 'wall.move', payload: { id: 'w1' } },
      { stores: { topology }, otel: span },
    );
    expect(commands.map(c => (c.payload as { id: string }).id)).toEqual(['w1', 'w2', 'w3']);
    expect(stats.entitiesVisited).toBe(3);
    expect(stats.cyclesDropped).toBe(1);
    const dropEvent = span.events.find(e => e.name === 'cascade.cycle.dropped');
    expect(dropEvent).toBeDefined();
    expect(dropEvent!.attrs?.['entity.id']).toBe('w1');
  });

  it('MAX_CASCADE_DEPTH throws when rules synthesise FRESH ids at each step', () => {
    const runner = new CascadeRunner();
    // A pathological rule that minted a new id at each hop — exactly the
    // failure mode the depth guard exists to catch (per S10 R2).
    let counter = 0;
    runner.register({
      key: 'pathological',
      appliesTo: (t) => t === 'pathological.recompute',
      resolveAffected: () => ['next-' + (++counter)],
      synthesize: (id) => ({ type: 'pathological.recompute', payload: { id } }),
    });
    expect(() => runner.dispatch(
      { type: 'pathological.recompute', payload: { id: 'root' } },
      { stores: {} },
    )).toThrow(CascadeDepthExceededError);
    // Sanity — depth cap is the one we documented.
    expect(MAX_CASCADE_DEPTH).toBe(16);
  });
});

describe('defaultExtractEntityId', () => {
  it('falls back across id → wallId → entityId', () => {
    expect(defaultExtractEntityId({ type: 'a', payload: { id: 'X' } })).toBe('X');
    expect(defaultExtractEntityId({ type: 'a', payload: { wallId: 'Y' } })).toBe('Y');
    expect(defaultExtractEntityId({ type: 'a', payload: { entityId: 'Z' } })).toBe('Z');
  });

  it('throws CascadeRunnerError when no id field is present', () => {
    expect(() => defaultExtractEntityId({ type: 'a', payload: {} }))
      .toThrow(CascadeRunnerError);
  });

  it('a rule with extractEntityId overrides the default', () => {
    const runner = new CascadeRunner();
    runner.register({
      key: 'slab.outline',
      appliesTo: (t) => t === 'slab.move',
      resolveAffected: () => [],
      synthesize: () => ({ type: 'noop', payload: {} }),
      extractEntityId: (cmd) => (cmd.payload as { slabId: string }).slabId,
    });
    const { commands } = runner.dispatch(
      { type: 'slab.move', payload: { slabId: 's1' } },
      { stores: {} },
    );
    expect(commands).toHaveLength(1);
  });
});
