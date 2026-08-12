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
// `performUndo` USED TO reconcile the two stacks with `_SAME_GESTURE_WINDOW_MS =
// 250`: when the legacy stack's top entry was NEWER than the ring buffer's top
// entry it was undone first — UNLESS its `targetIds` were a subset of the ring
// entry's ids AND the two commit stamps were within 250 ms, in which case it was
// classified as a dual-dispatch TWIN and ring-buffer-first ran.
//
// That predicate had no notion of CAUSALITY. It read a wall clock. So two
// sequences with IDENTICAL causal structure — same wall, same three verbs, same
// order — undid in DIFFERENT orders depending only on how fast the user (or the
// chat batch, or the machine between GC pauses) was.
//
// The constant is DELETED (2026-08-12, §UNDO-GESTURE-ID). The twin predicate now
// compares a `gestureId` carried by both stacks, and there is no time fallback.
// The cases below are kept exactly as written, as the regressions that would
// catch anyone putting a clock back into that decision: same story, gaps 400 ms
// vs 80 ms vs 124/126 ms, and now the SAME outcome every time.
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
// STATUS — WAS RED ON PURPOSE (3 of 5); CLOSED 2026-08-12 by §UNDO-GESTURE-ID.
// All three `it.fails` markers are GONE and the assertions they carried are now
// plain, permanently-green regressions:
//   ✓ TIMING-(IN)DEPENDENCE — `_isSameGestureTwin` no longer classifies by clock,
//     so a causally-distinct later edit is never read as a dual-dispatch twin.
//   ✓ BOUNDARY             — the 250 ms constant is deleted; there is no cliff to
//     sit either side of. The test stays as the guard against reintroducing one.
//   ✓ U-4 / doctrine-3     — `performUndo()` returns a discriminated `UndoOutcome`,
//     so "nothing to undo" and "an entry was stranded" are different values to
//     every caller (the HUD, initUI, BimService).
//
// THE FIX, AND WHY IT HAD TO BE AN IDENTITY. A monotonic SEQUENCE NUMBER
// replacing `timestamp` would NOT have greened these tests: the chronological
// comparison was already correct — the rake IS the newest entry and
// `_cmEntryIsNewer` saw that. The misroute lived entirely inside the TWIN
// predicate, and "these two entries came from ONE user interaction" is a relation
// no strictly-increasing counter can express. Only a GESTURE ID shared by both
// halves of a dual dispatch can, so that is what both stacks now carry
// (`PatchPair.gestureId` / `CommandMetadata.gestureId`, minted by
// `@pryzm/command-bus`'s gesture scope). The fixtures below stamp NO gesture id,
// which is the point: an unlabelled entry must never be adopted into the previous
// gesture — see the TWIN-POSITIVE case at the bottom for the other direction.

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
  /** §UNDO-GESTURE-ID — `CommandMetadata.gestureId`, absent unless the caller
   *  declared the interaction (the three-verb replay below deliberately does not:
   *  those are three separate user actions). */
  gestureId?: string;
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
    exec(label: string, timestamp: number, targetIds: string[], patch: Partial<WallRecord>, gestureId?: string): void {
      const before = { ...store.getById(targetIds[0]!)! };
      store.update(targetIds[0]!, patch);
      const keys = Object.keys(patch) as (keyof WallRecord)[];
      history.push({
        label, timestamp, targetIds, gestureId,
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
    /** §UNDO-GESTURE-ID — mirrors `CommandManagerImpl.peekUndoGestureId()`:
     *  the top entry's `metadata.gestureId`, or null when it has none. */
    peekUndoGestureId: () => history[history.length - 1]?.gestureId ?? null,
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
  // ✅ `it.fails` REMOVED 2026-08-12 — §UNDO-GESTURE-ID landed. The twin predicate
  // no longer reads a clock: `_isSameGestureTwin` requires the two entries to carry
  // the SAME `gestureId`, and the fixtures below stamp none, so the rake is what it
  // causally is — a separate later action — and chronological ordering undoes it
  // first, at ANY gap. This is now a plain assertion of the correct behaviour.
  it('TIMING-INDEPENDENCE — the SAME sequence 80 ms apart undoes the NEWEST mutation, like the 400 ms one', () => {
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
  // ✅ `it.fails` REMOVED 2026-08-12 — §UNDO-GESTURE-ID landed. There is no longer a
  // boundary to sit either side of: the constant is deleted, so 124 ms and 126 ms
  // are the same case. The test is kept (not deleted) as the regression that would
  // catch anyone reintroducing a clock into the twin predicate — it compares two
  // runs whose ONLY difference is the gap and requires identical outcomes.
  it('BOUNDARY — a 2 ms difference in inter-gesture gap changes nothing', () => {
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

  // ───────────────────────────────────────────────────────────────────────────
  // TWIN-POSITIVE — the other direction, which the deleted 250 ms window used to
  // carry and which an identity must therefore carry too. ONE dual dispatch (a 3D
  // tool: `bus.executeCommand('wall.create')` + `commandManager.execute(
  // CreateWallCommand)`) lands in BOTH stacks. It must be undone ONCE, via the
  // ring buffer + the U-8 shadow-drop — never re-routed to the legacy half first,
  // which would leave the ring entry behind as a phantom keypress.
  //
  // Here the legacy entry is stamped NEWER than the ring entry (the interleaving
  // that actually consults the twin predicate), so only the shared `gestureId`
  // keeps it on the ring-buffer path. Same fixture without the id ⇒ not a twin.
  // ───────────────────────────────────────────────────────────────────────────
  it('TWIN-POSITIVE — a shared gestureId keeps a genuine dual dispatch on the ring-buffer + shadow-drop path', () => {
    const store = makeWallStore();
    store.add({
      id: WALL_ID, type: 'wall', levelId: 'L0',
      height: 3, thickness: 0.2, materialColor: '#ffffff',
    });
    const cm = makeCommandManager(store);
    const rb = new RingBufferUndoStack();
    const GESTURE = 'g_wall.create_7_ab12cd';

    // The bus half: a whole-record create pair, stamped with the gesture id.
    rb.push({
      forward: { ops: [{ op: 'replace', path: `/${WALL_ID}`, value: structuredClone(store.getById(WALL_ID)!) }] },
      inverse: { ops: [{ op: 'remove', path: `/${WALL_ID}` }] },
      affectedStores: ['wall'],
      timestamp: 1_000_000,
      gestureId: GESTURE,
    } as any);
    // The legacy half of the SAME gesture, stamped 3 ms later (NEWER).
    cm.exec('create-twin', 1_000_003, [WALL_ID], { height: 3 }, GESTURE);

    install(rb, cm, store);
    performUndo();

    expect(store.getById(WALL_ID), 'the ring-buffer inverse removed the wall').toBeUndefined();
    expect(cm.undone, 'the legacy twin must NOT be undone separately').toEqual([]);
    expect(cm.history.length, 'the twin is shadow-dropped — one gesture, one Ctrl+Z').toBe(0);
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

  // ✅ `it.fails` REMOVED 2026-08-12 — `performUndo()` now returns a discriminated
  // `UndoOutcome` (C03 §4.6 U-4): `{status:'nothing-to-undo'}` vs
  // `{status:'stranded', reason, stores}`. Emptiness and refusal are different
  // values again, and the reason names WHICH store had no adapter.
  it('U-4 / doctrine-3 — performUndo tells its caller "nothing to undo" from "an entry was stranded"', () => {
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
