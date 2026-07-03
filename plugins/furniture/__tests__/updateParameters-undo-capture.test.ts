// @vitest-environment happy-dom
//
// §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — a 3D-gizmo furniture MOVE / ROTATE must be
// captured on the ring buffer as exactly ONE undoable step whose inverse restores
// the exact pre-move pose and whose forward re-applies it.
//
// ROOT CAUSE this guards (same class as §FIX-WALL-MOVE-UNDO-CAPTURE / L-49):
// `furniture.updateParameters` used to declare `affectedStores: []` and return
// `{ forward: [], inverse: [] }`, so the CommandBus classified every 3D furniture
// move/rotate as an EMPTY-PATCH record and SKIPPED the ring buffer. The move then
// lived ONLY in the legacy commandManager, but the unified performUndo() is
// ring-buffer-FIRST, so any covered element already on the ring was undone instead
// and the furniture "stayed moved". The fix records the pose change on the ring
// buffer when the 3D-gizmo commit opts in via `_recordUndo: true` + `_prev*`.

import { describe, it, expect } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { RingBufferUndoStack, type PatchPair } from '@pryzm/runtime-undo-stack';
import { UpdateFurnitureParametersHandler } from '../src/handlers/UpdateFurnitureParameters.js';

function buildEnv() {
  const ringBuffer = new RingBufferUndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    ringBuffer,
    // furniture.updateParameters declares affectedStores:['furniture'], so the
    // provider MUST expose `furniture` or buildContext() throws (the handler never
    // reads it — the authoritative mutation is the commandManager bridge, skipped
    // here because window.commandManager is undefined in the test env).
    storesProvider: () => ({ furniture: {} }),
  });
  bus.register(UpdateFurnitureParametersHandler as never);
  return { bus, ringBuffer };
}

const PREV_POS = { x: 1, y: 0, z: 1 };
const NEXT_POS = { x: 3, y: 0, z: 5 }; // moved +2x +4z
const PREV_ROT = { x: 0, y: 0, z: 0 };
const NEXT_ROT = { x: 0, y: Math.PI / 2, z: 0 }; // rotated 90° about Y

describe('§FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — furniture.updateParameters records the 3D move/rotate on the ring buffer', () => {
  it('records EXACTLY ONE ring-buffer entry whose inverse restores the pre-move pose and forward re-applies it', async () => {
    const { bus, ringBuffer } = buildEnv();
    const id = 'sofa_L72';

    expect(ringBuffer.size).toBe(0);

    await bus.executeCommand('furniture.updateParameters', {
      id,
      position: NEXT_POS,
      rotation: NEXT_ROT,
      _recordUndo: true,
      _prevPosition: PREV_POS,
      _prevRotation: PREV_ROT,
    });

    // The move/rotate is one undoable step — NOT skipped as an empty-patch record.
    expect(ringBuffer.size).toBe(1);
    expect(ringBuffer.canUndo()).toBe(true);

    const pair = ringBuffer.current() as PatchPair;
    expect(pair).not.toBeNull();
    expect(pair.affectedStores).toEqual(['furniture']);

    // Inverse = UNDO → restores BOTH position and rotation to their pre-move values.
    expect(pair.inverse.ops).toHaveLength(2);
    const invByField = Object.fromEntries(
      pair.inverse.ops.map((op) => [String(op.path).replace(/^.*\//, ''), op]),
    );
    expect(invByField.position!.op).toBe('replace');
    expect(invByField.position!.value).toEqual(PREV_POS);
    expect(invByField.rotation!.value).toEqual(PREV_ROT);
    expect(String(invByField.position!.path)).toContain(id);

    // Forward = REDO → re-applies the moved/rotated pose.
    expect(pair.forward.ops).toHaveLength(2);
    const fwdByField = Object.fromEntries(
      pair.forward.ops.map((op) => [String(op.path).replace(/^.*\//, ''), op]),
    );
    expect(fwdByField.position!.value).toEqual(NEXT_POS);
    expect(fwdByField.rotation!.value).toEqual(NEXT_ROT);
  });

  it('records a rotate-only drag (no position delta) as one invertible step', async () => {
    const { bus, ringBuffer } = buildEnv();

    await bus.executeCommand('furniture.updateParameters', {
      id: 'chair_rotate_only',
      rotation: NEXT_ROT,
      _recordUndo: true,
      _prevRotation: PREV_ROT,
    });

    expect(ringBuffer.size).toBe(1);
    const pair = ringBuffer.current() as PatchPair;
    expect(pair.inverse.ops).toHaveLength(1);
    expect(pair.inverse.ops[0]!.value).toEqual(PREV_ROT);
  });

  it('does NOT touch the ring buffer for callers that do not opt in (property panel / AI unchanged)', async () => {
    const { bus, ringBuffer } = buildEnv();

    await bus.executeCommand('furniture.updateParameters', {
      id: 'sofa_prop_edit',
      position: NEXT_POS,
      rotation: NEXT_ROT,
      // no _recordUndo → previous empty-patch behaviour preserved
    });

    expect(ringBuffer.size).toBe(0);
  });

  it('preserves the empty-patch skip when the pre-move pose is missing even if opted in', async () => {
    const { bus, ringBuffer } = buildEnv();

    await bus.executeCommand('furniture.updateParameters', {
      id: 'sofa_no_prev',
      position: NEXT_POS,
      _recordUndo: true,
      // no _prevPosition → undo has no target → do not record a half-undoable step
    });

    expect(ringBuffer.size).toBe(0);
  });
});
