// §UNDO-TARGET-IDENTITY — the GENERIC guard for C03 §4.6 **U-9**:
// "a command's targetIds MUST name every element it creates, not only its host".
//
// WHY A GENERIC GUARD AND NOT N PER-COMMAND TESTS
// ----------------------------------------------------------------------------
// U-8's shadow-drop (`dropEntriesForTargets`) is an element-IDENTITY predicate.
// A create command that names only its HOST is therefore indistinguishable from
// that host's own dual-dispatch twin, so undoing the host silently deletes the
// child's entry from history AND redoStack — the child's creation becomes
// invisible to undo and redo. That is the founder-reported "Ctrl+Z jumps over
// the door I just placed", and the audit found the SAME shape in four more
// families (stair railing → host stair, room-from-walls → host walls, plan view
// → host level, batched wall openings → host walls).
//
// The fix is a single chokepoint — `CommandManagerImpl.execute()` unions
// `CommandResult.affectedElementIds` into `command.targetIds` — so this file
// pins the chokepoint itself plus a walk over REAL create commands from
// several families. A future create command with the host-only shape is
// therefore repaired automatically, and this test proves it stays repaired.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';
import { CreateStairRailingCommand } from '../src/stair/CreateStairRailingCommand';
import { CreateLightingCommand } from '../src/lighting/CreateLightingCommand';
import { CreateColumnCommand } from '../src/columns/CreateColumnCommand';
import { doorStore } from '@pryzm/geometry-door';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

// ── Store doubles ───────────────────────────────────────────────────────────

function makeStore<T extends { id: string }>() {
  const map = new Map<string, T>();
  return {
    map,
    add(e: T) { map.set(e.id, e); },
    remove(id: string) { return map.delete(id); },
    update(id: string, u: Partial<T>) { const e = map.get(id); if (e) map.set(id, { ...e, ...u }); },
    getById(id: string) { return map.get(id); },
    get(id: string) { return map.get(id); },
    getAll() { return [...map.values()]; },
    getByLevel(levelId: string) { return [...map.values()].filter((e) => (e as { levelId?: string }).levelId === levelId); },
    clear() { map.clear(); },
    has(id: string) { return map.has(id); },
  };
}

function makeWall(id: string, lengthM = 6) {
  return {
    id, type: 'wall' as const, levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: lengthM, y: 0, z: 0 }],
    height: 2.7, thickness: 0.2, openings: [] as any[], childrenIds: [] as string[],
  };
}

function makeHarness() {
  const wallStore = {
    ...makeStore<any>(),
    addOpening(wallId: string, opening: any) {
      const w = this.getById(wallId); if (!w) return undefined;
      w.openings = [...w.openings, opening];
      if (!w.childrenIds.includes(opening.elementId)) w.childrenIds = [...w.childrenIds, opening.elementId];
      return w;
    },
    removeOpening(wallId: string, openingId: string) {
      const w = this.getById(wallId); if (!w) return undefined;
      const gone = w.openings.find((o: any) => o.id === openingId);
      w.openings = w.openings.filter((o: any) => o.id !== openingId);
      if (gone) w.childrenIds = w.childrenIds.filter((c: string) => c !== gone.elementId);
      return w;
    },
  };
  wallStore.add(makeWall('W1'));

  const stairStore = makeStore<any>();
  stairStore.add({ id: 'ST1', type: 'stair', levelId: 'L0', properties: {} });

  const stores = {
    wallStore,
    slabStore: makeStore<any>(),
    stairStore,
    stairRailingStore: makeStore<any>(),
    columnStore: makeStore<any>(),
    lightingStore: makeStore<any>(),
    roomStore: makeStore<any>(),
    curtainWallStore: makeStore<any>(),
  };
  const levels = [{ id: 'L0', name: 'Level 0', elevation: 0, height: 3, childrenIds: [] as string[] }];
  const bimManager = {
    getLevels: () => levels,
    getLevelById: (id: string) => levels.find((l) => l.id === id),
    registerElement: () => {},
    unregisterElement: () => {},
  };
  const ctx = { stores, bimManager } as unknown as CommandContext;
  return { ctx, stores, cm: new CommandManager(ctx) };
}

/** Synthetic command with an authored shape — the table below covers every
 *  targetIds shape the registry audit found. */
