// @vitest-environment happy-dom
//
// §UNDO-GESTURE-ID — the PLUMBING proof (C03 §4.6 U-10).
//
// `performUndoRedo` now decides "are these two undo entries the same user
// gesture?" by comparing an IDENTITY instead of subtracting two wall-clock
// stamps. That is only an improvement if the identity actually ARRIVES on both
// stacks in production. A predicate that is never satisfied because nothing
// stamps it would be strictly worse than the 250 ms window it replaced: every
// dual dispatch would be misread as two actions, and the user would get a phantom
// second Ctrl+Z. So this file asserts the delivery, not the decision.
//
// It uses the REAL `CommandBus` and the REAL `RingBufferUndoStack`. The one
// double is the legacy CommandManager, which records the `metadata.gestureId` it
// is handed — exactly what `CommandManagerImpl.execute` stores and
// `peekUndoGestureId()` reads back (verified against
// packages/command-registry/src/CommandManagerImpl.ts).
//
// THE TWO SHAPES A GESTURE ARRIVES IN (measured 2026-08-12, see the report):
//   A. HANDLER-INTERNAL — `initBusHandlers` registers 81 bridge handlers whose
//      `fn` calls `commandManager.execute(...)` while the bus dispatch is on the
//      stack. They must inherit the dispatch's id with no per-bridge change.
//   B. TOOL-LEVEL — a tool that dual-dispatches wraps both calls in
//      `withGesture(...)` and both read the same id.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandBus,
  RingBufferUndoStack,
  produceCommand,
  currentGestureId,
  withGesture,
  __resetGestureScopeForTests,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';

interface Wall { id: string; height: number }
type Stores = { wall: Record<string, Wall> };

/** What the legacy CommandManager recorded for each execute() it was handed. */
const cmLog: { label: string; gestureId: string | null }[] = [];

/** Mirrors `initBusHandlers._cmExec`: stamp the ambient gesture onto the metadata
 *  the legacy stack stores, without disturbing what the caller passed. */
function cmExec(label: string, meta?: Record<string, unknown>): void {
  const gestureId = currentGestureId();
  const base = meta ?? { source: 'HUMAN_DIRECT' };
  const options = gestureId !== null && base.gestureId === undefined
    ? { ...base, gestureId }
    : base;
  cmLog.push({ label, gestureId: (options.gestureId as string | undefined) ?? null });
}

/** The L1 bus store (C03 §4.4 row 1), committed the way composeRuntime does. */
const l1: { wall: Record<string, Wall> } = { wall: {} };

function makeBus(ringBuffer: RingBufferUndoStack): CommandBus {
  l1.wall = {};
  const bus = new CommandBus({
    ringBuffer,
    storesProvider: () => ({ wall: l1.wall }),
    audit: { actorId: 'test', projectId: 'p', clientId: 'c' },
  });
  bus.register(bridgeHandler as any);
  return bus;
}

/** A bridge-shaped handler: it produces a real patch AND calls the legacy stack
 *  from inside its own execute — shape A, the 81-handler case. */
const bridgeHandler: CommandHandler<{ id: string }, Stores> = {
  type: 'wall.create',
  affectedStores: ['wall'] as const,
  canExecute: (): ValidationResult => ({ valid: true }),
  execute: (ctx: HandlerContext<Stores>, payload): HandlerResult => {
    cmExec('CreateWallCommand');                  // ← the legacy half, mid-dispatch
    const [next, forward, inverse] = produceCommand<Record<string, Wall>>(ctx.stores.wall, d => {
      d[payload.id] = { id: payload.id, height: 3 };
    });
    l1.wall = next;
    return { forward, inverse, nextStates: { wall: next } };
  },
};

describe('§UNDO-GESTURE-ID — the id reaches BOTH undo stacks', () => {
  beforeEach(() => {
    cmLog.length = 0;
    __resetGestureScopeForTests();
  });

  it('SHAPE A — a legacy command executed inside a bus dispatch inherits that dispatch gesture', async () => {
    const rb = new RingBufferUndoStack();
    const bus = makeBus(rb);

    await bus.executeCommand('wall.create', { id: 'w1' });

    const pair = rb.current();
    expect(pair, 'the dispatch pushed a PatchPair').not.toBeNull();
    expect(pair!.gestureId, 'the ring entry is stamped').toBeTruthy();
    expect(cmLog).toHaveLength(1);
    expect(cmLog[0]!.gestureId, 'the legacy half carries the SAME id — this is the twin relation')
      .toBe(pair!.gestureId);
  });

  it('two SEPARATE dispatches get DIFFERENT ids (a gesture is per interaction, not per session)', async () => {
    const rb = new RingBufferUndoStack();
    const bus = makeBus(rb);

    await bus.executeCommand('wall.create', { id: 'w1' });
    const first = rb.current()!.gestureId;
    await bus.executeCommand('wall.create', { id: 'w2' });
    const second = rb.current()!.gestureId;

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second, 'a second interaction is a second gesture').not.toBe(first);
    expect(cmLog.map(e => e.gestureId)).toEqual([first, second]);
  });

  it('SHAPE B — a tool that wraps both calls in withGesture gets ONE id across them', async () => {
    const rb = new RingBufferUndoStack();
    const bus = makeBus(rb);

    // The `WallTool.createWall` shape: an unawaited bus dispatch followed by a
    // synchronous legacy execute, both inside one declared interaction.
    let declared = '';
    const pending = withGesture((gestureId) => {
      declared = gestureId;
      const p = bus.executeCommand('wall.create', { id: 'w1' });
      cmExec('CreateWallCommand (tool half)');
      return p;
    }, 'wall-draw');
    await pending;

    expect(rb.current()!.gestureId, 'the bus dispatch JOINED the open gesture rather than minting its own')
      .toBe(declared);
    // Two legacy entries here: the bridge's own (shape A) and the tool's, both in
    // the same interaction — which is exactly what "one gesture" means.
    expect(cmLog.every(e => e.gestureId === declared)).toBe(true);
  });

  it('the ambient scope does NOT leak past the dispatch that opened it', async () => {
    const rb = new RingBufferUndoStack();
    const bus = makeBus(rb);

    await bus.executeCommand('wall.create', { id: 'w1' });

    // A legacy command executed OUTSIDE any dispatch must be unlabelled — an
    // unlabelled entry is never adopted into the previous gesture (that adoption
    // is the bug §UNDO-GESTURE-ID exists to kill).
    cmExec('a later, unrelated property edit');
    expect(cmLog.at(-1)!.gestureId).toBeNull();
    expect(currentGestureId()).toBeNull();
  });
});
