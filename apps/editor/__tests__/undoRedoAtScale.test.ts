// @vitest-environment happy-dom
//
// §GATE-G10-UNDO-AT-SCALE — the V1 gate for "undo/redo at scale" (C03 §4.5–4.8).
//
// WHAT THIS PROVES (and why it is wired to the REAL objects, not doubles)
// ----------------------------------------------------------------------------
// The undo pipeline is four real parts in a row (C03 §4.2):
//
//   CommandBus.executeCommand → Immer forward/inverse patches
//     → RingBufferUndoStack.push (ONE PatchPair per dispatch)
//       → performUndo() (THE single entry point, C03 §4.6 U-5)
//         → applyRingBufferSide → elementUndoStoreAdapter
//           → the LEGACY, MESH-DRIVING store (§4.4)
//
// Every one of those is the production class here; only the legacy element store
// is a double (an instrumented Map with the exact `add/remove/update/getById`
// surface the adapter duck-types over — C03 §4.4 "Legacy store" row), plus the
// §P2.1 event bridge (in prod: initTools; here: a PatchEmitter subscriber that
// mirrors the forward patch into that store, which is precisely what the bridge
// does). That gives an end-to-end gate that would catch a break in ANY of the
// four links.
//
// THE INVARIANTS (the gate's acceptance criteria):
//   I1  one gesture = one undo entry — a single dispatch pushes exactly ONE
//       ring-buffer entry, and ONE performUndo() fully reverts it (no double
//       entry ⇒ no "second Ctrl+Z does nothing" phantom).
//   I2  a batch (AI proposal / multi-element create) collapses to ONE entry and
//       undoes ATOMICALLY — all N elements, in one keypress, or none.
//   I3  undo→redo is a FIXED POINT — the state after redo is byte-identical
//       (canonical JSON) to the state before undo, over repeated cycles.
//   I4  undo does not leak or corrupt NEIGHBOUR elements — elements not named in
//       the patch are byte-identical after undo/redo.
//   I5  AT SCALE (N = 500): the work an undo does is O(N) patch ops applied in a
//       SINGLE store apply — measured by COUNTS (ops, store-mutator calls, ring
//       entries), never by wall-clock (a ms assertion is flaky under CI load).
//       This is the count-side proof of the < 5 ms NFT target for Immer
//       reverse-patch undo (packages/perf-budgets/src/nft-targets.ts 'undo-single').
//   I6  U-1/U-3 — a suppressed (remote/AI-replay) dispatch and an empty-patch
//       record MUST NOT push a ring entry (they would poison the cursor).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandBus,
  RingBufferUndoStack,
  produceCommand,
  type CommandHandler,
  type EventRecord,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';
import { performUndo, performRedo } from '../src/engine/undo/performUndoRedo.js';
import {
  elementUndoStoreAdapter,
  __resetUndoRestoreSnapshots,
  type UndoPatchOp,
} from '../src/engine/undo/elementUndoStoreAdapter.js';

// ── The element + L1 store shape (mirrors plugins/wall/src/store.ts) ──────────

interface WallRec {
  id: string;
  type: 'wall';
  levelId: string;
  height: number;
  thickness: number;
  baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
}
type WallsState = Record<string, WallRec>;

function wallRec(id: string, i: number): WallRec {
  return {
    id,
    type: 'wall',
    levelId: 'L0',
    height: 3,
    thickness: 0.2,
    baseLine: [
      { x: i, y: 0, z: 0 },
      { x: i + 1, y: 0, z: 0 },
    ],
  };
}

// ── The LEGACY (mesh-driving) store double — instrumented for the count-based
//    scale assertions (I5). Surface = exactly what elementUndoStoreAdapter
//    duck-types over (C03 §4.4). ───────────────────────────────────────────────

