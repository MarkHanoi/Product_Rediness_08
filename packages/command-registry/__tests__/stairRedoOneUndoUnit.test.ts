// @vitest-environment happy-dom
//
// ─── §STAIR-REDO-ONE-UNIT (L-1530) + §STAIR-REDO-STABLE-ID (L-1531) ──────────
//
// FOUNDER, PRODUCTION (item 0.01): "STAIR REDO DOESN'T WORK." Undo removes the
// stair; redo does not bring it back.
//
// ⛔ THESE TESTS DO NOT ASSERT THAT A FUNCTION WAS CALLED. They drive the REAL
// legacy `CommandManager` — the stack `performUndoRedo.performRedo()` falls
// through to for this family, because the `stair.create` bus handler declares
// `stores: []` (initBusHandlers.ts:2458), CommandBus skips the ring buffer for an
// empty-patch record (CommandBus.ts:578), and `_covered([])` is false — and then
// read the stair store, the opening store and the manager's own history/redo
// stacks.
//
// The three measurements that pinned the defect, before the fix:
//
//   draw stair   history=[RAILING, RAILING, STAIR]   redo=[]
//   Ctrl+Z x3    history=[]                          redo=[STAIR, RAILING, RAILING]
//   Ctrl+Y x1    CreateStairRailing REFUSED ("Stair not found") -> popped + DISCARDED
//   Ctrl+Y x2    refused again -> popped + DISCARDED
//   Ctrl+Y x3    the stair finally returns -- with a DIFFERENT element id
//
// and, on the single-Ctrl+Z path, the stair redo's own re-created railings ran
// `redoStack = []` from inside it, so a second redo returned null.

import { describe, it, expect } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { CreateStairRailingCommand } from '../src/stair/CreateStairRailingCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import { stairHostPierceId } from '../src/stair/StairHorizontalHostPiercing';
import { FloorStore } from '@pryzm/core-app-model/stores';
import type { CommandContext } from '../src/types';

const DECK = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }];
const LEVELS = [
  { id: 'L0', elevation: 0, name: 'Ground' },
  { id: 'L1', elevation: 3.0, name: 'Level 1' },
];
const FLOOR_L1 = 'floor-L1';

function makeCtx() {
  const openings = new Map<string, any>();
  const stairs = new Map<string, any>();
  const railings = new Map<string, any>();
  const slabs = new Map<string, any>([['slab-L1', {
    id: 'slab-L1', levelId: 'L1', position: { x: 0, y: 0, z: 0 },
    polygon: DECK.map(p => ({ x: p.x, y: p.z })), holes: [],
  }]]);
  const floorStore = new FloorStore();
  floorStore.add({
    id: FLOOR_L1, levelId: 'L1', label: 'Finish', floorNumber: 'F-1',
    boundary: { polygon: DECK.map(p => ({ ...p })), baseOffset: 0, thickness: 0.05, detectionMethod: 'manual-polygon' },
    finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
    serviceHoles: [], coveredRoomIds: [], boundingWallIds: [], visible: true, properties: {},
    metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
  } as any);

  const stores: any = {
    openingStore: {
      add: (o: any) => { openings.set(o.id, o); }, remove: (id: string) => { openings.delete(id); },
      update: (id: string, p: any) => { const o = openings.get(id); if (o) openings.set(id, { ...o, ...p }); },
      getById: (id: string) => openings.get(id),
      getByHostId: (h: string) => [...openings.values()].filter(o => o.hostId === h),
      getAll: () => [...openings.values()],
    },
    slabStore: {
      add: (s: any) => slabs.set(s.id, s), getAll: () => [...slabs.values()],
      getById: (id: string) => slabs.get(id), remove: (id: string) => slabs.delete(id), triggerRebuild: () => {},
    },
    stairStore: {
      add: (s: any) => { stairs.set(s.id, structuredClone(s)); },
      get: (id: string) => stairs.get(id), getById: (id: string) => stairs.get(id),
      update: (id: string, p: any) => { const s = stairs.get(id); if (s) stairs.set(id, { ...s, ...p }); },
      remove: (id: string) => { stairs.delete(id); }, restoreSnapshot: (s: any) => { stairs.set(s.id, s); },
      getStairConnectingLevels: () => undefined, getAll: () => [...stairs.values()],
    },
    stairRailingStore: {
      add: (r: any) => { railings.set(r.id, r); }, remove: (id: string) => { railings.delete(id); },
      getByStairId: (sid: string) => [...railings.values()].filter(r => r.stairId === sid),
      removeByStairId: (sid: string) => { for (const r of [...railings.values()]) if (r.stairId === sid) railings.delete(r.id); },
      getAll: () => [...railings.values()],
    },
    floorStore,
    wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getLevels: () => LEVELS, getAll: () => [] },
  };
  const ctx = {
    stores,
    bimManager: { registerElement: () => {}, unregisterElement: () => {}, getLevelById: (id: string) => LEVELS.find(l => l.id === id) },
    projectContext: { activeLevelId: 'L0' },
  } as unknown as CommandContext;
  return { ctx, stairs, railings, openings, floorStore };
}

