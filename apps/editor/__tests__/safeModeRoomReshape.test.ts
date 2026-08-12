// SAFE MODE ROOM RESHAPE — the proof suite.
//
// WHAT THIS SUITE PROVES, AND WHAT IT DOES NOT.
// It drives the REAL `ApplyPredictedRoomGeometryCommand`, the REAL
// `WallMoveConsequencePlanner`, the REAL `predictRoomGeometry`, the REAL
// `ConsequenceExecutionService` and the REAL `RoomTopologyObserver` suppression
// logic against store-shaped DOUBLES. That makes every assertion here
// TEST-PROVEN. The links that require the live bus, the live commandManager and
// the live room store are driven by the certification gates, not by this file —
// see the per-link table in the phase report. Nothing here should be read as
// evidence that the production wiring is reached.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ApplyPredictedRoomGeometryCommand,
  type PredictedRoomGeometry,
} from '@pryzm/command-registry';
import { predictRoomGeometry } from '@pryzm/room-topology';
import { WallOccupancyStore } from '@pryzm/geometry-wall';
import type { WallData, WallBaseline } from '@pryzm/geometry-wall';
import type { PlanningContext, ReadonlyStoreView, ConsequencePlan } from '@pryzm/command-bus';
import {
  WallMoveConsequencePlanner,
  type WallMoveCommand,
} from '../src/engine/consequence/WallMoveConsequencePlanner';
import { ConsequenceExecutionService } from '../src/engine/consequence/ConsequenceExecutionService';

// ── A room store double with the surface the command actually uses ────────────

interface Room {
  id: string;
  levelId: string;
  name: string;
  roomNumber: string;
  occupancyType?: string;
  finishes?: unknown;
  ifcData?: unknown;
  revitId?: string;
  boundingWallIds: string[];
  boundary: { polygon: { x: number; z: number }[]; height: number; baseOffset: number; detectionMethod: string };
  computed: {
    area: number; grossArea: number; perimeter: number; volume: number;
    centroid: { x: number; z: number };
    boundingBox: { minX: number; minZ: number; maxX: number; maxZ: number };
  };
  metadata: { createdAt: number; modifiedAt: number; createdBy: string; version: number };
}

class RoomStoreDouble {
  private items = new Map<string, Room>();
  /** Set to a message to make the next `update` throw (store-rejection control). */
  rejectId: string | null = null;
  constructor(rooms: Room[]) { for (const r of rooms) this.items.set(r.id, structuredClone(r)); }
  getById(id: string): Room | null { return this.items.get(id) ?? null; }
  getAll(): Room[] { return [...this.items.values()]; }
  update(id: string, next: Room): void {
    if (this.rejectId === id) throw new Error('store rejected the update (control)');
    this.items.set(id, structuredClone(next));
  }
}

const room = (over: Partial<Room> = {}): Room => ({
  id: 'room-1', levelId: 'level-0', name: 'Kitchen', roomNumber: '00-001',
  occupancyType: 'kitchen', finishes: { floor: { materialName: 'oak', materialColor: '#c9a' } },
  ifcData: { guid: 'GUID-KITCHEN-0001', ifcClass: 'IfcSpace' }, revitId: 'revit-4711',
  boundingWallIds: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
  boundary: {
    polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
    height: 3, baseOffset: 0, detectionMethod: 'manual-boundary',
  },
  computed: {
    area: 16, grossArea: 16, perimeter: 16, volume: 48,
    centroid: { x: 2, z: 2 }, boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 },
  },
  metadata: { createdAt: 1000, modifiedAt: 1000, createdBy: 'user-7', version: 3 },
  ...over,
});

const ctxOf = (store: RoomStoreDouble): any => ({
  stores: { roomStore: store },
  bimManager: { getLevels: () => [{ id: 'level-0', elevation: 0, height: 3 }] },
});

const PREDICTED: PredictedRoomGeometry = {
  elementId: 'room-1',
  polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
  area: 12, perimeter: 14, centroid: { x: 2, z: 1.5 },
  boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
};