function makeLegacyStore() {
  const map = new Map<string, WallRec>();
  const calls = { add: 0, remove: 0, update: 0, getById: 0 };
  return {
    map,
    calls,
    add(e: WallRec) { calls.add++; map.set(e.id, e); },
    remove(id: string) { calls.remove++; map.delete(id); },
    update(id: string, u: Partial<WallRec>) {
      calls.update++;
      const e = map.get(id);
      if (e) map.set(id, { ...e, ...u });
    },
    getById(id: string) { calls.getById++; return map.get(id) ?? undefined; },
    /** Canonical, order-independent snapshot — the I3/I4 equality oracle. */
    snapshot(): string {
      const ids = [...map.keys()].sort();
      return JSON.stringify(ids.map(id => map.get(id)));
    },
  };
}
type LegacyStore = ReturnType<typeof makeLegacyStore>;

// ── The handlers (production shape: produceCommand over the L1 Record store) ──

interface CreateWallPayload { readonly id: string; readonly index: number }
interface CreateWallBatchPayload { readonly walls: readonly { id: string; index: number }[] }
interface SetWallHeightPayload { readonly id: string; readonly height: number }

type Stores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

/** The L1 bus store (C03 §4.4 row 1) — committed by the harness the way
 *  composeRuntime commits `nextStates`. */
const l1: { wall: WallsState } = { wall: {} };

class CreateWallHandler implements CommandHandler<CreateWallPayload, Stores> {
  readonly type = 'wall.create';
  readonly affectedStores = ['wall'] as const;
  canExecute(): ValidationResult { return { valid: true }; }
  execute(ctx: HandlerContext<Stores>, cmd: CreateWallPayload): HandlerResult {
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, d => {
      d[cmd.id] = wallRec(cmd.id, cmd.index);
    });
    l1.wall = next;
    return { forward, inverse, nextStates: { wall: next } };
  }
}

/** ONE Immer batch for the whole set → ONE forward + ONE inverse patch set →
 *  ONE ring-buffer entry (the invariant plugins/wall CreateWallBatch relies on). */
class CreateWallBatchHandler implements CommandHandler<CreateWallBatchPayload, Stores> {
  readonly type = 'wall.batch.create';
  readonly affectedStores = ['wall'] as const;
  canExecute(_c: HandlerContext<Stores>, cmd: CreateWallBatchPayload): ValidationResult {
    return cmd.walls.length > 0 ? { valid: true } : { valid: false, reason: 'empty batch' };
  }
  execute(ctx: HandlerContext<Stores>, cmd: CreateWallBatchPayload): HandlerResult {
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, d => {
      for (const w of cmd.walls) d[w.id] = wallRec(w.id, w.index);
    });
    l1.wall = next;
    return { forward, inverse, nextStates: { wall: next } };
  }
}

class SetWallHeightHandler implements CommandHandler<SetWallHeightPayload, Stores> {
  readonly type = 'wall.setHeight';
  readonly affectedStores = ['wall'] as const;
  canExecute(): ValidationResult { return { valid: true }; }
  execute(ctx: HandlerContext<Stores>, cmd: SetWallHeightPayload): HandlerResult {
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, d => {
      const w = d[cmd.id];
      if (w) w.height = cmd.height;
    });
    l1.wall = next;
    return { forward, inverse, nextStates: { wall: next } };
  }
}

/** A handler that mutates nothing → empty forward+inverse (the OI-034 /
 *  C03 §4.6 U-3 "cursor poison" case: MUST NOT reach the ring buffer). */
class NoopHandler implements CommandHandler<Record<string, never>, Stores> {
  readonly type = 'wall.noop';
  readonly affectedStores = ['wall'] as const;
  canExecute(): ValidationResult { return { valid: true }; }
  execute(): HandlerResult { return { forward: [], inverse: [] }; }
}

// ── Harness: real bus + real ring buffer + the §P2.1 bridge → legacy store ────

interface Harness {
  bus: CommandBus;
  rb: RingBufferUndoStack;
  legacy: LegacyStore;
  cmDropCalls: string[][];
}

