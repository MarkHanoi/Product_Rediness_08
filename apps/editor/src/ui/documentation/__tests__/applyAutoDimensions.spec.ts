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
import { dimensionStringsToLinearDimAnnotations, buildAnnotationRingUndoPair, buildEvalSnapshot } from '../applyAutoDimensions';
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

// §FIX-AUTODIM-UNDO-ONE-UNIT (L-162, C11/C24.1 §1.2) — the ring-buffer PatchPair
// that makes an auto-dim SET undoable via the unified ring-first undo path. The
// pair is the load-bearing pure logic; the round-trip below simulates the
// elementUndoStoreAdapter's whole-element add/remove semantics on the 'annotation'
// store so a single undo removes the whole set and redo restores it.
describe('buildAnnotationRingUndoPair (§FIX-AUTODIM-UNDO-ONE-UNIT)', () => {
  const set = [
    { id: 'annotation_A' },
    { id: 'annotation_B' },
    { id: 'annotation_C' },
  ];

  it('routes both sides to the annotation store the plan renderer reads', () => {
    const pair = buildAnnotationRingUndoPair(set);
    expect(pair.affectedStores).toEqual(['annotation']);
  });

  it('FORWARD (redo) adds every element; INVERSE (undo) removes them all in reverse', () => {
    const pair = buildAnnotationRingUndoPair(set);
    expect(pair.forward.ops.map((o) => o.op)).toEqual(['add', 'add', 'add']);
    expect(pair.forward.ops.map((o) => o.path)).toEqual(['/annotation_A', '/annotation_B', '/annotation_C']);
    // Every forward op carries the element as its value so redo re-adds it.
    expect(pair.forward.ops.every((o, i) => o.value === set[i])).toBe(true);
    // Inverse removes in reverse insertion order so the store returns to prior state.
    expect(pair.inverse.ops.map((o) => o.op)).toEqual(['remove', 'remove', 'remove']);
    expect(pair.inverse.ops.map((o) => o.path)).toEqual(['/annotation_C', '/annotation_B', '/annotation_A']);
  });

  it('is ONE undoable unit: applying INVERSE clears the whole set; FORWARD restores it', () => {
    // Minimal whole-element store mirroring the elementUndoStoreAdapter contract
    // (path length 1 → add(value) / remove(id)); ids parsed from the JSON pointer.
    const store = new Map<string, { id: string }>();
    const idOf = (path: string): string => path.slice(1); // '/annotation_A' → 'annotation_A'
    const apply = (ops: readonly { op: string; path: string; value: unknown }[]): void => {
      for (const op of ops) {
        const id = idOf(op.path);
        if (op.op === 'add') store.set(id, op.value as { id: string });
        else if (op.op === 'remove') store.delete(id);
      }
    };

    const pair = buildAnnotationRingUndoPair(set);
    apply(pair.forward.ops);              // creation state (as CreateManyAnnotationsCommand.execute leaves it)
    expect(store.size).toBe(3);

    apply(pair.inverse.ops);             // ONE undo → all dims gone
    expect(store.size).toBe(0);

    apply(pair.forward.ops);             // redo → all dims back
    expect([...store.keys()].sort()).toEqual(['annotation_A', 'annotation_B', 'annotation_C']);
  });

  it('is a no-op-safe empty pair for an empty set', () => {
    const pair = buildAnnotationRingUndoPair([]);
    expect(pair.forward.ops).toHaveLength(0);
    expect(pair.inverse.ops).toHaveLength(0);
    expect(pair.affectedStores).toEqual(['annotation']);
  });
});

