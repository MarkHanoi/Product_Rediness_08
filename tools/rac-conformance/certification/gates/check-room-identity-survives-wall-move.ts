// ─── GATE · check-room-identity-survives-wall-move ───────────────────────────
//
// THE INVARIANT: a room's identity is WHICH WALLS BOUND IT, not where its centroid
// happens to sit. Moving a bounding wall RESHAPES a room; it must never DESTROY one.
//
// WHY THIS GATE EXISTS — the measured defect it pins closed
// (`packages/room-topology/src/__tests__/roomIdentityByStructure.test.ts` PART 1, executed
// 2026-08-12): `RoomDetectionEngine.mergeWithExisting` re-attached semantics to freshly
// detected polygons by CENTROID PROXIMITY ALONE, bounded by `CENTROID_MATCH_RADIUS = 2.0 m`.
// On an 8.0 × 6.0 m room whose east wall is dragged outward the centroid moves by half the
// wall displacement, giving a hard cliff:
//
//     wall move 3.75 m → centroid shift 1.875 m → id PRESERVED
//     wall move 4.00 m → centroid shift 2.000 m → id RE-MINTED
//
// Past it the room was replaced by a fresh uuid, losing name, roomNumber, occupancyType,
// finishes, ifcData and revitId. The comment on the id line read "preserve ID so undo
// works" — so undo correctness for rooms rested on a distance heuristic. ADR-0319 classes
// `id` and `ifcData.guid` AUTHORITATIVE with NO TOLERANCE EVER: a re-minted GUID breaks
// correspondence with every previously exported IFC file INVISIBLY, because both files
// still open.
//
// WHY THIS GATE BUILDS ITS OWN WORLD rather than reading an artefact (the opposite choice
// from `check-identity-roundtrip`): no existing suite exercises the wall-move → re-detect →
// merge path, so there is no artefact to grade. It drives the REAL production
// `RoomDetectionEngine` — the same class `RoomTopologyObserver` calls — end to end: detect,
// stamp semantics, MOVE A BOUNDING WALL, re-detect, merge. Nothing is mocked but the
// WallStore's `getByLevel`, which is the engine's only input.
//
// FOUR CHECKS, and two CONTROLS THAT RUN EVERY TIME — because a gate never watched failing
// is not a gate:
//
//   CHECK 1 · a 6.0 m wall move (centroid shift 3.0 m, PAST the old 2.0 m radius) preserves
//             id, name, occupancyType, finishes and ifcData.guid.
//   CHECK 2 · a 40 m wall move — a displacement no radius widening could ever cover —
//             preserves the same fields. This is what distinguishes a STRUCTURAL fix from
//             a widened threshold: a threshold always has a cliff further out.
//   CHECK 3 · SPLIT CONTROL. A genuine split (a partition drawn through a named room) must
//             still yield TWO rooms with TWO DISTINCT ids, exactly one inheriting the
//             parent's name. This is the anti-over-matching arm: it fails if the fix made
//             everything match everything, and it preserves the Apr-2026 PARTITION-FIX.
//   CHECK 4 · DISJOINT CONTROL. An unrelated room 100 m away, sharing no walls, must NOT be
//             claimed. Fails if structural matching were made unconditional.
//
//   POSITIVE CONTROL (a FLOOR, not a check): the identity checker is run against a
//   DELIBERATELY IDENTITY-LOSING merge — the pre-fix centroid-only matcher, reimplemented
//   here — over the very same 6.0 m move. The checker MUST report loss. If it reports
//   "clean" over a merge known to destroy identity, the checker is BLIND and the gate exits
//   2 MISCONFIGURED, never 0. This is the arm that makes CHECK 1's green believable.
//
//   SPLIT-PRODUCES-TWO CONTROL (a FLOOR): the split fixture must actually detect TWO rooms
//   before CHECK 3's verdict means anything. A fixture that produced one room would let
//   CHECK 3 pass vacuously.
//
// Node-native. `RoomDetectionEngine` reaches THREE via `@pryzm/renderer-three`, which is
// why this file is run through tsx like every other gate here.

import { reportGate, type GateResult, type Floor } from '../contract.js';
import { RoomDetectionEngine } from '../../../../packages/room-topology/src/RoomDetectionEngine.js';
import type { RoomData } from '../../../../packages/room-topology/src/RoomTypes.js';

const LEVEL = 'L1';
const CENTROID_MATCH_RADIUS = 2.0; // the pre-fix radius, mirrored for the positive control

interface Pt { x: number; y: number; z: number }
interface Wall { id: string; type: string; baseLine: [Pt, Pt]; height: number; thickness: number; baseOffset: number; levelId: string; childrenIds: string[]; openings: unknown[]; metadata: Record<string, unknown> }

function wall(id: string, s: [number, number], e: [number, number], thickness = 0.2): Wall {
  return {
    id, type: 'wall',
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 2.7, thickness, baseOffset: 0, levelId: LEVEL,
    childrenIds: [], openings: [],
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'cert', version: 1 },
  };
}

