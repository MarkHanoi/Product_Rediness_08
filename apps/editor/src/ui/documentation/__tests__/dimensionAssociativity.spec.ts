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
import { planAnnotationDrag, dimOffsetAxis, isMeasuredAnnotation, PLAN_FRAME, projectToPlane } from '../annotationDragIntent';
import type { ViewPlaneFrame } from '../annotationDragIntent';

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
    // §FIX-DIM-DRAG-FRAME (L-297) — the axis is now expressed in the VIEW's (H, V) plane.
    // In a plan H = x, V = z, so a horizontal (+X) measure still offsets along +V (= +Z).
    expect(dimOffsetAxis(dim())).toEqual({ h: -0, v: 1 });
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

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-TAG-DRAG-2D (L-291c) — A TAG BUBBLE IS A FREE 2-D PLACEMENT.
//
// The founder: "they only move left or right — it would be great if they would move up and
// down." The RECORD always supported it (`screenOverride` is {x,y}; a symbol point is a full
// world point). The DRAG HANDLER was writing the PLAN axes and leaving world Y hardcoded — so
// in an ELEVATION a vertical drag wrote world Z (the invisible depth axis) and the bubble
// refused to climb.
//
// RED-FIRST: a test that drags HORIZONTALLY passes TODAY — that is the vacuous-guard trap the
// coordinator named. So every assertion below drags DIAGONALLY and asserts BOTH axes move.
// ─────────────────────────────────────────────────────────────────────────────

