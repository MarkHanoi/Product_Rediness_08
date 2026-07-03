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

import { MoveColumnHandler } from '@pryzm/plugin-column';
import { MoveBeamHandler } from '@pryzm/plugin-beam';
import { MoveStairHandler, RotateStairHandler } from '@pryzm/plugin-stair';
import { MoveSlabHandler } from '@pryzm/plugin-slab';
import { MovePlumbingHandler } from '@pryzm/plugin-plumbing';
import { MoveStructuralHandler } from '@pryzm/plugin-structural';
import { MoveFurnitureHandler, RotateFurnitureHandler } from '@pryzm/plugin-furniture';

const V = () => ({ x: 2, y: 0, z: 3 });
const DELTA = { x: 1.5, y: 0, z: -2 };

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
