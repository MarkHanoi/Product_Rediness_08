// @vitest-environment happy-dom
//
// §OI-054 — unit gate for THE single unified undo path (C03 §4.5/§4.6).
// Proves the routing contract that fixes the live bug (undo button no-op'd
// plan-view elements):
//   • a covered ring-buffer entry is applied via the adapter (mesh-driving) AND
//     its dual-dispatch twin is shadow-dropped from commandManager (U-8);
//   • an UNCOVERED entry (e.g. hosted door) does NOT step the cursor and falls
//     through to commandManager (coverage pre-check);
//   • an empty ring buffer falls back to commandManager.undo().

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { performUndo, performRedo, buildUndoStoreMap } from '../src/engine/undo/performUndoRedo.js';
import { __resetUndoRestoreSnapshots } from '../src/engine/undo/elementUndoStoreAdapter.js';

interface Op { op: 'add' | 'remove' | 'replace'; path: string; value?: unknown }
interface Pair { forward: { ops: Op[] }; inverse: { ops: Op[] }; affectedStores: string[] }

/** Minimal live legacy store (Map-based, mesh-driving in prod). */
function makeStore() {
  const map = new Map<string, any>();
  return {
    map,
    add(e: any) { map.set(e.id, e); },
    remove(id: string) { map.delete(id); },
    getById(id: string) { return map.get(id) ?? undefined; },
    update(id: string, u: any) { const e = map.get(id); if (e) map.set(id, { ...e, ...u }); },
  };
}

/** A one-entry ring buffer at the cursor; undoPatch steps it empty. */
function makeRingBuffer(pair: Pair | null) {
  let cursorHasUndo = pair !== null;
  return {
    canUndo: () => cursorHasUndo,
    canRedo: () => !cursorHasUndo && pair !== null,
    current: () => (cursorHasUndo ? pair : null),
    peek: () => (!cursorHasUndo ? pair : null),
    undoPatch: () => { if (!cursorHasUndo) return null; cursorHasUndo = false; return pair!.inverse; },
    redoPatch: () => { if (cursorHasUndo) return null; cursorHasUndo = true; return pair!.forward; },
  };
}

function makeCommandManager(targetIds: string[][]) {
  const entries = targetIds.map(ids => ({ targetIds: ids }));
  return {
    entries,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: () => entries.length > 0,
    canRedo: () => false,
    dropEntriesForTargets: vi.fn((ids: readonly string[]) => {
      const wanted = new Set(ids);
      const before = entries.length;
      for (let i = entries.length - 1; i >= 0; i--) {
        const t = entries[i]!.targetIds;
        if (t.length > 0 && t.every(x => wanted.has(x))) entries.splice(i, 1);
      }
      return before - entries.length;
    }),
  };
}

const WALL_ID = 'wall_01KSDNXWM0510W2JHHHNYESK10';
function wallPair(): Pair {
  return {
    forward: { ops: [{ op: 'add', path: '/' + WALL_ID, value: { id: WALL_ID, type: 'wall', levelId: 'L0' } }] },
    inverse: { ops: [{ op: 'remove', path: '/' + WALL_ID }] },
    affectedStores: ['wall'],
  };
}

function install(rb: any, cm: any, wallStore: any): void {
  (window as any).runtime = { bus: { ringBuffer: rb } };
  (globalThis as any).commandManager = cm;
  (window as any).wallStore = wallStore;
}

