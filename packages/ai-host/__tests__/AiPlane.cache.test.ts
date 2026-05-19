// @pryzm/ai-host — AiPlane response cache tests (ADR-050 · Task 4.5).
//
// Acceptance criteria from 46-IMPLEMENTATION-PLAN-2026-05-08.md §Task 4.5:
//   C1. Cache HIT → returned pending action carries cached proposedCommands;
//       impl is NOT called; `ai_usage` rows are NOT created (CostMeter.recordCall
//       never fires); `enforceAIQuota` (preCheckBudget) is NOT called.
//   C2. Cache MISS → impl IS called; result IS stored in cache (ttlDays=7).
//   C3. Cache HIT → `workflow.cacheHit` bus event emitted, NOT `workflow.start`.
//   C4. Cache HIT → pending action status is 'pending' (not 'rejected').
//   C5. Cache store failure is non-fatal; workflow completes normally.
//   C6. `executeBatch` with cache HIT → aiBatchId is propagated correctly.
//   C7. When `responseCache` is undefined, plane behaves exactly as before
//       (no regressions to existing happy-path tests).

import { describe, expect, it, vi } from 'vitest';
import { AiBus, type AiBusEvent } from '../src/AiBus.js';
import { AiPlane } from '../src/AiPlane.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import { MockAiResponseCache } from '../src/AiResponseCache.js';
import { CostMeter, type AiUsageRow } from '@pryzm/ai-cost';
import type {
  AiApprovalQueueLike,
  AiPendingAction,
  WorkflowImpl,
  WorkflowRunResult,
} from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

class MemoryQueue implements AiApprovalQueueLike {
  readonly items: AiPendingAction[] = [];
  enqueue(action: AiPendingAction): void { this.items.push(action); }
}

function makePlane(opts: {
  cache?: MockAiResponseCache;
  budget?: (projectId: string) => number;
  usage?: AiUsageRow[];
} = {}) {
  const queue = new MemoryQueue();
  const bus = new AiBus({ otelPrefix: 'pryzm.ai.cache.test' });
  const registry = new WorkflowRegistry();
  const usage: AiUsageRow[] = opts.usage ?? [];
  const meter = new CostMeter({
    perCallCeilingUsd: 0.18,
    preCallRejection: true,
    usageSink: (row) => { usage.push(row); },
    ...(opts.budget ? { perProjectMonthlyBudget: opts.budget } : {}),
  });
  const plane = new AiPlane({
    approvalQueue: queue,
    bus,
    costMeter: meter,
    workflowRegistry: registry,
    ...(opts.cache ? { responseCache: opts.cache } : {}),
  });
  return { plane, queue, bus, registry, meter, usage };
}

const FIXTURE_RESULT: WorkflowRunResult = {
  proposedCommands: [{ command: 'floor.add', payload: { area: 42 } }],
  actualCostUsd: 0.04,
  preview: { kind: 'json', data: { summary: 'cached' } },
};

const goodImpl: WorkflowImpl = async () => ({ ...FIXTURE_RESULT });

// ── C1 — Cache hit: impl not called, no usage row, no budget check ───────────

