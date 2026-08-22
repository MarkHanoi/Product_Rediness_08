// §FEAT-BALCONY-COMPOUND (L-5600) — the assembly, and the ONE-POLYGON property.
//
// ⭐ WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: that a dimension equals the
// documented default. `poolReachableThroughComposedRuntime.test.ts` records why, and
// the reasoning is adopted verbatim — such an assertion goes RED the day someone
// deliberately changes a default (not a defect) and stays GREEN if the resolution
// chain silently ignores an explicit override (very much one). So the dimensions are
// passed EXPLICITLY below and the assembly is asserted to HONOUR them, plus separate
// cases pin the geometric RELATIONSHIPS that must hold for ANY dimensions at all.
//
// The founder's 1.0 / 0.5 / 1.0 defaults ARE pinned — but in `BalconyDimensions.test.ts`,
// where the subject is the DEFAULT, not the assembly.

import { describe, expect, it } from 'vitest';
import { Balcony } from '@pryzm/schemas';
import {
  balconyRectangle,
  buildBalconyAssembly,
  resolveFreeEdges,
  type BalconyMemberIds,
  type HostWallSegment,
} from '../src/index.js';

const HOST: HostWallSegment = { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } };

const SLAB_ID = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FLOOR_ID = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const RAIL_IDS = [
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB2',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB3',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB4',
];

/** A balcony record with EXPLICIT dimensions — never the defaults. See the header. */
function makeBalcony(overrides: Record<string, unknown> = {}) {
  const boundary = balconyRectangle(HOST, 2, 1.6, 0.9, { x: 3, z: 9 });
  return Balcony.parse({
    id: 'balcony_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    levelId: 'level-1',
    hostWallId: 'wall_01ARZ3NDEKTSV4RRFFQ69G5FAW',
    hostOffset: 2,
    boundary,
    width: 1.6,
    projection: 0.9,
    railingHeight: 1.15,
    slabThickness: 0.24,
    finishThickness: 0.03,
    ...overrides,
  });
}

function idsFor(count: number): BalconyMemberIds {
  return { slabId: SLAB_ID, floorId: FLOOR_ID, railingIds: RAIL_IDS.slice(0, count) };
}

