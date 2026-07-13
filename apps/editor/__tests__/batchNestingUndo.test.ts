// @vitest-environment happy-dom
//
// §FIX-NESTED-BATCH-DROPS-GUARDS (L-271) — the NESTING half of gate G10.
//
// WHY THIS FILE EXISTS
// ----------------------------------------------------------------------------
// G10 (`undoRedoAtScale.test.ts`) pins "one gesture = one undo entry" — but only
// for a batch dispatched from an IDLE coordinator. Nothing pinned the invariant
// when `BatchCoordinator.runBatch()` is called RE-ENTRANTLY (the resi/house/office
// generators do it on every run: the console prints
//   "[BatchCoordinator] runBatch called while already batching — nesting not
//    supported. Running fn() without batch guards."
// ). A gate that is green while the invariant is still breakable is a gate that
// does not cover — so this file closes that hole with the REAL CommandBus, the
// REAL RingBufferUndoStack and the REAL `batchCoordinator` singleton.
//
// WHAT IT PROVES — AND WHAT IT REFUTED
// ----------------------------------------------------------------------------
// The L-271 hypothesis was: "nesting drops the guards, therefore one gesture
// fragments into N undo entries". Measured against the real objects, that is
// FALSE, and this file is the proof:
//
//   `CommandBus.executeCommand()` pushes exactly ONE ring-buffer entry PER
//   DISPATCH, unconditionally. It never reads `batchCoordinator`. `runBatch()`
//   never touches the undo stack. **`runBatch` is UNDO-NEUTRAL.**
//
// So the undo-entry count is a function of HOW MANY COMMANDS a gesture dispatches
// — never of whether a batch was open, nested or dropped:
//   • N flat `wall.create` dispatches  → N undo entries (nested or NOT — I-N1/I-N2)
//   • ONE `wall.batch.create` dispatch → ONE undo entry (nested or NOT — I-N3)
//
// The undo guard for a generator is therefore "dispatch ONE batch command", not
// "hold a batch open" (C16 §8.6). The REAL damage nesting does is to the batch
// GUARDS (builder pauses, redetect level set, expected element count, overlay,
// CRDT blackout) — pinned in `packages/core-app-model/src/batch/BatchCoordinator.nesting.test.ts`.
//
// INVARIANTS
//   I-N1  nesting does not CHANGE the undo-entry count vs the same dispatches
//         made from an idle coordinator (undo-neutrality of runBatch).
//   I-N2  N flat creates = N entries — with or without nesting (the honest
//         baseline; this is the shape LightingLayoutExecutor still has).
//   I-N3  ONE `*.batch.create` = ONE entry, AND undoes atomically, EVEN when the
//         runBatch that wraps it is nested inside another runBatch. This is the
//         G10 "one gesture = one undo entry" invariant, now pinned under nesting.
//   I-N4  a nested runBatch leaves the StoreEventBus depth balanced (returns to 0)
//         — no event is stranded in a bracket that never closes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CommandBus,
  RingBufferUndoStack,
  produceCommand,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';
import { batchCoordinator } from '@pryzm/core-app-model/batch';
import { storeEventBus } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';

// ── minimal wall store + handlers (same production shape as G10) ──────────────

interface WallRec { id: string; type: 'wall'; levelId: string; height: number }
type WallsState = Record<string, WallRec>;
type Stores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const l1: { wall: WallsState } = { wall: {} };

class CreateWallHandler implements CommandHandler<{ id: string }, Stores> {
  readonly type = 'wall.create';
  readonly affectedStores = ['wall'] as const;
  canExecute(): ValidationResult { return { valid: true }; }
  execute(ctx: HandlerContext<Stores>, cmd: { id: string }): HandlerResult {
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, d => {
      d[cmd.id] = { id: cmd.id, type: 'wall', levelId: 'L0', height: 3 };
    });
    l1.wall = next;
    return { forward, inverse, nextStates: { wall: next } };
  }
}

/** ONE Immer batch for the whole set → ONE PatchPair → ONE ring entry. */
class CreateWallBatchHandler implements CommandHandler<{ ids: readonly string[] }, Stores> {
  readonly type = 'wall.batch.create';
  readonly affectedStores = ['wall'] as const;
  canExecute(_c: HandlerContext<Stores>, cmd: { ids: readonly string[] }): ValidationResult {
    return cmd.ids.length > 0 ? { valid: true } : { valid: false, reason: 'empty batch' };
  }
  execute(ctx: HandlerContext<Stores>, cmd: { ids: readonly string[] }): HandlerResult {
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, d => {
      for (const id of cmd.ids) d[id] = { id, type: 'wall', levelId: 'L0', height: 3 };
    });
    l1.wall = next;
    return { forward, inverse, nextStates: { wall: next } };
  }
}

