// @vitest-environment happy-dom
//
// W5-4 PROBE — "undo is THREE STACKS for one element" (C03 §4.5–4.8, U-10).
//
// WHAT THIS FILE PROVES, and why it is a probe and not a fix.
// ---------------------------------------------------------------------------
// Three mutations of ONE wall are recorded by three different mechanisms
// (verified in `apps/editor/src/engine/initBusHandlers.ts`):
//
//   wall height  → `wall.updateDimensions` (:904)  stores:[] on the bus, but the
//                  handler BOTH `_cmExec`s the legacy UpdateWallDimensionsCommand
//                  AND hand-rolls a `ringBuffer.push({... affectedStores:['wall'],
//                  timestamp: Date.now() })` (:936). → BOTH stacks.
//   wall colour  → `wall.updateColor` (:818)       stores:[], `_cmExec` only, NO
//                  ring push at all.               → commandManager ONLY.
//   wall rake    → `element.updateParameters` (:1630) stores:[], `_cmExec` only.
//                                                   → commandManager ONLY.
//   add-layer    → `wall.addLayerBatch` (plugins/wall/src/handlers/AddWallLayerBatch.ts)
//                  affectedStores: [], calls `window.commandManager.execute(...)`.
//                                                   → commandManager ONLY.
//
// `performUndo` reconciles the two stacks with `_SAME_GESTURE_WINDOW_MS = 250`
// (performUndoRedo.ts:166): when the legacy stack's top entry is NEWER than the
// ring buffer's top entry, it is undone first — UNLESS its `targetIds` are a
// subset of the ring entry's ids AND the two commit stamps are within 250 ms, in
// which case it is classified as a dual-dispatch TWIN and ring-buffer-first runs.
//
// That predicate has no notion of CAUSALITY. It reads a wall clock. So two
// sequences with IDENTICAL causal structure — same wall, same three verbs, same
// order — undo in DIFFERENT orders depending only on how fast the user (or the
// chat batch, or the machine between GC pauses) was.
//
// `TIMING-DEPENDENCE` below is the artefact: same story, gaps 400 ms vs 80 ms,
// opposite outcome, and the fast one silently reverts the WRONG mutation and
// discards two later writes.
//
// The ring buffer is the REAL `RingBufferUndoStack` (@pryzm/runtime-undo-stack).
// The commandManager is a stub that mirrors `CommandManagerImpl` exactly where it
// matters: snapshot undo writing back into the live store, `peekUndoTimestamp` /
// `peekUndoTargetIds`, and the ORPHAN-SCOPED subset `dropEntriesForTargets`
// (§UNDO-SHADOW-DROP-SCOPE, CommandManagerImpl.ts:754 — an entry is dropped only
// when every one of its targets is GONE from the stores).
//
// Every assertion reads the AUTHORITATIVE record out of the mesh-driving legacy
// store (C03 §4.4 "Legacy store" row) — never `success === true`, never a stack
// depth.
//
// STATUS — THIS FILE IS RED ON PURPOSE (3 of 5). Do NOT weaken an assertion to
// green it; each one names a defect that is still live on `main`:
//   × TIMING-DEPENDENCE — `_isSameGestureTwin` misroutes a causally-distinct
//     later edit as a dual-dispatch twin.
//   × BOUNDARY         — the same, shown as a 2 ms wall-clock cliff.
//   × U-4 / doctrine-3 — `performUndo()` returns `void`, so "nothing to undo",
//     "I reverted something" and "a pending entry was stranded" are the SAME
//     value to every caller (the HUD, initUI, BimService).
// Because it is red, this file must NOT be added to a CI-gated suite until the
// fix lands. It is a probe, delivered uncommitted, per W5-4 step 1.
//
// NOTE ON THE PROPOSED FIX. A monotonic SEQUENCE NUMBER replacing `timestamp`
// would NOT green these tests. The chronological comparison here is already
// correct — the rake IS the newest entry and `_cmEntryIsNewer` sees that. The
// misroute happens entirely inside the TWIN predicate, and "these two entries
// came from ONE dispatch" is a relation a strictly-increasing counter cannot
// express. Only a GESTURE ID shared by both halves of a dual dispatch can.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { performUndo } from '../src/engine/undo/performUndoRedo.js';
import { __resetUndoRestoreSnapshots } from '../src/engine/undo/elementUndoStoreAdapter.js';

const WALL_ID = 'wall_01KSDNXWM0510W2JHHHNYESK10';

