// §FIX-DIMENSION-DRIVES-MODEL (L-291b, ADR-122 = OPTION A) + ADR-0123 — the coherence rule,
// executed.
//
//     AN EDITED ANNOTATION WRITES TO THE MODEL. NEVER TO THE DRAWING.
//
// RED-FIRST CHECK ON EVERY ASSERTION (the equidistant-square discipline):
//   • "the dimension reads 3200 after the edit" — an OVERRIDE would pass this too! It is the
//     assertion the REJECTED option satisfies. So it is NOT the guard. The guard is that
//     THE WALL MOVED and the annotation's own record was NOT touched. Asserted below on the
//     MODEL, never on the label.
//   • "an impossible edit does nothing" — a silent swallow passes this. So the guard asserts
//     BOTH halves: the model is untouched AND a reason came back.
//   • "no override field" — asserted as an ABSENCE, so it cannot be reintroduced quietly.

import { describe, it, expect, vi } from 'vitest';
import { makeAnnotationElement, makePointRef } from '@pryzm/plugin-annotations';
import type { StableReference } from '@pryzm/plugin-annotations';
import { resolveDimensionDrive, measuredDistanceM, type DriveWallLike } from '../driveDimension';
import { toTagRecord, applyTagMarkEdit } from '../../property-panel/tagSelectionPanel';

// A dimension measuring 3.0 m along +X between wall_a's end and wall_b's start.
const wallRef = (id: string, sub: string): StableReference => ({
  elementId: id, elementType: 'wall', subElement: sub as never, stableKey: `wall-${id}:${sub}`,
});

function dim(opts: { refs?: StableReference[] } = {}) {
  return makeAnnotationElement(
    'annotation_d1', 'linear-dim', 'v1',
    opts.refs ?? [
      { ...wallRef('wall_a', 'end'), cachedPosition: { x: 0, y: 0, z: 0 } },
      { ...wallRef('wall_b', 'start'), cachedPosition: { x: 3, y: 0, z: 0 } },
    ],
    {
      modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
      offset: 0.5,
      measurementNormal: { x: 1, y: 0, z: 0 },
    },
    { unit: 'mm' },
  );
}

const WALLS: Record<string, DriveWallLike> = {
  wall_a: { id: 'wall_a', baseLine: [{ x: -2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] },
  wall_b: { id: 'wall_b', baseLine: [{ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 5 }] },
  wall_locked: { id: 'wall_locked', locked: true, baseLine: [{ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 5 }] },
};
const getWall = (id: string): DriveWallLike | undefined => WALLS[id];

describe('the measured value is DERIVED, never read from a label', () => {
  it('reads 3.0 m from the geometry', () => {
    expect(measuredDistanceM(dim())).toBeCloseTo(3, 9);
  });
});

describe('WHICH ELEMENT MOVES — a stated rule, not a guess', () => {
  it('moves the element the USER SELECTED, when the dimension references it', () => {
    const r = resolveDimensionDrive(dim(), 3.2, { selectedElementId: 'wall_a', getWall });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wallId).toBe('wall_a');
    // wall_a is the "from" end (index 0): to LENGTHEN the dimension it moves the other way.
    expect(r.deltaM).toBeCloseTo(0.2, 9);
    expect(r.newBaseLine[0].x).toBeCloseTo(-2.2, 9);
    expect(r.newBaseLine[1].x).toBeCloseTo(-0.2, 9);
  });

  it('otherwise moves the SECOND reference (the "to" end), holding the "from" end', () => {
    const r = resolveDimensionDrive(dim(), 3.2, { selectedElementId: null, getWall });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wallId).toBe('wall_b');
    expect(r.refIndex).toBe(1);
    // The "to" end moves +0.2 m along +X: 3.0 → 3.2.
    expect(r.newBaseLine[0].x).toBeCloseTo(3.2, 9);
    expect(r.newBaseLine[1].x).toBeCloseTo(3.2, 9);
  });

  it('is PREDICTABLE — the same input always moves the same wall', () => {
    const a = resolveDimensionDrive(dim(), 3.2, { selectedElementId: null, getWall });
    const b = resolveDimensionDrive(dim(), 3.2, { selectedElementId: null, getWall });
    expect(a).toEqual(b);
  });

  it('a SHORTENING edit moves the wall the other way', () => {
    const r = resolveDimensionDrive(dim(), 2.5, { selectedElementId: null, getWall });
    expect(r.ok && r.newBaseLine[0].x).toBeCloseTo(2.5, 9);
  });
});

