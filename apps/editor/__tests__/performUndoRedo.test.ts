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
interface Pair { forward: { ops: Op[] }; inverse: { ops: Op[] }; affectedStores: string[]; timestamp?: number }

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

function makeCommandManager(targetIds: string[][], timestamps?: number[]) {
  const entries = targetIds.map((ids, i) => ({ targetIds: ids, timestamp: timestamps?.[i] }));
  return {
    entries,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: () => entries.length > 0,
    canRedo: () => false,
    // §UNDO-CROSS-STACK-ORDER — the read-only peeks performUndoRedo uses to
    // order the two stacks chronologically (CommandManagerImpl.peek*Timestamp).
    peekUndoTimestamp: () => entries[entries.length - 1]?.timestamp ?? null,
    // §UNDO-SAME-GESTURE — the guard input performUndoRedo uses to tell a
    // dual-dispatch TWIN from an unrelated later legacy entry. The stub omitted
    // it originally, so every cross-stack test silently ran with `cmTargets = []`
    // and the guard was never exercised (it is the guard, not the ordering, that
    // carried the L-69x defects).
    peekUndoTargetIds: () => entries[entries.length - 1]?.targetIds ?? [],
    peekRedoTimestamp: () => null,
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
function wallPair(timestamp?: number): Pair {
  return {
    forward: { ops: [{ op: 'add', path: '/' + WALL_ID, value: { id: WALL_ID, type: 'wall', levelId: 'L0' } }] },
    inverse: { ops: [{ op: 'remove', path: '/' + WALL_ID }] },
    affectedStores: ['wall'],
    ...(timestamp === undefined ? {} : { timestamp }),
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

  // ── §UNDO-CROSS-STACK-ORDER (C03 §4.5 / §4.7-2) ────────────────────────────
  // The founder-reported bug: a 3D-placed door/window is a commandManager-ONLY
  // entry (DoorTool/WindowTool → cm.execute(CreateWallOpeningCommand); no bus
  // dispatch), sitting ON TOP of the ring-buffer entry for the wall beneath it.
  // Ring-buffer-FIRST routing therefore undid the OLDER wall and "jumped over"
  // the newer door. Both stacks now carry commit timestamps and undo takes the
  // NEWEST pending entry across both.

  it('REGRESSION: a NEWER commandManager entry (3D door) is undone before an older ring-buffer entry', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    const cm = makeCommandManager([['door_1']], [2_000]);   // door placed AFTER the wall
    const rb = makeRingBuffer(wallPair(1_000));             // wall pushed FIRST
    install(rb, cm, store);

    performUndo();

    expect(cm.undo).toHaveBeenCalledTimes(1);               // the door was undone…
    expect(rb.canUndo()).toBe(true);                        // …and the wall's cursor is untouched
    expect(store.map.has(WALL_ID)).toBe(true);              // the wall is still there
    expect(cm.dropEntriesForTargets).not.toHaveBeenCalled();
  });

  it('an OLDER commandManager entry does not pre-empt a newer ring-buffer entry', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    const cm = makeCommandManager([['door_1']], [1_000]);   // door placed BEFORE the wall
    const rb = makeRingBuffer(wallPair(2_000));
    install(rb, cm, store);

    performUndo();

    expect(store.map.has(WALL_ID)).toBe(false);             // newest = the wall → reverted
    expect(cm.undo).not.toHaveBeenCalled();
  });

  it('without timestamps the legacy ring-buffer-first routing is preserved (back-compat)', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    const cm = makeCommandManager([['door_1']]);            // no timestamps on either side
    install(makeRingBuffer(wallPair()), cm, store);

    performUndo();

    expect(store.map.has(WALL_ID)).toBe(false);
    expect(cm.undo).not.toHaveBeenCalled();
  });

  it('redo replays chronologically: the OLDER pending entry (commandManager) goes first', () => {
    const store = makeStore();
    const cm = makeCommandManager([]);
    cm.canRedo = () => true;
    cm.peekRedoTimestamp = () => 1_000;                     // door redo is OLDER
    const rb = makeRingBuffer(wallPair(2_000));
    rb.undoPatch();                                          // park the ring buffer in "can redo"
    install(rb, cm, store);

    performRedo();

    expect(cm.redo).toHaveBeenCalledTimes(1);
    expect(store.map.has(WALL_ID)).toBe(false);              // ring buffer not consumed yet
  });

  // ── §UNDO-SAME-GESTURE (L-690) — the twin test, and why id-OVERLAP is wrong ──
  //
  // U-10's same-gesture guard exempts a dual-dispatch TWIN from chronological
  // re-routing. The guard asked "do the legacy entry's targetIds INTERSECT the
  // ids in the ring-buffer's top patch?" — but an intersection is not a twin
  // relation. Every later commandManager-only edit of an element that was
  // CREATED on the ring buffer intersects it too. There are ~70 such bridges
  // (`stores: []` in initBusHandlers) — wall.updateColor, slab.updateDimensions,
  // element.changeType, door.setOffset, level.*, view.*, grid.*, …
  //
  // Consequence before the fix, for a PLAN-drawn wall (ring-buffer-only) whose
  // colour the user then changes from the property panel:
  //   1. the colour edit is misread as the wall-create's dual-dispatch twin,
  //   2. so ring-buffer-first runs and Ctrl+Z DELETES THE WALL, and
  //   3. the shadow-drop then finds the colour entry fully orphaned and deletes
  //      it from history AND redoStack — the edit is gone from the timeline.
  // One keypress, wrong element destroyed, one user step silently lost.

  it('REGRESSION (L-690): a later cm-only PARAMETER EDIT is not mistaken for the ring-buffer create twin', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    // Plan-drawn wall → ring buffer only. Then a property-panel colour edit →
    // commandManager only, targeting THAT SAME wall, a second later.
    const cm = makeCommandManager([[WALL_ID]], [2_000]);
    const rb = makeRingBuffer(wallPair(1_000));
    install(rb, cm, store);

    performUndo();

    expect(cm.undo).toHaveBeenCalledTimes(1);   // the EDIT is undone…
    expect(store.map.has(WALL_ID)).toBe(true);  // …the wall survives
    expect(rb.canUndo()).toBe(true);            // …and its cursor is untouched
    expect(cm.dropEntriesForTargets).not.toHaveBeenCalled();
  });

  it('REGRESSION (bffa20df family): a hosted door in a PLAN-drawn wall is undone before the wall', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    // CreateWallOpeningCommand post-U-9: targetIds name the host AND the door.
    // The host id overlaps the ring-buffer wall entry, so the old `.some()`
    // guard classified it as a twin and undid the WALL instead of the door.
    const cm = makeCommandManager([[WALL_ID, 'door_1']], [2_000]);
    const rb = makeRingBuffer(wallPair(1_000));
    install(rb, cm, store);

    performUndo();

    expect(cm.undo).toHaveBeenCalledTimes(1);
    expect(store.map.has(WALL_ID)).toBe(true);
    expect(rb.canUndo()).toBe(true);
  });

  it('a genuine dual-dispatch twin (same gesture, same tick) still takes the ring-buffer + shadow-drop path', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    // 3D WallTool: bus push then `new CreateWallCommand(...)` a few ms later in
    // the SAME synchronous gesture — targetIds are covered by the patch's ids.
    const cm = makeCommandManager([[WALL_ID]], [1_003]);
    const rb = makeRingBuffer(wallPair(1_000));
    install(rb, cm, store);

    performUndo();

    expect(store.map.has(WALL_ID)).toBe(false);          // ring buffer handled it
    expect(cm.undo).not.toHaveBeenCalled();              // no phantom legacy undo
    expect(cm.dropEntriesForTargets).toHaveBeenCalledWith([WALL_ID]);
    expect(cm.entries.length).toBe(0);
  });

  it('REGRESSION (L-690): a TYPE-SWAP on a ring-buffer-created element reverses the swap, not the create', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    // `element.changeType` is an `initBusHandlers` bridge with `stores: []` — it
    // records NO PatchPair, so the swap lives on commandManager ONLY, targeting
    // the very element the ring buffer created. Undo must reverse the SWAP.
    const cm = makeCommandManager([[WALL_ID]], [5_000]);
    install(makeRingBuffer(wallPair(1_000)), cm, store);

    performUndo();

    expect(cm.undo).toHaveBeenCalledTimes(1);
    expect(store.map.has(WALL_ID)).toBe(true);   // the element is NOT popped
  });

  // ── §UNDO-NO-PHANTOM (L-691) — a failed legacy undo must not eat the keypress ──

  it('REGRESSION (L-691): a cm undo that reports failure falls through to the ring buffer', () => {
    const store = makeStore();
    store.add({ id: WALL_ID, type: 'wall', levelId: 'L0' });
    const cm = makeCommandManager([['door_1']], [2_000]);
    cm.undo = vi.fn(() => ({ success: false, affectedElementIds: [], info: ['rejected'] }));
    const rb = makeRingBuffer(wallPair(1_000));
    install(rb, cm, store);

    performUndo();

    expect(cm.undo).toHaveBeenCalledTimes(1);
    expect(store.map.has(WALL_ID)).toBe(false);  // keypress did SOMETHING — no phantom
  });

  it('REGRESSION (L-691): a cm redo that reports failure falls through to the ring buffer', () => {
    const store = makeStore();
    const cm = makeCommandManager([]);
    cm.canRedo = () => true;
    cm.peekRedoTimestamp = () => 1_000;                 // legacy redo is OLDER → tried first
    cm.redo = vi.fn(() => ({ success: false, affectedElementIds: [], info: ['rejected'] }));
    const rb = makeRingBuffer(wallPair(2_000));
    rb.undoPatch();
    install(rb, cm, store);

    performRedo();

    expect(cm.redo).toHaveBeenCalledTimes(1);
    expect(store.map.has(WALL_ID)).toBe(true);   // ring-buffer redo still ran
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

  // ── §UNDO-COVERAGE-DRIFT (L-693) — DERIVE the key list, don't hand-copy it ──
  //
  // C03 §4.8 claims this gate exists "so a future key drift fails CI". The test
  // above cannot do that: `KEY_TO_WINDOW_STORE` is a hand-maintained copy of the
  // handlers' declarations, so a plugin that adds — or renames — an
  // `affectedStores` key is invisible to it. That is the exact failure mode that
  // shipped the `curtainwall` gap (handler said `curtainwall`, the map only had
  // `curtain-wall`/`curtainWall`), and re-reading the same hand-list cannot
  // catch the next one.
  //
  // So read the keys from the SOURCE OF TRUTH — every `plugins/*/src/handlers/*`
  // handler's declared `affectedStores` — and require each to be either covered
  // by `buildUndoStoreMap()` or listed below with a reason. A NEW uncovered key
  // then fails here instead of shipping as a silent "undo does nothing".
  const EXPECTED_UNCOVERED: Record<string, string> = {
    // Deliberate — C03 §4.5: hosted two-part undo lives in the legacy command,
    // and `level` is spatial authority (Path A by design).
    door: 'HOSTED — opening must also leave the host wall; legacy command owns it',
    window: 'HOSTED — as door',
    level: 'spatial authority — Path A (AddLevelCommand) by design',
    // Acknowledged in C03 §4.8 "Not yet patch-undoable".
    section: 'no window.sectionStore — legacy fallback',
    structural: 'no window.structuralStore — legacy fallback',
    // Non-element / documentation + ephemeral stores: the commandManager bridge
    // owns their inverse, and they drive no BIM mesh.
    schedule: 'documentation store — cm bridge owns the inverse',
    sheet: 'documentation store — cm bridge owns the inverse',
    view: 'view-definition store — cm bridge owns the inverse',
    'active-view': 'ephemeral view pointer — not undoable state',
    selection: 'ephemeral selection — not undoable state (C03 §3)',
    // KNOWN GAP, reported not fixed — see the report accompanying L-693.
    // `dimension.create` / `dimension.createMany` (AutoDimension) declare
    // `['dimension']`, but there is no `window.dimensionStore` and no `dimension`
    // key in buildUndoStoreMap, so their ring entries are never covered and undo
    // falls to a commandManager that holds no entry for them. C03 §4.8 lists
    // dimensions under the `annotation` key, which no longer matches the code.
    // Fixing it needs a live in-app check of which store renders a dimension.
    dimension: 'KNOWN GAP (L-693) — declared by dimension.create*, no backing store',
  };

  it('every affectedStores key declared by a plugin handler is covered or explicitly excused', async () => {
    const { readdirSync, readFileSync, existsSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');

    const pluginsRoot = resolve(__dirname, '../../../plugins');
    const declared = new Map<string, string>();          // key → first file that declared it
    for (const plugin of readdirSync(pluginsRoot)) {
      const handlers = join(pluginsRoot, plugin, 'src', 'handlers');
      if (!existsSync(handlers)) continue;
      for (const file of readdirSync(handlers)) {
        if (!file.endsWith('.ts')) continue;
        const src = readFileSync(join(handlers, file), 'utf8');
        for (const m of src.matchAll(/affectedStores\s*[:=]\s*\[([^\]]*)\]/g)) {
          for (const k of m[1]!.matchAll(/'([^']+)'/g)) {
            if (!declared.has(k[1]!)) declared.set(k[1]!, `${plugin}/${file}`);
          }
        }
      }
    }
    // Guard the scan itself: a refactor that moves handlers would otherwise make
    // this gate pass vacuously (an empty scan proves nothing — see the
    // context-data-honesty rule: "failure and empty are the same value").
    expect(declared.size, 'handler scan found no affectedStores declarations at all').toBeGreaterThan(15);

    // Install every window store buildUndoStoreMap() reads. An adapter is only
    // produced for a store that is actually present, so a missing stub would
    // read as "uncovered" and blame the map for a fixture hole.
    const ALL_WINDOW_STORES = [
      ...new Set(Object.values(KEY_TO_WINDOW_STORE)),
      'poolStore', 'waterStore', 'stairRailingStore', 'stairLandingStore',
    ];
    for (const storeName of ALL_WINDOW_STORES) {
      (window as any)[storeName] = { add() {}, remove() {}, getById() {}, update() {} };
    }
    const map = buildUndoStoreMap();

    const unexplained: string[] = [];
    for (const [key, where] of declared) {
      if (typeof map[key]?.applyPatch === 'function') continue;
      if (key in EXPECTED_UNCOVERED) continue;
      unexplained.push(`${key} (declared by ${where})`);
    }
    expect(unexplained, 'uncovered affectedStores keys — ring-buffer undo silently '
      + 'falls to commandManager for these. Add an adapter to buildUndoStoreMap(), '
      + 'or record the key in EXPECTED_UNCOVERED with the reason.').toEqual([]);
  });
});