describe('AiPlane cache — C1: cache HIT bypasses impl + quota', () => {
  it('returns cached proposedCommands and does NOT call the impl', async () => {
    const cache = new MockAiResponseCache();
    const { plane, registry, usage } = makePlane({ cache });

    plane.registerWorkflow(
      { id: 'plan-critique', title: 'Critique', kind: 'rules', estimatedCostUsd: 0.05 },
      vi.fn(goodImpl),  // spy — must NOT be called
    );

    // Prime the cache with the expected hash key.
    // We use the real hashWorkflowRequest in AiPlane, so we seed by workflow+input
    // and let the plane compute the hash — the MockAiResponseCache.get() call
    // inspection tells us the exact key computed.
    // For testing, we prime with a sentinel and let the first MISS write it,
    // then call again to get a hit.
    const implSpy = vi.fn(goodImpl);
    registry.register(
      { id: 'wf.cached', title: 'Cached', kind: 'generative', estimatedCostUsd: 0.05 },
      implSpy,
    );

    // First call → MISS, impl runs, result stored.
    const input = { plan: 'room-42' };
    await plane.submit({ workflow: 'wf.cached', projectId: 'P-1', actorId: 'U-1', input });
    expect(implSpy).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);  // usage row created on miss

    // Second call with same input → HIT.
    const usage2: AiUsageRow[] = [];
    const { plane: plane2, registry: reg2 } = makePlane({ cache, usage: usage2 });
    const implSpy2 = vi.fn(goodImpl);
    reg2.register(
      { id: 'wf.cached', title: 'Cached', kind: 'generative', estimatedCostUsd: 0.05 },
      implSpy2,
    );
    const action = await plane2.submit({ workflow: 'wf.cached', projectId: 'P-1', actorId: 'U-1', input });

    // Impl must NOT have been called on the second plane.
    expect(implSpy2).not.toHaveBeenCalled();
    // No usage row for cache hit (enforceAIQuota not charged).
    expect(usage2).toHaveLength(0);
    // Returned action carries the cached commands.
    expect(action.proposedCommands).toHaveLength(1);
    expect(action.proposedCommands[0]!.command).toBe('floor.add');
    expect(action.status).toBe('pending');  // C4
  });
});

// ── C2 — Cache miss: impl called, result stored ──────────────────────────────

describe('AiPlane cache — C2: cache MISS runs impl and stores result', () => {
  it('calls impl and stores result in cache with ttlDays=7', async () => {
    const cache = new MockAiResponseCache();
    const { plane, registry } = makePlane({ cache });
    const implSpy = vi.fn(goodImpl);
    registry.register(
      { id: 'wf.miss', title: 'Miss', kind: 'floorplan', estimatedCostUsd: 0.03 },
      implSpy,
    );

    await plane.submit({ workflow: 'wf.miss', projectId: 'P-2', actorId: 'U-1' });

    expect(implSpy).toHaveBeenCalledTimes(1);
    expect(cache.setCalls).toHaveLength(1);
    const stored = cache.setCalls[0]!;
    expect(stored.ttlDays).toBe(7);
    expect(stored.key.tenantId).toBe('P-2');
    expect(stored.key.modelVersion).toBe('wf.miss');
    // The stored value carries the impl's WorkflowRunResult.
    expect(stored.value.proposedCommands).toHaveLength(1);
  });
});

// ── C3 — Cache HIT emits workflow.cacheHit, NOT workflow.start ───────────────

describe('AiPlane cache — C3: cacheHit bus event', () => {
  it('emits workflow.cacheHit (not workflow.start) on a cache hit', async () => {
    const cache = new MockAiResponseCache();
    const { plane: p1, registry: r1 } = makePlane({ cache });
    r1.register(
      { id: 'wf.evt', title: 'Evt', kind: 'cv', estimatedCostUsd: 0.01 },
      goodImpl,
    );
    // Populate cache via first call.
    await p1.submit({ workflow: 'wf.evt', projectId: 'P-3', actorId: 'U-1', input: { x: 1 } });

    // Second plane — same cache, record bus events.
    const { plane: p2, registry: r2, bus } = makePlane({ cache });
    r2.register(
      { id: 'wf.evt', title: 'Evt', kind: 'cv', estimatedCostUsd: 0.01 },
      vi.fn(async () => { throw new Error('should not be called'); }),
    );
    const events: AiBusEvent[] = [];
    bus.onAny((e) => events.push(e));

    await p2.submit({ workflow: 'wf.evt', projectId: 'P-3', actorId: 'U-1', input: { x: 1 } });

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('workflow.cacheHit');
    expect(kinds).not.toContain('workflow.start');
    expect(kinds).not.toContain('workflow.propose');

    // Payload carries contentHash + modelVersion for observability.
    const hitEvent = events.find((e) => e.kind === 'workflow.cacheHit')!;
    expect(typeof (hitEvent.payload as { contentHash: string }).contentHash).toBe('string');
    expect((hitEvent.payload as { contentHash: string }).contentHash).toHaveLength(64); // SHA-256 hex
  });
});

