// @vitest-environment happy-dom
//
// §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — GUARANTEE MATRIX.
//
// The founder's mandate: after a user MOVES / ROTATES an element in the 3D view
// and presses Undo, the change MUST revert — for EVERY element type, no silent
// no-op. This is the same class as L-49 (walls): a transform command that
// declares `affectedStores: []` / returns empty patches is classified by the
// CommandBus as an EMPTY-PATCH record and SKIPPED the ring buffer, so the unified
// (ring-buffer-FIRST) performUndo() reverts some OTHER element and the moved one
// "stays moved".
//
// This matrix asserts that every element type's move/rotate command records
// EXACTLY ONE invertible ring-buffer entry keyed on the element's own store —
// the precondition performUndo() needs to route an inverse patch through
// elementUndoStoreAdapter → window.<x>Store.update() → mesh rebuild.
//
// Coverage:
//   • produceCommand plugin handlers (column/beam/stair/slab/plumbing/structural/
//     furniture move + stair/furniture rotate) — imported REAL handlers.
//   • furniture.updateParameters (the actual 3D-drag command) has its own dedicated
//     suite in plugins/furniture/__tests__/updateParameters-undo-capture.test.ts.
//   • the column.update / beam.update / floor.update commandManager BRIDGES
//     (initBusHandlers.ts) — mechanism reconstructed below (they carry no plugin
//     store, so they emit the PatchPair directly like L-49's wall bridge).

import { describe, it, expect } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type CommandHandler, type Patch } from '@pryzm/plugin-sdk';
import { RingBufferUndoStack, type PatchPair } from '@pryzm/runtime-undo-stack';
// §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — production-wiring regression deps.
import { Store, attachStores } from '@pryzm/stores';
import { dispatchTyped } from '@pryzm/command-bus';

import { MoveColumnHandler } from '@pryzm/plugin-column';
import { MoveBeamHandler } from '@pryzm/plugin-beam';
import { MoveStairHandler, RotateStairHandler } from '@pryzm/plugin-stair';
import { MoveSlabHandler } from '@pryzm/plugin-slab';
import { MovePlumbingHandler } from '@pryzm/plugin-plumbing';
import { MoveStructuralHandler } from '@pryzm/plugin-structural';
import { MoveFurnitureHandler, RotateFurnitureHandler } from '@pryzm/plugin-furniture';

const V = () => ({ x: 2, y: 0, z: 3 });
const DELTA = { x: 1.5, y: 0, z: -2 };

// ── §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — TYPE-LEVEL guard (P5) ─────────
// `dispatchTyped` keys `payload` to CommandRegistry, so a wrong id-key/shape is a
// COMPILE error at the call site — the point of "closing the class" (L-214/L-218/
// L-220). These are compile-time assertions: run `tsc --noEmit` over this file to
// validate them (vitest's esbuild transform strips types, and the repo's root
// tsconfig `include` excludes __tests__, so CI does not currently gate them —
// tracked as P3 residue).
{
  const _typedBus = { executeCommand: (_t: string, _p?: unknown) => Promise.resolve() };
  // Correct payloads COMPILE:
  void (() => dispatchTyped(_typedBus, 'plumbing.moveFixture', { id: 'p1', to: { x: 0, y: 0, z: 0 } }));
  void (() => dispatchTyped(_typedBus, 'floor.update', { floorId: 'f1', updates: {} }));
  // Wrong id-key is a COMPILE error — the exact founder bug (plumbingId/delta vs id/to):
  // @ts-expect-error — 'plumbing.moveFixture' requires { id, to }, not the plugin handler's { plumbingId, delta }
  void (() => dispatchTyped(_typedBus, 'plumbing.moveFixture', { plumbingId: 'p1', delta: { x: 0, y: 0, z: 0 } }));
  // @ts-expect-error — 'floor.update' requires `floorId`, not `id`
  void (() => dispatchTyped(_typedBus, 'floor.update', { id: 'f1', updates: {} }));
}

/** Build a CommandBus + RingBuffer whose storesProvider seeds ONE element under
 *  `storeKey` so the move/rotate handler's canExecute passes and produceCommand
 *  has a target to mutate. */