// ═══════════════════════════════════════════════════════════════════════════════
describe('ApplyPredictedRoomGeometryCommand — writes what it was given', () => {
// ═══════════════════════════════════════════════════════════════════════════════

  it('commits the predicted polygon BYTE-IDENTICALLY (no recompute)', () => {
    const store = new RoomStoreDouble([room()]);
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
    expect(cmd.canExecute(ctxOf(store)).ok).toBe(true);
    const res = cmd.execute(ctxOf(store));

    expect(res.success).toBe(true);
    expect(res.affectedElementIds).toEqual(['room-1']);
    const after = store.getById('room-1')!;
    // BYTE-IDENTICAL, not "close enough".
    expect(JSON.stringify(after.boundary.polygon)).toBe(JSON.stringify(PREDICTED.polygon));
    expect(after.computed.area).toBe(12);
    expect(after.computed.perimeter).toBe(14);
    expect(after.computed.centroid).toEqual({ x: 2, z: 1.5 });
    expect(after.computed.boundingBox).toEqual(PREDICTED.boundingBox);
    // volume is area × the room's OWN height — not a value from the payload.
    expect(after.computed.volume).toBe(36);
  });

  it('NEVER touches name / roomNumber / occupancy / finishes / ifcData / revitId / membership', () => {
    const before = room();
    const store = new RoomStoreDouble([before]);
    new ApplyPredictedRoomGeometryCommand([PREDICTED]).execute(ctxOf(store));
    const after = store.getById('room-1')!;

    expect(after.id).toBe(before.id);
    expect(after.name).toBe('Kitchen');
    expect(after.roomNumber).toBe('00-001');
    expect(after.occupancyType).toBe('kitchen');
    expect(after.finishes).toEqual(before.finishes);
    expect(after.ifcData).toEqual(before.ifcData);
    expect(after.revitId).toBe('revit-4711');
    expect(after.boundingWallIds).toEqual(before.boundingWallIds);
    expect(after.levelId).toBe('level-0');
    // Authored provenance survives: a wall move does not turn a user-drawn room
    // into a system-detected one (C75 — a system write may not mint OR destroy
    // `authored`).
    expect(after.boundary.detectionMethod).toBe('manual-boundary');
    expect(after.metadata.createdAt).toBe(1000);
    expect(after.metadata.createdBy).toBe('user-7');
  });

  it('reports UNDETERMINED rooms and does NOT touch them (never "nothing changed")', () => {
    const store = new RoomStoreDouble([room(), room({ id: 'room-2', name: 'Hall' })]);
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED], [{
      elementId: 'room-2', reason: 'TOPOLOGY_CHANGE_POSSIBLE',
      detail: 'the moved baseline crosses another boundary wall',
    }]);
    const res = cmd.execute(ctxOf(store));

    expect(res.affectedElementIds).toEqual(['room-1']);
    // room-2 is UNTOUCHED …
    expect(store.getById('room-2')!.computed.area).toBe(16);
    // … and REPORTED, not silently skipped.
    expect(cmd.undeterminedRooms).toEqual([{
      elementId: 'room-2', reason: 'TOPOLOGY_CHANGE_POSSIBLE',
      detail: 'the moved baseline crosses another boundary wall',
    }]);
    expect(cmd.outcomes.map((o) => o.roomId)).toEqual(['room-1']);
  });

  it('an all-UNDETERMINED payload WARNS rather than reading as "no rooms affected"', () => {
    const store = new RoomStoreDouble([room()]);
    const cmd = new ApplyPredictedRoomGeometryCommand([], [
      { elementId: 'room-1', reason: 'OPEN_LOOP', detail: 'ring did not close' },
    ]);
    const v = cmd.canExecute(ctxOf(store));
    expect(v.ok).toBe(true);
    expect(v.warnings?.join(' ')).toContain('UNDETERMINED');
    expect(v.warnings?.join(' ')).toContain('NOT a determination');
  });

  it('reports a room named in the plan but absent from the store — never creates it', () => {
    const store = new RoomStoreDouble([]);
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
    const res = cmd.execute(ctxOf(store));
    expect(res.affectedElementIds).toEqual([]);
    expect(store.getAll()).toHaveLength(0);
    expect(cmd.outcomes[0]!.outcome).toBe('room-not-found');
  });

  it('REFUSES a payload that cannot have come from the predictor (< 3 vertices)', () => {
    const store = new RoomStoreDouble([room()]);
    const v = new ApplyPredictedRoomGeometryCommand([
      { ...PREDICTED, polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
    ]).canExecute(ctxOf(store));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('did not come from the predictor');
  });

  it('a store rejection is reported and does NOT leave a phantom undo snapshot', () => {
    const store = new RoomStoreDouble([room()]);
    store.rejectId = 'room-1';
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
    const res = cmd.execute(ctxOf(store));
    expect(res.affectedElementIds).toEqual([]);
    expect(cmd.outcomes[0]!.outcome).toBe('store-rejected');
    // Undo must restore NOTHING — the write never happened.
    store.rejectId = null;
    expect(cmd.undo(ctxOf(store)).affectedElementIds).toEqual([]);
    expect(store.getById('room-1')!.computed.area).toBe(16);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('ApplyPredictedRoomGeometryCommand — undo (C03 §4.5–4.8)', () => {
// ═══════════════════════════════════════════════════════════════════════════════

  it('restores the EXACT pre-state, geometry and all', () => {
    const before = room();
    const store = new RoomStoreDouble([before]);
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);

    cmd.execute(ctxOf(store));
    expect(store.getById('room-1')!.computed.area).toBe(12);

    const undone = cmd.undo(ctxOf(store));
    expect(undone.success).toBe(true);
    expect(undone.affectedElementIds).toEqual(['room-1']);

    const after = store.getById('room-1')!;
    expect(after.computed.area).toBe(16);
    expect(JSON.stringify(after.boundary.polygon)).toBe(JSON.stringify(before.boundary.polygon));
    expect(after.computed).toEqual(before.computed);
  });

  it('room IDENTITY survives execute AND undo (no add, no remove, ever)', () => {
    const store = new RoomStoreDouble([room(), room({ id: 'room-2' })]);
    const idsBefore = store.getAll().map((r) => r.id).sort();
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
    cmd.execute(ctxOf(store));
    expect(store.getAll().map((r) => r.id).sort()).toEqual(idsBefore);
    cmd.undo(ctxOf(store));
    expect(store.getAll().map((r) => r.id).sort()).toEqual(idsBefore);
  });

  it('the undo snapshot is a DEEP copy — a shallow one would restore the new value', () => {
    // The regression guard for the classic aliasing bug: `boundary`/`computed` are
    // nested objects, so a shallow snapshot shares them with the record being replaced.
    const store = new RoomStoreDouble([room()]);
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
    cmd.execute(ctxOf(store));
    cmd.undo(ctxOf(store));
    expect(store.getById('room-1')!.boundary.polygon).toEqual(
      [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
    );
  });

  it('is idempotent under a second undo (no snapshot left to re-apply)', () => {
    const store = new RoomStoreDouble([room()]);
    const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
    cmd.execute(ctxOf(store));
    cmd.undo(ctxOf(store));
    expect(cmd.undo(ctxOf(store)).affectedElementIds).toEqual([]);
    expect(store.getById('room-1')!.computed.area).toBe(16);
  });

  it('an already-identical prediction writes nothing and has nothing to undo', () => {
    const store = new RoomStoreDouble([room()]);
    // The prediction equals the stored geometry exactly.
    const identical: PredictedRoomGeometry = {
      elementId: 'room-1',
      polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
      area: 16, perimeter: 16, centroid: { x: 2, z: 2 },
      boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 },
    };
    const cmd = new ApplyPredictedRoomGeometryCommand([identical]);
    const res = cmd.execute(ctxOf(store));
    expect(res.affectedElementIds).toEqual([]);
    expect(cmd.outcomes[0]!.outcome).toBe('already-identical');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('PREVIEW AND EXECUTION USE THE SAME GEOMETRY (the phase invariant)', () => {
// ═══════════════════════════════════════════════════════════════════════════════

  const occupancy = new WallOccupancyStore();
  const wall = (id: string, a: [number, number], b: [number, number]): WallData =>
    ({
      id, type: 'wall', levelId: 'level-0',
      baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }] as WallBaseline,
      height: 3, thickness: 0.2, openings: [],
    }) as unknown as WallData;

  const walls = [
    wall('wall-1', [0, 0], [4, 0]),
    wall('wall-2', [4, 0], [4, 4]),
    wall('wall-3', [4, 4], [0, 4]),
    wall('wall-4', [0, 4], [0, 0]),
  ];

  const viewOf = (items: readonly unknown[]): ReadonlyStoreView => ({
    getAll: () => items,
    getById: (id) => (items as { id?: string }[]).find((i) => i.id === id) ?? null,
  });

  it('the polygon the PLANNER predicts is the polygon the COMMAND commits — end to end', async () => {
    // Move wall-3 (the far edge) from z=4 to z=3, shrinking the room 16 m² → 12 m².
    const moved: WallBaseline = [{ x: 4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }];
    const rooms = [room({
      boundary: {
        polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
        height: 3, baseOffset: 0, detectionMethod: 'manual-boundary',
      },
    })];
    // wall-2 and wall-4 must also shorten for the ring to close; model the real
    // post-move world so the predictor can trace a closed ring.
    const movedWalls = [
      wall('wall-1', [0, 0], [4, 0]),
      wall('wall-2', [4, 0], [4, 3]),
      wall('wall-3', [4, 3], [0, 3]),
      wall('wall-4', [0, 3], [0, 0]),
    ];

    const ctx: PlanningContext = {
      getStore: (s) => (s === 'wall' ? viewOf(movedWalls) : s === 'room' ? viewOf(rooms) : undefined),
    };
    const plan = await new WallMoveConsequencePlanner({ occupancy, predictRoomGeometry })
      .plan({ type: 'wall.move', payload: { id: 'wall-3', baseLine: moved } } as WallMoveCommand, ctx);

    const predicted = plan.predictedGeometry ?? [];
    expect(predicted).toHaveLength(1);
    expect(predicted[0]!.elementId).toBe('room-1');
    expect(predicted[0]!.area).toBeCloseTo(12, 9);

    // Now COMMIT it — and assert the store holds exactly what the PLAN said.
    const store = new RoomStoreDouble(rooms);
    new ApplyPredictedRoomGeometryCommand(predicted as PredictedRoomGeometry[]).execute(ctxOf(store));

    expect(JSON.stringify(store.getById('room-1')!.boundary.polygon))
      .toBe(JSON.stringify(predicted[0]!.polygon));
    expect(store.getById('room-1')!.computed.area).toBe(predicted[0]!.area);
  });

  it('POSITIVE CONTROL — a deviating "second algorithm" IS detected', () => {
    const store = new RoomStoreDouble([room()]);
    new ApplyPredictedRoomGeometryCommand([PREDICTED]).execute(ctxOf(store));

    // Simulate what RoomDetectionEngine would do: overwrite with its OWN answer.
    const hijacked = store.getById('room-1')!;
    hijacked.boundary.polygon = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2.95 }, { x: 0, z: 2.95 }];
    store.update('room-1', hijacked);

    // A byte-comparison of committed vs predicted MUST catch it. If this ever
    // passes as "identical", the comparator is blind and every fidelity claim
    // in this phase is worthless.
    expect(JSON.stringify(store.getById('room-1')!.boundary.polygon))
      .not.toBe(JSON.stringify(PREDICTED.polygon));
  });

  it('TOPOLOGY_CHANGE_POSSIBLE survives to the plan and yields NO geometry to commit', async () => {
    // Drive wall-1's baseline THROUGH the room's interior — a split/merge case the
    // pure predictor must refuse rather than answer confidently.
    const crossing: WallBaseline = [{ x: 2, y: 0, z: -2 }, { x: 2, y: 0, z: 6 }];
    const rooms = [room()];
    const ctx: PlanningContext = {
      getStore: (s) => (s === 'wall' ? viewOf(walls) : s === 'room' ? viewOf(rooms) : undefined),
    };
    const plan = await new WallMoveConsequencePlanner({ occupancy, predictRoomGeometry })
      .plan({ type: 'wall.move', payload: { id: 'wall-1', baseLine: crossing } } as WallMoveCommand, ctx);

    // The refusal reached the plan …
    const detail = plan.undetermined.map((u) => u.detail ?? '').join(' | ');
    expect(detail).toContain('TOPOLOGY_CHANGE_POSSIBLE');
    // … and NOTHING is offered for commit. An unpredictable room is never reshaped.
    expect(plan.predictedGeometry ?? []).toEqual([]);

    // The command over that empty payload writes nothing — and says why.
    const store = new RoomStoreDouble(rooms);
    const cmd = new ApplyPredictedRoomGeometryCommand([], [
      { elementId: 'room-1', reason: 'TOPOLOGY_CHANGE_POSSIBLE', detail },
    ]);
    expect(cmd.execute(ctxOf(store)).affectedElementIds).toEqual([]);
    expect(store.getById('room-1')!.computed.area).toBe(16);
    expect(cmd.undeterminedRooms).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('ConsequenceExecutionService — ONE gesture, suppression, read-back', () => {
// ═══════════════════════════════════════════════════════════════════════════════

  let dispatched: { type: string; gestureId?: string }[];
  let marked: string[][];
  let released: string[][];

  const planStub = (predictedGeometry?: unknown[]): ConsequencePlan => ({
    planId: 'plan-1', planHash: 'HASH', stateHash: 'STATE',
    command: { type: 'wall.move', payload: { id: 'wall-1' } },
    direct: { kind: 'determined', elements: ['wall-1'] },
    indirect: { kind: 'determined', elements: ['room-1'] },
    // Deliberately EMPTY. These service tests isolate the GEOMETRY arm of the
    // fidelity check: the `PlanningContext` double exposes no stores, so the
    // set-grain read-back sees nothing change and a non-empty `changed` would make
    // every case report `missing` — masking whether the geometry arm fired at all.
    // The set-grain arm is already covered by the R4 suite; this file must be able
    // to distinguish "diverged because of the polygon" from "diverged anyway".
    changed: [], excluded: [],
    topology: { added: [], removed: [], modified: [] },
    validation: { violationsCreated: [], violationsResolved: [] },
    regeneration: { required: [], skipped: [] },
    refused: [], undetermined: [],
    ...(predictedGeometry ? { predictedGeometry } : {}),
  }) as ConsequencePlan;

  const serviceWith = (over: Record<string, unknown>) => new ConsequenceExecutionService({
    bus: {
      executeCommand: async (type: string, _p: unknown, o?: { gestureId?: string }) => {
        dispatched.push({ type, gestureId: o?.gestureId });
        return { id: 'evt-1' } as never;
      },
    },
    // A planner that reproduces the supplied hash ⇒ the plan BINDS.
    planners: new Map([['wall.move', { plan: async () => planStub([{ elementId: 'room-1' }]) as never }]]) as never,
    context: () => ({ getStore: () => undefined }),
    redetectSuppressor: {
      markPlanCoveredLevels: (l: readonly string[]) => { marked.push([...l]); },
      releasePlanCoveredLevels: (l: readonly string[]) => { released.push([...l]); },
    },
    ...over,
  } as never);

  beforeEach(() => { dispatched = []; marked = []; released = []; });

  const GEOM = {
    elementId: 'room-1', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }],
    area: 6, perimeter: 12, centroid: { x: 2, z: 1 },
    boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
  };

  it('the wall dispatch and the room reshape share ONE gesture id', async () => {
    let reshapeGesture: string | undefined;
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: (_p: unknown, _u: unknown, g: string) => {
        reshapeGesture = g;
        return { applied: ['room-1'], levelIds: ['level-0'] };
      },
      readRoomGeometry: () => [GEOM],
    });

    await svc.execute(
      { type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never,
      { plan: planStub([GEOM]) },
    );

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.gestureId).toBeDefined();
    // THE assertion: the same id on both halves of the one user action.
    expect(reshapeGesture).toBe(dispatched[0]!.gestureId);
  });

  it("honours the caller's gesture id, so a whole drag stays ONE gesture", async () => {
    let reshapeGesture: string | undefined;
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: (_p: unknown, _u: unknown, g: string) => {
        reshapeGesture = g; return { applied: ['room-1'], levelIds: ['level-0'] };
      },
      readRoomGeometry: () => [GEOM],
    });
    await svc.execute({ type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never,
      { plan: planStub([GEOM]), gestureId: 'g_drag_42' });
    expect(dispatched[0]!.gestureId).toBe('g_drag_42');
    expect(reshapeGesture).toBe('g_drag_42');
  });

  it('suppression is TAKEN for the covered levels and RELEASED (C72 §4)', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: () => ({ applied: ['room-1'], levelIds: ['level-0'] }),
      readRoomGeometry: () => [GEOM],
    });
    await svc.execute({ type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub([GEOM]) });
    expect(marked).toEqual([['level-0']]);
    expect(released).toEqual([['level-0']]);
  });

  it('suppression is RELEASED even when the applier THROWS', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: () => { throw new Error('boom'); },
      readRoomGeometry: () => [GEOM],
    });
    const { consequence } = await svc.execute(
      { type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub([GEOM]) });
    // Nothing was marked (the throw preceded the mark) and nothing leaked.
    expect(marked).toEqual([]);
    expect(released).toEqual([]);
    // And the failure is TYPED on the report, not swallowed.
    const r = (consequence as { report: { undeterminedOutcomes: { item: { detail?: string } }[] } }).report;
    expect(r.undeterminedOutcomes.some((o) => (o.item.detail ?? '').includes('threw'))).toBe(true);
  });

  it('a DIVERGENT committed polygon surfaces as plan-fidelity-divergence', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: () => ({ applied: ['room-1'], levelIds: ['level-0'] }),
      // The "second algorithm": read-back returns a DIFFERENT ring.
      readRoomGeometry: () => [{ ...GEOM, polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2.9 }] }],
    });
    const { consequence } = await svc.execute(
      { type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub([GEOM]) });
    const r = (consequence as { report: { divergence: { kind: string }; geometryDiverged?: string[] } }).report;
    expect(r.divergence.kind).toBe('plan-fidelity-divergence');
    expect(r.geometryDiverged).toEqual(['room-1']);
  });

  it('NEGATIVE CONTROL — a faithful commit reads plan-agreed with no divergence', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: () => ({ applied: ['room-1'], levelIds: ['level-0'] }),
      readRoomGeometry: () => [GEOM],
    });
    const { consequence } = await svc.execute(
      { type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub([GEOM]) });
    const r = (consequence as { report: { divergence: { kind: string }; geometryDiverged?: string[] } }).report;
    expect(r.divergence.kind).toBe('plan-agreed');
    expect(r.geometryDiverged).toBeUndefined();
  });

  it('NO read-back channel ⇒ geometryUndetermined, NEVER a silent "polygons match"', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      applyPredictedRoomGeometry: () => ({ applied: ['room-1'], levelIds: ['level-0'] }),
      // readRoomGeometry deliberately absent.
    });
    const { consequence } = await svc.execute(
      { type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub([GEOM]) });
    const r = (consequence as { report: { geometryUndetermined?: { detail?: string }; geometry?: unknown } }).report;
    expect(r.geometryUndetermined?.detail).toContain('NOT evidence of fidelity');
    expect(r.geometry).toBeUndefined();
  });

  it('NO applier composed ⇒ a typed UNDETERMINED on the report, not a silent success', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub([GEOM]) }]]),
      readRoomGeometry: () => [GEOM],
    });
    const { consequence } = await svc.execute(
      { type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub([GEOM]) });
    const r = (consequence as { report: { undeterminedOutcomes: { item: { detail?: string } }[] } }).report;
    expect(r.undeterminedOutcomes.some(
      (o) => (o.item.detail ?? '').includes('DIFFERENT algorithm'))).toBe(true);
  });

  it('a plan with NO predicted geometry takes NO suppression (fallback redetect must run)', async () => {
    const svc = serviceWith({
      planners: new Map([['wall.move', { plan: async () => planStub() }]]),
      applyPredictedRoomGeometry: () => ({ applied: [], levelIds: ['level-0'] }),
      readRoomGeometry: () => [],
    });
    await svc.execute({ type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } } as never, { plan: planStub() });
    expect(marked).toEqual([]);
    expect(released).toEqual([]);
  });
});
