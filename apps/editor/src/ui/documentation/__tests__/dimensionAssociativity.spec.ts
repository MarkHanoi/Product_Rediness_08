// §FIX-DIM-ASSOCIATIVE-REFERENCES (L-287) — the three guards, at the OUTCOME.
//
//   1. A dimension REFERENCES ELEMENTS, not baked points — so it follows the model.
//   2. MOVE THE WALL and the dimension's value + witness lines follow (proved through the
//      REAL resolver the dependency graph uses, not a mock of it).
//   3. A DRAG CANNOT CHANGE THE VALUE — it moves the line. Structurally: the patch type has
//      no field for a reference.

import { describe, it, expect } from 'vitest';
import { makeAnnotationElement, makePointRef, resolveReferenceToPoint } from '@pryzm/plugin-annotations';
import { toStableReference, toStableReferences } from '../dimensionReferences';
import { planAnnotationDrag, dimOffsetAxis, isMeasuredAnnotation } from '../annotationDragIntent';

// A 10 m wall along +X, 0.2 m thick, with a 1 m door whose LEFT EDGE is at 4 m.
const WALL = {
  id: 'wall_1',
  baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
  thickness: 0.2,
  height: 3,
};
const DOOR = { id: 'door_1', wallId: 'wall_1', offset: 4, width: 1, height: 2.1, sillHeight: 0 };

const stores = {
  wallStore: { getById: (id: string) => (id === 'wall_1' ? WALL : undefined) },
  doorStore: { getById: (id: string) => (id === 'door_1' ? DOOR : undefined) },
};

// ── 1. The reference is an ELEMENT reference ────────────────────────────────

describe('the engine anchor → a live StableReference', () => {
  it('maps wall anchors onto the resolver\'s own sub-element vocabulary', () => {
    expect(toStableReference('wall_1', 'start', 'wall')).toMatchObject({
      elementId: 'wall_1', elementType: 'wall', subElement: 'start',
    });
    expect(toStableReference('wall_1', 'face-outer', 'wall')).toMatchObject({ subElement: 'face:exterior' });
    expect(toStableReference('wall_1', 'centerline', 'wall')).toMatchObject({ subElement: 'wall:centerline' });
  });

  it('maps opening anchors onto the hosted-opening ANCHOR CODE', () => {
    expect(toStableReference('door_1', 'left', 'door')).toMatchObject({ elementType: 'door', index: 0 });
    expect(toStableReference('door_1', 'center', 'door')).toMatchObject({ index: 1 });
    expect(toStableReference('door_1', 'right', 'door')).toMatchObject({ index: 2 });
  });

  it('NEVER GUESSES — an unmappable anchor returns null (the caller falls back and says so)', () => {
    expect(toStableReference('wall_1', 'top', 'wall')).toBeNull();
    expect(toStableReferences([{ elementId: 'ghost', anchor: 'start' }], () => undefined)).toBeNull();
  });

  it('is all-or-nothing: one live end + one baked end would be a hinge, not a dimension', () => {
    const kindOf = (id: string) => (id === 'wall_1' ? 'wall' as const : undefined);
    expect(toStableReferences(
      [{ elementId: 'wall_1', anchor: 'start' }, { elementId: 'unknown', anchor: 'end' }],
      kindOf,
    )).toBeNull();
  });
});

// ── 2. MOVE THE WALL — through the REAL resolver ────────────────────────────