function boot(): { bus: CommandBus; rb: RingBufferUndoStack } {
  l1.wall = {};
  const rb = new RingBufferUndoStack({ maxSize: 200 });
  const bus = new CommandBus({
    ringBuffer: rb,
    storesProvider: () => ({ wall: l1.wall }),
    audit: { actorId: 'test', projectId: 'p', clientId: 'c' },
  });
  bus.register(new CreateWallHandler());
  bus.register(new CreateWallBatchHandler());
  return { bus, rb };
}

/** Count ring-buffer entries by draining the undo cursor (non-destructive to the
 *  assertions — each test boots a fresh buffer). */
function ringEntryCount(rb: RingBufferUndoStack): number {
  let n = 0;
  while (rb.current() !== null) { rb.undo(); n++; }
  return n;
}

const OPTS = { levelIds: ['L0'], totalElementCount: 3, skipRedetectRooms: true } as const;

describe('§FIX-NESTED-BATCH-DROPS-GUARDS (L-271) — undo behaviour under nested runBatch', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    batchCoordinator.forceReset();
  });
  afterEach(() => {
    batchCoordinator.forceReset();
    _resetFrameSchedulerForTest();
    vi.restoreAllMocks();
  });

  it('I-N2 — N flat dispatches = N undo entries when the coordinator is IDLE (the baseline)', async () => {
    const { bus, rb } = boot();
    const pending: Promise<unknown>[] = [];
    batchCoordinator.runBatch(() => {
      for (const id of ['w1', 'w2', 'w3']) pending.push(bus.executeCommand('wall.create', { id }));
    }, { ...OPTS });
    await Promise.all(pending);
    expect(ringEntryCount(rb)).toBe(3);
  });

  it('I-N1/I-N2 — NESTING DOES NOT CHANGE THE UNDO-ENTRY COUNT (runBatch is undo-neutral)', async () => {
    const { bus, rb } = boot();
    const pending: Promise<unknown>[] = [];
    // The exact shape the resi generator produces: an executor opens a batch and a
    // command dispatched inside it opens a SECOND one (today: "nesting not supported").
    batchCoordinator.runBatch(() => {
      batchCoordinator.runBatch(() => {
        for (const id of ['w1', 'w2', 'w3']) pending.push(bus.executeCommand('wall.create', { id }));
      }, { levelIds: ['L1'], totalElementCount: 3, skipRedetectRooms: false });
    }, { ...OPTS });
    await Promise.all(pending);
    // Same 3 as the idle baseline — NOT more. The founder's "nesting fragments undo"
    // hypothesis is REFUTED: the undo stack never consults the BatchCoordinator.
    expect(ringEntryCount(rb)).toBe(3);
  });

  it('I-N3 — ONE *.batch.create inside a NESTED runBatch is still exactly ONE undo entry, and undoes atomically', async () => {
    const { bus, rb } = boot();
    let inner: Promise<unknown> | undefined;
    batchCoordinator.runBatch(() => {
      batchCoordinator.runBatch(() => {
        inner = bus.executeCommand('wall.batch.create', { ids: ['a', 'b', 'c', 'd', 'e'] });
      }, { levelIds: ['L1'], totalElementCount: 5, skipRedetectRooms: false });
    }, { ...OPTS });
    await inner;

    expect(Object.keys(l1.wall)).toHaveLength(5);
    // ONE gesture = ONE undo entry, even nested (the G10 invariant, now pinned under nesting).
    const entry = rb.current();
    expect(entry).not.toBeNull();
    expect(entry!.inverse.ops).toHaveLength(5); // atomic: all five reverted by the single entry
    rb.undo();
    expect(rb.current()).toBeNull();            // …and there is no SECOND entry to pop.
  });

  it('I-N4 — a nested runBatch leaves StoreEventBus depth balanced', async () => {
    const { bus } = boot();
    const pending: Promise<unknown>[] = [];
    expect(storeEventBus.batchDepth).toBe(0);
    batchCoordinator.runBatch(() => {
      batchCoordinator.runBatch(() => {
        pending.push(bus.executeCommand('wall.create', { id: 'w1' }));
      }, { levelIds: ['L1'], totalElementCount: 1 });
      // Inside the outer sync phase the bus MUST still be bracketed (events buffered).
      expect(storeEventBus.batchDepth).toBeGreaterThan(0);
    }, { ...OPTS });
    await Promise.all(pending);
    // forceReset() closes the outer async bracket the way a project switch would;
    // the point of this invariant is that nesting never leaves an EXTRA bracket open.
    batchCoordinator.forceReset();
    expect(storeEventBus.batchDepth).toBe(0);
  });
});