/** The REAL engine, over a minimal WallStore double (getByLevel is its only input). */
function detect(walls: Wall[]): RoomData[] {
  const store = { getByLevel: (l: string) => (l === LEVEL ? walls : []) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RoomDetectionEngine(store as any).detectRoomsForLevel(LEVEL, 0, 2.7);
}

/** An 8 m × 6 m room whose EAST wall sits at `eastX`. Moving it is the wall move. */
function rect(eastX: number, tag = 'r'): Wall[] {
  return [
    wall(`${tag}-south`, [0, 0], [eastX, 0]),
    wall(`${tag}-east`, [eastX, 0], [eastX, 6]),
    wall(`${tag}-north`, [eastX, 6], [0, 6]),
    wall(`${tag}-west`, [0, 6], [0, 0]),
  ];
}

const SEMANTICS = {
  name: 'Master Bedroom',
  roomNumber: '101',
  occupancyType: 'residential',
  finishes: { floor: 'oak-parquet', wall: 'plaster-white', ceiling: 'gypsum' },
  ifcData: { guid: 'IFC-GUID-STABLE-0001', name: 'Master Bedroom' },
  revitId: 'REVIT-778812',
} as const;

function stamp(r: RoomData): RoomData {
  return { ...r, ...SEMANTICS } as unknown as RoomData;
}

/**
 * THE IDENTITY CHECKER — one implementation, used by the real checks AND by the positive
 * control. Returns the list of fields that did NOT survive. Empty = identity preserved.
 */
function identityLosses(before: RoomData, after: RoomData): string[] {
  const lost: string[] = [];
  if (after.id !== before.id) lost.push(`id (${before.id} → ${after.id})`);
  if (after.name !== SEMANTICS.name) lost.push(`name ("${SEMANTICS.name}" → "${after.name}")`);
  if (after.roomNumber !== SEMANTICS.roomNumber) lost.push(`roomNumber ("${SEMANTICS.roomNumber}" → "${after.roomNumber}")`);
  if (after.occupancyType !== SEMANTICS.occupancyType) lost.push(`occupancyType (${SEMANTICS.occupancyType} → ${after.occupancyType})`);
  if (JSON.stringify(after.finishes) !== JSON.stringify(SEMANTICS.finishes)) lost.push(`finishes (${JSON.stringify(after.finishes)})`);
  if (after.ifcData?.guid !== SEMANTICS.ifcData.guid) lost.push(`ifcData.guid (${SEMANTICS.ifcData.guid} → ${String(after.ifcData?.guid)}) — the IFC round-trip JOIN KEY`);
  if (after.revitId !== SEMANTICS.revitId) lost.push(`revitId (${SEMANTICS.revitId} → ${String(after.revitId)})`);
  return lost;
}

/** The PRE-FIX matcher, reimplemented verbatim — the positive control's known-bad merge. */
function centroidOnlyMerge(detected: RoomData[], existing: RoomData[]): RoomData[] {
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
      ifcData: best.ifcData, revitId: best.revitId } as RoomData;
  });
}

// ═══ RUN ═════════════════════════════════════════════════════════════════════

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const engine = new RoomDetectionEngine({ getByLevel: () => [] } as any);

// ── FLOOR 0 · the fixtures must produce the subjects the checks grade ────────
const baseRooms = detect(rect(8));
floors.push({ what: 'rooms detected in the base 8×6 m fixture', measured: baseRooms.length, min: 1 });

const movedRooms = detect(rect(14));
floors.push({ what: 'rooms detected after the 6.0 m wall move', measured: movedRooms.length, min: 1 });

const base = baseRooms.length === 1 ? stamp(baseRooms[0]!) : null;
floors.push({
  what: 'boundingWallIds on the seeded room (the structural evidence itself)',
  measured: base?.boundingWallIds?.length ?? 0, min: 4,
});

// ── FLOOR 1 · POSITIVE CONTROL — can the checker SEE identity loss at all? ───
// Feed the checker a merge KNOWN to destroy identity (the pre-fix centroid matcher over a
// 6 m move, measured at 3.0 m centroid shift vs a 2.0 m radius). It MUST report losses.
let controlDetected = 0;
if (base && movedRooms.length === 1) {
  const lostByControl = identityLosses(base, centroidOnlyMerge([movedRooms[0]!], [base])[0]!);
  controlDetected = lostByControl.length;
  lines.push(
    `   POSITIVE CONTROL · the pre-fix centroid-only matcher over the SAME 6.0 m move lost ` +
    `${lostByControl.length} field(s): ${lostByControl.map((l) => l.split(' ')[0]).join(', ')} ` +
    `— the checker has teeth.`,
  );
}
floors.push({
  what: 'POSITIVE CONTROL: fields the checker detects as lost under a known-bad merge',
  measured: controlDetected, min: 6,
});

