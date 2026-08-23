// @vitest-environment happy-dom
//
// §UNDO-ORDERING-KEY (L-7300) — "Ctrl+Z after I raked a wall reverted a SLAB."
// ============================================================================
// FOUNDER REPORT, 2026-08-23: *"Undo / redo should also impact making a wall
// raked, and making an edit to the profile — however in a test it doesn't seem
// like [it does]."* His console, three wall edits then ONE Ctrl+Z:
//
//   [CommandManager] EXECUTE: UPDATE_ELEMENT_PARAMETER
//   [CommandManager] snapshot commandType="UPDATE_ELEMENT_PARAMETER (ad)" scope=[wall] elapsed=0.2ms
//   [UpdateElementParameterCommand] §DIAG-PARAM-REBUILD rebuilding wall/wall_01M0NJ9B6F… rakeAngleDeg=80
//   … rakeAngleDeg=70 on the same wall … then [WallTool] §FEAT-WALL-PROFILE-EDIT entered …
//   [Undo] ring-buffer applied — stores: slab  ids: slab_01M0NJ79M2…  shadow-dropped cm entries: 0
//   [Redo] ring-buffer applied — stores: slab
//
// ── WHAT THE TWO LOG LINES ACTUALLY SAY, AND WHAT THEY DO NOT ───────────────
// `scope=[wall]` and `stores: slab` are NOT a scope/apply mismatch inside one
// entry — that reading is refuted. `scope=[wall]` is `CommandManagerImpl`'s
// Contract 01 §2.2 transaction snapshot scope for the LEGACY entry (correct, and
// per-elementType since L-947); `stores: slab` is the `affectedStores` of a
// DIFFERENT entry on the OTHER stack. The defect is not that one entry lied — it
// is that the arbiter picked the wrong ENTRY.
//
// ── ROOT CAUSE (measured, not inferred) ────────────────────────────────────
// All three edits are `element.updateParameters`, whose bus handler declares
// `stores: [] as const` and bridges to `_cmExec` (`initBusHandlers.ts:2217`), so
// all three live on the commandManager stack ONLY and never mint a PatchPair.
// `performUndo` asks `_cmEntryIsNewer(pair, cm)` — and that function opened with
//
//     const pairTime = pair?.timestamp;
//     if (typeof pairTime !== 'number') return false;
//
// so a ring entry carrying NO commit timestamp did not lose a tie-break, it won
// UNCONDITIONALLY, however much newer the legacy entry was. SIX of the EIGHT
// production ring-buffer push sites minted exactly such an entry:
// `initBusHandlers.ts` :825 (`element.changeType`, ANY store), :1596 (furniture),
// :1647 (floor), :1703 (**slab**), :1798 (ceiling), and `commitAnnotationSet.ts`
// (annotation). Only `CommandBus.ts:591` and `initBusHandlers.ts:1335` stamped
// one. C03 §4.6 U-10 requires the key on BOTH stacks; its parenthetical named
// only `CommandBus` as the stamper, and that is how seven other producers shipped
// without knowing they had the obligation.
//
// ── THE FIX IS AT THE CHOKEPOINT ───────────────────────────────────────────
// `RingBufferUndoStack.push()` now stamps commit time on any pair that arrives
// without one, so no push site — present or future — can mint an unorderable
// entry. Six call-site edits were REJECTED as six copies of one rule with nothing
// enforcing it (the shape `_unionTargetIds` and `ELEMENT_STORE_ROUTES` already
// closed elsewhere). The dual-dispatch sites are unaffected: at all six, the
// legacy command is CONSTRUCTED before the ring push, so `cmTime <= pairTime` and
// `_cmEntryIsNewer` still returns false — their ring-buffer-first routing is
// byte-identical. The only decision that changes is the wrong one.
//
// ── HOW THIS FILE IS WRITTEN ───────────────────────────────────────────────
// The ring buffer is the REAL `RingBufferUndoStack` and the entry is pushed by a
// VERBATIM copy of `initBusHandlers.ts:1703` — omitting `timestamp` exactly as
// production did — because the invariant under test is the STACK's, and a fixture
// that hand-stamped the key would be testing the fixture. Its clock is injected
// so the assertion is deterministic rather than racing `Date.now()`.
// The commandManager is a stub mirroring `CommandManagerImpl` where it matters
// (`peekUndoTimestamp` = `command.timestamp` at construction, `peekUndoTargetIds`,
// `peekUndoGestureId`, orphan-scoped `dropEntriesForTargets`) — the same seam
// `undoGestureOrdering.test.ts` uses.
//
// EVERY assertion reads the AUTHORITATIVE record out of the mesh-driving legacy
// store (C03 §4.4 "Legacy store" row) — never `status === 'undone'`, never a
// stack depth. A rake undo that reports success while reverting nothing is the
// bug wearing a fix (L-2401).
//
// CONTRACTS: C03 §4.5–4.8 (U-10 cross-stack order, U-4 outcome honesty),
// C16 (command authoring), C85 §rake / §wallProfile.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import {
  performUndo,
  performRedo,
  __resetUnorderableReports,
} from '../src/engine/undo/performUndoRedo.js';
import { __resetUndoRestoreSnapshots } from '../src/engine/undo/elementUndoStoreAdapter.js';

