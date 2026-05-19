// @pryzm/ai-host — AiPlane tests (S49 D8).
//
// Spec source: PHASE-3A §S49 lines 102-168 — first-class L7.5 plane
// with bus + queue + cost meter + workflow registry, $0.18 per-call
// ceiling, pre-call rejection routed to the approval queue.

import { describe, expect, it, vi } from 'vitest';
import { AiBus, type AiBusEvent } from '../src/AiBus.js';
import { AiPlane } from '../src/AiPlane.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import { CostMeter, type AiUsageRow } from '@pryzm/ai-cost';
import type {
  AiApprovalQueueLike,
  AiPendingAction,
  WorkflowImpl,
} from '../src/types.js';

class MemoryQueue implements AiApprovalQueueLike {
  readonly items: AiPendingAction[] = [];
  enqueue(action: AiPendingAction): void { this.items.push(action); }
}

function makePlane(opts: {
  budget?: (projectId: string) => number;
  preCallRejection?: boolean;
  usage?: AiUsageRow[];
} = {}) {
  const queue = new MemoryQueue();
  const bus = new AiBus({ otelPrefix: 'pryzm.ai.test' });
  const registry = new WorkflowRegistry();
  const usage: AiUsageRow[] = opts.usage ?? [];
  const meter = new CostMeter({
    perCallCeilingUsd: 0.18,
    ...(opts.budget ? { perProjectMonthlyBudget: opts.budget } : {}),
    preCallRejection: opts.preCallRejection ?? true,
    usageSink: (row) => { usage.push(row); },
  });
  const plane = new AiPlane({
    approvalQueue: queue,
    bus,
    costMeter: meter,
    workflowRegistry: registry,
  });
  return { plane, queue, bus, registry, meter, usage };
}

const goodImpl: WorkflowImpl = async () => ({
  proposedCommands: [{ command: 'floor.add', payload: { area: 1 } }],
  actualCostUsd: 0.04,
});

describe('AiPlane.submit — happy path', () => {
  it('runs the workflow, records cost, enqueues a pending action', async () => {
    const { plane, queue, bus, usage } = makePlane();
    plane.registerWorkflow(
      { id: 'ai.floorplan.draft', title: 'Draft', kind: 'floorplan', estimatedCostUsd: 0.05 },
      goodImpl,
    );

    const events: AiBusEvent[] = [];
    bus.onAny((e) => events.push(e));

    const action = await plane.submit({
      workflow: 'ai.floorplan.draft',
      projectId: 'P-1',
      actorId: 'U-1',
      input: { brief: 'flat' },
    });

    expect(action.status).toBe('pending');
    expect(action.workflow).toBe('floorplan');
    expect(action.proposedCommands).toHaveLength(1);
    expect(action.estimatedCostUsd).toBeCloseTo(0.04, 6);

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toBe(action);

    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual(['workflow.start', 'workflow.propose']);

    expect(usage).toHaveLength(1);
    expect(usage[0]!.workflow).toBe('ai.floorplan.draft');
    expect(usage[0]!.projectId).toBe('P-1');
    expect(usage[0]!.costUsd).toBeCloseTo(0.04, 6);
  });

  it('throws if workflow id is not registered', async () => {
    const { plane } = makePlane();
    await expect(plane.submit({
      workflow: 'ai.unknown',
      projectId: 'P-1',
      actorId: 'U-1',
    })).rejects.toThrow(/not registered/);
  });
});

describe('AiPlane.submit — pre-call budget rejection', () => {
  it('rejects when estimated cost exceeds the $0.18 per-call ceiling', async () => {
    const { plane, queue, bus, usage } = makePlane();
    plane.registerWorkflow(
      { id: 'ai.heavy', title: 'Heavy', kind: 'cv', estimatedCostUsd: 0.05 },
      goodImpl,
    );
    const events: AiBusEvent[] = [];
    bus.onAny((e) => events.push(e));

    const action = await plane.submit({
      workflow: 'ai.heavy',
      projectId: 'P-2',
      actorId: 'U-1',
      // Override the descriptor to push past the ceiling.
      estimatedCostUsd: 0.25,
    });

    expect(action.status).toBe('rejected');
    expect(action.proposedCommands).toHaveLength(0);
    expect(queue.items[0]!.status).toBe('rejected');

    expect(events.map((e) => e.kind)).toEqual(['workflow.reject']);
    expect((events[0]!.payload as { reason: string }).reason)
      .toMatch(/Per-call ceiling/);

    // No cost recorded for rejected calls (impl never ran).
    expect(usage).toHaveLength(0);
  });

  it('rejects when monthly budget for the project would be exceeded', async () => {
    const { plane, queue } = makePlane({ budget: () => 0.10 });
    plane.registerWorkflow(
      { id: 'ai.floorplan.draft', title: 'Draft', kind: 'floorplan', estimatedCostUsd: 0.08 },
      goodImpl,
    );

    // First call: 0.08 < 0.10 → ok
    const a1 = await plane.submit({ workflow: 'ai.floorplan.draft', projectId: 'P-3', actorId: 'U' });
    expect(a1.status).toBe('pending');

    // Second call: 0.08 + 0.08 > 0.10 → rejected
    const a2 = await plane.submit({ workflow: 'ai.floorplan.draft', projectId: 'P-3', actorId: 'U' });
    expect(a2.status).toBe('rejected');
    expect(queue.items.map((i) => i.status)).toEqual(['pending', 'rejected']);
  });
});

describe('AiPlane.submit — error path', () => {
  it('emits workflow.error and rethrows when the impl throws', async () => {
    const { plane, bus } = makePlane();
    const events: AiBusEvent[] = [];
    bus.onAny((e) => events.push(e));
    plane.registerWorkflow(
      { id: 'ai.boom', title: 'Boom', kind: 'rules', estimatedCostUsd: 0.01 },
      async () => { throw new Error('handler failed'); },
    );

    await expect(plane.submit({ workflow: 'ai.boom', projectId: 'P-4', actorId: 'U' }))
      .rejects.toThrow('handler failed');

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('workflow.start');
    expect(kinds).toContain('workflow.error');
  });
});

describe('AiPlane — emitCommit helper', () => {
  it('publishes workflow.commit on the bus', () => {
    const { plane, bus } = makePlane();
    const fn = vi.fn();
    bus.on('workflow.commit', fn);
    plane.emitCommit('ai.x', 'P-1', 'run-99', { committed: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