describe('performUndoRedo — unified undo routing (OI-054)', () => {
  beforeEach(() => {
    __resetUndoRestoreSnapshots();
    delete (window as any).runtime;
    delete (globalThis as any).commandManager;
    delete (window as any).wallStore;
  });

  it('covered ring-buffer entry: applies inverse via the live store (removes the wall)', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    const cm = makeCommandManager([]);                 // plan wall: NOT in commandManager
    install(makeRingBuffer(wallPair()), cm, store);

    performUndo();

    expect(store.map.has(WALL_ID)).toBe(false);        // mesh-driving store reverted
    expect(cm.undo).not.toHaveBeenCalled();            // ring buffer handled it
  });

  it('dual-dispatch twin is shadow-dropped from commandManager (U-8 — no phantom undo)', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    const cm = makeCommandManager([[WALL_ID]]);        // 3D wall: ALSO a CreateWallCommand
    install(makeRingBuffer(wallPair()), cm, store);

    performUndo();

    expect(store.map.has(WALL_ID)).toBe(false);
    expect(cm.dropEntriesForTargets).toHaveBeenCalledWith([WALL_ID]);
    expect(cm.entries.length).toBe(0);                 // twin dropped → no phantom 2nd Ctrl+Z
    expect(cm.undo).not.toHaveBeenCalled();
  });

  it('uncovered store (hosted door): cursor NOT stepped, falls back to commandManager', () => {
    const store = makeStore();
    const cm = makeCommandManager([['door_x']]);
    const doorPair: Pair = {
      forward: { ops: [{ op: 'add', path: '/door_x', value: { id: 'door_x' } }] },
      inverse: { ops: [{ op: 'remove', path: '/door_x' }] },
      affectedStores: ['door'],                         // no door adapter in buildUndoStoreMap
    };
    const rb = makeRingBuffer(doorPair);
    install(rb, cm, store);

    performUndo();

    expect(rb.canUndo()).toBe(true);                   // cursor preserved (not consumed)
    expect(cm.undo).toHaveBeenCalledTimes(1);          // legacy path handled the hosted door
  });

  it('empty ring buffer: falls back to commandManager.undo()', () => {
    const cm = makeCommandManager([['wall_y']]);
    install(makeRingBuffer(null), cm, makeStore());

    performUndo();

    expect(cm.undo).toHaveBeenCalledTimes(1);
  });

  it('redo re-applies the forward patch via the live store (re-adds the wall)', () => {
    const store = makeStore();                          // wall already undone (absent)
    const cm = makeCommandManager([]);
    const rb = makeRingBuffer(wallPair());
    rb.undoPatch();                                     // move cursor into the "can redo" position
    install(rb, cm, store);

    performRedo();

    expect(store.map.has(WALL_ID)).toBe(true);          // forward patch re-created the wall
  });
});

// §OI-054 ALL-ELEMENTS coverage gate. Every plan-creatable element's bus create
// handler declares an `affectedStores` KEY; that exact key MUST resolve to an
// applyPatch adapter in buildUndoStoreMap, or that element's undo silently falls
// to commandManager ("history empty"). This caught the live `curtainwall` gap
// (handler said 'curtainwall', the map only had 'curtain-wall'/'curtainWall').
describe('buildUndoStoreMap — coverage of every create-handler affectedStores key', () => {
  // key → the window.<storeName> the adapter must wrap (verified against each
  // plugins/<x>/src/handlers/Create*.ts `affectedStores` + window.*Store assignment).
  const KEY_TO_WINDOW_STORE: Record<string, string> = {
    wall: 'wallStore', slab: 'slabStore', room: 'roomStore',
    curtainwall: 'curtainWallStore', curtainPanel: 'curtainPanelStore',
    column: 'columnStore', beam: 'beamStore', furniture: 'furnitureStore',
    ceiling: 'ceilingStore', floor: 'floorStore', roof: 'roofStore',
    stair: 'stairStore', handrail: 'handrailStore', lighting: 'lightingStore',
    plumbing: 'plumbingStore', grid: 'gridStore', annotation: 'annotationStore',
  };

  it('maps every create-handler store key to a live applyPatch adapter', () => {
    // Make every backing window store present (truthy) so the adapter wraps it.
    for (const storeName of new Set(Object.values(KEY_TO_WINDOW_STORE))) {
      (window as any)[storeName] = { add() {}, remove() {}, getById() {}, update() {} };
    }
    const map = buildUndoStoreMap();
    for (const key of Object.keys(KEY_TO_WINDOW_STORE)) {
      expect(typeof map[key]?.applyPatch, `store key "${key}" must have an applyPatch adapter`).toBe('function');
    }
  });
});
