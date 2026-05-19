// referencePlane command tests (S53 D5).
//
// Coverage:
//   • add → returns id, plane appears in store, undo removes it.
//   • update → patches fields, undo restores prior state.
//   • reorient → atomic origin+normal swap, undo restores ONLY the
//     pair that changed (does not touch name).
//   • remove → removes plane, undo re-adds with the same id.
//   • Each command emits exactly one `pryzm.family.command.<verb>`
//     OTel span (the bus contract).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCommandBus } from '../../src/app/commandBus.js';
import {
  clearSpanSinks,
  installSpanSink,
  type SpanRecord,
} from '../../src/app/otel.js';
import {
  ADD_REFERENCE_PLANE_VERB,
  REMOVE_REFERENCE_PLANE_VERB,
  REORIENT_REFERENCE_PLANE_VERB,
  UPDATE_REFERENCE_PLANE_VERB,
  registerReferencePlaneCommands,
  type AddReferencePlaneArgs,
  type RemoveReferencePlaneArgs,
  type ReorientReferencePlaneArgs,
  type UpdateReferencePlaneArgs,
} from '../../src/commands/referencePlane/index.js';
import {
  createReferencePlaneStore,
  type ReferencePlaneId,
  type ReferencePlaneStore,
} from '../../src/stores/referencePlaneStore.js';

let bus: ReturnType<typeof createCommandBus>;
let store: ReferencePlaneStore;
let spans: SpanRecord[];
let uninstall: (() => void) | null;

beforeEach(() => {
  bus = createCommandBus();
  store = createReferencePlaneStore();
  registerReferencePlaneCommands(bus, { store });
  spans = [];
  uninstall = installSpanSink((r) => {
    spans.push(r);
  });
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  clearSpanSinks();
});

const Z_UP = Object.freeze({ x: 0, y: 0, z: 1 });
const X_RIGHT = Object.freeze({ x: 1, y: 0, z: 0 });

describe('referencePlane.add', () => {
  it('adds a plane and returns its id', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      {
        name: 'Top',
        origin: { x: 0, y: 0, z: 0 },
        normal: Z_UP,
      },
    );
    expect(typeof id).toBe('string');
    const snap = store.get();
    expect(snap.planes).toHaveLength(1);
    expect(snap.byId[id]).toBeDefined();
    expect(snap.byName['Top']).toBeDefined();
  });

  it('emits a pryzm.family.command.referencePlane.add span', async () => {
    await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(ADD_REFERENCE_PLANE_VERB, {
      name: 'Top',
      origin: { x: 0, y: 0, z: 0 },
      normal: Z_UP,
    });
    const matched = spans.filter((s) => s.name === `pryzm.family.command.${ADD_REFERENCE_PLANE_VERB}`);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.status).toBe('ok');
    expect(matched[0]!.attributes['pryzm.family.command.category']).toBe('referencePlane');
  });

  it('undoing the add removes the plane', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
    );
    expect(store.get().planes).toHaveLength(1);
    const ok = await bus.undo();
    expect(ok).toBe(true);
    expect(store.get().planes).toHaveLength(0);
    expect(store.get().byId[id]).toBeUndefined();
  });
});

describe('referencePlane.update', () => {
  it('patches the plane name and undoes back to the original name', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
    );
    await bus.execute<UpdateReferencePlaneArgs, ReferencePlaneId>(UPDATE_REFERENCE_PLANE_VERB, {
      id,
      patch: { name: 'Roof Datum' },
    });
    expect(store.get().byId[id]!.name).toBe('Roof Datum');
    expect(store.get().byName['Top']).toBeUndefined();
    await bus.undo();
    expect(store.get().byId[id]!.name).toBe('Top');
  });

  it('rejects updates targeting unknown ids', async () => {
    await expect(
      bus.execute<UpdateReferencePlaneArgs, ReferencePlaneId>(UPDATE_REFERENCE_PLANE_VERB, {
        id: 'rp-zzz' as ReferencePlaneId,
        patch: { name: 'x' },
      }),
    ).rejects.toThrow(/unknown id/);
  });
});