function buildEnv(storeKey: string, id: string, element: Record<string, unknown>, handler: CommandHandler<unknown>) {
  const ringBuffer = new RingBufferUndoStack({ maxSize: 50 });
  const store: Record<string, unknown> = { [id]: element };
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    ringBuffer,
    storesProvider: () => ({ [storeKey]: store }),
  });
  bus.register(handler as never);
  return { bus, ringBuffer };
}

/** Assert the ring captured EXACTLY ONE invertible entry keyed on `storeKey`. */
function expectInvertibleRingEntry(ringBuffer: RingBufferUndoStack, storeKey: string, id: string) {
  expect(ringBuffer.size).toBe(1);
  expect(ringBuffer.canUndo()).toBe(true);
  const pair = ringBuffer.current() as PatchPair;
  expect(pair).not.toBeNull();
  expect(pair.affectedStores).toEqual([storeKey]);
  // Non-empty in BOTH directions → undo AND redo have something to apply.
  expect(pair.inverse.ops.length).toBeGreaterThan(0);
  expect(pair.forward.ops.length).toBeGreaterThan(0);
  // Every op is store-relative to THIS element (path[0] = id) so the adapter routes
  // it to window.<storeKey>Store.update(id, …).
  for (const op of pair.inverse.ops) expect(String(op.path)).toContain(id);
}