/** NO `id` — exactly what StairPlanToolHandler.ts:246 dispatches on a fresh draw. */
function freshInput(): CreateStairInput {
  return {
    baseLevelId: 'L0', topLevelId: 'L1', shape: 'I', riserHeight: 0.15, treadDepth: 0.28, width: 1.0,
    startPosition: { x: 0, y: 0, z: 0 }, flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 }], landings: [],
  } as CreateStairInput;
}

/**
 * The EXACT production listener chain (initTools.ts:2476 -> the `stair.createRailing`
 * handler at plugins/stair/src/handlers/CreateStairRailing.ts:73), collapsed to the
 * one thing it does that matters here: `commandManager.execute(new
 * CreateStairRailingCommand(...))` with DEFAULT metadata, synchronously, from inside
 * `CreateStairCommand.execute()`. That is what minted the two rival undo entries.
 *
 * With the fix the proposal event has no emitter, so this listener never fires — and
 * the tests below assert exactly that, by counting what it would have pushed.
 */
function wireProductionRailingBridge(cm: CommandManager): { dispose(): void; fired(): number } {
  let count = 0;
  const listener = (e: Event): void => {
    const d = (e as CustomEvent).detail;
    for (const r of (d.proposedRailings ?? [])) {
      count++;
      cm.execute(new CreateStairRailingCommand({ stairId: d.stairId, ...(r as object) } as any));
    }
  };
  window.addEventListener('bim-stair-railing-proposal', listener);
  return {
    dispose: () => window.removeEventListener('bim-stair-railing-proposal', listener),
    fired: () => count,
  };
}

const stacks = (cm: CommandManager) => ({
  history: (cm as any).history.map((h: any) => h.command.type) as string[],
  redo: (cm as any).redoStack.map((h: any) => h.command.type) as string[],
});

describe('§STAIR-REDO-ONE-UNIT (L-1530) — one stair gesture is ONE undo unit', () => {
  it('drawing a stair mints exactly ONE history entry, not three', () => {
    const { ctx, railings } = makeCtx();
    const cm = new CommandManager(ctx);
    cm.execute(new CreateStairCommand(freshInput()));

    // The railings ARE created (the auto-pair is not silently dropped) …
    expect(railings.size, 'auto-railings were not created').toBe(2);
    // … but they are this command's own work, not two rival undo entries.
    expect(stacks(cm).history).toEqual(['CREATE_STAIR']);
  });

  it('⭐ ONE Ctrl+Z removes the stair AND its railings; ONE Ctrl+Shift+Z brings both back', () => {
    const { ctx, stairs, railings } = makeCtx();
    const cm = new CommandManager(ctx);
    cm.execute(new CreateStairCommand(freshInput()));
    expect(stairs.size).toBe(1);

    expect(cm.undo()?.success).toBe(true);
    expect(stairs.size, 'stair survived undo').toBe(0);
    expect(railings.size, 'railings survived undo').toBe(0);

    const redone = cm.redo();
    expect(redone, 'redo found nothing to redo').not.toBeNull();
    expect(redone!.success, 'redo REFUSED — this is the founder-reported failure').toBe(true);
    expect(stairs.size, 'redo did not restore the stair').toBe(1);
    expect(railings.size, 'redo did not restore the railings').toBe(2);
    expect(stacks(cm).history).toEqual(['CREATE_STAIR']);
  });

  it('⭐ the production railing bridge never fires — the proposal event has no emitter', () => {
    const { ctx, railings } = makeCtx();
    const cm = new CommandManager(ctx);
    const bridge = wireProductionRailingBridge(cm);
    cm.execute(new CreateStairCommand(freshInput()));
    expect(bridge.fired(), 'the fire-and-forget proposal chain is still live').toBe(0);
    expect(railings.size, 'and the railings are still built').toBe(2);
    expect(stacks(cm).history).toEqual(['CREATE_STAIR']);
    bridge.dispose();
  });

  it('three Ctrl+Z presses do NOT bury the stair under two railing entries', () => {
    const { ctx, stairs } = makeCtx();
    const cm = new CommandManager(ctx);
    const bridge = wireProductionRailingBridge(cm);
    cm.execute(new CreateStairCommand(freshInput()));

    expect(cm.undo()?.success).toBe(true);           // the whole gesture
    expect(cm.undo(), 'a SECOND Ctrl+Z had something to undo').toBeNull();
    expect(cm.undo(), 'a THIRD Ctrl+Z had something to undo').toBeNull();

    // The redo stack must still hold the stair — pre-fix it held
    // [STAIR, RAILING, RAILING] and the two railing redos were popped, refused
    // and DISCARDED before the stair ever ran.
    expect(stacks(cm).redo).toEqual(['CREATE_STAIR']);
    expect(cm.redo()?.success).toBe(true);
    expect(stairs.size).toBe(1);
    bridge.dispose();
  });

  it('a redo does not clear the redo stack from inside itself', () => {
    const { ctx } = makeCtx();
    const cm = new CommandManager(ctx);
    const bridge = wireProductionRailingBridge(cm);
    cm.execute(new CreateStairCommand(freshInput()));
    cm.execute(new CreateStairCommand({ ...freshInput(), startPosition: { x: 4, y: 0, z: 4 } } as CreateStairInput));
    cm.undo(); cm.undo();
    expect(stacks(cm).redo.length).toBe(2);
    expect(cm.redo()?.success).toBe(true);
    // Pre-fix the first redo's re-created railings ran `redoStack = []` from
    // inside it, so the second redo returned null.
    expect(stacks(cm).redo.length, 'the pending redo entry was destroyed BY the redo').toBe(1);
    expect(cm.redo()?.success).toBe(true);
    bridge.dispose();
  });
});