function boot(): Harness {
  l1.wall = {};
  const rb = new RingBufferUndoStack({ maxSize: 200 });
  const bus = new CommandBus({
    ringBuffer: rb,
    storesProvider: () => ({ wall: l1.wall }),
    audit: { actorId: 'test', projectId: 'p', clientId: 'c' },
  });
  bus.register(new CreateWallHandler());
  bus.register(new CreateWallBatchHandler());
  bus.register(new SetWallHeightHandler());
  bus.register(new NoopHandler());

  const legacy = makeLegacyStore();

  // §P2.1 EVENT BRIDGE (prod: initTools.ts) — the legacy/mesh store is populated
  // from the command's FORWARD patch, not by the handler. Undo later reverts THIS
  // store through the same adapter, so the round-trip is the real one.
  const bridge = elementUndoStoreAdapter(legacy);
  bus.patches.subscribe((_bytes: Uint8Array, rec: EventRecord) => {
    bridge.applyPatch(rec.forward.map(p => ({ op: p.op, path: p.path, value: p.value }) as UndoPatchOp));
  });

  const cmDropCalls: string[][] = [];
  (window as unknown as Record<string, unknown>).runtime = { bus: { ringBuffer: rb } };
  (window as unknown as Record<string, unknown>).wallStore = legacy;
  (globalThis as unknown as Record<string, unknown>).commandManager = {
    canUndo: () => false,
    canRedo: () => false,
    undo: () => { throw new Error('commandManager.undo() MUST NOT be reached — the ring buffer owns these entries'); },
    redo: () => { throw new Error('commandManager.redo() MUST NOT be reached — the ring buffer owns these entries'); },
    dropEntriesForTargets: (ids: readonly string[]) => { cmDropCalls.push([...ids]); return 0; },
  };
  return { bus, rb, legacy, cmDropCalls };
}

beforeEach(() => {
  __resetUndoRestoreSnapshots();
  delete (window as unknown as Record<string, unknown>).runtime;
  delete (window as unknown as Record<string, unknown>).wallStore;
  delete (globalThis as unknown as Record<string, unknown>).commandManager;
});

// ─────────────────────────────────────────────────────────────────────────────

describe('§GATE-G10 I1 — one user gesture = exactly one undo entry', () => {
  it('a single dispatch pushes exactly ONE ring entry (and ONE legacy EventRecord)', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'w1', index: 0 });

    expect(h.rb.size).toBe(1);
    expect(h.rb.undoCount()).toBe(1);
    expect(h.bus.undo.size).toBe(1);       // legacy EventRecord stack — also exactly one
    expect(h.legacy.map.has('w1')).toBe(true);
  });

  it('ONE performUndo() fully reverts it; a SECOND keypress is not consumed by a phantom entry', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'w1', index: 0 });

    performUndo();
    expect(h.legacy.map.has('w1')).toBe(false);   // mesh-driving store reverted
    expect(h.rb.canUndo()).toBe(false);           // the single entry is consumed
    expect(h.rb.canRedo()).toBe(true);

    // The phantom-double-undo class (the property-panel commit()+blur() bug):
    // a second Ctrl+Z must find NOTHING left on the ring buffer. If a gesture had
    // pushed two entries, this would still see one.
    expect(h.rb.undoCount()).toBe(0);
  });

  it('N sequential gestures = N entries = N keypresses (no coalescing, no doubling)', async () => {
    const h = boot();
    for (let i = 0; i < 10; i++) await h.bus.executeCommand('wall.create', { id: `w${i}`, index: i });
    expect(h.rb.undoCount()).toBe(10);

    for (let i = 9; i >= 0; i--) {
      performUndo();
      expect(h.legacy.map.size).toBe(i);          // exactly one element per keypress
    }
    expect(h.rb.canUndo()).toBe(false);
  });
});

