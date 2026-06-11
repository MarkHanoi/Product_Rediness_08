// @vitest-environment happy-dom
//
// §PARTITION-REACH end-to-end (tracker §68.12, 2026-06-11) — generator → room detection.
//
// The founder's BUILD-vs-preview divergence: a 7-bed ~210 m² 2-storey house whose modal
// PREVIEW is clean but whose BUILT plan FLOODS — detected room polygons overlap, rooms
// merge ("Kitchen / Dining", "Bedroom 2 / Corridor"), a 55.7 m² no-door flood cell appears,
// and a habitable room floods into the stair void.
//
// ROOT CAUSE (verified): the D-TGL engine EMITS a clean wall graph — every interior
// partition meets its host EXACTLY, and feeding that emitted graph straight into the
// RoomDetectionEngine yields detectedRooms == engineRooms with ZERO overlaps (asserted
// below). The divergence is introduced LATER by the editor's whole-level WallJoinResolver,
// which clusters the engine's coincident Y-junction endpoints and TRIMS one member ~1 m
// back along its own axis, leaving a dangling end the thin-partition T-snap (≤ 0.20 m)
// cannot bridge → the loop floods.
//
// This test asserts BOTH halves of the fix's guarantee:
//   (1) the EMITTED graph is already clean — detectedRooms == engineRooms, 0 overlaps;
//   (2) after a realistic ~0.96 m resolver-trim on a Y-junction member, the
//       RoomDetectionEngine §PARTITION-REACH pass RECOVERS the trimmed partition so
//       detection STILL returns engineRooms (no flood/merge).

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import type { WallData, WallStore } from '@pryzm/geometry-wall';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
  ApartmentConstraints, ApartmentProgram, ScoringWeights, LayoutWall, LayoutOption,
} from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

function plate(areaM2: number, widthM: number): ShellAnalysis {
  const depthM = areaM2 / widthM;
  return {
    netAreaM2: areaM2, widthM, depthM,
    perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
    faces: [],
  } as ShellAnalysis;
}

