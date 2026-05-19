import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewQueue, type EnqueueProposalInput } from '../src/review-queue.js';
import { makeConfidenced } from '../src/confidence.js';

describe('ReviewQueue', () => {
  let queue: ReviewQueue;
  const fixedClock = () => new Date('2026-04-28T12:00:00Z');

  beforeEach(() => {
    queue = new ReviewQueue({ clock: fixedClock });
  });

  const makeInput = (id: string, kind: 'wall' | 'door' = 'wall'): EnqueueProposalInput<{ tag: string }> => ({
    id, pageId: 'page-1', hint: `hint for ${id}`,
    element: makeConfidenced(kind, { tag: id }, {
      geometricFit: 0.5, symbolClarity: 0.5, contextualPlausibility: 0.5,
    }),
  });

  it('enqueue() adds a pending entry with a timestamp', () => {
    const e = queue.enqueue(makeInput('w-1'));
    expect(e.id).toBe('w-1');
    expect(e.kind).toBe('wall');
    expect(e.confidence).toBeGreaterThan(0);
    expect(e.confidence).toBeLessThan(1);
    expect(e.enqueuedAt).toBe('2026-04-28T12:00:00.000Z');
    expect(queue.pendingCount()).toBe(1);
  });

  it('enqueue() rejects duplicate ids', () => {
    queue.enqueue(makeInput('w-1'));
    expect(() => queue.enqueue(makeInput('w-1'))).toThrow(/duplicate/);
  });

  it('enqueueAll() bulk-loads and notifies listeners only once', () => {
    let notifications = 0;
    queue.subscribe(() => notifications++);
    queue.enqueueAll([makeInput('w-1'), makeInput('w-2'), makeInput('w-3')]);
    expect(queue.pendingCount()).toBe(3);
    expect(notifications).toBe(1);
  });

  it('subscribe()/unsubscribe() — listener fires on enqueue and decide', () => {
    const snapshots: number[] = [];
    const unsub = queue.subscribe(s => snapshots.push(s.pending.length));
    queue.enqueue(makeInput('w-1'));
    queue.decide({ entryId: 'w-1', decision: 'accepted', reviewer: 'alice' });
    unsub();
    queue.enqueue(makeInput('w-2'));
    expect(snapshots).toEqual([1, 0]);
  });

  it('decide() removes from pending and appends to decided', () => {
    queue.enqueue(makeInput('w-1'));
    const rec = queue.decide({
      entryId: 'w-1', decision: 'edited', reviewer: 'bob',
      patch: { thicknessMm: 220 },
    });
    expect(rec.entryId).toBe('w-1');
    expect(rec.decision).toBe('edited');
    expect(rec.reviewer).toBe('bob');
    expect(rec.patch).toEqual({ thicknessMm: 220 });
    expect(queue.pendingCount()).toBe(0);
    expect(queue.decidedCount()).toBe(1);
  });

  it('decide() throws for unknown entry id', () => {
    expect(() => queue.decide({
      entryId: 'nope', decision: 'accepted', reviewer: 'alice',
    })).toThrow(/unknown entry/);
  });

  it('snapshot() returns fresh arrays — mutating them does not affect the queue', () => {
    queue.enqueue(makeInput('w-1'));
    const s = queue.snapshot();
    (s.pending as unknown[]).length = 0;
    expect(queue.pendingCount()).toBe(1);
  });

  it('listener errors are swallowed — one bad listener cannot break the queue', () => {
    queue.subscribe(() => { throw new Error('bad listener'); });
    let goodFired = false;
    queue.subscribe(() => { goodFired = true; });
    expect(() => queue.enqueue(makeInput('w-1'))).not.toThrow();
    expect(goodFired).toBe(true);
    expect(queue.pendingCount()).toBe(1);
  });

  it('hint is omitted from the entry when not provided', () => {
    queue.enqueue({
      id: 'w-1', pageId: 'page-1',
      element: makeConfidenced('wall', { tag: 'w-1' }, {
        geometricFit: 0.5, symbolClarity: 0.5, contextualPlausibility: 0.5,
      }),
    });
    const e = queue.snapshot().pending[0]!;
    expect('hint' in e).toBe(false);
  });
});