// ── C5 — Cache store failure is non-fatal ────────────────────────────────────

describe('AiPlane cache — C5: store failure is non-fatal', () => {
  it('completes the workflow even when cache.set() rejects', async () => {
    const brokenCache = new MockAiResponseCache();
    // Override set() to always throw.
    brokenCache.set = vi.fn(async () => { throw new Error('DB down'); });

    const { plane, registry, usage } = makePlane({ cache: brokenCache });
    registry.register(
      { id: 'wf.broken-cache', title: 'Broken', kind: 'voice', estimatedCostUsd: 0.01 },
      goodImpl,
    );

    const action = await plane.submit({
      workflow: 'wf.broken-cache',
      projectId: 'P-5',
      actorId: 'U-1',
    });

    // Workflow still completes and produces a pending action.
    expect(action.status).toBe('pending');
    expect(action.proposedCommands).toHaveLength(1);
    // Cost was still recorded (cache failure ≠ impl failure).
    expect(usage).toHaveLength(1);
  });
});

// ── C6 — executeBatch with cache hit propagates aiBatchId ────────────────────

describe('AiPlane cache — C6: executeBatch cache hit preserves aiBatchId', () => {
  it('tagged aiBatchId even for cache-hit actions within a batch', async () => {
    const cache = new MockAiResponseCache();

    // Populate cache via a standalone submit.
    const { plane: p0, registry: r0 } = makePlane({ cache });
    r0.register(
      { id: 'wf.batch', title: 'Batch', kind: 'generative', estimatedCostUsd: 0.01 },
      goodImpl,
    );
    await p0.submit({ workflow: 'wf.batch', projectId: 'P-6', actorId: 'U-1', input: { room: 'A' } });
    await p0.submit({ workflow: 'wf.batch', projectId: 'P-6', actorId: 'U-1', input: { room: 'B' } });

    // Now run a batch — both calls should hit the cache.
    const { plane: p1, registry: r1 } = makePlane({ cache });
    const implSpy = vi.fn(goodImpl);
    r1.register(
      { id: 'wf.batch', title: 'Batch', kind: 'generative', estimatedCostUsd: 0.01 },
      implSpy,
    );

    const results = await p1.executeBatch([
      { workflow: 'wf.batch', projectId: 'P-6', actorId: 'U-1', input: { room: 'A' } },
      { workflow: 'wf.batch', projectId: 'P-6', actorId: 'U-1', input: { room: 'B' } },
    ]);

    // Impl should NOT be called (both cache hits).
    expect(implSpy).not.toHaveBeenCalled();
    // Both results carry the same aiBatchId.
    expect(results).toHaveLength(2);
    const batchId = results[0]!.aiBatchId;
    expect(batchId).toBeDefined();
    expect(results[1]!.aiBatchId).toBe(batchId);
    // Both are 'pending'.
    for (const a of results) expect(a.status).toBe('pending');
  });
});

// ── C7 — No cache wired → plane behaves exactly as before ───────────────────

describe('AiPlane cache — C7: no cache wired = existing behaviour unchanged', () => {
  it('runs impl and records usage when responseCache is not provided', async () => {
    const { plane, registry, usage } = makePlane(); // no cache
    const implSpy = vi.fn(goodImpl);
    registry.register(
      { id: 'wf.nocache', title: 'NoCache', kind: 'floorplan', estimatedCostUsd: 0.05 },
      implSpy,
    );

    const action = await plane.submit({
      workflow: 'wf.nocache',
      projectId: 'P-7',
      actorId: 'U-1',
    });

    expect(implSpy).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);
    expect(action.status).toBe('pending');
    expect(action.proposedCommands).toHaveLength(1);
  });
});