// §FIX-AUTODIM-OPENING-EDGE-ORIGIN (L-180, C56 / C15 §2) — the store opening
// `offset` is the LEFT EDGE of the span `[offset, offset+width]`, but the
// geometry-kernel evaluator interprets `DoorLikeEvaluator.offset` as the door
// CENTRE. buildEvalSnapshot must reconcile the two (offset → offset+width/2) so the
// resolved world jambs land on the TRUE left/right edges in the SAME wall frame the
// chain planner used (left = a + u·offset, right = a + u·(offset+width),
// center = a + u·(offset+width/2)) — never shifted by −width/2 off the real jamb.
describe('buildEvalSnapshot opening edge origin (§FIX-AUTODIM-OPENING-EDGE-ORIGIN)', () => {
  // 6 m wall along +X from origin; unit dir u = (1,0), start a = (0,0,0).
  const OFFSET = 2.358; // store LEFT-EDGE offset (from the founder's placement log)
  const WIDTH = 0.926;
  const wallRecord = {
    id: 'w1',
    levelId: 'level-1',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 6, y: 0, z: 0 },
    ] as const,
    thickness: 0.1,
    height: 2.5,
    openings: [
      { elementId: 'door1', type: 'door' as const, offset: OFFSET, width: WIDTH, height: 2.1, sillHeight: 0 },
      // A window with a DIFFERENT known offset — same left-edge convention.
      { elementId: 'win1', type: 'window' as const, offset: 4.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
    ],
  };

  function widthDim(elementId: string): ReturnType<typeof DimensionStringSchema.parse> {
    return DimensionStringSchema.parse({
      id: `wdim-${elementId}`,
      kind: 'linear-element',
      references: [
        { elementId, anchor: 'left' },
        { elementId, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: -500,
      viewId: 'plan-view-1',
    });
  }

  function locationDim(elementId: string): ReturnType<typeof DimensionStringSchema.parse> {
    return DimensionStringSchema.parse({
      id: `ldim-${elementId}`,
      kind: 'linear-element',
      references: [
        { elementId: 'w1', anchor: 'start' }, // run datum = wall start (0 m)
        { elementId, anchor: 'center' },
      ],
      orientation: 'horizontal',
      offsetMm: -500,
      viewId: 'plan-view-1',
    });
  }

  it('DOOR width dim lands on the true LEFT/RIGHT jambs (offset, offset+width)', () => {
    const snap = buildEvalSnapshot([wallRecord], 'level-1');
    const anns = dimensionStringsToLinearDimAnnotations([widthDim('door1')], snap, 'plan-view-1');
    expect(anns).toHaveLength(1);
    const [p, q] = anns[0]!.geometry2D.modelPoints;
    // Left jamb = a + u·offset; right jamb = a + u·(offset+width) — NOT offset±width/2.
    expect(p!.x).toBeCloseTo(OFFSET, 6);
    expect(q!.x).toBeCloseTo(OFFSET + WIDTH, 6);
    // Span equals the true opening width.
    expect(Math.abs(q!.x - p!.x)).toBeCloseTo(WIDTH, 6);
  });

  it('DOOR location dim references the true CENTRE (offset + width/2), not the left edge/origin', () => {
    const snap = buildEvalSnapshot([wallRecord], 'level-1');
    const anns = dimensionStringsToLinearDimAnnotations([locationDim('door1')], snap, 'plan-view-1');
    expect(anns).toHaveLength(1);
    const [datum, centre] = anns[0]!.geometry2D.modelPoints;
    expect(datum!.x).toBeCloseTo(0, 6);          // run datum at wall start
    expect(centre!.x).toBeCloseTo(OFFSET + WIDTH / 2, 6); // true set-out centre
  });

  it('WINDOW (different offset) also lands on true jambs + centre', () => {
    const snap = buildEvalSnapshot([wallRecord], 'level-1');
    const w = dimensionStringsToLinearDimAnnotations([widthDim('win1')], snap, 'plan-view-1');
    const [wp, wq] = w[0]!.geometry2D.modelPoints;
    expect(wp!.x).toBeCloseTo(4.0, 6);
    expect(wq!.x).toBeCloseTo(4.0 + 1.2, 6);
    const l = dimensionStringsToLinearDimAnnotations([locationDim('win1')], snap, 'plan-view-1');
    expect(l[0]!.geometry2D.modelPoints[1]!.x).toBeCloseTo(4.0 + 1.2 / 2, 6);
  });
});