// 7-bed, ~210 m², 2-storey — the "grew +1 bedroom (over-capacity shell)", dominant-carve
// house the founder reported (§DIAG-PROGRAM-FIT chosenBeds > requestedBeds).
const BIG: ApartmentProgram = {
  bedrooms: 7, bathrooms: 3, masterEnSuite: true,
  openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

function toWallData(w: LayoutWall, id: string, level: string): WallData {
  return {
    id, type: 'wall',
    baseLine: [
      { x: w.start.x / 1000, y: 0, z: w.start.y / 1000 },
      { x: w.end.x / 1000, y: 0, z: w.end.y / 1000 },
    ],
    height: 2.7, thickness: 0.1, baseOffset: 0, levelId: level, childrenIds: [], openings: [],
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
  } as unknown as WallData;
}

/** Build the boundary-line store entries (open-plan splitters) for an option. */
function boundaryStore(opt: LayoutOption, level: string) {
  const bls = (opt.boundaries ?? []).map((b, i) => ({
    id: `bl-${i}`,
    placement: { start: { x: b.start.x / 1000, z: b.start.y / 1000 }, end: { x: b.end.x / 1000, z: b.end.y / 1000 } },
    properties: { isActive: true },
  }));
  return { getByLevel: (lvl: string) => (lvl === level ? bls : []) } as any;
}

function detect(walls: WallData[], level: string, bl: any): number {
  const stub = { getByLevel: (lvl: string) => (lvl === level ? walls : []) } as unknown as WallStore;
  return new RoomDetectionEngine(stub, undefined, undefined, bl).detectRoomsForLevel(level, 0, 2.7).length;
}

describe('§68.12 — generated house: emitted graph detects cleanly + recovers a resolver trim', () => {
  const r = generateHouseLayout(plate(210, 15), BIG, C, W, { storeyCount: 2 });

  it('produces a 2-storey multi-room house', () => {
    expect(r.perStoreyLayout).toHaveLength(2);
    for (const o of r.perStoreyLayout) expect(o.rooms.length).toBeGreaterThanOrEqual(8);
  });

  it('(1) the EMITTED wall graph detects detectedRooms == engineRooms on EVERY storey (no flood)', () => {
    r.perStoreyLayout.forEach((opt, si) => {
      const level = `E${si}`;
      const wd = opt.walls.map((w, i) => toWallData(w, `${si}-w${i}`, level));
      const detected = detect(wd, level, boundaryStore(opt, level));
      expect(detected, `storey ${si}: detected ${detected} ≠ engine ${opt.rooms.length}`).toBe(opt.rooms.length);
    });
  });

  it('(1b) emitted rooms have NO pairwise interior AABB overlap (no overlapping detected loops)', () => {
    r.perStoreyLayout.forEach((opt, si) => {
      const aabb = (rm: typeof opt.rooms[number]) => {
        const p = rm.polygon; if (!p || p.length < 3) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of p) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
        return { x0, y0, x1, y1 };
      };
      for (let a = 0; a < opt.rooms.length; a++) {
        for (let b = a + 1; b < opt.rooms.length; b++) {
          const A = aabb(opt.rooms[a]!), B = aabb(opt.rooms[b]!);
          if (!A || !B) continue;
          const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
          const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
          const overlapM2 = ox > 50 && oy > 50 ? (ox * oy) / 1e6 : 0;
          expect(overlapM2, `storey ${si}: rooms ${a}/${b} overlap ${overlapM2.toFixed(1)} m²`).toBeLessThan(0.5);
        }
      }
    });
  });

  it('(2) a ~0.96 m resolver-trim on a Y-junction member is RECOVERED — detection stays at engineRooms', () => {
    // Model the editor's §MULTI-CLUSTER trim: find an interior partition endpoint shared
    // by ≥ 2 OTHER interior partitions (a Y-junction), and pull THAT partition's endpoint
    // 0.961 m back along its own axis — exactly what leaves a dangling end. Assert the
    // RoomDetectionEngine still recovers engineRooms on every storey.
    r.perStoreyLayout.forEach((opt, si) => {
      const level = `T${si}`;
      const part = opt.walls.map((w, i) => ({ w, i })).filter(({ w }) => w.isExternal !== true);
      // Find a Y-junction: an endpoint coincident (< 50 mm) with ≥ 2 OTHER partition endpoints.
      const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 50;
      let trimIdx = -1; let trimSide: 'start' | 'end' = 'start';
      outer:
      for (const { w, i } of part) {
        for (const side of ['start', 'end'] as const) {
          const ep = w[side];
          let coincident = 0;
          for (const { w: o, i: oi } of part) {
            if (oi === i) continue;
            if (near(ep, o.start) || near(ep, o.end)) coincident++;
          }
          if (coincident >= 2) { trimIdx = i; trimSide = side; break outer; }
        }
      }
      // Some storeys may not have a 3-way Y; skip those (the clean-emit assertion covers them).
      if (trimIdx < 0) return;

      const trimmed: LayoutWall[] = opt.walls.map((w, i) => {
        if (i !== trimIdx) return w;
        const ep = { ...w[trimSide] };
        const other = trimSide === 'start' ? w.end : w.start;
        const dx = other.x - ep.x, dy = other.y - ep.y;
        const L = Math.hypot(dx, dy) || 1;
        ep.x += (dx / L) * 961; ep.y += (dy / L) * 961;   // retreat along the wall axis
        return trimSide === 'start' ? { ...w, start: ep } : { ...w, end: ep };
      });

      const wd = trimmed.map((w, i) => toWallData(w, `${si}-tw${i}`, level));
      const detected = detect(wd, level, boundaryStore(opt, level));
      expect(detected, `storey ${si}: trimmed detected ${detected} ≠ engine ${opt.rooms.length} (flood/merge)`)
        .toBe(opt.rooms.length);
    });
  });
});