describe('§GATE-G10 I2 — a batch (AI proposal / multi-element create) is ONE atomic undo entry', () => {
  it('300-wall batch → ONE ring entry; one undo removes ALL 300 and restores the prior state exactly', async () => {
    const h = boot();
    // Pre-existing context the batch must not disturb.
    await h.bus.executeCommand('wall.create', { id: 'pre-a', index: 100 });
    await h.bus.executeCommand('wall.create', { id: 'pre-b', index: 200 });
    const before = h.legacy.snapshot();
    const entriesBefore = h.rb.undoCount();

    const walls = Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, index: i }));
    await h.bus.executeCommand('wall.batch.create', { walls });

    expect(h.rb.undoCount()).toBe(entriesBefore + 1);   // ONE entry for 300 elements
    expect(h.legacy.map.size).toBe(302);

    performUndo();                                       // ONE keypress

    expect(h.legacy.map.size).toBe(2);                   // all 300 gone, atomically
    expect(h.legacy.snapshot()).toBe(before);            // prior state restored EXACTLY
    expect(h.rb.undoCount()).toBe(entriesBefore);        // the pre-existing entries survive
  });

  it('the batch inverse is applied in ONE store pass — 300 removes, zero adds, zero updates', async () => {
    const h = boot();
    const walls = Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, index: i }));
    await h.bus.executeCommand('wall.batch.create', { walls });

    h.legacy.calls.add = 0; h.legacy.calls.remove = 0; h.legacy.calls.update = 0;
    performUndo();

    expect(h.legacy.calls.remove).toBe(300);   // exactly one remove per element — O(N)
    expect(h.legacy.calls.add).toBe(0);        // no re-add churn
    expect(h.legacy.calls.update).toBe(0);     // no partial-field thrash
  });
});

describe('§GATE-G10 I3 — undo/redo is a FIXED POINT (byte-identical state)', () => {
  it('single create: undo → redo returns the byte-identical legacy state', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'w1', index: 0 });
    const afterCreate = h.legacy.snapshot();

    performUndo();
    performRedo();

    expect(h.legacy.snapshot()).toBe(afterCreate);
  });

  it('batch: five undo/redo cycles are stable — no drift, no duplicate, no loss', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'pre', index: 99 });
    const s0 = h.legacy.snapshot();
    const walls = Array.from({ length: 120 }, (_, i) => ({ id: `b${i}`, index: i }));
    await h.bus.executeCommand('wall.batch.create', { walls });
    const s1 = h.legacy.snapshot();

    for (let cycle = 0; cycle < 5; cycle++) {
      performUndo();
      expect(h.legacy.snapshot(), `undo cycle ${cycle}`).toBe(s0);
      performRedo();
      expect(h.legacy.snapshot(), `redo cycle ${cycle}`).toBe(s1);
    }
    // The cursor must be back where it started — not drifting one slot per cycle.
    expect(h.rb.undoCount()).toBe(2);
    expect(h.rb.redoCount()).toBe(0);
  });

  it('field edit: undo restores the OLD value, redo restores the NEW one, repeatedly', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'w1', index: 0 });
    await h.bus.executeCommand('wall.setHeight', { id: 'w1', height: 4.5 });
    expect(h.legacy.map.get('w1')!.height).toBe(4.5);

    for (let i = 0; i < 3; i++) {
      performUndo();
      expect(h.legacy.map.get('w1')!.height).toBe(3);     // pre-edit value
      performRedo();
      expect(h.legacy.map.get('w1')!.height).toBe(4.5);   // post-edit value
    }
    // The element survived — a field undo must never delete its element.
    expect(h.legacy.map.size).toBe(1);
  });
});