describe('§STAIR-REDO-STABLE-ID (L-1531 / C03 §2.6) — redo restores THE SAME stair', () => {
  it('⭐ the element id survives undo -> redo on a hand-drawn stair (no supplied id)', () => {
    const { ctx, stairs } = makeCtx();
    const cm = new CommandManager(ctx);
    const cmd = new CreateStairCommand(freshInput());
    cm.execute(cmd);
    const id1 = [...stairs.keys()][0]!;

    cm.undo();
    cm.redo();
    const id2 = [...stairs.keys()][0]!;

    expect(id2, 'redo minted a NEW stair id — a different element wearing the same GUID').toBe(id1);
  });

  it('the auto-opening and the floor-finish pierce come back under THE SAME keys', () => {
    const { ctx, stairs, openings, floorStore } = makeCtx();
    const cm = new CommandManager(ctx);
    cm.execute(new CreateStairCommand(freshInput()));
    const id = [...stairs.keys()][0]!;
    expect([...openings.keys()]).toEqual([stairAutoOpeningId(id)]);
    expect(floorStore.getById(FLOOR_L1)!.serviceHoles.map(h => h.id))
      .toEqual([stairHostPierceId(id, 'floor', FLOOR_L1)]);

    cm.undo();
    expect(openings.size).toBe(0);
    expect(floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(0);

    cm.redo();
    // Keyed off the stair id — an unstable id re-keys BOTH of these, which is how
    // a redone stair ends up with voids nothing owns.
    expect([...openings.keys()]).toEqual([stairAutoOpeningId(id)]);
    expect(floorStore.getById(FLOOR_L1)!.serviceHoles.map(h => h.id))
      .toEqual([stairHostPierceId(id, 'floor', FLOOR_L1)]);
  });

  it('the IFC GUID and the element id are stable TOGETHER, not one without the other', () => {
    const { ctx, stairs } = makeCtx();
    const cm = new CommandManager(ctx);
    cm.execute(new CreateStairCommand(freshInput()));
    const before = [...stairs.values()][0]!;
    cm.undo(); cm.redo();
    const after = [...stairs.values()][0]!;
    expect(after.ifcData.guid).toBe(before.ifcData.guid);
    expect(after.id).toBe(before.id);
  });

  it('§L-1532 — targetIds does not grow across redos', () => {
    const { ctx } = makeCtx();
    const cm = new CommandManager(ctx);
    const cmd = new CreateStairCommand(freshInput());
    cm.execute(cmd);
    cm.undo(); cm.redo(); cm.undo(); cm.redo();
    expect(cmd.targetIds.length, 'targetIds accumulated one dead id per redo').toBe(1);
  });

  it('the railings redo onto the SAME stair, with the SAME railing ids', () => {
    const { ctx, railings } = makeCtx();
    const cm = new CommandManager(ctx);
    cm.execute(new CreateStairCommand(freshInput()));
    const ids1 = [...railings.keys()].sort();
    cm.undo(); cm.redo();
    expect([...railings.keys()].sort()).toEqual(ids1);
  });
});
