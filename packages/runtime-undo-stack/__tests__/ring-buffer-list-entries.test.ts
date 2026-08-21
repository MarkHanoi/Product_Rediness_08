// §UNDO-HISTORY-DROPDOWN (ADR-0341) — gate for `RingBufferUndoStack.listEntries()`.
//
// THE DEFECT THIS ACCESSOR CLOSES. `_entries` and `_cursor` were private and the
// only readers were `current()` / `peek()` — the TOP of each direction. A UI
// could ask "what would the next Ctrl+Z revert?" but never "what are the last
// twenty things I did?", which is the founder's actual question. The obvious fix
// — an accessor for `_entries` — hands out `PatchPair.forward.value`, i.e. whole
// element records, giving UI code a mutation path into model state that no
// command authored (P6). So the accessor is a FROZEN, VALUE-FREE VIEW, and the
// value-free half is asserted here rather than assumed.

import { describe, expect, it } from 'vitest';
import { RingBufferUndoStack, type PatchPair } from '../src/RingBufferUndoStack.js';

function pair(id: string, type?: string, timestamp?: number, gestureId?: string): PatchPair {
  return {
    forward: { ops: [{ op: 'add', path: `/${id}`, value: { id, secret: 'PAYLOAD' } }] },
    inverse: { ops: [{ op: 'remove', path: `/${id}`, value: undefined }] },
    affectedStores: ['wall'],
    ...(type !== undefined ? { commandType: type } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    ...(gestureId !== undefined ? { gestureId } : {}),
  };
}

describe('RingBufferUndoStack.listEntries — the read-only history projection', () => {
  it('is empty for an empty buffer, and never throws', () => {
    expect(new RingBufferUndoStack().listEntries()).toEqual([]);
    expect(new RingBufferUndoStack().cursorIndex).toBe(-1);
  });

  it('lists every entry oldest-first with its index', () => {
    const rb = new RingBufferUndoStack();
    rb.push(pair('a'));
    rb.push(pair('b'));
    expect(rb.listEntries().map(e => e.index)).toEqual([0, 1]);
  });

  it('carries the label metadata the dropdown needs — and nothing more', () => {
    const rb = new RingBufferUndoStack();
    rb.push(pair('a', 'wall.create', 1234, 'g-9'));
    const [e] = rb.listEntries();
    expect(e).toMatchObject({
      commandType: 'wall.create', timestamp: 1234, gestureId: 'g-9', affectedStores: ['wall'],
    });
    expect(e!.opPaths).toEqual(['/a']);
  });

  it('NEVER exposes patch VALUES — the P6 property, asserted not assumed', () => {
    // A row that carried `value` would let a caller read (and a careless one
    // reconstruct and re-apply) whole element records straight off the undo
    // stack. `opPaths` is strings only.
    const rb = new RingBufferUndoStack();
    rb.push(pair('a', 'wall.create'));
    const serialised = JSON.stringify(rb.listEntries());
    expect(serialised).not.toContain('PAYLOAD');
    expect(serialised).not.toContain('value');
  });

  it('returns FROZEN rows — a UI cannot mutate undo state through the view', () => {
    const rb = new RingBufferUndoStack();
    rb.push(pair('a', 'wall.create'));
    const rows = rb.listEntries();
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0])).toBe(true);
    expect(Object.isFrozen(rows[0]!.affectedStores)).toBe(true);
  });

  it('partitions by the cursor: isUndone marks pending REDOs', () => {
    const rb = new RingBufferUndoStack();
    rb.push(pair('a'));
    rb.push(pair('b'));
    rb.push(pair('c'));
    expect(rb.listEntries().map(e => e.isUndone)).toEqual([false, false, false]);
    rb.undoPatch();
    expect(rb.listEntries().map(e => e.isUndone)).toEqual([false, false, true]);
    expect(rb.cursorIndex).toBe(1);
    rb.undoPatch();
    expect(rb.listEntries().map(e => e.isUndone)).toEqual([false, true, true]);
    rb.redoPatch();
    expect(rb.listEntries().map(e => e.isUndone)).toEqual([false, false, true]);
  });

  it('omits absent metadata rather than inventing it', () => {
    // A legacy fixture carries no timestamp / gestureId / commandType. Absence
    // must stay absent: a fabricated "now" would be a claim, and a fabricated
    // gesture id would make an unrelated entry look like a dual-dispatch twin.
    const rb = new RingBufferUndoStack();
    rb.push(pair('a'));
    const [e] = rb.listEntries();
    expect(e).not.toHaveProperty('timestamp');
    expect(e).not.toHaveProperty('gestureId');
    expect(e).not.toHaveProperty('commandType');
  });

  it('does not move the cursor', () => {
    const rb = new RingBufferUndoStack();
    rb.push(pair('a'));
    rb.push(pair('b'));
    const before = rb.cursorIndex;
    rb.listEntries();
    rb.listEntries();
    expect(rb.cursorIndex).toBe(before);
    expect(rb.canUndo()).toBe(true);
  });

  it('reflects the ring discard — a dropped oldest entry is not listed', () => {
    const rb = new RingBufferUndoStack({ maxSize: 2 });
    rb.push(pair('a', 'wall.create'));
    rb.push(pair('b', 'slab.create'));
    rb.push(pair('c', 'roof.create'));
    expect(rb.listEntries().map(e => e.commandType)).toEqual(['slab.create', 'roof.create']);
  });

  it('drops the redo tail on a new push, exactly as the buffer does', () => {
    const rb = new RingBufferUndoStack();
    rb.push(pair('a', 'wall.create'));
    rb.push(pair('b', 'slab.create'));
    rb.undoPatch();
    rb.push(pair('c', 'roof.create'));
    expect(rb.listEntries().map(e => e.commandType)).toEqual(['wall.create', 'roof.create']);
    expect(rb.listEntries().every(e => !e.isUndone)).toBe(true);
  });
});