// The founder's own ids, so a reader can line this file up against his console.
const WALL_ID = 'wall_01M0NJ9B6F63FZZTB03V1XCVCG';
const SLAB_ID = 'slab_01M0NJ79M23Q891GGVB5Q289WG';

/** Epoch-ms. Both stacks stamp `Date.now()`, so the fixture must too — a toy
 *  counter would make the ring buffer's own `Date.now()` stamp dwarf it and the
 *  comparison under test would never be exercised. */
const T_SLAB_TYPE_SWAP = 1_700_000_000_000;
const T_RAKE_80        = T_SLAB_TYPE_SWAP + 12_000;
const T_RAKE_70        = T_SLAB_TYPE_SWAP + 18_000;
const T_PROFILE        = T_SLAB_TYPE_SWAP + 25_000;

/** A gable ring: the five-vertex outline a profile edit authors in one gesture. */
const GABLE = [
  { u: 0, v: 0 }, { u: 6, v: 0 }, { u: 6, v: 2 }, { u: 3, v: 3 }, { u: 0, v: 2 },
];

interface Rec { id: string; [k: string]: unknown }

/** The mesh-driving legacy store (C03 §4.4 row 2). `update` MERGES a partial —
 *  what `WallStore.update` does and what `elementUndoStoreAdapter` relies on. */
function makeStore() {
  const map = new Map<string, Rec>();
  return {
    map,
    add(e: Rec) { map.set(e.id, { ...e }); },
    remove(id: string) { map.delete(id); },
    getById(id: string): Rec | undefined { return map.get(id); },
    update(id: string, u: Partial<Rec>) {
      const e = map.get(id);
      if (!e) return;
      map.set(id, { ...e, ...u });
    },
  };
}
type Store = ReturnType<typeof makeStore>;

interface CmEntry {
  label: string;
  timestamp: number;
  targetIds: string[];
  gestureId?: string;
  undo(): void;
  redo(): void;
}

/**
 * Mirrors `CommandManagerImpl` at the four surfaces `performUndoRedo` reads.
 * `exec` is `commandManager.execute(new UpdateElementParameterCommand(...))`:
 * capture the previous values of exactly the keys being written (the real
 * command's `captureCurrentValues`), write, push ONE entry stamped at command
 * CONSTRUCTION (`readonly timestamp = Date.now()`).
 */