interface WallRecord {
  id: string;
  type: 'wall';
  levelId: string;
  height: number;
  thickness: number;
  materialColor: string;
  rakeAngleDeg?: number;
}

/** The mesh-driving legacy store (C03 §4.4). `update` MERGES a partial, which is
 *  what `WallStore.update` does and what `elementUndoStoreAdapter` relies on. */
function makeWallStore() {
  const map = new Map<string, WallRecord>();
  return {
    map,
    add(e: WallRecord) { map.set(e.id, e); },
    remove(id: string) { map.delete(id); },
    getById(id: string): WallRecord | undefined { return map.get(id); },
    update(id: string, u: Partial<WallRecord>) {
      const e = map.get(id);
      if (!e) return;
      map.set(id, { ...e, ...u });
    },
  };
}
type WallStore = ReturnType<typeof makeWallStore>;

/**
 * A commandManager entry, shaped like `CommandManagerImpl`'s history entries:
 * a `timestamp` stamped at command CONSTRUCTION, `targetIds`, and an `undo()`
 * that writes the pre-command snapshot back into the live store (Path A is
 * snapshot-based — C03 §4.3).
 */
interface CmEntry {
  label: string;
  timestamp: number;
  targetIds: string[];
  undo(): void;
}

function makeCommandManager(store: WallStore) {
  const history: CmEntry[] = [];
  const undone: string[] = [];
  const cm = {
    history,
    undone,
    /** Mirrors `commandManager.execute(new UpdateXCommand(...))`: apply now,
     *  push a snapshot-inverse entry stamped at construction time. */
    exec(label: string, timestamp: number, targetIds: string[], patch: Partial<WallRecord>): void {
      const before = { ...store.getById(targetIds[0]!)! };
      store.update(targetIds[0]!, patch);
      const keys = Object.keys(patch) as (keyof WallRecord)[];
      history.push({
        label, timestamp, targetIds,
        undo(): void {
          const revert: Partial<WallRecord> = {};
          for (const k of keys) (revert as Record<string, unknown>)[k as string] = before[k];
          store.update(targetIds[0]!, revert);
        },
      });
    },
    canUndo: () => history.length > 0,
    canRedo: () => false,
    undo: vi.fn(() => {
      const e = history.pop();
      if (!e) return null;                 // U-4: "nothing to undo" is not success
      e.undo();
      undone.push(e.label);
      return { success: true, affectedElementIds: e.targetIds, info: [] };
    }),
    redo: vi.fn(() => null),
    peekUndoTimestamp: () => history[history.length - 1]?.timestamp ?? null,
    peekUndoTargetIds: () => history[history.length - 1]?.targetIds ?? [],
    peekRedoTimestamp: () => null,
    /** §UNDO-SHADOW-DROP-SCOPE — subset match AND every target orphaned. */
    dropEntriesForTargets: vi.fn((ids: readonly string[]) => {
      const wanted = new Set(ids);
      const orphaned = (id: string): boolean => store.getById(id) === undefined;
      const before = history.length;
      for (let i = history.length - 1; i >= 0; i--) {
        const t = history[i]!.targetIds;
        if (t.length > 0 && t.every(x => wanted.has(x)) && t.every(orphaned)) history.splice(i, 1);
      }
      return before - history.length;
    }),
  };
  return cm;
}
type Cm = ReturnType<typeof makeCommandManager>;

function install(rb: RingBufferUndoStack, cm: Cm, store: WallStore): void {
  (window as any).runtime = { bus: { ringBuffer: rb } };
  (globalThis as any).commandManager = cm;
  (window as any).wallStore = store;
}

/**
 * The exact three-verb sequence from the finding, replayed at a controllable
 * inter-gesture gap. Reproduces `initBusHandlers` faithfully:
 *
 *  1. HEIGHT — `wall.updateDimensions` (:912-946): `_cmExec(UpdateWallDimensions)`
 *     FIRST, then a ring `push` of a WHOLE-RECORD replace pair built from
 *     `structuredClone(before)` / `structuredClone(after)`.
 *  2. COLOUR — `wall.updateColor` (:826-832): `_cmExec` only, no ring push.
 *  3. RAKE   — `element.updateParameters` (:1638-1644): `_cmExec` only.
 */
