// @pryzm/ai-host — WorkflowRegistry tests (S49 D8).
//
// Spec source: PHASE-3A §S49 lines 125-132 — descriptor-based registry
// with $0.18 per-call ceiling enforcement.

import { describe, expect, it } from 'vitest';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import type { WorkflowDescriptor, WorkflowImpl } from '../src/types.js';

const PLACEHOLDER_IMPL: WorkflowImpl = async () => ({
  proposedCommands: [],
  actualCostUsd: 0,
});

function descriptor(overrides: Partial<WorkflowDescriptor> = {}): WorkflowDescriptor {
  return {
    id: 'ai.floorplan.draft',
    title: 'Floor-plan draft',
    kind: 'floorplan',
    estimatedCostUsd: 0.05,
    ...overrides,
  };
}

describe('WorkflowRegistry — register / get / list', () => {
  it('registers and retrieves a workflow by id', () => {
    const reg = new WorkflowRegistry();
    reg.register(descriptor(), PLACEHOLDER_IMPL);
    expect(reg.has('ai.floorplan.draft')).toBe(true);
    expect(reg.get('ai.floorplan.draft')?.descriptor.title).toBe('Floor-plan draft');
    expect(reg.size()).toBe(1);
  });

  it('throws when re-registering the same id', () => {
    const reg = new WorkflowRegistry();
    reg.register(descriptor(), PLACEHOLDER_IMPL);
    expect(() => reg.register(descriptor(), PLACEHOLDER_IMPL))
      .toThrow(/already registered/);
  });

  it('rejects descriptors that exceed the SPEC-28 §3 $0.18 ceiling', () => {
    const reg = new WorkflowRegistry();
    expect(() => reg.register(
      descriptor({ id: 'too-expensive', estimatedCostUsd: 0.20 }),
      PLACEHOLDER_IMPL,
    )).toThrow(/invalid/);
  });

  it('rejects descriptors with missing id / title / kind', () => {
    const reg = new WorkflowRegistry();
    expect(() => reg.register(descriptor({ id: '' }), PLACEHOLDER_IMPL)).toThrow();
    expect(() => reg.register(descriptor({ id: 'a', title: '' }), PLACEHOLDER_IMPL)).toThrow();
  });

  it('list() returns descriptors in registration order, no impl leaked', () => {
    const reg = new WorkflowRegistry();
    reg.register(descriptor({ id: 'a', estimatedCostUsd: 0.01 }), PLACEHOLDER_IMPL);
    reg.register(descriptor({ id: 'b', estimatedCostUsd: 0.02, kind: 'cv' }), PLACEHOLDER_IMPL);
    const ids = reg.list().map((d) => d.id);
    expect(ids).toEqual(['a', 'b']);
    expect((reg.list()[0] as { impl?: unknown }).impl).toBeUndefined();
  });

  it('_clear empties the registry', () => {
    const reg = new WorkflowRegistry();
    reg.register(descriptor(), PLACEHOLDER_IMPL);
    reg._clear();
    expect(reg.size()).toBe(0);
  });
});