function shapedCommand(
  type: string,
  authoredTargetIds: string[],
  createdIds: string[],
  opts: { readonly frozen?: boolean } = {},
): Command {
  const targetIds = opts.frozen ? Object.freeze([...authoredTargetIds]) : [...authoredTargetIds];
  return {
    id: `cmd_${type}`,
    type: type as Command['type'],
    timestamp: Date.now(),
    targetIds,
    affectedStores: ['wall'],
    canExecute: (): CommandValidationResult => ({ ok: true }),
    execute: (): CommandResult => ({ success: true, affectedElementIds: [...createdIds] }),
    undo: (): CommandResult => ({ success: true, affectedElementIds: [...createdIds] }),
    serialize: () => ({ type, targetIds, timestamp: 0, version: 1, payload: {} }),
  } as unknown as Command;
}

describe('§UNDO-TARGET-IDENTITY — the U-9 chokepoint (C03 §4.6)', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => { h = makeHarness(); });

  // Every targetIds shape the registry audit found, including the two broken ones.
  const SHAPES: Array<{ name: string; authored: string[]; created: string[] }> = [
    { name: 'own-id create (CreateWallCommand / CreateColumnCommand shape)', authored: ['E1'], created: ['E1'] },
    { name: 'HOST-ONLY create (CreateWallOpeningCommand shape — was BROKEN)', authored: ['HOST'], created: ['CHILD'] },
    { name: 'HOST-ONLY create, many hosts (DetectRoomFromWallsCommand shape — was BROKEN)', authored: ['W1', 'W2', 'W3'], created: ['ROOM1'] },
    { name: 'empty-then-push create (CreateStairCommand shape)', authored: [], created: ['ST1'] },
    { name: 'batch create (BatchCreateRoomsCommand shape)', authored: ['R1', 'R2'], created: ['R1', 'R2'] },
    { name: 'create with children (CreateFurnitureCommand shape)', authored: ['F1'], created: ['F1', 'F1_child'] },
  ];

  for (const shape of SHAPES) {
    it(`after execute, targetIds names every created element — ${shape.name}`, () => {
      const cmd = shapedCommand('CREATE_X', shape.authored, shape.created);
      h.cm.execute(cmd);
      for (const id of shape.created) {
        expect(cmd.targetIds, `created id "${id}" must appear in targetIds`).toContain(id);
      }
      // Authored ids are never dropped — host context is preserved.
      for (const id of shape.authored) expect(cmd.targetIds).toContain(id);
      // targetIds[0] is stable: the authored first id keeps its position, so every
      // `targetIds[0]` host consumer (AIPanel / ValidatePanel / batch executor)
      // reads the same value it read before.
      if (shape.authored.length > 0) expect(cmd.targetIds[0]).toBe(shape.authored[0]);
    });
  }

  it('a HOST-ONLY create is no longer shadow-dropped when its host is reverted (the live bug)', () => {
    const child = shapedCommand('CREATE_CHILD', ['HOST'], ['CHILD']);
    h.cm.execute(child);
    // A ring-buffer undo just removed the HOST; performUndo shadow-drops ids=['HOST'].
    expect(h.cm.dropEntriesForTargets(['HOST'])).toBe(0);
    expect(h.cm.getHistory().length).toBe(1);
    expect(h.cm.canUndo()).toBe(true);
  });

  it('the legitimate dual-dispatch drop still works (U-8 is not weakened)', () => {
    h.stores.wallStore.add({ id: 'W9', type: 'wall', levelId: 'L0', openings: [], childrenIds: [] } as any);
    h.cm.execute(shapedCommand('CREATE_WALL', ['W9'], ['W9']));
    h.stores.wallStore.remove('W9');                    // the ring-buffer undo removed it
    expect(h.cm.dropEntriesForTargets(['W9'])).toBe(1);  // twin dropped → one gesture, one Ctrl+Z
  });

  it('a frozen targetIds array never breaks execution (defensive)', () => {
    const cmd = shapedCommand('CREATE_FROZEN', ['HOST'], ['CHILD'], { frozen: true });
    const res = h.cm.execute(cmd);
    expect(res.success).toBe(true);                      // the command still succeeded
    expect(h.cm.getHistory().length).toBe(1);
  });

  it('a failed execute does not widen targetIds', () => {
    const failing = {
      ...shapedCommand('CREATE_FAIL', ['HOST'], ['CHILD']),
      execute: (): CommandResult => ({ success: false, affectedElementIds: ['CHILD'] }),
    } as unknown as Command;
    h.cm.execute(failing);
    expect(failing.targetIds).toEqual(['HOST']);
  });
});

// ── The walk over REAL create commands, family by family ────────────────────
//
// Each entry drives the actual registry command through the actual
// CommandManager and asserts U-9 plus the identity round-trip the founder named:
// create → undo removes → redo restores the SAME id → repeat without drift.

