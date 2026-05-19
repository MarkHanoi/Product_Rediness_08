// @pryzm/ai-worker — queue tests (S47).

import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultRegistry,
  createQueue,
  HandlerRegistry,
  InMemoryQueue,
  mockFloorplanHandler,
} from '../src/index.js';
import type { HandlerResult, WorkflowJob } from '../src/types.js';

describe('@pryzm/ai-worker — InMemoryQueue', () => {
  it('enqueues and drains in FIFO order', async () => {
    const registry = createDefaultRegistry();
    const completed: Array<{ job: WorkflowJob; result: HandlerResult }> = [];
    const q = new InMemoryQueue({
      registry,
      onComplete: (job, result) => { completed.push({ job, result }); },
    });

    const a = await q.enqueue({ kind: 'floorplan', projectId: 'P', input: { i: 1 } });
    const b = await q.enqueue({ kind: 'floorplan', projectId: 'P', input: { i: 2 } });
    expect(await q.size()).toBe(2);

    const drained = await q.drain();
    expect(drained).toBe(2);
    expect(await q.size()).toBe(0);
    expect(completed.map((c) => c.job.id)).toEqual([a.id, b.id]);
    expect(completed[0]!.result.proposedCommands).toHaveLength(1);
  });

  it('respects the `max` argument on drain', async () => {
    const q = new InMemoryQueue({ registry: createDefaultRegistry() });
    await q.enqueue({ kind: 'floorplan', projectId: 'P', input: null });
    await q.enqueue({ kind: 'floorplan', projectId: 'P', input: null });
    await q.enqueue({ kind: 'floorplan', projectId: 'P', input: null });

    const n = await q.drain(2);
    expect(n).toBe(2);
    expect(await q.size()).toBe(1);
  });

  it('routes handler errors to onError without losing the queue', async () => {
    const registry = new HandlerRegistry();
    registry.register('floorplan', async () => { throw new Error('boom'); });
    const errors: Array<{ job: WorkflowJob; err: unknown }> = [];
    const q = new InMemoryQueue({
      registry,
      onError: (job, err) => { errors.push({ job, err }); },
    });
    await q.enqueue({ kind: 'floorplan', projectId: 'P', input: null });

    await q.drain();
    expect(errors).toHaveLength(1);
    expect((errors[0]!.err as Error).message).toBe('boom');
    expect(await q.size()).toBe(0);
  });

  it('throws when an unknown workflow kind is dispatched', async () => {
    const registry = new HandlerRegistry();
    // Intentionally no handler for 'cv'.
    const errors: Array<{ job: WorkflowJob; err: unknown }> = [];
    const q = new InMemoryQueue({
      registry,
      onError: (job, err) => { errors.push({ job, err }); },
    });
    await q.enqueue({ kind: 'cv', projectId: 'P', input: null });
    await q.drain();
    expect(errors).toHaveLength(1);
    expect((errors[0]!.err as Error).message).toMatch(/No handler/);
  });

  it('rejects enqueue after close', async () => {
    const q = new InMemoryQueue({ registry: createDefaultRegistry() });
    await q.close();
    await expect(
      q.enqueue({ kind: 'floorplan', projectId: 'P', input: null }),
    ).rejects.toThrow(/closed/);
  });
});

describe('@pryzm/ai-worker — createQueue factory', () => {
  it('returns InMemoryQueue when env is empty', async () => {
    const q = await createQueue({ env: {}, registry: createDefaultRegistry() });
    expect(q.selection).toBe('memory');
  });

  it('returns InMemoryQueue when PRYZM_AI_QUEUE=memory even with REDIS_URL set', async () => {
    const q = await createQueue({
      env: { REDIS_URL: 'redis://localhost', PRYZM_AI_QUEUE: 'memory' },
      registry: createDefaultRegistry(),
    });
    expect(q.selection).toBe('memory');
  });

  it('throws when BullMQ is requested but the adapter is not installed', async () => {
    await expect(
      createQueue({
        env: { REDIS_URL: 'redis://localhost' },
        registry: createDefaultRegistry(),
      }),
    ).rejects.toThrow(/BullMQ.*adapter is not installed/);
  });
});

describe('@pryzm/ai-worker — mockFloorplanHandler', () => {
  it('produces a deterministic command payload digest', async () => {
    const job: WorkflowJob = {
      id: 'job-1', kind: 'floorplan', projectId: 'P-1',
      input: { brief: 'hello' }, enqueuedAt: 0, attempts: 0,
    };
    const result = await mockFloorplanHandler(job);
    expect(result.proposedCommands).toHaveLength(1);
    expect(result.proposedCommands[0]!.command).toBe('floorplan.draft');
    expect(result.preview).toEqual({
      kind: 'json',
      data: { workflow: 'floorplan', jobId: 'job-1' },
    });
  });

  it('handles unserialisable input without throwing', async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const job: WorkflowJob = {
      id: 'job-2', kind: 'floorplan', projectId: 'P-2',
      input: cyclic, enqueuedAt: 0, attempts: 0,
    };
    const result = await mockFloorplanHandler(job);
    expect(result.proposedCommands).toHaveLength(1);
  });
});

describe('@pryzm/ai-worker — registry', () => {
  it('rejects double-registration of the same kind', () => {
    const r = new HandlerRegistry();
    r.register('floorplan', mockFloorplanHandler);
    expect(() => r.register('floorplan', mockFloorplanHandler))
      .toThrow(/already registered/);
  });

  it('exposes has() for capability discovery', () => {
    const r = createDefaultRegistry();
    expect(r.has('floorplan')).toBe(true);
    expect(r.has('cv')).toBe(false);
  });
});

describe('@pryzm/ai-worker — S47 D5 end-to-end smoke', () => {
  it('runs mock AI batch → handler → approval-queue-shaped result', async () => {
    const registry = createDefaultRegistry();
    const completed: HandlerResult[] = [];
    const q = await createQueue({
      env: {},
      registry,
      onComplete: (_, r) => { completed.push(r); },
    });
    await q.enqueue({ kind: 'floorplan', projectId: 'P-smoke', input: { brief: 'studio flat' } });
    await q.drain();
    expect(completed).toHaveLength(1);
    const cmd = completed[0]!.proposedCommands[0]!;
    expect(cmd.command).toBe('floorplan.draft');
    await q.close();
  });
});

// Dummy spy so we don't strip the import.
vi.stubGlobal('__aiWorkerSmoke', true);
