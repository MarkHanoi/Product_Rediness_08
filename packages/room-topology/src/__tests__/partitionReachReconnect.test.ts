// @vitest-environment happy-dom
//
// §PARTITION-REACH (tracker §68.12, 2026-06-11) regression — HARD GATE.
//
// THE DEFECT (verified by a headless generator probe, NOT re-derived): on a generated
// multi-room house the D-TGL engine emits up to 3 interior partitions meeting at ONE
// exact Y-junction point — a clean, fully-closed graph (room detection returns
// detectedRooms == engineRooms). The editor's whole-level WallJoinResolver then CLUSTERS
// those coincident endpoints, finds no pinnable pair, and TRIMS one member back ALONG ITS
// OWN AXIS (its §MULTI-CLUSTER pinned=0 trimmed=N path) — leaving that partition's end up
// to ~1 m SHORT of the host it should T-junction onto. The thickness-driven T-junction
// snap (≤ 0.20 m for a thin partition) cannot bridge a ~1 m gap, so the room loop never
// closes → RoomDetection floods across the gap → the founder's compound merges
// ("Kitchen / Dining", "Bedroom 2 / Corridor"), the 55.7 m² no-door flood cell, and the
// HABITABLE-ON-STAIR flood.
//
// THE FIX (`_reconnectDanglingEnds` in RoomDetectionEngine): a guarded pre-pass moves
// ONLY a genuinely-DANGLING endpoint (connected to NOTHING) onto the host body/corner it
// RUNS UP TO (collinear with its own axis, bounded reach). A precisely-drawn / clean-emit
// plan has no such ends → strict no-op.
//
// This test models the EXACT founder geometry: two collinear horizontal host segments
// meeting at the junction, plus a vertical T-partition whose end has been TRIMMED 0.961 m
// short of that junction. Without the fix the partition's room loop floods (2 → 1 room);
// with it the trim is recovered and BOTH rooms detect.

import { describe, it, expect } from 'vitest';
import { RoomDetectionEngine } from '../RoomDetectionEngine';
import type { WallData, WallStore } from '@pryzm/geometry-wall';

const LEVEL = 'L1';
const Y = 0;
let seq = 0;

function wall(id: string, s: [number, number], e: [number, number], thickness = 0.1): WallData {
  return {
    id, type: 'wall',
    baseLine: [ { x: s[0], y: Y, z: s[1] }, { x: e[0], y: Y, z: e[1] } ],
    height: 2.7, thickness, baseOffset: 0, levelId: LEVEL, childrenIds: [], openings: [],
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

function engineFor(walls: WallData[]): RoomDetectionEngine {
  const stub = { getByLevel: (levelId: string) => (levelId === LEVEL ? walls : []) } as unknown as WallStore;
  return new RoomDetectionEngine(stub);
}

/**
 * An 8 m × 6 m shell split into TWO rooms by a horizontal partition at z = 3 plus a
 * vertical partition at x = 4 in the LOWER half (so the lower half is two rooms, the
 * upper half one — 3 rooms total). The vertical partition's TOP end is the one that
 * gets trimmed: it should meet the horizontal partition's BODY at (4, 3).
 *
 * `vertTrimM` = how far the vertical partition's top end is pulled DOWN (short) from the
 * host body it should T onto. 0 = clean (meets exactly).
 */
function buildHouseCornerJunction(vertTrimM: number): WallData[] {
  const s = seq++;
  const walls: WallData[] = [
    // exterior shell (centrelines) 8 × 6
    wall(`sh-b-${s}`, [0, 0], [8, 0], 0.2),
    wall(`sh-r-${s}`, [8, 0], [8, 6], 0.2),
    wall(`sh-t-${s}`, [8, 6], [0, 6], 0.2),
    wall(`sh-l-${s}`, [0, 6], [0, 0], 0.2),
    // horizontal partition at z = 3 — emitted as TWO COLLINEAR segments meeting at the
    // junction x = 4 (mirrors the generator's idx5/idx27 split), so the vertical
    // partition's target is a shared CORNER, not a single segment's interior.
    wall(`hp-l-${s}`, [0, 3], [4, 3]),
    wall(`hp-r-${s}`, [4, 3], [8, 3]),
    // vertical partition x = 4 in the LOWER half: should run (4,0)->(4,3) meeting the
    // horizontal host at (4,3). Trim its TOP end DOWN by `vertTrimM`.
    wall(`vp-${s}`, [4, 0], [4, 3 - vertTrimM]),
  ];
  return walls;
}

describe('§PARTITION-REACH — resolver-trimmed dangling partition reconnects', () => {
  it('CONTROL: clean Y-junction (0 mm trim) detects all 3 rooms', () => {
    const rooms = engineFor(buildHouseCornerJunction(0)).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(rooms.length).toBe(3);
  });

  it('a 0.961 m resolver-trim gap floods WITHOUT the fix-radius (proves the defect surface)', () => {
    // The trimmed vertical partition's top end sits 0.961 m from the host body. This is
    // far beyond the thin-partition T-snap (0.20 m): the ONLY thing that closes the loop
    // is `_reconnectDanglingEnds`. Assert the recovery is REAL by also confirming a gap
    // ABOVE the reconnection cap (1.25 m) still floods — i.e. the pass is bounded, not a
    // blanket teleport.
    const tooFar = engineFor(buildHouseCornerJunction(1.5)).detectRoomsForLevel(LEVEL, 0, 2.7);
    // 1.5 m > REACH_MAX_M (1.25) — NOT reconnected → the lower split floods (2 → 1 room).
    expect(tooFar.length).toBe(2);
  });

  it('FIX: a 0.961 m resolver-trim gap is reconnected → all 3 rooms detect', () => {
    const rooms = engineFor(buildHouseCornerJunction(0.961)).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(rooms.length).toBe(3);
  });

  it('a partition that genuinely TERMINATES free in open space is NOT teleported (no false reconnection)', () => {
    // A short peninsula partition that ends in open space and whose axis does NOT aim at a
    // host body must be left untouched (else precisely-drawn plans distort — §STRICT-ROOMS).
    // One horizontal partition spanning the shell + a stub that ends mid-air, parallel to
    // and offset from the shell (its axis points along the shell, never INTO a host).
    const s = seq++;
    const walls: WallData[] = [
      wall(`p-sh-b-${s}`, [0, 0], [8, 0], 0.2),
      wall(`p-sh-r-${s}`, [8, 0], [8, 6], 0.2),
      wall(`p-sh-t-${s}`, [8, 6], [0, 6], 0.2),
      wall(`p-sh-l-${s}`, [0, 6], [0, 0], 0.2),
      // full-width partition at z = 3 → 2 rooms.
      wall(`p-hp-${s}`, [0, 3], [8, 3]),
      // a free-standing stub mid-room, HORIZONTAL (parallel to the host) ending in open
      // air; its axis does not point at any host body within the reach cap.
      wall(`p-stub-${s}`, [3, 1.5], [5, 1.5]),
    ];
    const rooms = engineFor(walls).detectRoomsForLevel(LEVEL, 0, 2.7);
    // The stub does not seal anything → still exactly 2 rooms; the stub was NOT teleported
    // onto the host (which would have created a spurious extra room or distorted the split).
    expect(rooms.length).toBe(2);
  });
});
