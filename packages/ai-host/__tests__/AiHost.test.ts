// @vitest-environment happy-dom
//
// @pryzm/ai-host — host behaviour tests (S47).
//
// happy-dom required because the transitive import chain pulls in
// `@thatopen/ui`, which reads `HTMLElement` at module load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiHost } from '../src/index.js';
import { _resetAiHostForTests } from '../src/AiHost.js';
import type {
  AiApprovalQueueLike,
  AiPendingAction,
} from '../src/types.js';

class MemoryQueue implements AiApprovalQueueLike {
  readonly items: AiPendingAction[] = [];
  enqueue(action: AiPendingAction): void { this.items.push(action); }
}

afterEach(() => {
  _resetAiHostForTests();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.useFakeTimers({ now: 1_700_000_000_000 });
});

describe('@pryzm/ai-host — submit workflow', () => {
  it('produces a pending action and enqueues it on the approval queue', async () => {
    const queue = new MemoryQueue();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-001' }),
    } as Response);
    const host = await getAiHost({ approvalQueue: queue, fetch: fetchImpl });

    const action = await host.submit({
      workflow: 'floorplan',
      projectId: 'P-1',
      input: { brief: 'two-bed flat' },
      clientRequestId: 'req-A',
    });

    expect(action.id).toBe('job-001');
    expect(action.workflow).toBe('floorplan');
    expect(action.status).toBe('pending');
    expect(action.createdAt).toBe(1_700_000_000_000);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toBe(action);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/ai-worker');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      workflow: 'floorplan',
      projectId: 'P-1',
      input: { brief: 'two-bed flat' },
      clientRequestId: 'req-A',
    });
  });

  it('fails open when the worker endpoint is unreachable (S47 worker not wired)', async () => {
    const queue = new MemoryQueue();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const host = await getAiHost({ approvalQueue: queue, fetch: fetchImpl });

    const action = await host.submit({
      workflow: 'generative',
      projectId: 'P-2',
      clientRequestId: 'req-B',
    });

    expect(action.status).toBe('pending');
    expect(action.id).toBe('pending-req-B');
    expect(action.workflow).toBe('generative');
    expect(queue.items).toHaveLength(1);
  });

  it('synthesises a clientRequestId when none is supplied', async () => {
    const queue = new MemoryQueue();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);
    const host = await getAiHost({ approvalQueue: queue, fetch: fetchImpl });

    const a = await host.submit({ workflow: 'voice', projectId: 'P-1' });
    const b = await host.submit({ workflow: 'voice', projectId: 'P-1' });
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('pending-local-')).toBe(true);
    expect(b.id.startsWith('pending-local-')).toBe(true);
  });

  it('works without an approval queue wired (unit-test friendly)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-X' }),
    } as Response);
    const host = await getAiHost({ fetch: fetchImpl });

    const action = await host.submit({
      workflow: 'rules',
      projectId: 'P-9',
      clientRequestId: 'req-Z',
    });
    expect(action.id).toBe('job-X');
  });

  it('records workflow kind in OTel span name (smoke)', async () => {
    // We don't install a real SDK; we just verify that submit completes
    // through the no-op tracer for every kind in the union.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-S' }),
    } as Response);
    const host = await getAiHost({ fetch: fetchImpl });
    const kinds = ['floorplan', 'generative', 'rules', 'cv', 'voice'] as const;
    for (const k of kinds) {
      const a = await host.submit({
        workflow: k,
        projectId: 'P',
        clientRequestId: `req-${k}`,
      });
      expect(a.workflow).toBe(k);
    }
  });
});
