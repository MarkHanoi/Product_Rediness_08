import { describe, expect, it } from 'vitest';
import { UndoStack } from '../src/UndoStack.js';
import type { EventRecord } from '../src/types.js';

function rec(id: string): EventRecord {
  return {
    id,
    type: 'test.op',
    payload: {},
    affectedStores: ['x'],
    patches: [],
    forward: [],
    inverse: [],
    audit: {
      actorId: 'a',
      projectId: 'p',
      clientId: 'c',
      timestamp: new Date(0).toISOString(),
    },
  };
}

describe('UndoStack', () => {
  it('push then undo returns the most recent record', () => {
    const u = new UndoStack();
    u.push(rec('a'));
    u.push(rec('b'));
    expect(u.size).toBe(2);
    expect(u.undo()?.id).toBe('b');
    expect(u.size).toBe(1);
  });

  it('undo then redo restores order', () => {
    const u = new UndoStack();
    u.push(rec('a'));
    u.push(rec('b'));
    u.undo(); // pops 'b' onto redo
    expect(u.redoSize).toBe(1);
    expect(u.redo()?.id).toBe('b');
    expect(u.redoSize).toBe(0);
    expect(u.size).toBe(2);
  });

  it('a fresh push wipes redo history', () => {
    const u = new UndoStack();
    u.push(rec('a'));
    u.push(rec('b'));
    u.undo();
    u.push(rec('c'));
    expect(u.redoSize).toBe(0);
    expect(u.redo()).toBeNull();
  });

  it('respects maxSize (oldest dropped)', () => {
    const u = new UndoStack({ maxSize: 3 });
    u.push(rec('a'));
    u.push(rec('b'));
    u.push(rec('c'));
    u.push(rec('d'));
    expect(u.size).toBe(3);
    expect(u.snapshot().undo.map(r => r.id)).toEqual(['b', 'c', 'd']);
  });

  it('maxSize is clamped to >= 1', () => {
    const u = new UndoStack({ maxSize: 0 });
    u.push(rec('a'));
    u.push(rec('b'));
    expect(u.size).toBe(1);
    expect(u.snapshot().undo[0]!.id).toBe('b');
  });

  it('clear empties both stacks', () => {
    const u = new UndoStack();
    u.push(rec('a'));
    u.undo();
    u.clear();
    expect(u.size).toBe(0);
    expect(u.redoSize).toBe(0);
    expect(u.undo()).toBeNull();
    expect(u.redo()).toBeNull();
  });
});