// ── FLOOR 2 · the SPLIT fixture must actually split ──────────────────────────
const splitWalls = [...rect(10), wall('r-partition', [5, 0], [5, 6], 0.1)];
const splitDetected = detect(splitWalls);
floors.push({ what: 'rooms detected in the SPLIT fixture (CHECK 3 is vacuous below 2)', measured: splitDetected.length, min: 2 });

if (floors.every((f) => f.measured >= f.min) && base) {
  // ── CHECK 1 · a 6.0 m wall move (3.0 m centroid shift, past the old 2.0 m radius) ──
  const merged1 = engine.mergeWithExisting([movedRooms[0]!], [base])[0]!;
  const lost1 = identityLosses(base, merged1);
  if (lost1.length > 0) {
    findingNames.push(`6.0 m wall move: room identity lost (${lost1.length} field(s))`);
    lines.push(`❌ CHECK 1 · 6.0 m wall move (centroid shift 3.0 m): LOST ${lost1.join(' · ')}`);
  } else {
    lines.push(
      `✓  CHECK 1 · 6.0 m wall move (centroid shift 3.0 m, past the 2.0 m radius): id, name, ` +
      `roomNumber, occupancyType, finishes, ifcData.guid and revitId all survived; ` +
      `area reshaped ${base.computed.area.toFixed(1)} → ${merged1.computed.area.toFixed(1)} m².`,
    );
  }

  // ── CHECK 2 · 40 m — beyond ANY widened radius ──────────────────────────────
  const far = detect(rect(48));
  if (far.length !== 1) {
    findingNames.push('40 m wall move: fixture did not yield one room');
    lines.push('❌ CHECK 2 · the 40 m fixture did not detect exactly one room — no verdict possible.');
  } else {
    const merged2 = engine.mergeWithExisting([far[0]!], [base])[0]!;
    const lost2 = identityLosses(base, merged2);
    if (lost2.length > 0) {
      findingNames.push(`40 m wall move: room identity lost (${lost2.length} field(s))`);
      lines.push(`❌ CHECK 2 · 40 m wall move (centroid shift 20 m): LOST ${lost2.join(' · ')}`);
    } else {
      lines.push('✓  CHECK 2 · 40 m wall move (centroid shift 20 m): identity survived — the match is STRUCTURAL, not a widened threshold.');
    }
  }

  // ── CHECK 3 · SPLIT CONTROL — the fix must not make everything match everything ──
  const parent = stamp(detect(rect(10))[0]!);
  const mergedSplit = engine.mergeWithExisting(splitDetected, [parent]);
  const ids = new Set(mergedSplit.map((r) => r.id));
  const inheritors = mergedSplit.filter((r) => r.id === parent.id).length;
  const named = mergedSplit.filter((r) => r.name === SEMANTICS.name).length;
  if (mergedSplit.length !== 2 || ids.size !== 2 || inheritors !== 1 || named !== 1) {
    findingNames.push(`SPLIT control: ${mergedSplit.length} room(s), ${ids.size} distinct id(s), ${inheritors} inheritor(s)`);
    lines.push(
      `❌ CHECK 3 · SPLIT: expected 2 rooms / 2 distinct ids / exactly 1 inheriting the parent, got ` +
      `${mergedSplit.length} / ${ids.size} / ${inheritors} (named=${named}). ` +
      `A split that collapses onto one id destroys a room the user drew.`,
    );
  } else {
    lines.push('✓  CHECK 3 · SPLIT: 2 rooms, 2 distinct ids, exactly 1 inherits the parent identity — the PARTITION-FIX holds.');
  }

  // ── CHECK 4 · DISJOINT CONTROL — an unrelated room must not be claimed ───────
  const farAway = detect([
    wall('b-south', [100, 100], [108, 100]), wall('b-east', [108, 100], [108, 106]),
    wall('b-north', [108, 106], [100, 106]), wall('b-west', [100, 106], [100, 100]),
  ]);
  if (farAway.length !== 1) {
    findingNames.push('DISJOINT control: fixture did not yield one room');
    lines.push('❌ CHECK 4 · the disjoint fixture did not detect exactly one room — no verdict possible.');
  } else {
    const mergedFar = engine.mergeWithExisting([farAway[0]!], [base])[0]!;
    if (mergedFar.id === base.id || mergedFar.name === SEMANTICS.name) {
      findingNames.push('DISJOINT control: an unrelated room 100 m away CLAIMED the seeded identity');
      lines.push('❌ CHECK 4 · DISJOINT: a room 100 m away sharing NO walls claimed the seeded identity — matching is over-broad.');
    } else {
      lines.push('✓  CHECK 4 · DISJOINT: a room 100 m away sharing no walls was NOT claimed.');
    }
  }
}

const result: GateResult = {
  gate: 'check-room-identity-survives-wall-move',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0, NO BASELINE. A room that comes back under a different id has lost its name,
  // its schedule row, its finishes and its IFC join key — and ADR-0319 grants `id` and
  // `ifcData.guid` NO TOLERANCE EVER. There is no level of this that is acceptable debt.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