function makeCommandManager(store: Store) {
  const history: CmEntry[] = [];
  const redoStack: CmEntry[] = [];
  const cm = {
    history,
    redoStack,
    exec(label: string, timestamp: number, id: string, patch: Record<string, unknown>): void {
      const before = { ...store.getById(id)! };
      const keys = Object.keys(patch);
      store.update(id, patch);
      history.push({
        label, timestamp, targetIds: [id],
        undo(): void {
          const revert: Record<string, unknown> = {};
          for (const k of keys) revert[k] = before[k];
          store.update(id, revert);
        },
        redo(): void { store.update(id, patch); },
      });
    },
    canUndo: () => history.length > 0,
    canRedo: () => redoStack.length > 0,
    undo: vi.fn(() => {
      const e = history.pop();
      if (!e) return null;                       // U-4: empty is not success
      e.undo();
      redoStack.push(e);
      return { success: true, affectedElementIds: e.targetIds, info: [] };
    }),
    redo: vi.fn(() => {
      const e = redoStack.pop();
      if (!e) return null;
      e.redo();
      history.push(e);
      return { success: true, affectedElementIds: e.targetIds, info: [] };
    }),
    peekUndoTimestamp: () => history[history.length - 1]?.timestamp ?? null,
    peekRedoTimestamp: () => redoStack[redoStack.length - 1]?.timestamp ?? null,
    peekUndoTargetIds: () => history[history.length - 1]?.targetIds ?? [],
    peekUndoGestureId: () => history[history.length - 1]?.gestureId ?? null,
    /** §UNDO-SHADOW-DROP-SCOPE — subset match AND every target orphaned. */
    dropEntriesForTargets: vi.fn((ids: readonly string[]) => {
      const wanted = new Set(ids);
      const before = history.length;
      for (let i = history.length - 1; i >= 0; i--) {
        const t = history[i]!.targetIds;
        if (t.length > 0 && t.every(x => wanted.has(x)) && t.every(x => store.getById(x) === undefined)) {
          history.splice(i, 1);
        }
      }
      return before - history.length;
    }),
    beginExternalRevert: vi.fn(),
    endExternalRevert: vi.fn(),
  };
  return cm;
}
type Cm = ReturnType<typeof makeCommandManager>;

/**
 * The world: a slab whose TYPE was swapped a minute before the wall work.
 *
 * The ring push below is a VERBATIM copy of `initBusHandlers.ts:1703`
 * (`element.changeType`, slab branch) — whole-record replace pair,
 * `affectedStores: ['slab']`, and NO `timestamp`. That omission is the subject:
 * leave it in, and the stack is what has to supply the key.
 */
function world(): { wallStore: Store; slabStore: Store; rb: RingBufferUndoStack; cm: Cm } {
  const wallStore = makeStore();
  const slabStore = makeStore();

  wallStore.add({ id: WALL_ID, type: 'wall', levelId: 'L0', height: 3, thickness: 0.2 });

  const slabBefore = { id: SLAB_ID, type: 'slab', levelId: 'L0', thickness: 0.2, systemTypeId: 'SLAB-A' };
  const slabAfter  = { ...slabBefore, systemTypeId: 'SLAB-B' };
  slabStore.add(slabAfter);

  const rb = new RingBufferUndoStack({ now: () => T_SLAB_TYPE_SWAP });
  rb.push({
    forward: { ops: [{ op: 'replace', path: `/${SLAB_ID}`, value: slabAfter }] },
    inverse: { ops: [{ op: 'replace', path: `/${SLAB_ID}`, value: slabBefore }] },
    affectedStores: ['slab'],
    // NO `timestamp` — production omitted it here, and that is the defect.
  } as never);

  const cm = makeCommandManager(wallStore);

  (window as unknown as Record<string, unknown>).runtime = { bus: { ringBuffer: rb } };
  (globalThis as unknown as Record<string, unknown>).commandManager = cm;
  (window as unknown as Record<string, unknown>).wallStore = wallStore;
  (window as unknown as Record<string, unknown>).slabStore = slabStore;

  return { wallStore, slabStore, rb, cm };
}

const wall = (s: Store) => s.getById(WALL_ID)!;
const slabType = (s: Store) => s.getById(SLAB_ID)!.systemTypeId;