describe('the reference resolves against the LIVE model', () => {
  it('a wall reference follows the wall when the wall moves', () => {
    const ref = toStableReference('wall_1', 'end', 'wall')!;
    expect(resolveReferenceToPoint(ref, stores as never)!.x).toBeCloseTo(10, 9);

    WALL.baseLine[1] = { x: 14, y: 0, z: 0 };   // the user lengthens the wall
    expect(resolveReferenceToPoint(ref, stores as never)!.x).toBeCloseTo(14, 9);
    WALL.baseLine[1] = { x: 10, y: 0, z: 0 };   // restore
  });

  it('an OPENING reference lands on the real jambs — the store offset is the LEFT EDGE', () => {
    // §OPENING-OFFSET-LEFTEDGE-UNIFY: the door spans [4, 5]; its centre is 4.5.
    // The resolver used to read `offset` as the CENTRE, putting 'left' at 3.5 — half a
    // width outside the jamb — and 'center' ON the left jamb. This is that regression.
    const left = resolveReferenceToPoint(toStableReference('door_1', 'left', 'door')!, stores as never)!;
    const centre = resolveReferenceToPoint(toStableReference('door_1', 'center', 'door')!, stores as never)!;
    const right = resolveReferenceToPoint(toStableReference('door_1', 'right', 'door')!, stores as never)!;
    expect(left.x).toBeCloseTo(4.0, 9);
    expect(centre.x).toBeCloseTo(4.5, 9);
    expect(right.x).toBeCloseTo(5.0, 9);
  });

  it('an opening reference follows the DOOR when the door slides along its host wall', () => {
    const ref = toStableReference('door_1', 'center', 'door')!;
    expect(resolveReferenceToPoint(ref, stores as never)!.x).toBeCloseTo(4.5, 9);
    DOOR.offset = 6;                            // the user slides the door
    expect(resolveReferenceToPoint(ref, stores as never)!.x).toBeCloseTo(6.5, 9);
    DOOR.offset = 4;                            // restore
  });

  it('a POINT ref — what the executor used to emit — does NOT follow anything', () => {
    // The bug, stated as a test: this is why every auto-dim in the product was a lie
    // waiting to happen. A point ref resolves to its own cache, forever.
    const baked = makePointRef({ x: 10, y: 0, z: 0 } as never);
    WALL.baseLine[1] = { x: 14, y: 0, z: 0 };
    expect(resolveReferenceToPoint(baked, stores as never)!.x).toBeCloseTo(10, 9);   // stale
    WALL.baseLine[1] = { x: 10, y: 0, z: 0 };
  });
});

// ── 3. A DRAG CANNOT CHANGE THE VALUE ───────────────────────────────────────

function dim(offset = 0.5) {
  return makeAnnotationElement(
    'annotation_d1',
    'linear-dim',
    'v1',
    [
      { ...toStableReference('wall_1', 'start', 'wall')!, cachedPosition: { x: 0, y: 0, z: 0 } },
      { ...toStableReference('wall_1', 'end', 'wall')!, cachedPosition: { x: 10, y: 0, z: 0 } },
    ],
    {
      modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
      offset,
      measurementNormal: { x: 1, y: 0, z: 0 },   // horizontal measure
    },
    { unit: 'mm' },
  );
}

describe('a drag is a PRESENTATION edit — it moves the LINE, never the measurement', () => {
  it('turns a drag into a new OFFSET, and produces NO reference or point change', () => {
    const ann = dim(0.5);
    const patch = planAnnotationDrag(ann, ann.geometry2D, 3 /* dx */, 2 /* dz */)!;

    // The line offsets along leftPerp(+X) = +Z, so only the Z component of the drag counts:
    // "forward and backward", exactly as the founder describes it.
    expect(patch.offset).toBeCloseTo(0.5 + 2, 9);
    // The patch CANNOT express anything else — there is no field for a reference or a
    // measured point. This is the structural guarantee, asserted.
    expect(Object.keys(patch)).toEqual(['offset']);
    expect('references' in patch).toBe(false);
    expect(patch.symbolPoint).toBeUndefined();
  });

  it('dragging ALONG the measured axis does not move the line at all (it is not a translation)', () => {
    const ann = dim(0.5);
    const patch = planAnnotationDrag(ann, ann.geometry2D, 5 /* purely along +X */, 0)!;
    expect(patch.offset).toBeCloseTo(0.5, 9);
  });

  it('the offset axis is the one the RENDERER offsets along (leftPerp of the measurement dir)', () => {
    expect(dimOffsetAxis(dim())).toEqual({ x: -0, z: 1 });
  });

  it('a TAG drag moves the BUBBLE and leaves the leader anchor on the element', () => {
    const tag = makeAnnotationElement(
      'annotation_t1', 'door-tag', 'v1',
      [makePointRef({ x: 4.5, y: 0, z: 0 } as never)],
      { modelPoints: [{ x: 4.5, y: 0, z: 0 }, { x: 4.5, y: 0, z: 1.2 }], offset: 0 },
      { elementId: 'door_1', cachedLabel: 'D1' },
    );
    const patch = planAnnotationDrag(tag, tag.geometry2D, 1, 1)!;
    expect(patch.symbolPoint).toEqual({ x: 5.5, y: 0, z: 2.2 });   // the bubble moved…
    expect(patch.offset).toBeUndefined();                          // …and nothing else did.
    // The ANCHOR (modelPoints[0], the point on the door) is not in the patch at all.
  });

  it('knows which annotations are MEASUREMENTS (their points are a cache, not a position)', () => {
    expect(isMeasuredAnnotation('linear-dim')).toBe(true);
    expect(isMeasuredAnnotation('door-tag')).toBe(false);
  });
});
