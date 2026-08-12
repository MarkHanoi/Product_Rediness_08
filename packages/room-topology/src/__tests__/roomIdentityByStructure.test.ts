// @vitest-environment happy-dom
//
// §ROOM-IDENTITY-BY-STRUCTURE — MEASUREMENT FIRST, then the fix.
//
// THE AUDIT'S CLAIM (classification C, "partially implemented, declared blind spot"):
//   "room identity survives a wall move by PROXIMITY, not by identity"
//
// `RoomDetectionEngine.mergeWithExisting` re-attaches semantic data to freshly
// detected polygons via `_findBestCentroidMatch` — the existing room whose CENTROID
// is within `CENTROID_MATCH_RADIUS` (2.0 m). The code comment on the id line reads
// `id: match.id, // preserve ID so undo works`, so undo correctness for rooms rests
// on a distance heuristic. Move a bounding wall far enough that the room's centroid
// shifts more than 2.0 m and the room is not RESHAPED — it is DESTROYED and replaced
// by a fresh uuid, losing name, roomNumber, occupancyType, finishes, ifcData, revitId.
//
// PART 1 below MEASURES that cliff on the pre-fix matcher (a local reimplementation of
// centroid-only matching, so the measurement survives the fix and stays readable as
// the record of WHY the fix exists). PART 2 asserts the shipped engine now survives
// past that cliff. PART 3 is the anti-over-matching control: a genuine room SPLIT must
// still yield TWO rooms, and two DIFFERENT rooms must not collapse into one.
//
// THE FIX under test: identity is matched on `boundingWallIds` OVERLAP FIRST (a room's
// identity is WHICH WALLS BOUND IT — structural, survives arbitrary displacement),
// with the centroid retained only as a tiebreak among equally-overlapping candidates
// and as the fallback when no structural evidence exists (a first detection, or a room
// whose bounding set changed completely). The `used`-set PARTITION-FIX semantics are
// preserved unchanged: one existing room may still be claimed only once.

import { describe, it, expect } from 'vitest';
import { RoomDetectionEngine } from '../RoomDetectionEngine';
import type { RoomData } from '../RoomTypes';
import type { WallData, WallStore } from '@pryzm/geometry-wall';

const LEVEL = 'L1';
const Y = 0;

/** The radius the pre-fix matcher used. Mirrored here so the measurement is explicit. */
const CENTROID_MATCH_RADIUS = 2.0;