function playThreeMutations(gapMs: number) {
  const store = makeWallStore();
  store.add({
    id: WALL_ID, type: 'wall', levelId: 'L0',
    height: 3, thickness: 0.2, materialColor: '#ffffff',
  });
  const cm = makeCommandManager(store);
  const rb = new RingBufferUndoStack();
  const t0 = 1_000_000;

  // ── 1. HEIGHT → BOTH stacks ──────────────────────────────────────────────
  const beforeH = structuredClone(store.getById(WALL_ID)!);
  cm.exec('height', t0, [WALL_ID], { height: 4.2 });
  const afterH = structuredClone(store.getById(WALL_ID)!);
  rb.push({
    forward: { ops: [{ op: 'replace', path: `/${WALL_ID}`, value: afterH }] },
    inverse: { ops: [{ op: 'replace', path: `/${WALL_ID}`, value: beforeH }] },
    affectedStores: ['wall'],
    timestamp: t0,
  } as any);

  // ── 2. COLOUR → commandManager ONLY (no ring push) ───────────────────────
  cm.exec('colour', t0 + gapMs, [WALL_ID], { materialColor: '#6600ff' });

  // ── 3. RAKE → commandManager ONLY ────────────────────────────────────────
  cm.exec('rake', t0 + 2 * gapMs, [WALL_ID], { rakeAngleDeg: 62 });

  install(rb, cm, store);
  return { store, cm, rb };
}

const wall = (store: WallStore): WallRecord => store.getById(WALL_ID)!;

