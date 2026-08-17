// TEMPORARY PROBE — DELETE. Measures whether previewSlabConnectivityWeld reaches
// CascadeWallBaselineCommand.canExecute and what it does there.
import { describe, expect, it } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import {
  SlabStore,
  previewSlabConnectivityWeld,
  traceRegionSketchAtPoint,
  type RegionWallLike,
  type SlabData,
  type SlabSketch,
} from '../src/index';
import { ProjectContext } from '@pryzm/core-app-model';

const LEVEL = 'L0';
let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number]): WallData {
  return {
    id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness: 0.2, baseOffset: 0, openings: [],
    metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}
function makeLevelProvider() {
  const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
  return {
    getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
    getLevels: () => [{ ...level }],
  };
}

describe('probe', () => {
  it('measures', () => {
    const wallStore = new WallStore(
      new ProjectContext(),
      makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();
    Object.assign(globalThis as object, { wallStore });
    wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
    wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
    wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
    wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));
    const rw: RegionWallLike[] = wallStore.getAll()
      .map(w => ({ id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })) }));
    const traced = traceRegionSketchAtPoint(rw, 3, 2)!;
    slabStore.add({
      id: 'slab-loop', type: 'slab', levelId: LEVEL, thickness: 0.2,
      position: { x: 0, y: 0, z: 0 }, polygon: traced.ring, sketch: traced.sketch as SlabSketch,
      ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
    } as unknown as SlabData);

    const r = previewSlabConnectivityWeld({
      slabStore: slabStore as never,
      wallStore: wallStore as never,
      movedWallId: 'w-west',
      newBaseLine: [{ x: 5, y: 0, z: 4 }, { x: 5, y: 0, z: 0 }],
    });
    console.log('PROBE RESULT', JSON.stringify({
      allowed: r.allowed, evaluated: r.evaluated, entries: r.entries.length,
      refusal: r.refusal?.code ?? null,
    }));
    expect(r.evaluated).toBe(true);
  }, 30000);
});