function wall(id: string, s: [number, number], e: [number, number], thickness = 0.2): WallData {
  return {
    id,
    type: 'wall',
    baseLine: [
      { x: s[0], y: Y, z: s[1] },
      { x: e[0], y: Y, z: e[1] },
    ],
    height: 2.7,
    thickness,
    baseOffset: 0,
    levelId: LEVEL,
    childrenIds: [],
    openings: [],
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

function engineFor(walls: WallData[]): RoomDetectionEngine {
  const stub = {
    getByLevel: (levelId: string) => (levelId === LEVEL ? walls : []),
  } as unknown as WallStore;
  return new RoomDetectionEngine(stub);
}

/**
 * A single rectangular room, 8 m wide × 6 m deep, whose EAST wall sits at x = `eastX`.
 * Moving `eastX` is the wall move under test: it displaces the room centroid by
 * exactly (eastX - 8) / 2 in x.
 */
function rect(eastX: number, tag = 'r'): WallData[] {
  return [
    wall(`${tag}-south`, [0, 0], [eastX, 0]),
    wall(`${tag}-east`, [eastX, 0], [eastX, 6]),
    wall(`${tag}-north`, [eastX, 6], [0, 6]),
    wall(`${tag}-west`, [0, 6], [0, 0]),
  ];
}

/** Stamp full semantics onto a detected room, as a user would by naming/classifying it. */
function withSemantics(r: RoomData): RoomData {
  return {
    ...r,
    name: 'Master Bedroom',
    roomNumber: '101',
    occupancyType: 'residential',
    finishes: { floor: 'oak-parquet', wall: 'plaster-white', ceiling: 'gypsum' },
    ifcData: { guid: 'IFC-GUID-STABLE-0001', name: 'Master Bedroom' },
    revitId: 'REVIT-778812',
    properties: { costCentre: 'CC-42' },
  } as unknown as RoomData;
}

/** The PRE-FIX matcher, reimplemented verbatim: centroid-only, radius-bounded. */
function preFixMerge(detected: RoomData[], existing: RoomData[]): RoomData[] {
  const used = new Set<string>();
  return detected.map((d) => {
    let best: RoomData | undefined;
    let bestDist = CENTROID_MATCH_RADIUS;
    for (const room of existing) {
      if (used.has(room.id)) continue;
      const dx = room.computed.centroid.x - d.computed.centroid.x;
      const dz = room.computed.centroid.z - d.computed.centroid.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; best = room; }
    }
    if (!best) return d;
    used.add(best.id);
    return { ...d, id: best.id, name: best.name, roomNumber: best.roomNumber,
      occupancyType: best.occupancyType, finishes: { ...best.finishes },
      ifcData: best.ifcData, revitId: best.revitId,
      properties: { ...best.properties } } as RoomData;
  });
}

/** Detect exactly one room from a wall set, or fail loudly. */
function detectOne(walls: WallData[]): RoomData {
  const rooms = engineFor(walls).detectRoomsForLevel(LEVEL, 0, 2.7);
  expect(rooms.length, 'fixture must produce exactly one room').toBe(1);
  return rooms[0]!;
}

describe('§ROOM-IDENTITY-BY-STRUCTURE · PART 1 — measure the centroid cliff', () => {
  it('locates the exact displacement at which centroid-only matching FAILS', () => {
    const base = withSemantics(detectOne(rect(8)));
    const baseCx = base.computed.centroid.x;

    // Sweep the east wall outward in 0.25 m steps and record the last displacement
    // at which the pre-fix matcher still recognises the room.
    const readings: Array<{ eastX: number; wallMove: number; centroidShift: number; matched: boolean }> = [];
    let lastMatched = -1;
    let firstFailed = -1;

    for (let eastX = 8; eastX <= 16; eastX += 0.25) {
      const moved = detectOne(rect(eastX));
      const merged = preFixMerge([moved], [base])[0]!;
      const matched = merged.id === base.id;
      const centroidShift = Math.abs(moved.computed.centroid.x - baseCx);
      readings.push({ eastX, wallMove: eastX - 8, centroidShift, matched });
      if (matched) lastMatched = eastX - 8;
      else if (firstFailed < 0) firstFailed = eastX - 8;
    }

    const lastOk = readings.filter((r) => r.matched).at(-1)!;
    const firstBad = readings.find((r) => !r.matched)!;

    // eslint-disable-next-line no-console
    console.log(
      `\n§ROOM-IDENTITY MEASUREMENT · CENTROID_MATCH_RADIUS = ${CENTROID_MATCH_RADIUS} m\n` +
      `  room: 8.0 m × 6.0 m rectangle; the EAST wall is moved outward (+x).\n` +
      `  a wall move of D displaces the centroid by D/2 (one of two x-extremes moves).\n` +
      `  LAST SURVIVING : wall move ${lastOk.wallMove.toFixed(2)} m → centroid shift ${lastOk.centroidShift.toFixed(3)} m → id PRESERVED\n` +
      `  FIRST FAILURE  : wall move ${firstBad.wallMove.toFixed(2)} m → centroid shift ${firstBad.centroidShift.toFixed(3)} m → id RE-MINTED\n` +
      `  ⇒ the cliff is a wall displacement of ~${(2 * CENTROID_MATCH_RADIUS).toFixed(1)} m ` +
      `(centroid shift ${CENTROID_MATCH_RADIUS.toFixed(1)} m). Beyond it the room is DESTROYED, not reshaped.\n`,
    );

    // The threshold is real and is where the arithmetic says it is: centroid shift
    // = wallMove / 2, so the failure begins at wallMove ≈ 2 × radius = 4.0 m.
    expect(lastOk.centroidShift).toBeLessThan(CENTROID_MATCH_RADIUS);
    expect(firstBad.centroidShift).toBeGreaterThanOrEqual(CENTROID_MATCH_RADIUS);
    expect(firstBad.wallMove).toBeGreaterThan(2 * CENTROID_MATCH_RADIUS - 0.5);
    expect(firstBad.wallMove).toBeLessThan(2 * CENTROID_MATCH_RADIUS + 0.5);
  });

  it('proves WHAT IS LOST when centroid matching fails — field by field, not assumed', () => {
    const base = withSemantics(detectOne(rect(8)));
    const moved = detectOne(rect(14)); // 6.0 m wall move → 3.0 m centroid shift > 2.0 m
    const lost = preFixMerge([moved], [base])[0]!;

    expect(lost.id).not.toBe(base.id);            // a FRESH uuid
    expect(lost.name).toBe('');                   // "Master Bedroom" gone
    expect(lost.roomNumber).toBe('');             // "101" gone
    expect(lost.occupancyType).toBe('unclassified'); // "residential" gone
    expect(lost.finishes).toEqual({});            // oak-parquet / plaster / gypsum gone
    expect(lost.ifcData).toBeUndefined();         // the IFC round-trip JOIN KEY gone
    expect(lost.revitId).toBeUndefined();         // Revit correspondence gone
    expect(lost.properties).toEqual({});          // costCentre gone

    // eslint-disable-next-line no-console
    console.log(
      `\n§ROOM-IDENTITY MEASUREMENT · WHAT IS LOST at a 6.0 m wall move (pre-fix matcher):\n` +
      `  id            "${base.id}" → "${lost.id}"  (RE-MINTED)\n` +
      `  name          "${base.name}" → ""\n` +
      `  roomNumber    "${base.roomNumber}" → ""\n` +
      `  occupancyType "${base.occupancyType}" → "${lost.occupancyType}"\n` +
      `  finishes      ${JSON.stringify(base.finishes)} → {}\n` +
      `  ifcData.guid  "${base.ifcData?.guid}" → undefined  ← the IFC/Revit JOIN KEY\n` +
      `  revitId       "${base.revitId}" → undefined\n` +
      `  properties    ${JSON.stringify(base.properties)} → {}\n`,
    );
  });

  it('CONTROL: the two wall sets are the SAME four walls — identity evidence existed all along', () => {
    const base = detectOne(rect(8));
    const moved = detectOne(rect(14));
    // Structural identity was available and unused: the bounding wall ids are identical.
    expect([...moved.boundingWallIds].sort()).toEqual([...base.boundingWallIds].sort());
    expect(base.boundingWallIds.length).toBeGreaterThanOrEqual(4);
  });
});

describe('§ROOM-IDENTITY-BY-STRUCTURE · PART 2 — the shipped engine survives the cliff', () => {
  const engine = engineFor([]);

  it('preserves id + name + occupancyType + finishes + ifcData across a 6.0 m wall move', () => {
    const base = withSemantics(detectOne(rect(8)));
    const moved = detectOne(rect(14));
    const merged = engine.mergeWithExisting([moved], [base])[0]!;

    expect(merged.id).toBe(base.id);
    expect(merged.name).toBe('Master Bedroom');
    expect(merged.roomNumber).toBe('101');
    expect(merged.occupancyType).toBe('residential');
    expect(merged.finishes).toEqual(base.finishes);
    expect(merged.ifcData?.guid).toBe('IFC-GUID-STABLE-0001');
    expect(merged.revitId).toBe('REVIT-778812');
    expect(merged.properties).toEqual({ costCentre: 'CC-42' });
    // The GEOMETRY is the new geometry — the room is RESHAPED, not resurrected.
    expect(merged.computed.area).toBeGreaterThan(base.computed.area + 20);
  });

  it('survives an extreme displacement the radius could never be widened to cover', () => {
    const base = withSemantics(detectOne(rect(8)));
    const moved = detectOne(rect(48)); // 40 m wall move → 20 m centroid shift
    const merged = engine.mergeWithExisting([moved], [base])[0]!;
    expect(merged.id).toBe(base.id);
    expect(merged.name).toBe('Master Bedroom');
    expect(merged.ifcData?.guid).toBe('IFC-GUID-STABLE-0001');
  });

  it('still matches by centroid when NO structural evidence exists (fallback intact)', () => {
    // Same geometry, but the existing record carries a bounding set that no longer
    // overlaps at all (e.g. every bounding wall was replaced). The centroid has not
    // moved, so the centroid fallback must still claim it.
    const base = withSemantics(detectOne(rect(8)));
    const rewired: RoomData = { ...base, boundingWallIds: ['ghost-a', 'ghost-b', 'ghost-c', 'ghost-d'] };
    const again = detectOne(rect(8));
    const merged = engine.mergeWithExisting([again], [rewired])[0]!;
    expect(merged.id).toBe(base.id);
    expect(merged.name).toBe('Master Bedroom');
  });
});

describe('§ROOM-IDENTITY-BY-STRUCTURE · PART 2b — undo RE-DERIVES rooms, it does not restore them', () => {
  const engine = engineFor([]);

  // MEASURED FACTS establishing this, all read at HEAD and cited so the claim is auditable:
  //
  //   1. `plugins/wall/src/handlers/MoveWall.ts:84` declares `affectedStores = ['wall']` —
  //      NOT `['wall','room']`. The ring buffer therefore captures NO room patch for a wall
  //      move, so there is nothing for `buildUndoStoreMap`'s `room → roomStore` adapter
  //      (performUndoRedo.ts:314) to apply. The room half of the edit is simply not recorded.
  //
  //   2. `performUndoRedo.ts:393-406` `_withPausedObservers` calls
  //      `roomTopologyObserver.pause()` before applying the patch and `.resume()` after.
  //      `RoomTopologyObserver.pause()/resume()` (observer:288-289) are BARE FLAG WRITES —
  //      `resume()` does not flush, and `_onWallMutationCommitted` (observer:228) returns
  //      early `if (this.paused)`, DROPPING the event rather than queueing it.
  //
  //   Together: undo restores the WALLS, and the rooms are then re-derived from them by a
  //   LATER redetect. Room identity across undo therefore rests entirely on
  //   `mergeWithExisting` — i.e. on this file's subject. That is precisely why the fix had
  //   to be structural: the audit's phrase "undo correctness for rooms rests on a distance
  //   heuristic" is CORRECT, and it is the merge, not the undo machinery, that decides it.
  //
  // This test proves the CONSEQUENCE that matters: re-deriving from restored walls returns
  // the ORIGINAL identity — which is what makes undo converge. Pre-fix it did not, whenever
  // the move exceeded the 2.0 m centroid cliff.

  it('re-deriving from the RESTORED walls recovers the original identity (undo converges)', () => {
    const base = withSemantics(detectOne(rect(8)));

    // EDIT: move the east wall 8 → 14 (a 6.0 m move, past the old cliff), then merge.
    const afterEdit = engine.mergeWithExisting([detectOne(rect(14))], [base])[0]!;
    expect(afterEdit.id).toBe(base.id);

    // UNDO: the wall patch restores the walls to eastX = 8. The observer was paused and
    // dropped its events, so the rooms are RE-DERIVED from those restored walls and merged
    // against whatever the store currently holds — the post-edit room.
    const afterUndo = engine.mergeWithExisting([detectOne(rect(8))], [afterEdit])[0]!;

    // The identity must come all the way home, including the IFC join key.
    expect(afterUndo.id).toBe(base.id);
    expect(afterUndo.name).toBe('Master Bedroom');
    expect(afterUndo.occupancyType).toBe('residential');
    expect(afterUndo.finishes).toEqual(base.finishes);
    expect(afterUndo.ifcData?.guid).toBe('IFC-GUID-STABLE-0001');
    // ...and the GEOMETRY is back to the original 8 × 6 = 48 m².
    expect(afterUndo.computed.area).toBeCloseTo(base.computed.area, 5);
  });

  it('CONTROL: pre-fix, that same undo round trip DESTROYED the identity at both ends', () => {
    const base = withSemantics(detectOne(rect(8)));
    // Edit past the cliff — identity already lost here...
    const afterEdit = preFixMerge([detectOne(rect(14))], [base])[0]!;
    expect(afterEdit.id).not.toBe(base.id);
    // ...and undo cannot recover what the edit discarded: the semantics are gone for good.
    const afterUndo = preFixMerge([detectOne(rect(8))], [afterEdit])[0]!;
    expect(afterUndo.name).toBe('');
    expect(afterUndo.ifcData).toBeUndefined();
    expect(afterUndo.id).not.toBe(base.id);
  });
});

describe('§ROOM-IDENTITY-BY-STRUCTURE · PART 3 — the fix did not make everything match everything', () => {
  const engine = engineFor([]);

  it('a genuine room SPLIT still yields TWO rooms with TWO distinct ids (PARTITION-FIX preserved)', () => {
    const base = withSemantics(detectOne(rect(10)));

    // Now add an interior partition at x = 5 — the room splits in two.
    const split = [...rect(10), wall('r-partition', [5, 0], [5, 6], 0.1)];
    const detected = engineFor(split).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(detected.length, 'the partition must split the room in two').toBe(2);

    const merged = engine.mergeWithExisting(detected, [base]);
    expect(merged.length).toBe(2);
    const ids = new Set(merged.map((r) => r.id));
    expect(ids.size, 'the two halves must NOT collapse onto one id').toBe(2);
    // Exactly one half inherits the parent's identity; the other is genuinely new.
    expect(merged.filter((r) => r.id === base.id).length).toBe(1);
    expect(merged.filter((r) => r.name === 'Master Bedroom').length).toBe(1);
  });

  it('two DIFFERENT existing rooms keep their OWN identities across a shared-wall move', () => {
    const split = [...rect(10), wall('r-partition', [5, 0], [5, 6], 0.1)];
    const detected = engineFor(split).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(detected.length).toBe(2);

    // Name them by their x position so the assertion is about WHICH room kept WHICH name.
    const sorted = [...detected].sort((a, b) => a.computed.centroid.x - b.computed.centroid.x);
    const west: RoomData = { ...sorted[0]!, name: 'West Room', roomNumber: 'W1', occupancyType: 'residential' };
    const east: RoomData = { ...sorted[1]!, name: 'East Room', roomNumber: 'E1', occupancyType: 'office' };

    // Move the SHARED partition from x = 5 to x = 8 — the west room grows, the east shrinks.
    const movedWalls = [...rect(10), wall('r-partition', [8, 0], [8, 6], 0.1)];
    const redetected = engineFor(movedWalls).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(redetected.length).toBe(2);

    const merged = engine.mergeWithExisting(redetected, [west, east]);
    const byX = [...merged].sort((a, b) => a.computed.centroid.x - b.computed.centroid.x);
    expect(byX[0]!.id).toBe(west.id);
    expect(byX[0]!.name).toBe('West Room');
    expect(byX[1]!.id).toBe(east.id);
    expect(byX[1]!.name).toBe('East Room');
    expect(new Set(merged.map((r) => r.id)).size).toBe(2);
  });

  it('an UNRELATED room in a different part of the plan is NOT claimed', () => {
    // Two disjoint rectangles far apart, sharing no walls.
    const a = detectOne(rect(8, 'a'));
    const named: RoomData = { ...a, name: 'Room A', occupancyType: 'residential' };
    const farWalls = [
      wall('b-south', [100, 100], [108, 100]),
      wall('b-east', [108, 100], [108, 106]),
      wall('b-north', [108, 106], [100, 106]),
      wall('b-west', [100, 106], [100, 100]),
    ];
    const b = detectOne(farWalls);
    const merged = engine.mergeWithExisting([b], [named])[0]!;
    expect(merged.id).not.toBe(named.id);
    expect(merged.name).toBe('');
  });
});