describe('§FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — every element move/rotate is captured on the ring buffer', () => {
  it('column.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('column', 'col1', { origin: V() }, new MoveColumnHandler() as never);
    await bus.executeCommand('column.move', { columnId: 'col1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'column', 'col1');
  });

  it('beam.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('beam', 'bm1', { baseLine: [V(), V()] }, new MoveBeamHandler() as never);
    await bus.executeCommand('beam.move', { beamId: 'bm1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'beam', 'bm1');
  });

  it('stair.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('stair', 'st1', { origin: V(), rotation: 0 }, new MoveStairHandler() as never);
    await bus.executeCommand('stair.move', { stairId: 'st1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'stair', 'st1');
  });

  it('stair.rotate records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('stair', 'st2', { origin: V(), rotation: 0 }, new RotateStairHandler() as never);
    await bus.executeCommand('stair.rotate', { stairId: 'st2', rotation: Math.PI / 2 });
    expectInvertibleRingEntry(ringBuffer, 'stair', 'st2');
  });

  it('slab.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('slab', 'sl1', { boundary: [V(), V(), V()], holes: [] }, new MoveSlabHandler() as never);
    await bus.executeCommand('slab.move', { slabId: 'sl1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'slab', 'sl1');
  });

  it('plumbing.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('plumbing', 'pl1', { origin: V() }, new MovePlumbingHandler() as never);
    await bus.executeCommand('plumbing.move', { plumbingId: 'pl1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'plumbing', 'pl1');
  });

  it('structural.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('structural', 'sr1', { origin: V() }, new MoveStructuralHandler() as never);
    await bus.executeCommand('structural.move', { structuralId: 'sr1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'structural', 'sr1');
  });

  it('furniture.move records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('furniture', 'fn1', { origin: V(), rotation: 0 }, new MoveFurnitureHandler() as never);
    await bus.executeCommand('furniture.move', { furnitureId: 'fn1', delta: DELTA });
    expectInvertibleRingEntry(ringBuffer, 'furniture', 'fn1');
  });

  it('furniture.rotate records an invertible ring entry', async () => {
    const { bus, ringBuffer } = buildEnv('furniture', 'fn2', { origin: V(), rotation: 0 }, new RotateFurnitureHandler() as never);
    await bus.executeCommand('furniture.rotate', { furnitureId: 'fn2', rotation: Math.PI });
    expectInvertibleRingEntry(ringBuffer, 'furniture', 'fn2');
  });
});

// ── column.update / beam.update / floor.update BRIDGE mechanism ──────────────
// These three 3D-drag commands are commandManager BRIDGES (no plugin store), so —
// exactly like L-49's wall bridge and the furniture.updateParameters handler —
// they emit the forward/inverse PatchPair DIRECTLY (the bridge does the
// authoritative mutation via commandManager; the patches drive undo/redo only).
// This suite reconstructs the initBusHandlers.ts bridge contract (§FIX-UNDO-
// CAPTURE-SYSTEMIC) to guard that mechanism: `_movePatchPair` over the union of
// updated fields, gated on `_recordUndo` + a `_prev` snapshot.
describe('§FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — commandManager-bridge move commands emit an invertible PatchPair', () => {
  // Faithful copy of initBusHandlers.ts `_movePatchPair`.
  const movePatchPair = (
    id: string | undefined,
    prev: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined,
  ): { forward: Patch[]; inverse: Patch[] } | null => {
    if (!id || !prev || !next) return null;
    const forward: Patch[] = [];
    const inverse: Patch[] = [];
    for (const field of Object.keys(next)) {
      if (!(field in prev)) continue;
      forward.push({ op: 'replace', path: [id, field], value: next[field] });
      inverse.push({ op: 'replace', path: [id, field], value: prev[field] });
    }
    return forward.length > 0 ? { forward, inverse } : null;
  };

  const makeBridge = (type: string, storeKey: string): CommandHandler<Record<string, unknown>> => ({
    type,
    affectedStores: [storeKey] as never,
    canExecute: () => ({ valid: true }),
    execute: (_ctx: never, cmd: Record<string, unknown>) => {
      const pair = cmd._recordUndo
        ? movePatchPair(cmd.id as string, cmd._prev as Record<string, unknown>, cmd.updates as Record<string, unknown>)
        : null;
      return pair ?? { forward: [], inverse: [] };
    },
  });

  function buildBridgeEnv(handler: CommandHandler<Record<string, unknown>>, storeKey: string) {
    const ringBuffer = new RingBufferUndoStack({ maxSize: 50 });
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 50 }),
      ringBuffer,
      storesProvider: () => ({ [storeKey]: {} }),
    });
    bus.register(handler as never);
    return { bus, ringBuffer };
  }

  it('column.update (move + rotate) records ONE invertible ring entry restoring the pre-move pose', async () => {
    const { bus, ringBuffer } = buildBridgeEnv(makeBridge('column.update', 'column'), 'column');
    await bus.executeCommand('column.update', {
      id: 'col_b',
      updates: { position: { x: 5, y: 0, z: 5 }, rotation: 1 },
      _recordUndo: true,
      _prev: { position: { x: 0, y: 0, z: 0 }, rotation: 0 },
    });
    expect(ringBuffer.size).toBe(1);
    const pair = ringBuffer.current() as PatchPair;
    expect(pair.affectedStores).toEqual(['column']);
    expect(pair.inverse.ops).toHaveLength(2);
    const inv = Object.fromEntries(pair.inverse.ops.map((op) => [String(op.path).replace(/^.*\//, ''), op.value]));
    expect(inv.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(inv.rotation).toBe(0);
  });

  it('beam.update (move) records ONE invertible ring entry', async () => {
    const { bus, ringBuffer } = buildBridgeEnv(makeBridge('beam.update', 'beam'), 'beam');
    await bus.executeCommand('beam.update', {
      id: 'bm_b',
      updates: { startPoint: { x: 1, y: 0, z: 1 }, endPoint: { x: 2, y: 0, z: 2 } },
      _recordUndo: true,
      _prev: { startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 1 } },
    });
    expect(ringBuffer.size).toBe(1);
    expect((ringBuffer.current() as PatchPair).affectedStores).toEqual(['beam']);
  });

  it('floor.update (move) records ONE invertible ring entry', async () => {
    const { bus, ringBuffer } = buildBridgeEnv(makeBridge('floor.update', 'floor'), 'floor');
    await bus.executeCommand('floor.update', {
      id: 'fl_b',
      updates: { boundary: { polygon: [{ x: 1, z: 1 }] } },
      _recordUndo: true,
      _prev: { boundary: { polygon: [{ x: 0, z: 0 }] } },
    });
    expect(ringBuffer.size).toBe(1);
    expect((ringBuffer.current() as PatchPair).affectedStores).toEqual(['floor']);
  });

  it('does NOT record when the drag-end does not opt in (_recordUndo unset)', async () => {
    const { bus, ringBuffer } = buildBridgeEnv(makeBridge('column.update', 'column'), 'column');
    await bus.executeCommand('column.update', { id: 'col_c', updates: { position: { x: 9, y: 0, z: 9 } } });
    expect(ringBuffer.size).toBe(0);
  });
});

// ── §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — PRODUCTION-WIRING regression ──
// The suite above wired NO `attachStores`, so it never reproduced the founder's
// `[TransformDrag] floor.update failed: [Immer] error nr: 18` — in production
// `attachStores(emitter, stores)` re-applies each command's FORWARD patch to the
// plugin store at dispatch time. The floor/column/beam bridges declare
// `affectedStores: ['floor'|'column'|'beam']` (needed so ring-buffer UNDO routes to
// the legacy geometry store) but their plugin DTO store is a DETACHED instance that
// never held the element, so `Store.applyPatch` hit Immer's id-prefixed `replace`
// on an absent id → error 18 ("Cannot apply patch, path doesn't resolve") → the whole
// drag rejected. This suite wires attachStores + a real (empty) plugin Store and
// asserts the drag no longer throws while STILL capturing the ring-buffer undo entry.
describe('§FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — drag bridge tolerates a DETACHED (empty) plugin store', () => {
  const movePatchPair = (
    id: string | undefined,
    prev: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined,
  ): { forward: Patch[]; inverse: Patch[] } | null => {
    if (!id || !prev || !next) return null;
    const forward: Patch[] = [];
    const inverse: Patch[] = [];
    for (const field of Object.keys(next)) {
      if (!(field in prev)) continue;
      forward.push({ op: 'replace', path: [id, field], value: next[field] });
      inverse.push({ op: 'replace', path: [id, field], value: prev[field] });
    }
    return forward.length > 0 ? { forward, inverse } : null;
  };

  // Faithful copy of the initBusHandlers floor bridge: reads cmd.floorId, opts the
  // move onto the ring buffer via _movePatchPair, declares affectedStores ['floor'].
  const floorBridge: CommandHandler<Record<string, unknown>> = {
    type: 'floor.update',
    affectedStores: ['floor'] as never,
    canExecute: (_ctx, cmd) => (cmd.floorId ? { valid: true } : { valid: false, reason: 'floorId is required' }),
    execute: (_ctx, cmd) => {
      const pair = cmd._recordUndo
        ? movePatchPair(cmd.floorId as string, cmd._prev as Record<string, unknown>, cmd.updates as Record<string, unknown>)
        : null;
      return pair ?? { forward: [], inverse: [] };
    },
  };

  it('floor.update no longer throws Immer error 18 when attachStores re-applies to an EMPTY plugin store', async () => {
    const ringBuffer = new RingBufferUndoStack({ maxSize: 50 });
    const emitter = new PatchEmitter();
    // The plugin `floor` store is a real Store<T> and DETACHED (empty) — the floor
    // being dragged lives only in the legacy geometry store, not here.
    const floorStore = new Store<{ id: string }>('floor');
    const detach = attachStores(emitter, { floor: floorStore as unknown as Store<object> });
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter,
      undoStack: new UndoStack({ maxSize: 50 }),
      ringBuffer,
      storesProvider: () => ({ floor: {} }),
    });
    bus.register(floorBridge as never);

    // Before L-220 this rejected with Immer error 18; it must now resolve.
    await expect(
      bus.executeCommand('floor.update', {
        floorId: 'fl_detached',
        updates: { boundary: { polygon: [{ x: 1, z: 1 }] } },
        _recordUndo: true,
        _prev: { boundary: { polygon: [{ x: 0, z: 0 }] } },
      }),
    ).resolves.toBeDefined();

    // The ring-buffer undo entry is STILL captured (undo continues to work).
    expect(ringBuffer.size).toBe(1);
    expect((ringBuffer.current() as PatchPair).affectedStores).toEqual(['floor']);
    detach();
  });
});