describe('W5-4 — three stacks for one wall: ordering is decided by a stopwatch', () => {
  beforeEach(() => {
    __resetUndoRestoreSnapshots();
    delete (window as any).runtime;
    delete (globalThis as any).commandManager;
    delete (window as any).wallStore;
  });

  it('BASELINE — deliberate pacing (400 ms apart): three undos reverse in exact reverse order', () => {
    const { store, cm } = playThreeMutations(400);
    expect(wall(store)).toMatchObject({ height: 4.2, materialColor: '#6600ff', rakeAngleDeg: 62 });

    performUndo();                                   // expect: rake reverts
    expect(wall(store).rakeAngleDeg).toBeUndefined();
    expect(wall(store).materialColor).toBe('#6600ff');
    expect(wall(store).height).toBe(4.2);

    performUndo();                                   // expect: colour reverts
    expect(wall(store).materialColor).toBe('#ffffff');
    expect(wall(store).height).toBe(4.2);

    performUndo();                                   // expect: height reverts
    expect(wall(store).height).toBe(3);

    expect(cm.undone).toEqual(['rake', 'colour']);   // height came off the ring buffer
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE ARTEFACT. Identical causal structure to the baseline — same wall, same
  // three verbs, same order, same stack membership. ONLY the wall-clock gap
  // differs (80 ms instead of 400 ms). The rake edit and the height edit are
  // still two DELIBERATE, causally-independent user actions.
  //
  // `_isSameGestureTwin` sees targetIds [WALL_ID] ⊆ the ring patch's ids AND
  // |t_rake − t_height| = 160 ms ≤ 250 ms, so it declares the RAKE to be the
  // HEIGHT gesture's dual-dispatch twin and routes ring-buffer-first.
  //
  // The first Ctrl+Z therefore reverts the OLDEST of the three mutations, not the
  // newest — and because the ring inverse is a WHOLE-RECORD replace built from a
  // snapshot taken BEFORE the colour edit existed, applying it also silently
  // reinstates the pre-colour colour. One keypress, the wrong mutation reversed,
  // a second mutation clobbered, and the user's colour entry still sitting in
  // `history` claiming to be pending.
  // ───────────────────────────────────────────────────────────────────────────
  // ⚠ `it.fails` — DELIBERATE. This asserts the CORRECT behaviour and records that
  // PRYZM does not have it yet. Vitest inverts the verdict: green while the defect
  // is present, RED THE DAY SOMEBODY FIXES IT. Same idiom as QueryEngineDrain.spec
  // — a falsifiable inventory that fails when you fix something, so the entry
  // cannot be silently outlived. Do NOT "repair" it by relaxing the assertion; the
  // fix is §UNDO-GESTURE-ID (stamp a gesture id at dispatch, S2–S3 in W5-4). When
  // that lands, DELETE the `.fails` — do not delete the test.
  it.fails('TIMING-DEPENDENCE — the SAME sequence 80 ms apart undoes the WRONG mutation first', () => {
    const { store } = playThreeMutations(80);
    expect(wall(store)).toMatchObject({ height: 4.2, materialColor: '#6600ff', rakeAngleDeg: 62 });

    performUndo();

    // ONE assertion carrying the WHOLE post-Ctrl+Z record, so the failure output
    // shows every field that moved — not just the first one that tripped.
    // Expected (what the 400 ms baseline above actually does): only the rake goes.
    expect({ ...wall(store) }, 'first Ctrl+Z must reverse the NEWEST mutation (rake) and nothing else')
      .toEqual({
        id: WALL_ID, type: 'wall', levelId: 'L0',
        height: 4.2, thickness: 0.2, materialColor: '#6600ff',
      });
  });

  // The 250 ms constant is load-bearing, and the boundary is directly observable.
  // The separator the guard actually measures is |t_rake − t_height| = 2 × gap, so
  // the flip sits at gap = 125 ms. Two runs whose inter-gesture gap differs by
  // 2 ms — nothing else — leave the model in different states.
  // ⚠ `it.fails` — see the note above. Drop `.fails` when §UNDO-GESTURE-ID lands.
  it.fails('BOUNDARY — a 2 ms difference in inter-gesture gap flips which mutation is reversed', () => {
    const slow = playThreeMutations(126);            // 2 × 126 = 252 ms > 250 → not a twin
    performUndo();
    const slowState = { ...wall(slow.store) };

    __resetUndoRestoreSnapshots();
    delete (window as any).runtime;
    delete (globalThis as any).commandManager;
    delete (window as any).wallStore;

    const fast = playThreeMutations(124);            // 2 × 124 = 248 ms ≤ 250 → "twin"
    performUndo();
    const fastState = { ...wall(fast.store) };

    // Guard the probe itself: if the slow run did not take the correct path, the
    // comparison below would pass for the wrong reason (empty ≠ failure).
    expect(slowState.rakeAngleDeg, 'PROBE GUARD — the 252 ms run must undo the rake').toBeUndefined();
    expect(slowState.height, 'PROBE GUARD — the 252 ms run must leave the height alone').toBe(4.2);

    expect(fastState, 'undo order must not depend on how fast the user clicked').toEqual(slowState);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// The cost of the deliberate door/window omission from `buildUndoStoreMap`
// (performUndoRedo.ts:306-311), measured rather than asserted.
// ───────────────────────────────────────────────────────────────────────────────
describe('W5-4 — door/window omission: what it actually costs', () => {
  beforeEach(() => {
    __resetUndoRestoreSnapshots();
    delete (window as any).runtime;
    delete (globalThis as any).commandManager;
    delete (window as any).wallStore;
  });

  it('a ring entry declaring affectedStores:["door"] is silently un-undoable', () => {
    const store = makeWallStore();
    const cm = makeCommandManager(store);          // legacy stack EMPTY — the standalone
                                                   // `window.setSize` / `door.setWidth`
                                                   // bridges are cm-only, so if a caller
                                                   // ever pushes a 'door' ring pair there
                                                   // is no legacy entry beneath it.
    const rb = new RingBufferUndoStack();
    rb.push({
      forward: { ops: [{ op: 'replace', path: '/door_1/width', value: 1.2 }] },
      inverse: { ops: [{ op: 'replace', path: '/door_1/width', value: 0.9 }] },
      affectedStores: ['door'],
      timestamp: 1_000_000,
    } as any);
    install(rb, cm, store);

    performUndo();

    // 'door' has no adapter → `_covered` is false → the cursor is NOT stepped and
    // the legacy fallback finds nothing. The entry is permanently stranded.
    expect(rb.canUndo(), 'the entry is still pending — nothing consumed it').toBe(true);
    expect(cm.undo).not.toHaveBeenCalled();
  });

  // ⚠ `it.fails` — see the note above. `performUndo()` returns void, so "nothing to
  // undo", "I reverted something" and "a pending entry was stranded" are the SAME
  // VALUE to every caller (HUD, initUI, BimService). Drop `.fails` when performUndo
  // returns a discriminated result per C03 §4.6 U-4.
  it.fails('U-4 / doctrine-3 — performUndo cannot tell its caller "nothing to undo" from "I undid something"', () => {
    const store = makeWallStore();
    const cm = makeCommandManager(store);
    const rb = new RingBufferUndoStack();
    install(rb, cm, store);

    // Both stacks empty: nothing to undo.
    const emptyResult = performUndo();

    // A stranded uncovered entry: something WAS pending and was NOT reverted.
    rb.push({
      forward: { ops: [{ op: 'replace', path: '/door_1/width', value: 1.2 }] },
      inverse: { ops: [{ op: 'replace', path: '/door_1/width', value: 0.9 }] },
      affectedStores: ['door'],
      timestamp: 1_000_000,
    } as any);
    const strandedResult = performUndo();

    expect(emptyResult, 'emptiness and refusal must not be the same value (C03 §4.6 U-4)')
      .not.toEqual(strandedResult);
  });
});
