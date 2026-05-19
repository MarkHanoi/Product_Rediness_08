// produceRoom parity suite (S25-T5).
//
// FIXTURE NOTE — synthetic-but-analytic.
// =====================================
// The PRYZM 1 codebase contains a 20-case room-detection regression
// fixture (`__fixtures__/rooms-v1/*.json`).  Importing those fixtures
// requires the bake-fixtures pipeline (S30) to lift the PRYZM 1
// `RoomDetectionService` test outputs into the new descriptor shape;
// that data-import work is tracked as a follow-up task on the S25
// completion checklist.  In the meantime every case below is built
// from analytic primitives (rectangles, L-shapes, openings) whose
// boundary polygon, area, and perimeter are derivable on paper, so
// the test asserts producer correctness rather than parity-as-byte-
// match.  Parity-as-byte-match against PRYZM 1 lands as a follow-up
// once the lifted fixture corpus is available.
//
// Tolerance budget — the phase doc requires "area within 0.1%" for
// every case; we assert against that explicitly.

import { describe, expect, it } from 'vitest';
import { Room, Wall, createId } from '@pryzm/schemas';
import {
  produceRoom,
  analyseRoom,
  assertValidDescriptor,
  type RoomBoundaryContext,
} from '../src/index.js';
import { DescriptorInvariantError } from '../src/types/assertValidDescriptor.js';

const AREA_TOL_REL = 0.001; // 0.1 %
const PERIM_TOL_REL = 0.001;

function makeWall(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  levelId = 'L1',
) {
  return Wall.parse({
    id: createId('wall'),
    levelId,
    baseLine: [
      { x: ax, y: 0, z: az },
      { x: bx, y: 0, z: bz },
    ],
  });
}

function makeRoom(seedX: number, seedZ: number, levelId = 'L1') {
  return Room.parse({
    levelId,
    boundaryMode: 'wallBound',
    seedPoint: { x: seedX, y: 0, z: seedZ },
  });
}

function ctxOf(walls: ReturnType<typeof makeWall>[]): RoomBoundaryContext {
  return { walls };
}