describe('buildBalconyAssembly — three members from ONE polygon', () => {
  it('A-1: emits exactly a slab, a finish and one railing per FREE edge', () => {
    const b = makeBalcony();
    const asm = buildBalconyAssembly(b, idsFor(3), { hostSegment: HOST });

    expect(asm.slab.type).toBe('slab');
    expect(asm.finish.type).toBe('floor');
    expect(asm.railings).toHaveLength(3);
    expect(asm.railings.every((r) => r.type === 'handrail')).toBe(true);
    expect(asm.freeEdges).toHaveLength(3);
  });

  it('A-2: ⭐ ONE POLYGON — slab and finish share the boundary VALUE, not a copy of it', () => {
    // The founder: "the floor finish and railings should adapt". This is that
    // requirement expressed as a property: there is no second polygon that could be
    // stale, because both outlines are recomputed from `balcony.boundary`.
    const b = makeBalcony();
    const asm = buildBalconyAssembly(b, idsFor(3), { hostSegment: HOST });

    expect(asm.slab.boundary).toEqual(asm.finish.boundary);
    expect(asm.slab.boundary.map((p) => [p.x, p.z])).toEqual(b.boundary.map((p) => [p.x, p.z]));
  });

  it('A-3: ⭐ RESHAPE the balcony and all three members follow — including the rail COUNT', () => {
    // The whole "edit profile" requirement, at the layer where it is decidable.
    // A five-sided balcony has FOUR free edges, so it has FOUR rails, not three.
    const pentagon = [
      { x: 2, y: 0, z: 0 },
      { x: 3.6, y: 0, z: 0 },
      { x: 3.6, y: 0, z: 0.9 },
      { x: 2.8, y: 0, z: 1.4 },
      { x: 2, y: 0, z: 0.9 },
    ];
    const b = makeBalcony({ boundary: pentagon });
    const free = resolveFreeEdges(b.boundary, HOST);
    expect(free).toHaveLength(4);

    const asm = buildBalconyAssembly(
      b,
      { slabId: SLAB_ID, floorId: FLOOR_ID, railingIds: [...RAIL_IDS, 'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB5'] },
      { hostSegment: HOST },
    );
    expect(asm.slab.boundary).toHaveLength(5);
    expect(asm.finish.boundary).toHaveLength(5);
    expect(asm.railings).toHaveLength(4);
    // ...and every rail runs along a real edge of the NEW outline.
    for (const r of asm.railings) {
      const a = { x: r.path[0]!.x, z: r.path[0]!.z };
      const c = { x: r.path[1]!.x, z: r.path[1]!.z };
      const onRing = free.some(
        (e) =>
          Math.hypot(e.a.x - a.x, e.a.z - a.z) < 1e-9 && Math.hypot(e.b.x - c.x, e.b.z - c.z) < 1e-9,
      );
      expect(onRing, `rail ${r.id} lies on a free edge of the new outline`).toBe(true);
    }
  });

  it('A-4: REFUSES a stale railing-id count rather than leaving an edge unguarded', () => {
    // The stale-count failure a profile edit produces. Building the shorter of the
    // two would silently omit a guard from a drop, so it fails at the boundary,
    // before a store is touched.
    const b = makeBalcony();
    expect(() => buildBalconyAssembly(b, idsFor(2), { hostSegment: HOST })).toThrow(
      /expected 3 railing ids/i,
    );
  });

  it('A-5: the vertical stack is slab-top-at-datum, FFL one finish up, rail on the FFL', () => {
    const b = makeBalcony();
    const asm = buildBalconyAssembly(b, idsFor(3), { hostSegment: HOST });
    const datumY = b.boundary[0]!.y;

    // Slab TOP on the level datum, body downward (the slab family's own anchor).
    expect(asm.slab.baseOffset).toBe(0);
    expect(asm.slab.thickness).toBe(0.24);

    // Finish FFL = slab top + finish thickness — the SAME arithmetic
    // `FloorSlabBindingHandler._onSlabUpdated` uses for a bound finish.
    expect(asm.finish.baseOffset).toBeCloseTo(0.03, 9);
    expect(asm.finish.thickness).toBeCloseTo(0.03, 9);

    // ⭐ The rail stands on the FINISHED floor, not on the structural plate.
    for (const r of asm.railings) {
      expect(r.path[0]!.y).toBeCloseTo(datumY + 0.03, 9);
      expect(r.path[1]!.y).toBeCloseTo(datumY + 0.03, 9);
      expect(r.height).toBeCloseTo(1.15, 9);
    }
  });

  it('A-6: a thicker FINISH lifts the railing — the two are not independently stored', () => {
    const thin = buildBalconyAssembly(makeBalcony({ finishThickness: 0.01 }), idsFor(3), {
      hostSegment: HOST,
    });
    const thick = buildBalconyAssembly(makeBalcony({ finishThickness: 0.09 }), idsFor(3), {
      hostSegment: HOST,
    });
    expect(thick.railings[0]!.path[0]!.y - thin.railings[0]!.path[0]!.y).toBeCloseTo(0.08, 9);
    // ...while the slab does not move. Only the thing that should move, moves.
    expect(thick.slab.baseOffset).toBe(thin.slab.baseOffset);
  });

  it('A-7: every member is OWNED by the balcony — parentId on all three kinds', () => {
    const b = makeBalcony();
    const asm = buildBalconyAssembly(b, idsFor(3), { hostSegment: HOST });
    expect(asm.slab.parentId).toBe(b.id);
    expect(asm.finish.parentId).toBe(b.id);
    expect(asm.railings.every((r) => r.parentId === b.id)).toBe(true);
    // The RAIL's `hostId` is the SLAB — a guard is carried by the plate it stands
    // on. That is a different relationship from ownership and is not merged with it.
    expect(asm.railings.every((r) => r.hostId === SLAB_ID)).toBe(true);
  });

  it('A-8: every member carries COMPUTED provenance, never `authored`', () => {
    // C75 §1.1/§2.2 — the user drew the OUTLINE, not these three records.
    const asm = buildBalconyAssembly(makeBalcony(), idsFor(3), { hostSegment: HOST });
    for (const rec of [asm.slab, asm.finish, ...asm.railings]) {
      expect((rec.provenance as { origin?: string }).origin).toBe('computed');
    }
  });

  it('A-9: PURE — the same record twice yields byte-identical members', () => {
    // No id minting, no clock, no randomness. This is what makes REDO safe (CA-2).
    const b = makeBalcony();
    const one = buildBalconyAssembly(b, idsFor(3), { hostSegment: HOST });
    const two = buildBalconyAssembly(b, idsFor(3), { hostSegment: HOST });
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it('A-10: NO host segment ⇒ railed all round, and the rail count says so', () => {
    const b = makeBalcony();
    const asm = buildBalconyAssembly(
      b,
      { slabId: SLAB_ID, floorId: FLOOR_ID, railingIds: [...RAIL_IDS, 'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB5'] },
      {},
    );
    expect(asm.railings).toHaveLength(4);
  });
});
