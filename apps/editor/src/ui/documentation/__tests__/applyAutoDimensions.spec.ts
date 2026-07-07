// §FIX-AUTODIM-RENDER-SINK (L-138) — payload-shape specs for the pure
// DimensionString → 'linear-dim' annotation adapter.
//
// The executor `applyAutoDimensions` is impure (live stores / bus / window), but
// the load-bearing mapping — abstract engine `DimensionString[]` → the RENDERED
// `'linear-dim'` AnnotationElement the plan renderer draws — is extracted as a
// pure function. These specs assert the annotation shape the renderer expects
// (`type: 'linear-dim'`, `ownerViewId`, 2 refs, world `modelPoints`, metre offset)
// for a 2-point string AND a multi-station chain (N stations → N-1 segment dims).

import { describe, it, expect } from 'vitest';
import { dimensionStringsToLinearDimAnnotations } from '../applyAutoDimensions';
import { DimensionStringSchema } from '@pryzm/schemas/annotation/dimension';
import type { ElementSnapshotForDim, WallLikeEvaluator } from '@pryzm/geometry-kernel';

// One 6 m wall along +X from the origin; anchors resolve to start (0), center (3), end (6) metres.
function snapshotWithWall(): ElementSnapshotForDim {
  const wall: WallLikeEvaluator = {
    id: 'w1',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 6, y: 0, z: 0 },
    ],
    height: 2.5,
    baseOffset: 0,
  };
  return {
    walls: new Map([['w1', wall]]),
    doors: new Map(),
    windows: new Map(),
    rooms: new Map(),
  };
}

describe('dimensionStringsToLinearDimAnnotations (§FIX-AUTODIM-RENDER-SINK)', () => {
  it('adapts a 2-point linear-element string to ONE linear-dim annotation the plan renderer draws', () => {
    const two = DimensionStringSchema.parse({
      id: 'd1',
      kind: 'linear-element',
      references: [
        { elementId: 'w1', anchor: 'start' },
        { elementId: 'w1', anchor: 'end' },
      ],
      orientation: 'horizontal',
      offsetMm: -500, // SIGNED — engine's per-side outward offset
      viewId: 'plan-view-1',
    });

    const anns = dimensionStringsToLinearDimAnnotations([two], snapshotWithWall(), 'plan-view-1');

    expect(anns).toHaveLength(1);
    const a = anns[0]!;
    expect(a.type).toBe('linear-dim');
    expect(a.ownerViewId).toBe('plan-view-1');
    expect(a.references).toHaveLength(2);
    expect(a.parameters.unit).toBe('mm');
    // World modelPoints in METRES (mm/1000), y = 0 (plan projection ignores y).
    expect(a.geometry2D.modelPoints).toHaveLength(2);
    expect(a.geometry2D.modelPoints[0]).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(a.geometry2D.modelPoints[1]).toMatchObject({ x: 6, y: 0, z: 0 });
    // Signed offset carried through as METRES.
    expect(a.geometry2D.offset).toBeCloseTo(-0.5, 6);
  });

  it('splits an N-station chain string into N-1 consecutive segment dims, each inheriting the signed offset', () => {
    const chain = DimensionStringSchema.parse({
      id: 'd2',
      kind: 'linear-chain',
      references: [
        { elementId: 'w1', anchor: 'start' },  // 0 m
        { elementId: 'w1', anchor: 'center' }, // 3 m
        { elementId: 'w1', anchor: 'end' },    // 6 m
      ],
      orientation: 'horizontal',
      offsetMm: 300,
      viewId: 'plan-view-1',
    });

    const anns = dimensionStringsToLinearDimAnnotations([chain], snapshotWithWall(), 'plan-view-1');

    // 3 stations → 2 segment dims (start→center, center→end).
    expect(anns).toHaveLength(2);
    expect(anns.every((a) => a.type === 'linear-dim' && a.ownerViewId === 'plan-view-1')).toBe(true);

    expect(anns[0]!.geometry2D.modelPoints[0]).toMatchObject({ x: 0, z: 0 });
    expect(anns[0]!.geometry2D.modelPoints[1]).toMatchObject({ x: 3, z: 0 });
    expect(anns[1]!.geometry2D.modelPoints[0]).toMatchObject({ x: 3, z: 0 });
    expect(anns[1]!.geometry2D.modelPoints[1]).toMatchObject({ x: 6, z: 0 });

    for (const a of anns) expect(a.geometry2D.offset).toBeCloseTo(0.3, 6);
  });
});
