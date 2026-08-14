// §L-905 / C78 §12 — one gesture = one undo, EXECUTED.
//
// "make room 003 a bedroom" changes TWO fields (occupancyType + name). Shipping
// that as two sibling legacy commands (RenameRoomCommand + SetRoomOccupancyCommand)
// would put TWO entries on the legacy history and cost two Ctrl+Z for one user
// sentence. The fix carries the occupancy INSIDE RenameRoomCommand's one store
// patch, so the history holds ONE entry and one undo() restores BOTH fields
// (the command's full-RoomData snapshot restore).
//
// This suite runs the REAL CommandManager (happy-dom, the same harness shape as
// createCommandTargetIdentity.test.ts) — not a hand-rolled undo.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { RenameRoomCommand } from '../src/rooms/RenameRoomCommand';
import type { CommandContext } from '../src/types';

/** Room-store double with the REAL RoomStore's seams the command uses:
 *  merge-on-update, snapshot-restore, copy-out reads. */
function makeRoomStore(...rooms: any[]) {
  const map = new Map<string, any>();
  for (const r of rooms) map.set(r.id, structuredClone(r));
  return {
    getById: (id: string) => {
      const r = map.get(id);
      return r ? structuredClone(r) : undefined;
    },
    update: (id: string, patch: any) => {
      const cur = map.get(id);
      if (!cur) throw new Error(`no such room: ${id}`);
      map.set(id, { ...cur, ...patch });
    },
    restoreSnapshot: (record: any) => {
      map.set(record.id, structuredClone(record));
    },
    getAll: () => [...map.values()],
    /** Raw internal record — what "the store holds" means in assertions. */
    raw: (id: string) => map.get(id),
  };
}

function makeHarness() {
  const roomStore = makeRoomStore({
    id: 'r-c',
    type: 'room',
    levelId: 'L0',
    name: 'Room 00-003',
    roomNumber: '00-003',
    occupancyType: 'unclassified',
  });
  const ctx = {
    stores: { roomStore },
    bimManager: { getLevels: () => [{ id: 'L0', name: 'Level 0', elevation: 0 }] },
  } as unknown as CommandContext;
  return { roomStore, cm: new CommandManager(ctx) };
}

describe('§L-905 — occupancy + rename are ONE history entry, ONE Ctrl+Z (C78 §12)', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => { h = makeHarness(); });

  it('one RenameRoomCommand applies BOTH fields and pushes exactly one entry', () => {
    const result = h.cm.execute(
      new RenameRoomCommand('r-c', { name: 'Bedroom 01', occupancyType: 'bedroom' }),
    );
    expect(result.success).toBe(true);
    expect(h.roomStore.raw('r-c').name).toBe('Bedroom 01');
    expect(h.roomStore.raw('r-c').occupancyType).toBe('bedroom');
    // ONE entry — the whole point. Two entries is the two-Ctrl+Z defect.
    expect(h.cm.getHistory()).toHaveLength(1);
  });

  it('ONE undo() reverts BOTH the occupancy and the name', () => {
    h.cm.execute(new RenameRoomCommand('r-c', { name: 'Bedroom 01', occupancyType: 'bedroom' }));
    const undone = h.cm.undo();
    expect(undone && (undone as { success?: boolean }).success !== false).toBe(true);
    expect(h.roomStore.raw('r-c').name).toBe('Room 00-003');
    expect(h.roomStore.raw('r-c').occupancyType).toBe('unclassified');
    expect(h.cm.canUndo()).toBe(false);
  });

  it('redo() re-applies both, and a second undo() reverts both again', () => {
    h.cm.execute(new RenameRoomCommand('r-c', { name: 'Bedroom 01', occupancyType: 'bedroom' }));
    h.cm.undo();
    h.cm.redo();
    expect(h.roomStore.raw('r-c').name).toBe('Bedroom 01');
    expect(h.roomStore.raw('r-c').occupancyType).toBe('bedroom');
    h.cm.undo();
    expect(h.roomStore.raw('r-c').name).toBe('Room 00-003');
    expect(h.roomStore.raw('r-c').occupancyType).toBe('unclassified');
  });

  it('omitting occupancyType leaves occupancy untouched (existing callers unaffected)', () => {
    h.cm.execute(new RenameRoomCommand('r-c', { name: 'My Room' }));
    expect(h.roomStore.raw('r-c').name).toBe('My Room');
    expect(h.roomStore.raw('r-c').occupancyType).toBe('unclassified');
  });

  it('a missing room refuses (canExecute) and pushes nothing', () => {
    const result = h.cm.execute(
      new RenameRoomCommand('ghost', { name: 'Bedroom 01', occupancyType: 'bedroom' }),
    );
    expect(result.success).toBe(false);
    expect(h.cm.getHistory()).toHaveLength(0);
  });
});