interface FamilyCase {
  family: string;
  /** Build the command + the oracle that reads the created element back. */
  make(h: ReturnType<typeof makeHarness>): {
    command: Command;
    /** Ids the command is expected to create (resolved AFTER execute). */
    createdIds(): string[];
    /** True while the created element is present in its store. */
    alive(id: string): boolean;
  };
}

const FAMILIES: FamilyCase[] = [
  {
    family: 'door / window (hosted opening — host = wall)',
    make: (h) => {
      const command = new CreateWallOpeningCommand({
        wallId: 'W1',
        openingData: { type: 'door', offset: 1, width: 0.9, height: 2.1, sillHeight: 0 },
      }) as unknown as Command;
      return {
        command,
        createdIds: () => [h.stores.wallStore.getById('W1')!.openings[0]?.elementId].filter(Boolean),
        alive: (id) => (h.stores.wallStore.getById('W1')!.openings as any[]).some((o) => o.elementId === id),
      };
    },
  },
  {
    family: 'stair-railing (host = stair)',
    make: (h) => {
      const command = new CreateStairRailingCommand({ stairId: 'ST1', side: 'left' as any }) as unknown as Command;
      return {
        command,
        createdIds: () => h.stores.stairRailingStore.getAll().map((r: any) => r.id),
        alive: (id) => h.stores.stairRailingStore.has(id),
      };
    },
  },
  {
    family: 'lighting (own id — commandManager-ONLY 3D tool)',
    make: (h) => {
      const command = new CreateLightingCommand({
        fixtureType: 'downlight' as any,
        position: { x: 1, y: 2.6, z: 1 },
        levelId: 'L0',
      } as any) as unknown as Command;
      return {
        command,
        createdIds: () => h.stores.lightingStore.getAll().map((l: any) => l.id),
        alive: (id) => h.stores.lightingStore.has(id),
      };
    },
  },
  {
    family: 'column (own id — commandManager-ONLY 3D tool)',
    make: (h) => {
      const command = new CreateColumnCommand({
        position: { x: 0, y: 0, z: 0 },
        levelId: 'L0',
        width: 0.4, depth: 0.4, height: 3,
      } as any) as unknown as Command;
      return {
        command,
        createdIds: () => h.stores.columnStore.getAll().map((c: any) => c.id),
        alive: (id) => h.stores.columnStore.has(id),
      };
    },
  },
];

describe('§UNDO-TARGET-IDENTITY — real create commands, per family (U-9 + stable id)', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => {
    for (const d of doorStore.getAll()) doorStore.remove(d.id);
    h = makeHarness();
  });

  for (const f of FAMILIES) {
    it(`${f.family}: targetIds names every created element after execute (U-9)`, () => {
      const c = f.make(h);
      const res = h.cm.execute(c.command);
      expect(res.success, `${f.family} execute must succeed for the guard to mean anything`).toBe(true);
      const created = c.createdIds();
      expect(created.length, 'the command must have created at least one element').toBeGreaterThan(0);
      for (const id of created) {
        expect(c.command.targetIds, `${f.family}: created id must be in targetIds`).toContain(id);
      }
    });

    it(`${f.family}: a host-scoped shadow-drop no longer destroys the entry`, () => {
      const c = f.make(h);
      h.cm.execute(c.command);
      // Simulate performUndo's shadow-drop after a ring-buffer undo of the HOST
      // (wall / stair / level) — the authored first target.
      const host = c.command.targetIds[0]!;
      expect(h.cm.dropEntriesForTargets([host])).toBe(0);
      expect(h.cm.canUndo()).toBe(true);
    });

    it(`${f.family}: undo removes it, redo restores the SAME id, twice, with no drift`, () => {
      const c = f.make(h);
      h.cm.execute(c.command);
      const created = c.createdIds();
      expect(created.length).toBeGreaterThan(0);
      const id = created[0]!;
      expect(c.alive(id)).toBe(true);

      for (let cycle = 0; cycle < 2; cycle++) {
        h.cm.undo();
        expect(c.alive(id), `${f.family}: undo (cycle ${cycle}) must remove the element`).toBe(false);
        h.cm.redo();
        expect(c.alive(id), `${f.family}: redo (cycle ${cycle}) must restore the SAME id`).toBe(true);
        expect(c.createdIds(), `${f.family}: no id drift across cycle ${cycle}`).toContain(id);
      }
    });

    it(`${f.family}: serialize() round-trips and keeps the created id in targetIds`, () => {
      const c = f.make(h);
      h.cm.execute(c.command);
      const id = c.createdIds()[0]!;
      const wire = c.command.serialize();
      expect(wire.targetIds).toContain(id);
      expect(typeof wire.timestamp).toBe('number');   // U-10 needs a commit time on the wire
      expect(wire.type).toBe(c.command.type);
    });
  }
});
