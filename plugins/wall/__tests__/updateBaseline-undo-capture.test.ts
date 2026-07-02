// @vitest-environment happy-dom
//
// §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — a 3D-gizmo wall MOVE must be captured on
// the ring buffer as exactly ONE undoable step whose inverse restores the exact
// pre-move baseline and whose forward re-applies the move.
//
// ROOT CAUSE this guards: `wall.updateBaseline` used to declare `affectedStores:
// []` and return `{ forward: [], inverse: [] }`, so the CommandBus classified the
// move as an EMPTY-PATCH record and SKIPPED the ring buffer (`skipRingBuffer =
// isEmptyPatchRecord`). The move then lived ONLY in the legacy commandManager, but
// the unified performUndo() is ring-buffer-FIRST, so any covered `wall` entry
// already on the ring was undone instead and the move was never reverted
// ("wall stays moved"). The fix records the baseLine change on the ring buffer
// when the 3D-gizmo commit opts in via `_recordUndo: true`.

import { describe, it, expect } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { RingBufferUndoStack, type PatchPair } from '@pryzm/runtime-undo-stack';
import { UpdateWallBaselineHandler } from '../src/handlers/UpdateWallBaseline.js';

type Pt = { x: number; y: number; z: number };

function buildEnv() {
  const ringBuffer = new RingBufferUndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    ringBuffer,
    // wall.updateBaseline declares affectedStores:['wall'], so the provider MUST
    // expose `wall` or buildContext() throws (the handler never reads it here).
    storesProvider: () => ({ wall: {} }),
  });
  bus.register(UpdateWallBaselineHandler as never);
  return { bus, ringBuffer };
}

const PREV: [Pt, Pt] = [{ x: 0, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }];
const NEXT: [Pt, Pt] = [{ x: 0, y: 3, z: 2 }, { x: 4, y: 3, z: 2 }]; // moved +2 in Z

describe('§FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — wall.updateBaseline records the move on the ring buffer', () => {
  it('records EXACTLY ONE ring-buffer entry whose inverse restores the pre-move baseline and forward re-applies it', async () => {
    const { bus, ringBuffer } = buildEnv();
    const wallId = 'wall_L49_move';

    expect(ringBuffer.size).toBe(0);

    await bus.executeCommand('wall.updateBaseline', {
      wallId,
      newBaseLine: NEXT,
      prevBaseLine: PREV,
      _recordUndo: true, // 3D-gizmo drag-end opts into the unified ring-buffer timeline
    });

    // The move is one undoable step — NOT skipped as an empty-patch record.
    expect(ringBuffer.size).toBe(1);
    expect(ringBuffer.canUndo()).toBe(true);

    const pair = ringBuffer.current() as PatchPair;
    expect(pair).not.toBeNull();
    expect(pair.affectedStores).toEqual(['wall']);

    // Inverse = UNDO → restores the exact PREV baseline via a single replace op.
    expect(pair.inverse.ops).toHaveLength(1);
    const inv = pair.inverse.ops[0]!;
    expect(inv.op).toBe('replace');
    expect(String(inv.path)).toContain(wallId);
    expect(String(inv.path).endsWith('baseLine')).toBe(true);
    expect(inv.value).toEqual(PREV);

    // Forward = REDO → re-applies the moved baseline.
    expect(pair.forward.ops).toHaveLength(1);
    const fwd = pair.forward.ops[0]!;
    expect(fwd.op).toBe('replace');
    expect(fwd.value).toEqual(NEXT);
  });

  it('does NOT touch the ring buffer for callers that do not opt in (plan tools / property panel unchanged)', async () => {
    const { bus, ringBuffer } = buildEnv();

    await bus.executeCommand('wall.updateBaseline', {
      wallId: 'wall_plan_move',
      newBaseLine: NEXT,
      prevBaseLine: PREV,
      // no _recordUndo → previous empty-patch behaviour preserved
    });

    expect(ringBuffer.size).toBe(0);
  });

  it('preserves the empty-patch skip when prevBaseLine is missing even if opted in (nothing half-undoable is recorded)', async () => {
    const { bus, ringBuffer } = buildEnv();

    await bus.executeCommand('wall.updateBaseline', {
      wallId: 'wall_no_prev',
      newBaseLine: NEXT,
      _recordUndo: true,
      // no prevBaseLine → undo has no target → do not record a half-undoable step
    } as never);

    expect(ringBuffer.size).toBe(0);
  });
});
