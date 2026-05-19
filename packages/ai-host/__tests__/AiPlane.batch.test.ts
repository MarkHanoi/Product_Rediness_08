// @pryzm/ai-host — `AiPlane.executeBatch` tests (S54 D1).
//
// Covers:
//   1. Every pending action in the returned array shares the same
//      `aiBatchId`.
//   2. The bus emits `workflow.batchStart` before the first run and
//      `workflow.batchEnd` after the last, both carrying `aiBatchId`.
//   3. A partial failure does NOT abort the batch — prior pending
//      actions are still returned, the failed run emits a
//      `workflow.error` event tagged with the same `aiBatchId`, and
//      `workflow.batchEnd` reports `failed: 1`.
//   4. The caller may supply an explicit `aiBatchId` (idempotency
//      across retries).
//   5. Empty batches resolve to an empty array AND emit no bus events.
//   6. Every pending action carries a `runId` field (populated by
//      `AiPlane.submit()`) so the approval-queue UI can group parent
//      and child actions without parsing the `id` string.

import { describe, expect, it } from 'vitest';
import { CostMeter } from '@pryzm/ai-cost';
import { AiPlane } from '../src/AiPlane.js';
import { AiBus } from '../src/AiBus.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import type { AiBusEvent } from '../src/AiBus.js';
import type {
  AiApprovalQueueLike,
  AiPendingAction,
  WorkflowDescriptor,
  WorkflowImpl,
  WorkflowRunResult,
} from '../src/types.js';

class MemoryQueue implements AiApprovalQueueLike {
  readonly enqueued: AiPendingAction[] = [];
  enqueue(a: AiPendingAction): void { this.enqueued.push(a); }
}

function buildPlane() {
  const queue = new MemoryQueue();
  const bus = new AiBus({ otelPrefix: 'pryzm.ai.test' });
  const registry = new WorkflowRegistry();
  const events: AiBusEvent[] = [];
  bus.onAny((ev) => { events.push(ev); });
  const plane = new AiPlane({
    approvalQueue: queue,
    bus,
    costMeter: new CostMeter(),
    workflowRegistry: registry,
  });
  return { plane, queue, bus, registry, events };
}

function registerSimple(
  registry: WorkflowRegistry,
  id: string,
  kind: 'generative' | 'rules' | 'voice' | 'floorplan' | 'cv' = 'generative',
  result: Partial<WorkflowRunResult> = {},
): WorkflowDescriptor {
  const descriptor: WorkflowDescriptor = {
    id,
    title: `Test ${id}`,
    kind,
    estimatedCostUsd: 0.01,
  };
  const impl: WorkflowImpl = async () => ({
    proposedCommands: result.proposedCommands ?? [{ command: 'test.noop', payload: { id } }],
    actualCostUsd: result.actualCostUsd ?? 0.01,
  });
  registry.register(descriptor, impl);
  return descriptor;
}

