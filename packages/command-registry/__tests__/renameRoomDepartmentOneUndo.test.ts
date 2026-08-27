// §DEPT153 (L-12540+) — the manual Department field's writer.
//
// Mirrors renameRoomOccupancyOneUndo.test.ts EXACTLY (same harness shape): department
// rides RenameRoomCommand's SAME combined patch as name/roomNumber/occupancyType, so
// setting it costs ONE history entry and undoes in ONE Ctrl+Z. Additionally pins the
// `departmentAuthored` metadata stamp (EI-7e, C84 §9) — mirroring `roomNumberAuthored`
// exactly — which BulkAutoClassifyRoomsCommand (§ROOMTYPE142/§DEPT153) reads to decide
// whether a room's department is safe to re-derive.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { RenameRoomCommand } from '../src/rooms/RenameRoomCommand';
import type { CommandContext } from '../src/types';

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
      // Faithful to the real RoomStore.update(): metadata is a MERGE, not a
      // wholesale replace, because RenameRoomCommand only ever sends the ONE
      // changed flag — see RoomStore.ts's own EI-7e comment.
      const merged = { ...cur, ...patch };
      if (patch.metadata) merged.metadata = { ...cur.metadata, ...patch.metadata };
      map.set(id, merged);
    },
    restoreSnapshot: (record: any) => {
      map.set(record.id, structuredClone(record));
    },
    getAll: () => [...map.values()],
    raw: (id: string) => map.get(id),
  };
}

function makeHarness() {
  const roomStore = makeRoomStore({
    id: 'r-d',
    type: 'room',
    levelId: 'L0',
    name: 'Room 00-004',
    roomNumber: '00-004',
    occupancyType: 'unclassified',
    department: undefined,
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'system', version: 1 },
  });
  const ctx = {
    stores: { roomStore },
    bimManager: { getLevels: () => [{ id: 'L0', name: 'Level 0', elevation: 0 }] },
  } as unknown as CommandContext;
  return { roomStore, cm: new CommandManager(ctx) };
}

describe('§DEPT153 — department rides RenameRoomCommand, ONE history entry, ONE Ctrl+Z', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => { h = makeHarness(); });

  it('setting department writes the value AND stamps departmentAuthored=true', () => {
    const result = h.cm.execute(new RenameRoomCommand('r-d', { department: 'Residential' }));
    expect(result.success).toBe(true);
    expect(h.roomStore.raw('r-d').department).toBe('Residential');
    expect(h.roomStore.raw('r-d').metadata.departmentAuthored).toBe(true);
    expect(h.cm.getHistory()).toHaveLength(1);
  });

  it('clearing department (blank) writes empty string AND un-authors it', () => {
    h.cm.execute(new RenameRoomCommand('r-d', { department: 'Residential' }));
    h.cm.execute(new RenameRoomCommand('r-d', { department: '' }));
    expect(h.roomStore.raw('r-d').department).toBe('');
    expect(h.roomStore.raw('r-d').metadata.departmentAuthored).toBe(false);
  });

  it('department + name + occupancy in ONE call apply together in ONE history entry', () => {
    const result = h.cm.execute(
      new RenameRoomCommand('r-d', { name: 'Bedroom 01', occupancyType: 'bedroom', department: 'Residential' }),
    );
    expect(result.success).toBe(true);
    expect(h.roomStore.raw('r-d').name).toBe('Bedroom 01');
    expect(h.roomStore.raw('r-d').occupancyType).toBe('bedroom');
    expect(h.roomStore.raw('r-d').department).toBe('Residential');
    expect(h.cm.getHistory()).toHaveLength(1);
  });

  it('ONE undo() reverts the department AND its authored flag together with name/occupancy', () => {
    h.cm.execute(new RenameRoomCommand('r-d', { name: 'Bedroom 01', occupancyType: 'bedroom', department: 'Residential' }));
    const undone = h.cm.undo();
    expect(undone && (undone as { success?: boolean }).success !== false).toBe(true);
    expect(h.roomStore.raw('r-d').name).toBe('Room 00-004');
    expect(h.roomStore.raw('r-d').occupancyType).toBe('unclassified');
    expect(h.roomStore.raw('r-d').department).toBeUndefined();
    expect(h.roomStore.raw('r-d').metadata.departmentAuthored).toBeUndefined();
    expect(h.cm.canUndo()).toBe(false);
  });

  it('omitting department leaves it untouched (existing name/number/occupancy callers unaffected)', () => {
    h.cm.execute(new RenameRoomCommand('r-d', { name: 'My Room' }));
    expect(h.roomStore.raw('r-d').name).toBe('My Room');
    expect(h.roomStore.raw('r-d').department).toBeUndefined();
    expect(h.roomStore.raw('r-d').metadata.departmentAuthored).toBeUndefined();
  });

  it('a missing room refuses (canExecute) and pushes nothing', () => {
    const result = h.cm.execute(new RenameRoomCommand('ghost', { department: 'Residential' }));
    expect(result.success).toBe(false);
    expect(h.cm.getHistory()).toHaveLength(0);
  });
});