describe('AN IMPOSSIBLE EDIT FAILS LOUDLY — and both halves are asserted', () => {
  // A silent swallow would pass "the model is untouched". So every case asserts a REASON too.

  it('a LOCKED wall: no move, and it SAYS it is locked', () => {
    const ann = dim({
      refs: [
        { ...wallRef('wall_a', 'end'), cachedPosition: { x: 0, y: 0, z: 0 } },
        { ...wallRef('wall_locked', 'start'), cachedPosition: { x: 3, y: 0, z: 0 } },
      ],
    });
    const r = resolveDimensionDrive(ann, 3.2, { selectedElementId: 'wall_locked', getWall });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('locked');
    expect(r.message).toMatch(/locked/i);          // the USER is told, not the console
  });

  it('a BAKED (point-ref) dimension: it cannot move anything, and it says why', () => {
    const baked = makeAnnotationElement(
      'annotation_d2', 'linear-dim', 'v1',
      [makePointRef({ x: 0, y: 0, z: 0 } as never), makePointRef({ x: 3, y: 0, z: 0 } as never)],
      { modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }], offset: 0.5, measurementNormal: { x: 1, y: 0, z: 0 } },
      { unit: 'mm' },
    );
    const r = resolveDimensionDrive(baked, 3.2, { selectedElementId: null, getWall });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('not-associative');
    expect(r.message).toMatch(/not linked|re-anchor/i);
  });

  it('a dimension between two OPENINGS: no movable wall, and it says so', () => {
    const ann = dim({
      refs: [
        { elementId: 'door_1', elementType: 'door', subElement: 'param', stableKey: 'k1', cachedPosition: { x: 0, y: 0, z: 0 } },
        { elementId: 'door_2', elementType: 'door', subElement: 'param', stableKey: 'k2', cachedPosition: { x: 3, y: 0, z: 0 } },
      ],
    });
    const r = resolveDimensionDrive(ann, 3.2, { selectedElementId: null, getWall });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('no-movable-reference');
  });

  it('a non-positive value is refused before anything is dispatched', () => {
    for (const bad of [0, -1, NaN]) {
      const r = resolveDimensionDrive(dim(), bad, { selectedElementId: null, getWall });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure).toBe('invalid-value');
    }
  });

  it('NEVER falls back to overriding the text — the rejected option has no back door', () => {
    const r = resolveDimensionDrive(dim(), 3.2, { selectedElementId: null, getWall });
    // The resolution describes a MODEL change and nothing else. There is no field on it
    // through which a label could be written — assert the ABSENCE, so it cannot creep back.
    expect(Object.keys(r).sort()).toEqual(
      ['currentM', 'deltaM', 'newBaseLine', 'ok', 'prevBaseLine', 'refIndex', 'wallId'],
    );
    expect('overrideText' in r).toBe(false);
    expect('label' in r).toBe(false);
  });

  it('the DIMENSION RECORD is never touched by a drive', () => {
    const ann = dim();
    const before = JSON.stringify(ann);
    resolveDimensionDrive(ann, 3.2, { selectedElementId: null, getWall });
    // The drawing is a READOUT. A drive writes the model; it does not write the annotation.
    // (An OVERRIDE implementation would have mutated `parameters.override` right here — which
    // is exactly why "the dimension now reads 3200" is NOT the guard.)
    expect(JSON.stringify(ann)).toBe(before);
  });
});

// ── The TAG half of the same coherence rule (ADR-0123) ──────────────────────

describe('an edited TAG writes element.mark — and therefore the schedule (C28)', () => {
  const tag = makeAnnotationElement(
    'annotation_t1', 'door-tag', 'v1',
    [makePointRef({ x: 4.5, y: 0, z: 0 } as never)],
    { modelPoints: [{ x: 4.5, y: 0, z: 0 }, { x: 4.5, y: 0, z: 1.2 }], offset: 0 },
    { elementId: 'door_1', mark: 'D-01', typeMark: 'Solid Timber', cachedLabel: 'Solid Timber' },
  );

  it('the panel record comes FROM THE RECORD, not from the label', () => {
    const rec = toTagRecord(tag)!;
    expect(rec.targetElementId).toBe('door_1');
    expect(rec.mark).toBe('D-01');
    expect(rec.typeMark).toBe('Solid Timber');
    expect(rec.category).toBe('door');
  });

  it('editing the mark dispatches an ELEMENT write — and does NOT write the tag label', () => {
    const rec = toTagRecord(tag)!;
    const updateElementMark = vi.fn().mockResolvedValue(undefined);
    const before = JSON.stringify(tag);

    return applyTagMarkEdit(rec, 'D-07', { updateElementMark }).then((res) => {
      expect(res.ok).toBe(true);
      expect(updateElementMark).toHaveBeenCalledWith('door_1', 'D-07');
      // THE GUARD: the annotation is untouched. Its label re-derives from the model on the
      // next reconcile. If this ever fails, the drawing has become a second source of truth.
      expect(JSON.stringify(tag)).toBe(before);
    });
  });

  it('a rejected mark edit SURFACES the reason and changes nothing', () => {
    const rec = toTagRecord(tag)!;
    const updateElementMark = vi.fn().mockRejectedValue(new Error('Element is locked'));
    return applyTagMarkEdit(rec, 'D-09', { updateElementMark }).then((res) => {
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/locked/i);
    });
  });

  it('an EMPTY mark is refused — it is the key the schedule joins on', () => {
    const rec = toTagRecord(tag)!;
    const updateElementMark = vi.fn();
    return applyTagMarkEdit(rec, '   ', { updateElementMark }).then((res) => {
      expect(res.ok).toBe(false);
      expect(updateElementMark).not.toHaveBeenCalled();
    });
  });
});
