// §UNDO-SHADOW-DROP-IDENTITY — regression gate for the founder-reported bug
// "creating a door/window then Ctrl+Z does NOT undo it — undo JUMPS OVER it to
// the element created before" (C03 §4.5–§4.8, C15 hosted elements).
//
// ROOT CAUSE PINNED HERE
// ----------------------------------------------------------------------------
// `CreateWallOpeningCommand` declared `targetIds = [wallId]` — the HOST wall
// only, never the created opening. A door/window placed in the 3D view is a
// commandManager-ONLY entry (DoorTool/WindowTool call
// `cm.execute(new CreateWallOpeningCommand(...))`; there is no bus dispatch), so
// the wall beneath it is the ring buffer's top entry. On Ctrl+Z the unified path
// (performUndoRedo) took the ring buffer first, undid the WALL, and then ran the
// U-8 shadow-drop with `ids = [wallId]`. The ADD_OPENING entry's targetIds
// (`[wallId]`) are a SUBSET of that, and the wall was now orphaned — so the
// door's undo entry was deleted from BOTH `history` and `redoStack`. The door
// creation became invisible to undo AND redo: exactly "undo jumped over it".
//
// THE INVARIANTS THIS FILE PINS
//   1. targetIds names the CREATED opening element, not only its host — element
//      identity is what the shadow-drop predicate is keyed on (U-8).
//   2. A live opening's entry is NEVER shadow-dropped by a host-wall revert.
//   3. undo → redo restores the SAME opening id AND the SAME element id, in the
//      wall, in the doorStore/windowStore, and in the semantic registry (C03
//      §2.6 stable-id rule; C15 §2 hosted-element identity).

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface FakeWall {
  id: string;
  type: 'wall';
  levelId: string;
  baseLine: [Pt, Pt];
  height: number;
  thickness: number;
  openings: any[];
  childrenIds: string[];
}

function makeWall(id: string, lengthM = 6): FakeWall {
  return {
    id, type: 'wall', levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: lengthM, y: 0, z: 0 }],
    height: 2.7, thickness: 0.2, openings: [], childrenIds: [],
  };
}

/** WallStore double with the exact mutator surface CreateWallOpeningCommand uses. */
function makeWallStore(seed: FakeWall[]) {
  const map = new Map<string, FakeWall>(seed.map(w => [w.id, w]));
  return {
    map,
    add(w: FakeWall) { map.set(w.id, w); },
    remove(id: string) { map.delete(id); },
    getById(id: string) { return map.get(id); },
    getAll() { return [...map.values()]; },
    addOpening(wallId: string, opening: any) {
      const w = map.get(wallId);
      if (!w) return undefined;
      w.openings = [...w.openings, opening];
      if (!w.childrenIds.includes(opening.elementId)) w.childrenIds = [...w.childrenIds, opening.elementId];
      return w;
    },
    removeOpening(wallId: string, openingId: string) {
      const w = map.get(wallId);
      if (!w) return undefined;
      const gone = w.openings.find(o => o.id === openingId);
      w.openings = w.openings.filter(o => o.id !== openingId);
      if (gone) w.childrenIds = w.childrenIds.filter(c => c !== gone.elementId);
      return w;
    },
  };
}

function makeCtx(wallStore: ReturnType<typeof makeWallStore>) {
  const registered = new Set<string>();
  const bimManager = {
    getLevels: () => [{ id: 'L0', name: 'Level 0', childrenIds: [] as string[] }],
    getLevelById: () => undefined,
    registerElement: (id: string) => { registered.add(id); },
    unregisterElement: (id: string) => { registered.delete(id); },
  };
  const ctx = {
    stores: { wallStore, slabStore: { getAll: () => [], clear() {}, add() {}, remove() {} } },
    bimManager,
  } as unknown as CommandContext;
  return { ctx, registered };
}

/** Stand-in for the ring-buffer twin of a 3D-created wall (CreateWallCommand). */
function fakeWallCommand(targetIds: string[]): Command {
  return {
    id: `cmd_CREATE_WALL_${targetIds.join('_')}`,
    type: 'CREATE_WALL' as Command['type'],
    timestamp: Date.now(),
    targetIds,
    affectedStores: ['wall'],
    canExecute: (): CommandValidationResult => ({ ok: true }),
    execute: (): CommandResult => ({ success: true, affectedElementIds: targetIds }),
    undo: (): CommandResult => ({ success: true, affectedElementIds: targetIds }),
    serialize: () => ({ type: 'CREATE_WALL', targetIds, timestamp: 0, version: 1, payload: {} }),
  } as unknown as Command;
}

const DOOR_OPENING = {
  type: 'door' as const,
  offset: 1.0,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
  doorType: 'single',
};