describe('a tag drags freely in the VIEW\'S plane — both axes, both projections', () => {
  const tag = () => makeAnnotationElement(
    'annotation_t2', 'door-tag', 'v1',
    [makePointRef({ x: 4.5, y: 1.05, z: 0 } as never)],
    {
      modelPoints: [
        { x: 4.5, y: 1.05, z: 0 },     // the leader ANCHOR, on the door
        { x: 4.5, y: 2.80, z: 0 },     // the bubble
      ],
      offset: 0,
    },
    { elementId: 'door_1', cachedLabel: 'D-01', showLeader: true },
  );

  it('PLAN — a DIAGONAL drag moves the bubble on BOTH plan axes (X and Z)', () => {
    const t = tag();
    const patch = planAnnotationDrag(t, t.geometry2D, 2, 3, PLAN_FRAME)!;
    expect(patch.symbolPoint).toEqual({ x: 6.5, y: 2.8, z: 3 });   // x AND z moved
  });

  it('*** ELEVATION — a DIAGONAL drag moves the bubble UP (world Y), not into the depth ***', () => {
    const t = tag();
    const frame = { isVertical: true, hWorldAxis: 'x' as const, hSign: 1 as const };
    const patch = planAnnotationDrag(t, t.geometry2D, 2, 3, frame)!;

    // THE GUARD: the vertical component lands on world Y — the axis the user can SEE.
    expect(patch.symbolPoint!.y).toBeCloseTo(2.8 + 3, 9);
    expect(patch.symbolPoint!.x).toBeCloseTo(4.5 + 2, 9);
    // …and it does NOT land on world Z, which was the bug: the tag slid sideways only, while
    // its "vertical" motion vanished into the depth axis nobody can see in an elevation.
    expect(patch.symbolPoint!.z).toBeCloseTo(0, 9);
  });

  it('ELEVATION on the OTHER horizontal axis — H is world Z, V is still world Y', () => {
    const t = tag();
    const frame = { isVertical: true, hWorldAxis: 'z' as const, hSign: 1 as const };
    const patch = planAnnotationDrag(t, t.geometry2D, 2, 3, frame)!;
    expect(patch.symbolPoint).toEqual({ x: 4.5, y: 5.8, z: 2 });
  });

  it('the LEADER ANCHOR never moves — the drag cannot reach a reference (L-287)', () => {
    const t = tag();
    const frame = { isVertical: true, hWorldAxis: 'x' as const, hSign: 1 as const };
    const patch = planAnnotationDrag(t, t.geometry2D, 2, 3, frame)!;
    // The patch carries ONLY the symbol. modelPoints[0] — the point ON THE DOOR — is not in it,
    // and there is no field through which it could be. The leader simply STRETCHES.
    expect(Object.keys(patch)).toEqual(['symbolPoint']);
    expect(t.geometry2D.modelPoints[0]).toEqual({ x: 4.5, y: 1.05, z: 0 });
  });

  it('a DIMENSION is still 1-D — its line moves perpendicular to what it measures, and nowhere else', () => {
    // The two presentation models are genuinely different, and this is the one that must NOT
    // become free: a dim line that drifts along its own measurement axis is just wrong.
    const d = dim(0.5);
    const patch = planAnnotationDrag(d, d.geometry2D, 5, 2, PLAN_FRAME)!;
    expect(Object.keys(patch)).toEqual(['offset']);
    expect(patch.offset).toBeCloseTo(0.5 + 2, 9);   // only the perpendicular component
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-DIM-DRAG-FRAME (L-297) — A DIMENSION IS 1-D IN THE VIEW'S OWN FRAME, NOT THE PLAN'S.
//
// The founder, on an ELEVATION: "dimensions — they are being moved in the OPPOSITE direction:
// mouse down, the dim goes UP and vice versa." The offset MAGNITUDE was already right (L-291c
// fixed the tag branch's dimensionality); only the FRAME the dim was 1-D ALONG was still
// computed plan-first, so on a mirrored (hSign = -1) façade the vertical drag was multiplied by
// a plan vector's sign and the whole gesture inverted.
//
// THE TEETH — stated plainly so the next author cannot weaken it: the founder's report is an
// INVERSION, so a test that asserts only |offset| CHANGED scores 1.000 on the broken build.
// Every assertion below is DIRECTIONAL and pinned to what the RENDERER does with `offset`
// (`_linearDimViewGeometry`: `side = leftPerp(projectedNormal)`, `dimLine.v = ref.v + side.v *
// offset`). We replicate exactly that projection here, so "drag DOWN ⇒ the drawn line goes
// DOWN" is asserted against the renderer's own maths, not against a restatement of the planner.
// Proven red-first: negating `axis.h`/`axis.v` (or the returned `delta`) in dimOffsetAxis flips
// every "moves DOWN"/"moves UP" assertion in this block, and ONLY this block.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The world-Y (height) at which the RENDERER actually draws the dimension LINE, given an offset.
 * A faithful replica of `PlanViewAnnotationRenderer._linearDimViewGeometry`:
 *   dir  = unit(projectToPlane(measurementNormal))       // the measure direction, IN VIEW H/V
 *   side = leftPerp(dir) = (-dir.v, dir.h)               // sideH = -dir.v, sideV = dir.h
 *   dimLine.v = ref.v + side.v * offset
 * Higher V = higher on screen (world up), so this IS the screen height of the drawn line.
 */
function renderedDimLineV(ann: ReturnType<typeof horizontalElevDim>, frame: ViewPlaneFrame, offset: number): number {
  const [p] = ann.geometry2D.modelPoints!;
  const refV = projectToPlane(p, frame).v;
  const mn = projectToPlane(ann.geometry2D.measurementNormal!, frame);
  const len = Math.hypot(mn.h, mn.v);
  const sideV = mn.h / len;              // = dir.h  (the V component of leftPerp(dir))
  return refV + sideV * offset;
}

// A HORIZONTAL elevation dim, exactly as `elevationHSegmentToAnnotation` bakes one:
// measurementNormal is the view's +H axis in WORLD terms — `(hSign,0,0)` for an X-facing façade —
// and the two model points share a height and differ only in the horizontal world axis.
function horizontalElevDim(hSign: 1 | -1, offset = 0.5) {
  return makeAnnotationElement(
    'annotation_ed1', 'linear-dim', 'v1',
    [makePointRef({ x: 0, y: 3, z: 0 } as never), makePointRef({ x: 4, y: 3, z: 0 } as never)],
    {
      modelPoints: [{ x: 0, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }],
      offset,
      measurementNormal: { x: hSign, y: 0, z: 0 },
    },
    { unit: 'mm' },
  );
}

describe('§FIX-DIM-DRAG-FRAME — a horizontal elevation dim drags in the RIGHT vertical direction', () => {
  // The founder's façade is the mirrored one — hSign = -1 — where the old plan-first axis
  // inverted. We assert the FIX there, and confirm the un-mirrored façade was already right.
  for (const hSign of [1, -1] as const) {
    const frame: ViewPlaneFrame = { isVertical: true, hWorldAxis: 'x', hSign };

    it(`hSign=${hSign}: drag DOWN → the RENDERED line moves DOWN`, () => {
      const d = horizontalElevDim(hSign, 0.5);
      // Drag DOWN in an elevation = world Y decreases ⇒ dV < 0 (screenToWorld reports V = world Y).
      const patch = planAnnotationDrag(d, d.geometry2D, /*dH*/ 0, /*dV*/ -0.4, frame)!;
      expect(Object.keys(patch)).toEqual(['offset']);   // VALUE cannot change: patch is offset-only
      const before = renderedDimLineV(d, frame, d.geometry2D.offset!);
      const after  = renderedDimLineV(d, frame, patch.offset!);
      expect(after).toBeLessThan(before);               // drawn line is LOWER on screen
    });

    it(`hSign=${hSign}: drag UP → the RENDERED line moves UP`, () => {
      const d = horizontalElevDim(hSign, 0.5);
      const patch = planAnnotationDrag(d, d.geometry2D, 0, +0.4, frame)!;
      const before = renderedDimLineV(d, frame, d.geometry2D.offset!);
      const after  = renderedDimLineV(d, frame, patch.offset!);
      expect(after).toBeGreaterThan(before);            // drawn line is HIGHER on screen
    });

    it(`hSign=${hSign}: the drawn displacement EQUALS the drag (1 m down ⇒ 1 m down), never inverted`, () => {
      const d = horizontalElevDim(hSign, 0.5);
      const dV = -1.0;
      const patch = planAnnotationDrag(d, d.geometry2D, 0, dV, frame)!;
      const moved = renderedDimLineV(d, frame, patch.offset!) - renderedDimLineV(d, frame, d.geometry2D.offset!);
      expect(moved).toBeCloseTo(dV, 9);                 // co-moves with the cursor, magnitude AND sign
    });
  }

  it('a horizontal drag does NOT move a horizontal elevation dim (it is perpendicular to it)', () => {
    const d = horizontalElevDim(-1, 0.5);
    const frame: ViewPlaneFrame = { isVertical: true, hWorldAxis: 'x', hSign: -1 };
    const patch = planAnnotationDrag(d, d.geometry2D, /*dH*/ 3, /*dV*/ 0, frame)!;
    expect(patch.offset).toBeCloseTo(0.5, 9);
  });

  it('a VERTICAL elevation dim (measurementNormal = world-UP) is DRAGGABLE — the silent-null bug', () => {
    // measurementNormal = (0,1,0): projects to view (h=0, v=1). The old PLAN-space maths saw
    // x=z=0, fell through to the p→q fallback, found len≈0, and returned null — the dim could
    // not be dragged AT ALL. Frame-aware, it offsets cleanly along the view's H axis.
    const vdim = makeAnnotationElement(
      'annotation_vd1', 'linear-dim', 'v1',
      [makePointRef({ x: 2, y: 0, z: 0 } as never), makePointRef({ x: 2, y: 2.04, z: 0 } as never)],
      {
        modelPoints: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 2.04, z: 0 }],
        offset: 0.5,
        measurementNormal: { x: 0, y: 1, z: 0 },   // WORLD UP — a door-height dim
      },
      { unit: 'mm' },
    );
    const frame: ViewPlaneFrame = { isVertical: true, hWorldAxis: 'x', hSign: 1 };
    expect(dimOffsetAxis(vdim, frame)).not.toBeNull();               // no longer null…
    // …and it responds to a HORIZONTAL drag in the right direction. A vertical measure offsets
    // along leftPerp(up) = -H (renderer: side = leftPerp(dir), sideH = -dir.v = -1), so the
    // DRAWN line's H = ref.h + sideH·offset must co-move with the cursor: drag RIGHT ⇒ line RIGHT.
    const patch = planAnnotationDrag(vdim, vdim.geometry2D, /*dH*/ 0.3, /*dV*/ 0, frame)!;
    expect(Object.keys(patch)).toEqual(['offset']);
    const refH = projectToPlane(vdim.geometry2D.modelPoints![0], frame).h;
    const before = refH + (-1) * vdim.geometry2D.offset!;
    const after  = refH + (-1) * patch.offset!;
    expect(after - before).toBeCloseTo(0.3, 9);                      // line moved +0.3 in H, with the cursor
  });

  it('PLAN is BYTE-IDENTICAL — the regression fence (the founder never complained about plan)', () => {
    // Same drag maths as the pre-L-297 build for a plan dim: horizontal (+X) measure, offset
    // along +Z, only the V(=Z) component of the drag counts.
    const d = dim(0.5);
    const patch = planAnnotationDrag(d, d.geometry2D, 5, 2, PLAN_FRAME)!;
    expect(patch.offset).toBeCloseTo(0.5 + 2, 9);
  });
});
