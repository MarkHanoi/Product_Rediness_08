// @pryzm/runtime-undo-stack — RingBufferUndoStack contract tests (Sprint A33).
//
// Covers:
//   1. `undoPatch()` / `redoPatch()` atomicity and null behavior.
//   2. `op` field preservation in `JsonPatchOp` (C03 §4.1 fix — Sprint A33).
//   3. Round-trip: undo → redo restores forward value.
//   4. Subscriber notified exactly once per atomic patch-and-move call.

import { describe, expect, it, vi } from 'vitest';
import { RingBufferUndoStack, type PatchPair } from '../src/RingBufferUndoStack.js';

function makePair(fwdValue: number, invValue: number): PatchPair {
  return {
    forward: { ops: [{ op: 'replace', path: '/x', value: fwdValue }] },
    inverse: { ops: [{ op: 'replace', path: '/x', value: invValue }] },
  };
}

describe('RingBufferUndoStack — undoPatch', () => {
  it('returns null on empty stack', () => {
    expect(new RingBufferUndoStack().undoPatch()).toBeNull();
  });

  it('returns the inverse PatchSide and decrements cursor atomically', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(10, 0));
    rb.push(makePair(20, 10));

    const side = rb.undoPatch();

    expect(side).not.toBeNull();
    expect(side!.ops).toHaveLength(1);
    expect(side!.ops[0]).toMatchObject({ op: 'replace', path: '/x', value: 10 });
    expect(rb.undoCount()).toBe(1);
    expect(rb.redoCount()).toBe(1);
  });

  it('returns null after all entries have been undone', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(1, 0));
    rb.undoPatch();
    expect(rb.undoPatch()).toBeNull();
  });

  it('notifies subscribers exactly once per call', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(5, 0));
    const spy = vi.fn();
    rb.subscribe(spy);
    spy.mockClear();

    rb.undoPatch();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('RingBufferUndoStack — redoPatch', () => {
  it('returns null when nothing to redo', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(1, 0));
    expect(rb.redoPatch()).toBeNull();
  });

  it('returns the forward PatchSide and increments cursor atomically', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(42, 0));
    rb.undoPatch();

    const side = rb.redoPatch();

    expect(side).not.toBeNull();
    expect(side!.ops[0]).toMatchObject({ op: 'replace', path: '/x', value: 42 });
    expect(rb.undoCount()).toBe(1);
    expect(rb.redoCount()).toBe(0);
  });

  it('notifies subscribers exactly once per call', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(5, 0));
    rb.undoPatch();
    const spy = vi.fn();
    rb.subscribe(spy);
    spy.mockClear();

    rb.redoPatch();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('RingBufferUndoStack — undoPatch / redoPatch round-trip', () => {
  it('undo then redo restores original forward value', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(99, 0));

    const inv = rb.undoPatch();
    expect(inv!.ops[0]!.value).toBe(0);

    const fwd = rb.redoPatch();
    expect(fwd!.ops[0]!.value).toBe(99);

    expect(rb.undoCount()).toBe(1);
    expect(rb.redoCount()).toBe(0);
  });

  it('multiple undo/redo steps stay consistent', () => {
    const rb = new RingBufferUndoStack();
    rb.push(makePair(1, 0));
    rb.push(makePair(2, 1));
    rb.push(makePair(3, 2));

    expect(rb.undoPatch()!.ops[0]!.value).toBe(2);
    expect(rb.undoPatch()!.ops[0]!.value).toBe(1);
    expect(rb.undoPatch()!.ops[0]!.value).toBe(0);
    expect(rb.undoPatch()).toBeNull();

    expect(rb.redoPatch()!.ops[0]!.value).toBe(1);
    expect(rb.redoPatch()!.ops[0]!.value).toBe(2);
    expect(rb.redoPatch()!.ops[0]!.value).toBe(3);
    expect(rb.redoPatch()).toBeNull();
  });
});

describe('RingBufferUndoStack — op field preservation (Sprint A33)', () => {
  it('preserves op: add / remove across push → undoPatch → redoPatch', () => {
    const pair: PatchPair = {
      forward: { ops: [{ op: 'add', path: '/items/0', value: 'wall-abc' }] },
      inverse: { ops: [{ op: 'remove', path: '/items/0', value: undefined }] },
    };
    const rb = new RingBufferUndoStack();
    rb.push(pair);

    const inv = rb.undoPatch();
    expect(inv!.ops[0]!.op).toBe('remove');

    const fwd = rb.redoPatch();
    expect(fwd!.ops[0]!.op).toBe('add');
  });

  it('current() preserves op field in stored PatchPair', () => {
    const rb = new RingBufferUndoStack();
    rb.push({
      forward: { ops: [{ op: 'add', path: '/a', value: 1 }] },
      inverse: { ops: [{ op: 'remove', path: '/a', value: undefined }] },
    });
    const pair = rb.current();
    expect(pair!.forward.ops[0]!.op).toBe('add');
    expect(pair!.inverse.ops[0]!.op).toBe('remove');
  });
});