describe('§GATE-G10 I4 — undo must not leak or corrupt NEIGHBOUR elements', () => {
  it('undoing a create leaves every other element byte-identical', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'n1', index: 1 });
    await h.bus.executeCommand('wall.create', { id: 'n2', index: 2 });
    await h.bus.executeCommand('wall.setHeight', { id: 'n2', height: 2.4 });
    const neighbours = h.legacy.snapshot();

    await h.bus.executeCommand('wall.create', { id: 'victim', index: 3 });
    performUndo();

    expect(h.legacy.map.has('victim')).toBe(false);
    expect(h.legacy.snapshot()).toBe(neighbours);   // n1 + n2 (incl. its edited height) untouched
  });

  it('undoing a field edit touches ONLY the edited element (one update call, no neighbour writes)', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'a', index: 1 });
    await h.bus.executeCommand('wall.create', { id: 'b', index: 2 });
    await h.bus.executeCommand('wall.setHeight', { id: 'a', height: 9 });
    const bBefore = JSON.stringify(h.legacy.map.get('b'));

    h.legacy.calls.update = 0; h.legacy.calls.remove = 0; h.legacy.calls.add = 0;
    performUndo();

    expect(h.legacy.calls.update).toBe(1);          // exactly the one element in the patch
    expect(h.legacy.calls.remove).toBe(0);
    expect(h.legacy.calls.add).toBe(0);
    expect(JSON.stringify(h.legacy.map.get('b'))).toBe(bBefore);
  });
});

describe('§GATE-G10 I5 — AT SCALE (500 elements): the undo is O(N) ops in ONE apply', () => {
  const N = 500;

  it('one 500-element batch = ONE ring entry whose inverse is exactly N ops (no O(N²) blow-up)', async () => {
    const h = boot();
    const walls = Array.from({ length: N }, (_, i) => ({ id: `s${i}`, index: i }));
    await h.bus.executeCommand('wall.batch.create', { walls });

    expect(h.rb.undoCount()).toBe(1);
    const pair = h.rb.current()!;
    // The NFT budget (nft-targets.ts 'undo-single': < 5 ms, Immer reverse-patch)
    // holds iff the undo is a linear patch apply. These COUNTS are the invariant a
    // wall-clock assertion can only approximate — and they are stable under CI load.
    expect(pair.inverse.ops.length).toBe(N);        // exactly one inverse op per element
    expect(pair.forward.ops.length).toBe(N);
    expect(pair.affectedStores).toEqual(['wall']);
    // Every op is a whole-element op at the store root — the cheap path.
    expect(pair.inverse.ops.every(o => o.op === 'remove')).toBe(true);
    expect(pair.forward.ops.every(o => o.op === 'add')).toBe(true);
  });

  it('undo of 500 elements = ONE keypress, ONE store apply, N mutator calls, and a full atomic restore', async () => {
    const h = boot();
    const walls = Array.from({ length: N }, (_, i) => ({ id: `s${i}`, index: i }));
    await h.bus.executeCommand('wall.batch.create', { walls });
    const populated = h.legacy.snapshot();

    h.legacy.calls.remove = 0;
    performUndo();
    expect(h.legacy.calls.remove).toBe(N);          // O(N), not O(N²)
    expect(h.legacy.map.size).toBe(0);

    h.legacy.calls.add = 0;
    performRedo();
    expect(h.legacy.calls.add).toBe(N);
    expect(h.legacy.snapshot()).toBe(populated);    // fixed point at scale
  });

  it('500 SEQUENTIAL gestures stay within the ring cap and never desync the cursor', async () => {
    const h = boot();
    const CAP = 200;                                 // RingBufferUndoStack default (C03 §4.2)
    for (let i = 0; i < N; i++) await h.bus.executeCommand('wall.create', { id: `q${i}`, index: i });

    expect(h.legacy.map.size).toBe(N);
    expect(h.rb.size).toBe(CAP);                     // oldest silently discarded — never throws
    expect(h.rb.undoCount()).toBe(CAP);

    // Undo every retained entry; each keypress must revert exactly one element.
    let expected = N;
    for (let i = 0; i < CAP; i++) {
      performUndo();
      expected--;
      expect(h.legacy.map.size).toBe(expected);
    }
    expect(h.rb.canUndo()).toBe(false);
    expect(h.rb.redoCount()).toBe(CAP);
    // The N-CAP oldest walls are beyond the horizon — still present, not corrupted.
    expect(h.legacy.map.size).toBe(N - CAP);
  });
});

