// STEP 0 EXPERIMENT — does `planHash` cover the PREDICTED ROOM POLYGON?
//
// The safety property under test (ADR-0322 §10, G-REASON-05): an approval binds to
// `planId`+`planHash`+`stateHash`, and any change to what the plan PREDICTS must
// invalidate that approval. Once execution commits the PREDICTED ROOM GEOMETRY
// (SAFE MODE ROOM RESHAPE), the polygon is part of what the plan promises — so two
// plans whose predicted polygons differ MUST have different hashes.
//
// The experiment is deliberately adversarial: it produces two predictions that differ
// in POLYGON while holding AREA (the only room quantity the R5 `metrics` array carries)
// equal. If the hash only covers area, the two hashes collide and the approval is hollow.

import { describe, it, expect } from 'vitest';
import { WallOccupancyStore } from '@pryzm/geometry-wall';
import type { WallData, WallBaseline } from '@pryzm/geometry-wall';
import type { PlanningContext, ReadonlyStoreView } from '@pryzm/command-bus';
import {
  WallMoveConsequencePlanner,
  type WallMoveCommand,
  type RoomGeometryPredictor,
} from '../src/engine/consequence/WallMoveConsequencePlanner';

const occupancy = new WallOccupancyStore();

function viewOf(items: readonly unknown[]): ReadonlyStoreView {
  return {
    getAll: () => items,
    getById: (id) => (items as { id?: string }[]).find((i) => i.id === id) ?? null,
  };
}
function makeContext(stores: Record<string, readonly unknown[]>): PlanningContext {
  return { getStore: (s) => (s in stores ? viewOf(stores[s]!) : undefined) };
}

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
const rooms = [{
  id: 'room-1',
  boundingWallIds: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
  boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }], height: 3 },
  computed: { area: 16 },
}];

const cmd: WallMoveCommand = {
  type: 'wall.move',
  payload: { id: 'wall-1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] as WallBaseline },
};

/**
 * Two predictors. Both report area 12 for room-1 (identical metric transition);
 * they differ ONLY in the predicted POLYGON — an equal-area shear. Everything else
 * the planner reads is byte-identical.
 */
const makePredictor = (poly: readonly { x: number; z: number }[]): RoomGeometryPredictor =>
  () => ({
    anyStructuralLink: true,
    rooms: [{
      roomId: 'room-1', kind: 'determined',
      polygon: poly, area: 12, perimeter: 14, centroid: { x: 2, z: 1.5 },
      boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
      areaBefore: 16, areaDelta: -4,
    }],
  });

const POLY_A = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
// Equal-area (shoelace = 12) parallelogram — a DIFFERENT ring, same area.
const POLY_B = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 5, z: 3 }, { x: 1, z: 3 }];

describe('STEP 0 — planHash coverage of the predicted room polygon', () => {
  it('reports whether two plans differing ONLY in predicted polygon hash differently', async () => {
    const ctx = makeContext({ wall: walls, room: rooms });
    const planA = await new WallMoveConsequencePlanner({
      occupancy, predictRoomGeometry: makePredictor(POLY_A),
    }).plan(cmd, ctx);
    const planB = await new WallMoveConsequencePlanner({
      occupancy, predictRoomGeometry: makePredictor(POLY_B),
    }).plan(cmd, ctx);

    // eslint-disable-next-line no-console
    console.log('STEP0 planA.planHash =', planA.planHash, ' planB.planHash =', planB.planHash,
      ' EQUAL(collision) =', planA.planHash === planB.planHash,
      ' stateHash equal =', planA.stateHash === planB.stateHash,
      ' metrics A =', JSON.stringify(planA.metrics), ' metrics B =', JSON.stringify(planB.metrics));

    // Everything OTHER than the polygon is identical — proving the hash difference is
    // attributable to the polygon and to nothing else.
    expect(planA.stateHash).toBe(planB.stateHash);
    expect(planA.metrics).toEqual(planB.metrics);
    expect(planA.changed).toEqual(planB.changed);
    expect(planA.undetermined).toEqual(planB.undetermined);

    // THE SAFETY PROPERTY.
    expect(planA.planHash).not.toBe(planB.planHash);
  });

  it('carries the predicted polygon as a first-class plan field (what execution commits)', async () => {
    const ctx = makeContext({ wall: walls, room: rooms });
    const plan = await new WallMoveConsequencePlanner({
      occupancy, predictRoomGeometry: makePredictor(POLY_A),
    }).plan(cmd, ctx);
    expect(plan.predictedGeometry).toEqual([{
      elementId: 'room-1', polygon: POLY_A, area: 12, perimeter: 14,
      centroid: { x: 2, z: 1.5 }, boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
    }]);
  });

  it('stays deterministic: same state + same command ⇒ byte-identical plan (G-REASON-02)', async () => {
    const ctx = makeContext({ wall: walls, room: rooms });
    const mk = () => new WallMoveConsequencePlanner({
      occupancy, predictRoomGeometry: makePredictor(POLY_A),
    }).plan(cmd, ctx);
    expect(JSON.stringify(await mk())).toBe(JSON.stringify(await mk()));
  });

  it('omits predictedGeometry entirely when no predictor is composed (no hash churn)', async () => {
    const ctx = makeContext({ wall: walls, room: rooms });
    const plan = await new WallMoveConsequencePlanner({ occupancy }).plan(cmd, ctx);
    expect(plan.predictedGeometry).toBeUndefined();
  });
});