describe('AiPlane.executeBatch — S54 D1 batched-undo', () => {
  it('tags every pending action with the same aiBatchId', async () => {
    const { plane, registry, queue } = buildPlane();
    registerSimple(registry, 'wf.a');
    registerSimple(registry, 'wf.b', 'rules');
    registerSimple(registry, 'wf.c', 'voice');

    const result = await plane.executeBatch([
      { workflow: 'wf.a', projectId: 'p1', actorId: 'u1' },
      { workflow: 'wf.b', projectId: 'p1', actorId: 'u1' },
      { workflow: 'wf.c', projectId: 'p1', actorId: 'u1' },
    ]);

    expect(result).toHaveLength(3);
    const batchId = result[0]!.aiBatchId;
    expect(batchId).toBeDefined();
    expect(batchId).toMatch(/^batch-/);
    for (const action of result) {
      expect(action.aiBatchId).toBe(batchId);
      expect(action.status).toBe('pending');
    }
    // All three are enqueued in submission order with identical batch id.
    expect(queue.enqueued).toHaveLength(3);
    expect(queue.enqueued.map((a) => a.aiBatchId)).toEqual([batchId, batchId, batchId]);
  });

  it('emits workflow.batchStart before the first run and workflow.batchEnd after the last', async () => {
    const { plane, registry, events } = buildPlane();
    registerSimple(registry, 'wf.a');
    registerSimple(registry, 'wf.b');

    await plane.executeBatch([
      { workflow: 'wf.a', projectId: 'p1', actorId: 'u1' },
      { workflow: 'wf.b', projectId: 'p1', actorId: 'u1' },
    ]);

    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('workflow.batchStart');
    expect(kinds[kinds.length - 1]).toBe('workflow.batchEnd');

    const batchStart = events.find((e) => e.kind === 'workflow.batchStart')!;
    const batchEnd = events.find((e) => e.kind === 'workflow.batchEnd')!;
    const startPayload = batchStart.payload as { aiBatchId: string; runCount: number };
    const endPayload = batchEnd.payload as {
      aiBatchId: string; succeeded: number; failed: number; runCount: number;
    };

    expect(startPayload.runCount).toBe(2);
    expect(endPayload.runCount).toBe(2);
    expect(endPayload.succeeded).toBe(2);
    expect(endPayload.failed).toBe(0);
    expect(startPayload.aiBatchId).toBe(endPayload.aiBatchId);
  });

  it('survives a partial failure — prior actions returned, error tagged with batch id', async () => {
    const { plane, registry, events } = buildPlane();
    registerSimple(registry, 'wf.a');
    // wf.b throws inside its impl.
    registry.register(
      { id: 'wf.bad', title: 'bad', kind: 'generative', estimatedCostUsd: 0.01 },
      async () => { throw new Error('synthetic-impl-error'); },
    );
    registerSimple(registry, 'wf.c');

    const result = await plane.executeBatch([
      { workflow: 'wf.a', projectId: 'p1', actorId: 'u1' },
      { workflow: 'wf.bad', projectId: 'p1', actorId: 'u1' },
      { workflow: 'wf.c', projectId: 'p1', actorId: 'u1' },
    ]);

    // Only successful runs land in the returned array.
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.workflow)).toEqual(['generative', 'generative']);

    const batchId = result[0]!.aiBatchId;
    for (const action of result) expect(action.aiBatchId).toBe(batchId);

    // The error event carries the same aiBatchId.
    const errorEv = events.find((e) => e.kind === 'workflow.error');
    expect(errorEv).toBeDefined();
    expect((errorEv!.payload as { aiBatchId: string }).aiBatchId).toBe(batchId);

    // batchEnd reports succeeded:2 failed:1.
    const batchEnd = events.find((e) => e.kind === 'workflow.batchEnd')!;
    const endPayload = batchEnd.payload as { succeeded: number; failed: number };
    expect(endPayload.succeeded).toBe(2);
    expect(endPayload.failed).toBe(1);
  });

  it('honors a caller-supplied aiBatchId for idempotency on retry', async () => {
    const { plane, registry, events } = buildPlane();
    registerSimple(registry, 'wf.a');
    registerSimple(registry, 'wf.b');

    const result = await plane.executeBatch(
      [
        { workflow: 'wf.a', projectId: 'p1', actorId: 'u1' },
        { workflow: 'wf.b', projectId: 'p1', actorId: 'u1' },
      ],
      { aiBatchId: 'caller-supplied-batch-42' },
    );

    expect(result.every((a) => a.aiBatchId === 'caller-supplied-batch-42')).toBe(true);
    const batchStart = events.find((e) => e.kind === 'workflow.batchStart')!;
    expect((batchStart.payload as { aiBatchId: string }).aiBatchId).toBe('caller-supplied-batch-42');
  });

  it('resolves an empty batch to an empty array with no bus events emitted', async () => {
    const { plane, events } = buildPlane();
    const result = await plane.executeBatch([]);
    expect(result).toEqual([]);
    expect(events).toHaveLength(0);
  });

  it('does NOT tag standalone submit() pending actions with aiBatchId', async () => {
    const { plane, registry } = buildPlane();
    registerSimple(registry, 'wf.solo');
    const action = await plane.submit({ workflow: 'wf.solo', projectId: 'p1', actorId: 'u1' });
    expect(action.aiBatchId).toBeUndefined();
  });

  it('each pending action carries a runId so the queue UI can group parent + child actions', async () => {
    const { plane, registry, queue } = buildPlane();
    registerSimple(registry, 'wf.a');
    registerSimple(registry, 'wf.b', 'rules');

    const result = await plane.executeBatch([
      { workflow: 'wf.a', projectId: 'p1', actorId: 'u1' },
      { workflow: 'wf.b', projectId: 'p1', actorId: 'u1' },
    ]);

    // Both returned actions must have a runId set and it must match
    // their `id` prefix so the UI can group without parsing.
    for (const action of result) {
      expect(action.runId).toBeDefined();
      expect(typeof action.runId).toBe('string');
      expect(action.runId!.length).toBeGreaterThan(0);
      // The parent action id is `${runId}-pending`.
      expect(action.id).toBe(`${action.runId}-pending`);
    }

    // Enqueued actions mirror the returned ones.
    for (const enqueued of queue.enqueued) {
      expect(enqueued.runId).toBeDefined();
    }

    // The two runs get distinct runIds.
    expect(result[0]!.runId).not.toBe(result[1]!.runId);
  });

  it('standalone submit() also populates runId on the pending action', async () => {
    const { plane, registry } = buildPlane();
    registerSimple(registry, 'wf.solo');
    const action = await plane.submit({ workflow: 'wf.solo', projectId: 'p1', actorId: 'u1' });
    expect(action.runId).toBeDefined();
    expect(action.id).toBe(`${action.runId}-pending`);
  });
});
