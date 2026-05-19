// End-to-end smoke test of the L2 pipeline using the toy-cube plugin.
//
// Covers S02 exit criterion #1:
//   "MoveCubeCommand executes; patches correct on undo;
//    round-trip via JSON OK." (spec line 343)

import { describe, expect, it } from 'vitest';
import { applyPatches } from 'immer';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '../src/index.js';
import {
  MoveCubeCommand,
  type CubesState,
} from '../../../plugins/toy-cube/src/index.js';

function freshBus() {
  let cubeState: CubesState = { c1: { x: 0, y: 0, z: 0 } };
  const bus = new CommandBus({
    audit: { actorId: 'u-1', projectId: 'p-1', clientId: 'tab-A' },
    storesProvider: () => ({ cube: cubeState }),
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 100 }),
  });
  bus.register(new MoveCubeCommand());
  return {
    bus,
    state: () => cubeState,
    setState: (s: CubesState) => {
      cubeState = s;
    },
  };
}

describe('MoveCubeCommand — full L2 pipeline', () => {
  it('produces forward + inverse patches that move the cube', async () => {
    const { bus, state, setState } = freshBus();
    const before = state();
    const evt = await bus.executeCommand('cube.move', {
      id: 'c1',
      dx: 5,
      dy: 0,
      dz: -2,
    });

    // Apply forward → expected next state.
    const next = applyPatches(before, [...evt.forward]);
    expect(next['c1']).toEqual({ x: 5, y: 0, z: -2 });
    setState(next as CubesState);

    // Apply inverse → original state restored.
    const restored = applyPatches(next, [...evt.inverse]);
    expect(restored['c1']).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('attaches ULID + audit metadata to every event', async () => {
    const { bus } = freshBus();
    const evt = await bus.executeCommand('cube.move', { id: 'c1', dx: 1, dy: 1, dz: 1 });
    expect(evt.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(evt.audit.actorId).toBe('u-1');
    expect(evt.audit.projectId).toBe('p-1');
    expect(evt.audit.clientId).toBe('tab-A');
    expect(new Date(evt.audit.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('groups patches per affected store as PatchSnapshotEntry[]', async () => {
    const { bus } = freshBus();
    const evt = await bus.executeCommand('cube.move', { id: 'c1', dx: 2, dy: 0, dz: 0 });
    expect(evt.patches).toHaveLength(1);
    expect(evt.patches[0]!.storeKey).toBe('cube');
    expect(evt.patches[0]!.forwardPatches).toEqual(evt.forward);
    expect(evt.patches[0]!.inversePatches).toEqual(evt.inverse);
    expect(evt.patches[0]!.capturedAt).toBe(evt.audit.timestamp);
  });

  it('emits JSON bytes that round-trip through PatchEmitter.decode (S02 exit criterion #1)', async () => {
    const { bus } = freshBus();
    let captured: Uint8Array | null = null;
    bus.patches.subscribe(bytes => {
      captured = bytes;
    });
    const evt = await bus.executeCommand('cube.move', { id: 'c1', dx: 3, dy: 0, dz: 0 });
    expect(captured).toBeInstanceOf(Uint8Array);
    expect(captured!.byteLength).toBeGreaterThan(0);
    // MessagePack (ADR-004): first byte is a fixmap marker, NOT JSON `{` (0x7b).
    expect(captured![0]).not.toBe(0x7b);
    const decoded = PatchEmitter.decode(captured!) as EventRecord;
    expect(decoded.id).toBe(evt.id);
    expect(decoded.type).toBe('cube.move');
    expect(decoded.forward).toEqual(evt.forward);
    expect(decoded.inverse).toEqual(evt.inverse);
    expect(decoded.audit).toEqual(evt.audit);
    expect(decoded.patches).toEqual(evt.patches);
  });

  it('records the event on the UndoStack — undo→redo restores state', async () => {
    const { bus, state, setState } = freshBus();
    const evt = await bus.executeCommand('cube.move', { id: 'c1', dx: 4, dy: 0, dz: 0 });
    setState(applyPatches(state(), [...evt.forward]) as CubesState);

    expect(bus.undo.size).toBe(1);
    const undone = bus.undo.undo();
    expect(undone?.id).toBe(evt.id);
    setState(applyPatches(state(), [...undone!.inverse]) as CubesState);
    expect(state()['c1']).toEqual({ x: 0, y: 0, z: 0 });

    const redone = bus.undo.redo();
    expect(redone?.id).toBe(evt.id);
    setState(applyPatches(state(), [...redone!.forward]) as CubesState);
    expect(state()['c1']).toEqual({ x: 4, y: 0, z: 0 });
  });

  it('throws on unknown command type', async () => {
    const { bus } = freshBus();
    await expect(bus.executeCommand('cube.fly', { id: 'c1' })).rejects.toThrow(
      /no handler registered/,
    );
  });

  it('canExecute rejects non-finite deltas without touching the undo stack', async () => {
    const { bus } = freshBus();
    await expect(
      bus.executeCommand('cube.move', { id: 'c1', dx: NaN, dy: 0, dz: 0 }),
    ).rejects.toThrow(/canExecute rejected/);
    expect(bus.undo.size).toBe(0);
  });
});
