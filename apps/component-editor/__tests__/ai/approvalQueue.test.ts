// AI approval queue tests (S54).
//
// Coverage: enqueue / list / peek / accept / reject / clear, FIFO order,
// duplicate-id rejection, and pub-sub event delivery.

import { describe, expect, it } from 'vitest';
import { createAiApprovalQueue } from '../../src/ai/approvalQueue.js';
import type { AiApprovalQueueEvent, AiPendingActionLike } from '../../src/ai/types.js';

function action(id: string, prompt = `prompt-${id}`): AiPendingActionLike {
  return Object.freeze({
    id,
    prompt,
    commands: Object.freeze([{ verb: 'noop', args: {} }]),
  });
}

describe('AI approval queue', () => {
  it('starts empty', () => {
    const q = createAiApprovalQueue();
    expect(q.size()).toBe(0);
    expect(q.peek()).toBeUndefined();
    expect(q.list()).toEqual([]);
  });

  it('enqueues in FIFO order', () => {
    const q = createAiApprovalQueue();
    q.enqueue(action('a'));
    q.enqueue(action('b'));
    q.enqueue(action('c'));
    expect(q.list().map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(q.peek()?.id).toBe('a');
    expect(q.size()).toBe(3);
  });

  it('refuses duplicate ids', () => {
    const q = createAiApprovalQueue();
    q.enqueue(action('a'));
    expect(() => q.enqueue(action('a'))).toThrow(/duplicate id/);
  });

  it('accept removes the matching entry and returns it', () => {
    const q = createAiApprovalQueue();
    q.enqueue(action('a'));
    q.enqueue(action('b'));
    const popped = q.accept('a');
    expect(popped?.id).toBe('a');
    expect(q.list().map((x) => x.id)).toEqual(['b']);
  });

  it('reject removes the matching entry and returns it', () => {
    const q = createAiApprovalQueue();
    q.enqueue(action('a'));
    q.enqueue(action('b'));
    const popped = q.reject('b', 'too expensive');
    expect(popped?.id).toBe('b');
    expect(q.list().map((x) => x.id)).toEqual(['a']);
  });

  it('accept / reject return undefined when the id is unknown', () => {
    const q = createAiApprovalQueue();
    expect(q.accept('nope')).toBeUndefined();
    expect(q.reject('nope')).toBeUndefined();
  });

  it('clear empties the queue', () => {
    const q = createAiApprovalQueue();
    q.enqueue(action('a'));
    q.enqueue(action('b'));
    q.clear();
    expect(q.size()).toBe(0);
    expect(q.list()).toEqual([]);
  });

  it('list returns a frozen snapshot', () => {
    const q = createAiApprovalQueue();
    q.enqueue(action('a'));
    const snap = q.list();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('subscribers receive enqueued / accepted / rejected / cleared events in order', () => {
    const q = createAiApprovalQueue();
    const events: AiApprovalQueueEvent[] = [];
    const off = q.subscribe((e) => events.push(e));

    q.enqueue(action('a'));
    q.enqueue(action('b'));
    q.accept('a');
    q.reject('b', 'because');
    q.enqueue(action('c'));
    q.clear();
    off();

    expect(events.map((e) => e.kind)).toEqual([
      'enqueued',
      'enqueued',
      'accepted',
      'rejected',
      'enqueued',
      'cleared',
    ]);
    const rejected = events.find((e) => e.kind === 'rejected');
    expect(rejected && 'reason' in rejected ? rejected.reason : undefined).toBe('because');
  });

  it('clear on an already-empty queue does not emit', () => {
    const q = createAiApprovalQueue();
    const events: AiApprovalQueueEvent[] = [];
    q.subscribe((e) => events.push(e));
    q.clear();
    expect(events).toEqual([]);
  });

  it('unsubscribe stops further events', () => {
    const q = createAiApprovalQueue();
    const events: AiApprovalQueueEvent[] = [];
    const off = q.subscribe((e) => events.push(e));
    q.enqueue(action('a'));
    off();
    q.enqueue(action('b'));
    expect(events.map((e) => e.kind)).toEqual(['enqueued']);
  });

  it('a listener that throws does not break the producer', () => {
    const q = createAiApprovalQueue();
    q.subscribe(() => {
      throw new Error('bad listener');
    });
    expect(() => q.enqueue(action('a'))).not.toThrow();
    expect(q.size()).toBe(1);
  });
});