describe('produceRoom — parity suite (synthetic-but-analytic)', () => {
  describe('case A: simple 4×6 m rectangle', () => {
    const walls = [
      makeWall(0, 0, 4, 0),
      makeWall(4, 0, 4, 6),
      makeWall(4, 6, 0, 6),
      makeWall(0, 6, 0, 0),
    ];
    const room = makeRoom(2, 3);

    it('analyses to area = 24 m², perimeter = 20 m, 4 walls', () => {
      const a = analyseRoom(room, ctxOf(walls));
      expect(a.area).toBeCloseTo(24, 6);
      expect(Math.abs(a.area - 24) / 24).toBeLessThan(AREA_TOL_REL);
      expect(a.perimeter).toBeCloseTo(20, 6);
      expect(Math.abs(a.perimeter - 20) / 20).toBeLessThan(PERIM_TOL_REL);
      expect(a.boundingWallIds).toHaveLength(4);
      expect(a.polygon).toHaveLength(4);
    });

    it('produces a valid descriptor with one fill group', () => {
      const desc = produceRoom(room, ctxOf(walls), 0);
      expect(() => assertValidDescriptor(desc)).not.toThrow();
      expect(desc.groups).toHaveLength(1);
      expect(desc.materialKeys).toHaveLength(1);
      expect(desc.materialKeys[0]).toMatch(/^room\|/);
      // 4 polygon vertices → 4 fan-triangles → 12 non-indexed verts.
      expect(desc.position.length).toBe(12 * 3);
      expect(desc.index.length).toBe(12);
    });

    it('determinism: same input → identical hash across two runs', () => {
      const d1 = produceRoom(room, ctxOf(walls), 0);
      const d2 = produceRoom(room, ctxOf(walls), 0);
      expect(d1.hash).toBe(d2.hash);
    });

    it('seed point outside the rectangle is rejected', () => {
      const outside = makeRoom(10, 10);
      expect(() => analyseRoom(outside, ctxOf(walls))).toThrow(
        DescriptorInvariantError,
      );
    });
  });

  describe('case B: L-shape (8×6 outer minus 4×3 cut from top-right)', () => {
    // L-shape outline (CCW from origin):
    //   (0,0) → (8,0) → (8,3) → (4,3) → (4,6) → (0,6) → close
    // area = 8*6 - 4*3 = 48 - 12 = 36
    // perimeter = 8 + 3 + 4 + 3 + 4 + 6 = 28
    const walls = [
      makeWall(0, 0, 8, 0),
      makeWall(8, 0, 8, 3),
      makeWall(8, 3, 4, 3),
      makeWall(4, 3, 4, 6),
      makeWall(4, 6, 0, 6),
      makeWall(0, 6, 0, 0),
    ];
    const room = makeRoom(2, 2);

    it('analyses the L-shape correctly', () => {
      const a = analyseRoom(room, ctxOf(walls));
      expect(Math.abs(a.area - 36) / 36).toBeLessThan(AREA_TOL_REL);
      expect(Math.abs(a.perimeter - 28) / 28).toBeLessThan(PERIM_TOL_REL);
      expect(a.boundingWallIds).toHaveLength(6);
      expect(a.polygon).toHaveLength(6);
    });

    it('seed in the cut-away corner is rejected (outside L)', () => {
      const cut = makeRoom(6, 5); // inside the missing 4×3 cut
      expect(() => analyseRoom(cut, ctxOf(walls))).toThrow(
        DescriptorInvariantError,
      );
    });
  });

  describe('case C: rectangle with an opening (door cut at one edge)', () => {
    // 5×4 rectangle, but the south wall is split into two segments
    // that leave a 1 m gap (1 → 2) for a door.  The room is still
    // enclosed because the gap is small and the half-edge graph
    // still finds a closed face — we model the opening as TWO walls
    // colinear on the south edge (the producer uses centerlines
    // anyway, so the gap manifests as missing graph nodes there).
    //
    // To keep the room enclosed we connect the two south segments
    // with a "door head" wall above them — this is the worst-case
    // PRYZM 1 reference treats: the opening is enclosed by a thin
    // header that the producer detects as a degenerate face.  For
    // the 2A v1 contract we therefore enclose the opening with a
    // jamb pair (vertical walls down to the opening) so the face
    // remains well-defined.
    //
    // Simplified: two segments at z=0 with no gap (the door cut is
    // a wall.opening, NOT a gap in the centerline) — confirms the
    // producer ignores wall.openings (those are a render concern,
    // not a topology concern).
    const walls = [
      makeWall(0, 0, 5, 0),
      makeWall(5, 0, 5, 4),
      makeWall(5, 4, 0, 4),
      makeWall(0, 4, 0, 0),
    ];
    // Inject a door opening on the south wall — produceRoom MUST
    // ignore openings (boundary detection works at the centerline
    // level).
    walls[0] = Wall.parse({
      id: walls[0]!.id,
      levelId: 'L1',
      baseLine: walls[0]!.baseLine,
      childrenIds: ['door_dummy'],
      openings: [
        {
          id: 'op1',
          type: 'door',
          doorType: 'single',
          offset: 2,
          width: 1,
          height: 2.1,
          sillHeight: 0,
          elementId: 'door_dummy',
        },
      ],
    });

    it('opening on a wall does not change the room area', () => {
      const room = makeRoom(2.5, 2);
      const a = analyseRoom(room, ctxOf(walls));
      expect(Math.abs(a.area - 20) / 20).toBeLessThan(AREA_TOL_REL);
      expect(Math.abs(a.perimeter - 18) / 18).toBeLessThan(PERIM_TOL_REL);
    });
  });

  describe('case D: room split by an interior wall (two adjacent rooms)', () => {
    // 6×4 outer rectangle, split vertically at x=3 into two 3×4
    // sub-rooms.  Two seed points yield two distinct rooms each
    // with area 12 m² and perimeter 14 m.
    //
    // BIM-semantics: walls meet only at endpoints (the producer
    // expects a proper PSLG — walls do NOT cross mid-segment).  The
    // south and north walls are therefore *split* at the divider's
    // T-junctions: south = (0,0)-(3,0) + (3,0)-(6,0); north = same
    // mirrored.  Authoring tools (the wall-join split logic landing
    // in S26 cross-rules) will emit this shape automatically; the
    // producer's contract is to consume it as-is.
    const walls = [
      makeWall(0, 0, 3, 0),     // south-left
      makeWall(3, 0, 6, 0),     // south-right
      makeWall(6, 0, 6, 4),     // east outer
      makeWall(6, 4, 3, 4),     // north-right
      makeWall(3, 4, 0, 4),     // north-left
      makeWall(0, 4, 0, 0),     // west outer
      makeWall(3, 0, 3, 4),     // interior divider
    ];
    const dividerId = walls[6]!.id;
    const left = makeRoom(1.5, 2);
    const right = makeRoom(4.5, 2);

    it('left sub-room (3×4)', () => {
      const a = analyseRoom(left, ctxOf(walls));
      expect(Math.abs(a.area - 12) / 12).toBeLessThan(AREA_TOL_REL);
      expect(Math.abs(a.perimeter - 14) / 14).toBeLessThan(PERIM_TOL_REL);
      // 4 distinct walls bound the left room: south-left, divider,
      // north-left, west-outer.
      expect(a.boundingWallIds).toHaveLength(4);
      expect(a.boundingWallIds).toContain(dividerId);
    });

    it('right sub-room (3×4)', () => {
      const a = analyseRoom(right, ctxOf(walls));
      expect(Math.abs(a.area - 12) / 12).toBeLessThan(AREA_TOL_REL);
      expect(Math.abs(a.perimeter - 14) / 14).toBeLessThan(PERIM_TOL_REL);
      expect(a.boundingWallIds).toHaveLength(4);
      expect(a.boundingWallIds).toContain(dividerId);
    });

    it('two independent seed points → two distinct boundary sets', () => {
      const al = analyseRoom(left, ctxOf(walls));
      const ar = analyseRoom(right, ctxOf(walls));
      // Different polygons, but both reference the divider.
      const leftXs = al.polygon.map((p) => p.x).sort();
      const rightXs = ar.polygon.map((p) => p.x).sort();
      expect(leftXs).not.toEqual(rightXs);
      expect(al.boundingWallIds).toContain(dividerId);
      expect(ar.boundingWallIds).toContain(dividerId);
    });
  });

  describe('sketched-mode back-compat', () => {
    it('uses the polygon from the schema directly when boundaryMode is "sketched"', () => {
      const room = Room.parse({
        boundary: [
          { x: 0, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
          { x: 2, y: 0, z: 3 },
          { x: 0, y: 0, z: 3 },
        ],
      });
      // Default boundaryMode is 'sketched'.
      expect(room.boundaryMode).toBe('sketched');
      const a = analyseRoom(room, ctxOf([]));
      expect(a.area).toBeCloseTo(6, 6);
      expect(a.perimeter).toBeCloseTo(10, 6);
      expect(a.boundingWallIds).toEqual([]);

      const desc = produceRoom(room, ctxOf([]), 0);
      expect(() => assertValidDescriptor(desc)).not.toThrow();
    });
  });

  describe('error surfacing (SPEC-01 §3 — never silently degrade)', () => {
    it('wallBound mode without seedPoint throws DescriptorInvariantError', () => {
      const room = Room.parse({
        boundary: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 0, z: 1 },
        ],
      });
      // Force the discriminator without a seed (would normally be
      // blocked by the schema refine; we mutate post-parse to test
      // the producer's defence-in-depth).
      const broken = { ...room, boundaryMode: 'wallBound' as const };
      expect(() => analyseRoom(broken, ctxOf([makeWall(0, 0, 1, 0)]))).toThrow(
        DescriptorInvariantError,
      );
    });

    it('no walls on the level throws DescriptorInvariantError', () => {
      const room = makeRoom(0, 0);
      expect(() => analyseRoom(room, ctxOf([]))).toThrow(
        DescriptorInvariantError,
      );
    });
  });
});
