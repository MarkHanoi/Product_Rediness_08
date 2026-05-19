// AiApprovalQueueStore — tests (S47).

import { describe, expect, it } from 'vitest';
import {
  AiApprovalQueueStore,
  approvalQueueBadgeCount,
  DEFAULT_PENDING_TTL_MS,
} from '../src/AiApprovalQueueStore.js';
import type { AiPendingActionData } from '../src/AiApprovalQueueStore.js';

function pending(over: Partial<AiPendingActionData> = {}): AiPendingActionData {
  return Object.freeze({
    id: 'a',
    workflow: 'floorplan',
    proposedCommands: [],
    estimatedCostUsd: 0,
    createdAt: 0,
    status: 'pending',
    ...over,
  });
}

describe('AiApprovalQueueStore — selectors', () => {
  it('returns pending() ordered by createdAt ascending', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'b', createdAt: 200 }));
    s.enqueue(pending({ id: 'a', createdAt: 100 }));
    s.enqueue(pending({ id: 'c', createdAt: 300 }));
    const ids = s.pending().map((a) => a.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('byWorkflow filters on kind', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'a', workflow: 'floorplan' }));
    s.enqueue(pending({ id: 'b', workflow: 'voice' }));
    s.enqueue(pending({ id: 'c', workflow: 'voice' }));
    expect(s.byWorkflow('voice').map((a) => a.id).sort()).toEqual(['b', 'c']);
    expect(s.byWorkflow('cv')).toHaveLength(0);
  });

  it('byStatus filters on lifecycle', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'a' }));
    s.enqueue(pending({ id: 'b' }));
    s.approve('a');
    expect(s.byStatus('approved')).toHaveLength(1);
    expect(s.byStatus('pending')).toHaveLength(1);
  });

  it('pendingCount + approvalQueueBadgeCount agree', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'a' }));
    s.enqueue(pending({ id: 'b' }));
    s.approve('a');
    expect(s.pendingCount()).toBe(1);
    expect(approvalQueueBadgeCount(s)).toBe(1);
  });
});

describe('AiApprovalQueueStore — transitions', () => {
  it('approve flips pending → approved (terminal)', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'x' }));
    expect(s.approve('x')?.status).toBe('approved');
    // second approve is a no-op
    expect(s.approve('x')).toBeNull();
  });

  it('reject flips pending → rejected (terminal)', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'x' }));
    expect(s.reject('x')?.status).toBe('rejected');
    expect(s.reject('x')).toBeNull();
  });

  it('expireOlderThan only sweeps stale pending rows', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'old', createdAt: 0 }));
    s.enqueue(pending({ id: 'fresh', createdAt: 1_000_000 }));
    s.enqueue(pending({ id: 'approved', createdAt: 0 }));
    s.approve('approved');

    const now = DEFAULT_PENDING_TTL_MS + 1;
    const swept = s.expireOlderThan(now);
    expect(swept).toBe(1);
    expect(s.byStatus('expired').map((a) => a.id)).toEqual(['old']);
    expect(s.byStatus('pending').map((a) => a.id)).toEqual(['fresh']);
    expect(s.byStatus('approved').map((a) => a.id)).toEqual(['approved']);
  });

  it('exposes pure nextStateFor* helpers', () => {
    const cur = pending({ id: 'p' });
    expect(AiApprovalQueueStore.nextStateForApprove(cur)?.status).toBe('approved');
    expect(AiApprovalQueueStore.nextStateForReject(cur)?.status).toBe('rejected');
    expect(AiApprovalQueueStore.nextStateForExpire(cur, 100, 50)?.status).toBe('expired');
    expect(AiApprovalQueueStore.nextStateForExpire(cur, 100, 1_000_000)).toBeNull();
    const approved = pending({ id: 'a', status: 'approved' });
    expect(AiApprovalQueueStore.nextStateForApprove(approved)).toBeNull();
    expect(AiApprovalQueueStore.nextStateForReject(approved)).toBeNull();
    expect(AiApprovalQueueStore.nextStateForExpire(approved, 1e9)).toBeNull();
  });
});

describe('AiApprovalQueueStore — enqueue + immutability', () => {
  it('freezes enqueued actions', () => {
    const s = new AiApprovalQueueStore();
    const action = pending({ id: 'x' });
    s.enqueue(action);
    const got = s.get('x')!;
    expect(Object.isFrozen(got)).toBe(true);
  });

  it('approve / reject / expire return frozen successor states', () => {
    const s = new AiApprovalQueueStore();
    s.enqueue(pending({ id: 'x' }));
    const a = s.approve('x')!;
    expect(Object.isFrozen(a)).toBe(true);

    s.enqueue(pending({ id: 'y' }));
    const r = s.reject('y')!;
    expect(Object.isFrozen(r)).toBe(true);

    s.enqueue(pending({ id: 'z', createdAt: 0 }));
    s.expireOlderThan(DEFAULT_PENDING_TTL_MS + 1);
    expect(Object.isFrozen(s.get('z')!)).toBe(true);
  });
});