describe('referencePlane.reorient', () => {
  it('changes origin + normal atomically and leaves the name alone', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
    );
    await bus.execute<ReorientReferencePlaneArgs, ReferencePlaneId>(REORIENT_REFERENCE_PLANE_VERB, {
      id,
      origin: { x: 1, y: 2, z: 3 },
      normal: X_RIGHT,
    });
    const after = store.get().byId[id]!;
    expect(after.name).toBe('Top');
    expect(after.origin).toEqual({ x: 1, y: 2, z: 3 });
    // Normal is normalised by the store; X_RIGHT is already unit.
    expect(after.normal.x).toBeCloseTo(1, 6);
    expect(after.normal.y).toBeCloseTo(0, 6);
    expect(after.normal.z).toBeCloseTo(0, 6);
  });

  it('undoing the reorient restores ONLY origin + normal (not name)', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
    );
    // Update the name in a separate command so the reorient undo
    // window only spans the reorient mutation.
    await bus.execute<UpdateReferencePlaneArgs, ReferencePlaneId>(UPDATE_REFERENCE_PLANE_VERB, {
      id,
      patch: { name: 'Roof Datum' },
    });
    await bus.execute<ReorientReferencePlaneArgs, ReferencePlaneId>(REORIENT_REFERENCE_PLANE_VERB, {
      id,
      origin: { x: 1, y: 2, z: 3 },
      normal: X_RIGHT,
    });
    expect(store.get().byId[id]!.name).toBe('Roof Datum');
    expect(store.get().byId[id]!.origin).toEqual({ x: 1, y: 2, z: 3 });
    await bus.undo();
    const restored = store.get().byId[id]!;
    expect(restored.name).toBe('Roof Datum'); // name preserved
    expect(restored.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(restored.normal.z).toBeCloseTo(1, 6);
  });

  it('emits a pryzm.family.command.referencePlane.reorient span', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
    );
    spans.length = 0;
    await bus.execute<ReorientReferencePlaneArgs, ReferencePlaneId>(REORIENT_REFERENCE_PLANE_VERB, {
      id,
      origin: { x: 1, y: 0, z: 0 },
      normal: X_RIGHT,
    });
    const matched = spans.filter(
      (s) => s.name === `pryzm.family.command.${REORIENT_REFERENCE_PLANE_VERB}`,
    );
    expect(matched).toHaveLength(1);
    expect(matched[0]!.status).toBe('ok');
  });

  it('rejects reorient against an unknown id', async () => {
    await expect(
      bus.execute<ReorientReferencePlaneArgs, ReferencePlaneId>(REORIENT_REFERENCE_PLANE_VERB, {
        id: 'rp-missing' as ReferencePlaneId,
        origin: { x: 0, y: 0, z: 0 },
        normal: Z_UP,
      }),
    ).rejects.toThrow(/unknown id/);
  });
});

describe('referencePlane.remove', () => {
  it('removes a plane and undo re-adds it with the same id', async () => {
    const id = await bus.execute<AddReferencePlaneArgs, ReferencePlaneId>(
      ADD_REFERENCE_PLANE_VERB,
      { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
    );
    await bus.execute<RemoveReferencePlaneArgs, ReferencePlaneId>(REMOVE_REFERENCE_PLANE_VERB, {
      id,
    });
    expect(store.get().planes).toHaveLength(0);
    await bus.undo();
    const restored = store.get().byId[id]!;
    expect(restored).toBeDefined();
    expect(restored.name).toBe('Top');
  });

  it('rejects remove against an unknown id', async () => {
    await expect(
      bus.execute<RemoveReferencePlaneArgs, ReferencePlaneId>(REMOVE_REFERENCE_PLANE_VERB, {
        id: 'rp-missing' as ReferencePlaneId,
      }),
    ).rejects.toThrow(/unknown id/);
  });
});