describe('§UNDO-ORDERING-KEY (L-7300) — a wall RAKE is undone before an older slab entry', () => {
  beforeEach(() => {
    __resetUndoRestoreSnapshots();
    __resetUnorderableReports();
    delete (window as unknown as Record<string, unknown>).runtime;
    delete (globalThis as unknown as Record<string, unknown>).commandManager;
    delete (window as unknown as Record<string, unknown>).wallStore;
    delete (window as unknown as Record<string, unknown>).slabStore;
  });

  it("L-7300 — Ctrl+Z after two rakes reverts the WALL, and NO other store moves", () => {
    const { wallStore, slabStore, cm } = world();
    cm.exec('rake-80', T_RAKE_80, WALL_ID, { rakeAngleDeg: 80 });
    cm.exec('rake-70', T_RAKE_70, WALL_ID, { rakeAngleDeg: 70 });
    expect(wall(wallStore).rakeAngleDeg).toBe(70);

    const first = performUndo();

    // THE ASSERTION THE FOUNDER'S CONSOLE FAILED: the WALL moved, the slab did not.
    expect(wall(wallStore).rakeAngleDeg).toBe(80);
    expect(slabType(slabStore)).toBe('SLAB-B');
    expect(first.status).toBe('undone');
    expect(first).toMatchObject({ path: 'commandManager' });

    // …and the second Ctrl+Z takes the rake off entirely, still without touching the slab.
    performUndo();
    expect(wall(wallStore).rakeAngleDeg).toBeUndefined();
    expect(slabType(slabStore)).toBe('SLAB-B');
  });

  it('L-7300 — the slab entry is reached only AFTER both wall edits, not before', () => {
    const { wallStore, slabStore, cm } = world();
    cm.exec('rake-80', T_RAKE_80, WALL_ID, { rakeAngleDeg: 80 });
    cm.exec('rake-70', T_RAKE_70, WALL_ID, { rakeAngleDeg: 70 });

    performUndo();
    performUndo();
    expect(slabType(slabStore)).toBe('SLAB-B');   // still untouched

    const third = performUndo();                   // NOW the older ring entry is the newest pending
    expect(third).toMatchObject({ status: 'undone', path: 'ring-buffer', stores: ['slab'] });
    expect(slabType(slabStore)).toBe('SLAB-A');
    expect(wall(wallStore).rakeAngleDeg).toBeUndefined();
  });

  it('L-7300 REDO — redo replays the RAKE, not the slab (the symmetric half)', () => {
    const { wallStore, slabStore, cm } = world();
    cm.exec('rake-80', T_RAKE_80, WALL_ID, { rakeAngleDeg: 80 });

    performUndo();
    expect(wall(wallStore).rakeAngleDeg).toBeUndefined();
    expect(slabType(slabStore)).toBe('SLAB-B');

    const r = performRedo();
    expect(r.status).toBe('redone');
    expect(wall(wallStore).rakeAngleDeg).toBe(80);   // the wall came back…
    expect(slabType(slabStore)).toBe('SLAB-B');      // …and the slab never moved
  });

  it('L-7300 — a wall PROFILE edit undoes and redoes as ONE step, slab untouched', () => {
    const { wallStore, slabStore, cm } = world();

    // `WallTool._commitWallProfile` sends the WHOLE ring in ONE
    // `element.updateParameters` dispatch — one command, one history entry,
    // however many vertices the user dragged (C03 §4.6: one gesture, one Ctrl+Z).
    cm.exec('profile', T_PROFILE, WALL_ID, { wallProfile: { ring: GABLE } });
    expect(cm.history).toHaveLength(1);
    expect((wall(wallStore).wallProfile as { ring: unknown[] }).ring).toHaveLength(5);

    const u = performUndo();
    expect(u).toMatchObject({ path: 'commandManager' });
    expect(wall(wallStore).wallProfile).toBeUndefined();   // the rectangle is back
    expect(slabType(slabStore)).toBe('SLAB-B');

    performRedo();
    // Vertex for vertex — a profile that comes back with four of five vertices is
    // a failed redo that reports success.
    expect((wall(wallStore).wallProfile as { ring: typeof GABLE }).ring).toEqual(GABLE);
    expect(slabType(slabStore)).toBe('SLAB-B');
  });

  it('L-7300 — rake THEN profile: two gestures, two Ctrl+Z, in reverse order', () => {
    const { wallStore, slabStore, cm } = world();
    cm.exec('rake-80', T_RAKE_80, WALL_ID, { rakeAngleDeg: 80 });
    cm.exec('profile', T_PROFILE, WALL_ID, { wallProfile: { ring: GABLE } });

    performUndo();
    expect(wall(wallStore).wallProfile).toBeUndefined();
    expect(wall(wallStore).rakeAngleDeg).toBe(80);      // the rake SURVIVES the profile undo

    performUndo();
    expect(wall(wallStore).rakeAngleDeg).toBeUndefined();
    expect(slabType(slabStore)).toBe('SLAB-B');
  });

  it('the ring buffer STAMPS the entry the push site omitted — the invariant, at the seam', () => {
    const { rb } = world();
    // The push above supplied no timestamp; `current()` must still be orderable.
    expect(typeof rb.current()!.timestamp).toBe('number');
    expect(rb.current()!.timestamp).toBe(T_SLAB_TYPE_SWAP);
  });
});