describe('§GATE-G10 KNOWN GAP — cross-stack undo ORDERING (C03 §4.7 follow-up 2 / ADR-051)', () => {
  // THE GAP, STATED AS THE INVARIANT IT VIOLATES: **Ctrl+Z undoes the user's most
  // recent gesture.** It does not, when the two undo backends are interleaved.
  //
  // `performUndo()` is RING-BUFFER-FIRST *unconditionally* (performUndoRedo.ts:210).
  // The two stacks carry independent cursors and no shared clock, so "most recent"
  // is unknowable at the decision point. A gesture that is commandManager-ONLY —
  // and there are still many live ones: JoinTool / CutTool / OffsetTool / MirrorTool
  // / ScaleTool / CopyPasteTool (packages/input-host), OpeningTool, WindowTool,
  // level ops, property-panel edits — performed AFTER a bus-only gesture (every plan
  // tool + every AI batch) is therefore NOT the first thing undone. The ring buffer's
  // older entry wins, so:
  //
  //     draw a wall in plan (bus)  →  Join/Trim it (commandManager)  →  Ctrl+Z
  //     EXPECTED: the join is reverted.   ACTUAL: the WALL IS DELETED.
  //
  // …and the join is then also dropped from the timeline by the shadow-drop that
  // follows (it targets the now-removed wall → it is a genuine orphan).
  //
  // This is NOT fixable inside the bus or the registry: the ordering decision lives in
  // `performUndoRedo`, and a correct fix needs a single monotonic gesture sequence
  // stamped on BOTH backends' entries (ring PatchPair + commandManager history entry),
  // with `performUndo` popping whichever top entry has the higher seq. That is the
  // ADR-051 single-timeline end-state.
  //
  // Encoded with `it.fails` so it is HONEST: the assertion below is the invariant we
  // want, and the marker records that it does not hold yet. When the single timeline
  // lands, this test goes GREEN → `it.fails` turns RED → delete the marker.
  it.fails('the LAST gesture is undone first, even when it landed on the other stack', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'w1', index: 0 });   // gesture 1 — bus only

    // gesture 2 — commandManager only (e.g. JoinTool trims the wall). It is the most
    // recent user action, so Ctrl+Z must revert IT.
    let cmUndone = false;
    (globalThis as unknown as Record<string, unknown>).commandManager = {
      canUndo: () => true,
      canRedo: () => false,
      undo: () => { cmUndone = true; },
      redo: () => {},
      dropEntriesForTargets: () => 0,
    };

    performUndo();

    expect(cmUndone).toBe(true);                    // the join is reverted…
    expect(h.legacy.map.has('w1')).toBe(true);      // …and the wall is still there
  });
});

describe('§GATE-G10 I6 — U-1/U-3: suppressed and empty-patch dispatches never reach the ring buffer', () => {
  it('suppressUndo (remote / AI-replay) pushes NOTHING to either stack', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'local', index: 0 });
    await h.bus.executeCommand('wall.create', { id: 'remote', index: 1 }, { suppressUndo: true });

    expect(h.rb.undoCount()).toBe(1);               // only the local gesture
    expect(h.bus.undo.size).toBe(1);
    expect(h.legacy.map.has('remote')).toBe(true);  // …but the element was still created

    performUndo();
    expect(h.legacy.map.has('local')).toBe(false);
    expect(h.legacy.map.has('remote')).toBe(true);  // a remote edit is NOT undoable locally
  });

  it('an empty-patch record does not eat a cursor slot (C03 §4.6 U-3)', async () => {
    const h = boot();
    await h.bus.executeCommand('wall.create', { id: 'w1', index: 0 });
    await h.bus.executeCommand('wall.noop', {});

    expect(h.rb.undoCount()).toBe(1);               // the noop did NOT push

    performUndo();                                   // must land on the create, not a ghost
    expect(h.legacy.map.has('w1')).toBe(false);
  });
});
