// Stores ↔ command-bus integration (S05-T3).
//
// Per the session plan T-S3:
//   "handler patches store → subscriber observes DirtyDiff →
//    second handler patches different store → both diffs visible."
//
// What this proves:
//   • `attachStores(emitter, { cube, marker })` correctly routes
//     `PatchSnapshotEntry.forwardPatches` to the matching Store by
//     `storeKey`.
//   • A handler emits ONE `EventRecord` carrying ONE
//     `PatchSnapshotEntry`; the matching store observes ONE diff with
//     the right partition (added vs updated vs removed).
//   • Two handlers writing to two distinct stores produce two
//     independent diffs — neither store hears the other's patches.
//   • An EventRecord referencing an unknown storeKey is silently
//     skipped by default (the bootstrap-friendly behaviour); the
//     `onUnknownStore` hook fires when provided.
//
// We use minimal in-test handlers (no @pryzm/plugin-toy-cube import)
// so this test depends only on @pryzm/command-bus + @pryzm/stores —
// the smallest possible surface that exercises the integration.

import { describe, expect, it, vi } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  produceCommand,
  UndoStack,
  type CommandHandler,
  type EventRecord,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';
import { attachStores, CubeStore, Store, type DirtyDiff } from '../src/index.js';

// --- Demo "marker" store + DTO --------------------------------------------

interface MarkerDto {
  readonly label: string;
}

class MarkerStore extends Store<MarkerDto> {
  constructor() {
    super('marker');
  }
}

// --- Handlers --------------------------------------------------------------

interface DemoStores extends Record<string, unknown> {
  cube: Record<string, { x: number; y: number; z: number }>;
  marker: Record<string, MarkerDto>;
}

class AddCube implements CommandHandler<{ id: string; x: number; y: number; z: number }, DemoStores> {
  readonly type = 'cube.add';
  readonly affectedStores = ['cube'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute(
    ctx: HandlerContext<DemoStores>,
    cmd: { id: string; x: number; y: number; z: number },
  ): HandlerResult {
    const [next, forward, inverse] = produceCommand<DemoStores['cube']>(ctx.stores.cube, draft => {
      draft[cmd.id] = { x: cmd.x, y: cmd.y, z: cmd.z };
    });
    return { forward, inverse, nextStates: { cube: next } };
  }
}

class AddMarker implements CommandHandler<{ id: string; label: string }, DemoStores> {
  readonly type = 'marker.add';
  readonly affectedStores = ['marker'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute(
    ctx: HandlerContext<DemoStores>,
    cmd: { id: string; label: string },
  ): HandlerResult {
    const [next, forward, inverse] = produceCommand<DemoStores['marker']>(ctx.stores.marker, draft => {
      draft[cmd.id] = { label: cmd.label };
    });
    return { forward, inverse, nextStates: { marker: next } };
  }
}

// --- Harness ---------------------------------------------------------------

function makeHarness() {
  const cube = new CubeStore();
  const marker = new MarkerStore();
  // The bus's storesProvider returns the Record<id, dto> view that
  // handlers' `produceCommand` mutates.  In real bootstrap the L1
  // stores layer materialises this object from store.getState() —
  // here we keep a parallel record and let `attachStores` fan
  // forward patches into the canonical Store<T> instances.
  const recordView: { cube: DemoStores['cube']; marker: DemoStores['marker'] } = {
    cube: {},
    marker: {},
  };
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    audit: { actorId: 'u', projectId: 'p', clientId: 'c' },
    storesProvider: () => recordView,
    emitter,
    undoStack: new UndoStack({ maxSize: 100 }),
  });
  bus.register(new AddCube());
  bus.register(new AddMarker());
  return { cube, marker, bus, emitter, recordView };
}

describe('Stores ↔ command-bus (S05-T3)', () => {
  it('routes per-store patches to the matching Store via attachStores()', async () => {
    const { cube, marker, bus, emitter } = makeHarness();
    const cubeListener = vi.fn();
    const markerListener = vi.fn();
    cube.subscribeDirty(cubeListener);
    marker.subscribeDirty(markerListener);
    const detach = attachStores(emitter, { cube, marker });

    // 1) Cube command — only `cube` observes a diff.
    await bus.executeCommand('cube.add', { id: 'c1', x: 1, y: 2, z: 3 });
    expect(cubeListener).toHaveBeenCalledTimes(1);
    expect(markerListener).not.toHaveBeenCalled();
    const cubeDiff = cubeListener.mock.calls[0]![0] as DirtyDiff;
    expect([...cubeDiff.added]).toEqual(['c1']);
    expect(cube.getState().get('c1')).toEqual({ x: 1, y: 2, z: 3 });

    // 2) Marker command — only `marker` observes the diff.
    await bus.executeCommand('marker.add', { id: 'm1', label: 'origin' });
    expect(cubeListener).toHaveBeenCalledTimes(1);
    expect(markerListener).toHaveBeenCalledTimes(1);
    const markerDiff = markerListener.mock.calls[0]![0] as DirtyDiff;
    expect([...markerDiff.added]).toEqual(['m1']);
    expect(marker.getState().get('m1')).toEqual({ label: 'origin' });

    detach();
    // After detach, no further fan-out.
    await bus.executeCommand('cube.add', { id: 'c2', x: 0, y: 0, z: 0 });
    expect(cubeListener).toHaveBeenCalledTimes(1);
  });

  it('skips unknown storeKey by default; fires onUnknownStore hook when provided', async () => {
    const { cube, bus, emitter } = makeHarness();
    const cubeListener = vi.fn();
    cube.subscribeDirty(cubeListener);
    const onUnknown = vi.fn();
    // Note: NO marker store registered.
    attachStores(emitter, { cube }, { onUnknownStore: onUnknown });

    // marker.add will produce a record with storeKey="marker" — unknown.
    await bus.executeCommand('marker.add', { id: 'm1', label: 'x' });
    expect(cubeListener).not.toHaveBeenCalled();
    expect(onUnknown).toHaveBeenCalledTimes(1);
    const [storeKey, record] = onUnknown.mock.calls[0]!;
    expect(storeKey).toBe('marker');
    expect((record as EventRecord).type).toBe('marker.add');
  });
});
