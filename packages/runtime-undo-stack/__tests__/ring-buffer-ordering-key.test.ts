/**
 * §UNDO-ORDERING-KEY (L-7300, C03 §4.6 U-10) — every stored entry is ORDERABLE.
 *
 * WHAT BROKE. C03 §4.6 U-10 requires both undo stacks to carry a commit
 * timestamp so `performUndoRedo` can interleave them chronologically. Its
 * parenthetical named ONE producer — *"`PatchPair.timestamp` stamped by
 * `CommandBus` at push"* — and that is how the obligation was read: as
 * `CommandBus`'s. Measured 2026-08-23, **6 of the 8 production push sites minted
 * an entry with no timestamp** (`initBusHandlers.ts` :825 / :1596 / :1647 /
 * :1703 / :1798, and `commitAnnotationSet.ts`).
 *
 * WHY THAT IS NOT A COSMETIC GAP. `performUndoRedo._cmEntryIsNewer` opens with
 * `if (typeof pairTime !== 'number') return false`, so a missing key does not
 * lose a tie-break — it makes the ring buffer win UNCONDITIONALLY over a legacy
 * entry however much newer. The founder's Ctrl+Z after raking a wall reverted a
 * SLAB for exactly this reason (`apps/editor/__tests__/L7300RakeProfileUndoCrossStack.test.ts`).
 *
 * THE INVARIANT THIS FILE PINS: after `push()`, EVERY entry the stack hands back
 * — through `current()`, `peek()` or `listEntries()` — carries a finite numeric
 * `timestamp`, whatever the pusher supplied. The stamp is minted at the ONE
 * chokepoint every producer flows through, so it cannot be forgotten by a push
 * site that does not yet exist.
 */

import { describe, it, expect, vi } from 'vitest';
import { RingBufferUndoStack, type PatchPair } from '../src/RingBufferUndoStack.js';

const pair = (id: string, extra: Partial<PatchPair> = {}): PatchPair => ({
  forward: { ops: [{ op: 'replace', path: `/${id}`, value: { id, v: 2 } }] },
  inverse: { ops: [{ op: 'replace', path: `/${id}`, value: { id, v: 1 } }] },
  affectedStores: ['slab'],
  ...extra,
});

describe('§UNDO-ORDERING-KEY — push() mints the key the caller omitted', () => {
  it('an UNSTAMPED pair is orderable once stored (the six production sites)', () => {
    const rb = new RingBufferUndoStack({ now: () => 1_700_000_000_000 });
    rb.push(pair('slab_1'));                     // verbatim shape of initBusHandlers:1703

    const stored = rb.current()!;
    expect(typeof stored.timestamp).toBe('number');
    expect(Number.isFinite(stored.timestamp!)).toBe(true);
    expect(stored.timestamp).toBe(1_700_000_000_000);
  });

  it("a SUPPLIED timestamp is never overwritten — CommandBus's commit instant wins", () => {
    const rb = new RingBufferUndoStack({ now: () => 999 });
    rb.push(pair('slab_1', { timestamp: 1_700_000_012_345 }));
    expect(rb.current()!.timestamp).toBe(1_700_000_012_345);
  });

  it('the pusher\'s object is not mutated — a caller may share or freeze its pair', () => {
    const rb = new RingBufferUndoStack({ now: () => 42 });
    const p = Object.freeze(pair('slab_1'));
    expect(() => rb.push(p)).not.toThrow();       // a frozen pair must not be written through
    expect(p.timestamp).toBeUndefined();          // the caller's object is untouched
    expect(rb.current()!.timestamp).toBe(42);     // the STORED copy carries the key
  });

  it('everything else about the pair survives the stamping', () => {
    const rb = new RingBufferUndoStack({ now: () => 7 });
    rb.push(pair('slab_1', { gestureId: 'g-1', commandType: 'element.changeType' }));
    const s = rb.current()!;
    expect(s.affectedStores).toEqual(['slab']);
    expect(s.gestureId).toBe('g-1');
    expect(s.commandType).toBe('element.changeType');
    expect(s.forward.ops[0]!.path).toBe('/slab_1');
    expect(s.inverse.ops[0]!.value).toEqual({ id: 'slab_1', v: 1 });
  });

  it('the key reaches EVERY reader — current(), peek() and listEntries()', () => {
    const rb = new RingBufferUndoStack({ now: () => 500 });
    rb.push(pair('a'));
    rb.push(pair('b'));
    rb.undoPatch();                               // cursor now on `a`; `b` is a pending redo

    expect(rb.current()!.timestamp).toBe(500);
    expect(rb.peek()!.timestamp).toBe(500);
    for (const view of rb.listEntries()) expect(typeof view.timestamp).toBe('number');
  });

  it('a THROWING or NON-FINITE injected clock still yields a key (C03 §4.2 — push never throws)', () => {
    const boom = new RingBufferUndoStack({ now: () => { throw new Error('no clock'); } });
    expect(() => boom.push(pair('a'))).not.toThrow();
    expect(Number.isFinite(boom.current()!.timestamp!)).toBe(true);

    const nan = new RingBufferUndoStack({ now: () => Number.NaN });
    nan.push(pair('a'));
    expect(Number.isFinite(nan.current()!.timestamp!)).toBe(true);
  });

  it('the DEFAULT clock is the real one — the same Date.now() Command.timestamp uses', () => {
    // The cross-stack comparison is only meaningful if both sides read the same
    // clock; a stack that stamped a counter would order correctly against nothing.
    const spy = vi.spyOn(Date, 'now');
    try {
      const rb = new RingBufferUndoStack();
      const before = Date.now();
      rb.push(pair('a'));
      expect(spy).toHaveBeenCalled();
      expect(rb.current()!.timestamp).toBeGreaterThanOrEqual(before);
      expect(rb.current()!.timestamp).toBeLessThanOrEqual(Date.now());
    } finally {
      spy.mockRestore();
    }
  });
});