describe('§UNDO-SHADOW-DROP-IDENTITY — a hosted opening is undoable (C03 §4.6 U-8 / C15)', () => {
  let wallStore: ReturnType<typeof makeWallStore>;
  let ctx: CommandContext;
  let cm: CommandManager;

  beforeEach(() => {
    for (const d of doorStore.getAll()) doorStore.remove(d.id);
    for (const w of windowStore.getAll()) windowStore.remove(w.id);
    wallStore = makeWallStore([makeWall('W1')]);
    ({ ctx } = makeCtx(wallStore));
    cm = new CommandManager(ctx);
  });

  it('declares the created opening element in targetIds (not only the host wall)', () => {
    const cmd = new CreateWallOpeningCommand({ wallId: 'W1', openingData: { ...DOOR_OPENING } });
    expect(cmd.targetIds[0]).toBe('W1');                    // host stays FIRST (targetIds[0] consumers)
    expect(cmd.targetIds.length).toBe(2);

    cm.execute(cmd);
    const elementId = wallStore.getById('W1')!.openings[0].elementId;
    expect(cmd.targetIds).toContain(elementId);              // the created element IS a target
  });

  it('REGRESSION: undoing the host wall does NOT shadow-drop the door entry (undo no longer jumps over it)', () => {
    // 1. A 3D-created wall: dual-dispatched, so it is ALSO a commandManager entry.
    cm.execute(fakeWallCommand(['W1']));
    // 2. A 3D-placed door on that wall: commandManager-ONLY (DoorTool → cm.execute).
    cm.execute(new CreateWallOpeningCommand({ wallId: 'W1', openingData: { ...DOOR_OPENING } }));
    expect(cm.getHistory().length).toBe(2);

    // 3. Ctrl+Z takes the ring buffer's WALL entry (the pre-fix routing), which
    //    removes the wall, then shadow-drops with ids = [W1].
    wallStore.remove('W1');
    const dropped = cm.dropEntriesForTargets(['W1']);

    // The wall's own twin is dropped (U-8). The door's entry MUST survive: its
    // targetIds are not a subset of [W1] any more, and the door element is alive.
    expect(dropped).toBe(1);
    const remaining = cm.getHistory();
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.command.type).toBe('ADD_OPENING');
    expect(cm.canUndo()).toBe(true);                        // the door is still undoable
  });

  it('a live door survives a shadow-drop that names BOTH the wall and the door', () => {
    cm.execute(new CreateWallOpeningCommand({ wallId: 'W1', openingData: { ...DOOR_OPENING } }));
    const elementId = wallStore.getById('W1')!.openings[0].elementId;

    // Even a superset drop request must not delete the entry while the element
    // is alive — orphan-scoping (§UNDO-SHADOW-DROP-SCOPE) is the second guard.
    expect(cm.dropEntriesForTargets(['W1', elementId])).toBe(0);
    expect(cm.getHistory().length).toBe(1);
  });

  it('undo removes the door from the wall AND the doorStore; redo restores the SAME ids', () => {
    const res = cm.execute(new CreateWallOpeningCommand({ wallId: 'W1', openingData: { ...DOOR_OPENING } }));
    expect(res.success).toBe(true);

    const created = wallStore.getById('W1')!.openings[0];
    const openingId = created.id as string;
    const elementId = created.elementId as string;
    expect(doorStore.has(elementId)).toBe(true);
    expect(wallStore.getById('W1')!.childrenIds).toContain(elementId);

    // ── UNDO ────────────────────────────────────────────────────────────────
    cm.undo();
    expect(wallStore.getById('W1')!.openings.length).toBe(0);   // hole closed
    expect(doorStore.has(elementId)).toBe(false);               // leaf/frame gone
    expect(wallStore.getById('W1')!.childrenIds).not.toContain(elementId);

    // ── REDO ────────────────────────────────────────────────────────────────
    cm.redo();
    const restored = wallStore.getById('W1')!.openings[0];
    expect(restored).toBeDefined();
    // IDENTITY: the SAME opening id and the SAME element id — never re-minted.
    expect(restored.id).toBe(openingId);
    expect(restored.elementId).toBe(elementId);
    expect(doorStore.has(elementId)).toBe(true);
    expect(doorStore.getById(elementId)!.openingId).toBe(openingId);
    expect(wallStore.getById('W1')!.childrenIds).toContain(elementId);
  });

  it('undo→redo→undo→redo keeps the id stable across repeated cycles (no id drift)', () => {
    cm.execute(new CreateWallOpeningCommand({ wallId: 'W1', openingData: { type: 'window', offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9 } }));
    const elementId = wallStore.getById('W1')!.openings[0].elementId as string;

    for (let i = 0; i < 2; i++) {
      cm.undo();
      expect(wallStore.getById('W1')!.openings.length).toBe(0);
      expect(windowStore.has(elementId)).toBe(false);
      cm.redo();
      expect(wallStore.getById('W1')!.openings[0].elementId).toBe(elementId);
      expect(windowStore.has(elementId)).toBe(true);
    }
  });

  it('serialize() round-trips the stable ids so a replayed command keeps the same identity (C03 §2.6)', () => {
    const cmd = new CreateWallOpeningCommand({ wallId: 'W1', openingData: { ...DOOR_OPENING } });
    cm.execute(cmd);
    const elementId = wallStore.getById('W1')!.openings[0].elementId as string;

    const wire = cmd.serialize();
    expect((wire.payload as any).openingData.elementId).toBe(elementId);

    // Reconstructing from the wire (the CommandRegistry ADD_OPENING factory /
    // collab replay path) reuses the ids rather than minting new ones.
    const replayed = new CreateWallOpeningCommand({
      wallId: (wire.payload as any).wallId,
      openingData: (wire.payload as any).openingData,
    });
    expect(replayed.targetIds).toContain(elementId);
  });
});
