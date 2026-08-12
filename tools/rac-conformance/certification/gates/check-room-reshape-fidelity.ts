// ─── GATE · check-room-reshape-fidelity ──────────────────────────────────────
//
// THE INVARIANT (the founder's non-negotiable, in one sentence):
//   PREVIEW AND EXECUTION MUST USE THE SAME PREDICTED GEOMETRY. The polygon the
//   confirmation card showed is BYTE-IDENTICAL to the polygon that lands in the
//   room store. No second room-detection algorithm may silently replace it.
//
// ─── WHY THIS GATE EXISTS — the measured defect it pins closed ───────────────
// Before SAFE MODE ROOM RESHAPE, two different algorithms answered "what shape is
// this room after the wall moves?":
//   • PREVIEW  — `predictRoomGeometry` (pure, per-room, over the room's declared
//     `boundingWallIds`, welding at `COINCIDENT_M` = 1 mm, with typed per-room
//     refusals). The founder's `Kitchen: 12.4 m² → 10.8 m²` card is its output.
//   • EXECUTION — nothing. The wall committed; `RoomTopologyObserver` fired the
//     NON-UNDOABLE `ReDetectRoomsCommand`; `RoomDetectionEngine` re-partitioned
//     the WHOLE LEVEL, welding at 0.05 m — fifty times looser. Whatever polygon
//     that produced is what the user got.
// The number a human approved was not the number that got written, and NOTHING in
// the system could tell. This gate is the thing that can now tell.
//
// ─── WHY IT BUILDS ITS OWN WORLD ─────────────────────────────────────────────
// It drives the REAL `predictRoomGeometry` (the preview's algorithm) and the REAL
// `ApplyPredictedRoomGeometryCommand` (the execution path) over a store double,
// then compares the COMMITTED polygon against the PREDICTED one byte-for-byte.
// The store double is the only stand-in: it is the command's sole output surface,
// and using the production store here would require a composed runtime without
// making the comparison any more real.
//
// ─── THE CHECKS ──────────────────────────────────────────────────────────────
//   CHECK 1 · FIDELITY. Predict a wall move, commit the prediction, read the store
//             back: the polygon must be byte-identical, and so must area,
//             perimeter, centroid and bounding box.
//   CHECK 2 · SEMANTICS UNTOUCHED. id, name, roomNumber, occupancyType, finishes,
//             ifcData, revitId, boundingWallIds and `boundary.detectionMethod`
//             survive the reshape unchanged. A reshape that renames a room, or
//             that rewrites `detectionMethod` from `manual-boundary` to an
//             auto value, has DESTROYED authored provenance (C75 §1.1: the system
//             may not mint `authored` — and may not erase it either).
//   CHECK 3 · UNDETERMINED IS NEVER "UNCHANGED". A room whose prediction is
//             UNDETERMINED must be reported and left untouched — never written,
//             never counted as reshaped, never silently dropped.
//   CHECK 4 · NO RECOMPUTE. The committed area must equal the PREDICTED area even
//             when that area disagrees with a shoelace of the committed ring —
//             i.e. the command writes what it was given rather than deriving it.
//             This is the arm that catches "helpful" recomputation, which is how a
//             second algorithm sneaks back in wearing the first one's name.
//
// ─── POSITIVE CONTROL — EXECUTED ON EVERY RUN (a FLOOR, not a check) ─────────
// The comparator is re-run over a DELIBERATELY DEVIATING commit: the same
// prediction, then a rival polygon written over it — exactly what
// `RoomDetectionEngine` would do if the suppression failed. The comparator MUST
// report divergence. If it reports "identical" over a commit known to differ, the
// comparator is BLIND and this gate exits 2 MISCONFIGURED rather than 0. That is
// what makes CHECK 1's green believable: a gate never watched failing is not a
// gate.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED / blind comparator · 3 exceeded.
// HARD-0, no baseline: there is no acceptable level of "the user got a shape they
// did not approve".

import { reportGate, type GateResult, type Floor } from '../contract.js';
import { predictRoomGeometry } from '../../../../packages/room-topology/src/predictRoomGeometry.js';
import { ApplyPredictedRoomGeometryCommand } from '../../../../packages/command-registry/src/rooms/ApplyPredictedRoomGeometryCommand.js';
import type { PredictedRoomGeometry } from '../../../../packages/command-registry/src/rooms/ApplyPredictedRoomGeometryCommand.js';

const lines: string[] = [];
const findingNames: string[] = [];
const floors: Floor[] = [];

// ─── The world ───────────────────────────────────────────────────────────────

interface Pt { x: number; z: number }
interface W { id: string; baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] }

const w = (id: string, a: [number, number], b: [number, number]): W => ({
  id, baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
});

const SEMANTICS = {
  name: 'Kitchen', roomNumber: '00-004', occupancyType: 'kitchen',
  finishes: { floor: { materialName: 'oak', materialColor: '#c9a37b' } },
  ifcData: { guid: 'IFC-GUID-RESHAPE-0001', ifcClass: 'IfcSpace' },
  revitId: 'REVIT-55021',
} as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
const makeRoom = (id = 'room-1'): any => ({
  id, levelId: 'L1', ...SEMANTICS,
  boundingWallIds: ['wall-s', 'wall-e', 'wall-n', 'wall-w'],
  boundary: {
    polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    height: 2.7, baseOffset: 0, detectionMethod: 'manual-boundary',
  },
  computed: {
    area: 24, grossArea: 24, perimeter: 20, volume: 64.8,
    centroid: { x: 3, z: 2 }, boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 4 },
  },
  metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'cert-user', version: 2 },
});

class RoomStore {
  private m = new Map<string, any>();
  constructor(rooms: any[]) { for (const r of rooms) this.m.set(r.id, structuredClone(r)); }
  getById(id: string): any { return this.m.get(id) ?? null; }
  getAll(): any[] { return [...this.m.values()]; }
  update(id: string, next: any): void { this.m.set(id, structuredClone(next)); }
}

const ctxOf = (store: RoomStore): any => ({
  stores: { roomStore: store },
  bimManager: { getLevels: () => [{ id: 'L1', elevation: 0, height: 2.7 }] },
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * THE COMPARATOR — one implementation, used by the real checks AND by the positive
 * control. Returns the list of geometry fields that DIVERGED. Empty = fidelity.
 */
function divergences(predicted: PredictedRoomGeometry, committed: {
  boundary?: { polygon?: readonly Pt[] };
  computed?: { area?: number; perimeter?: number; centroid?: Pt; boundingBox?: unknown };
}): string[] {
  const out: string[] = [];
  const pj = JSON.stringify(predicted.polygon);
  const cj = JSON.stringify(committed.boundary?.polygon);
  if (pj !== cj) out.push(`polygon (predicted ${pj} → committed ${cj})`);
  if (committed.computed?.area !== predicted.area) out.push(`area (${predicted.area} → ${committed.computed?.area})`);
  if (committed.computed?.perimeter !== predicted.perimeter) out.push(`perimeter (${predicted.perimeter} → ${committed.computed?.perimeter})`);
  if (JSON.stringify(committed.computed?.centroid) !== JSON.stringify(predicted.centroid)) out.push('centroid');
  if (JSON.stringify(committed.computed?.boundingBox) !== JSON.stringify(predicted.boundingBox)) out.push('boundingBox');
  return out;
}

// ─── Produce a real prediction through the REAL preview algorithm ────────────
// Move the north wall from z=4 to z=3: the 6×4 room becomes 6×3 (24 m² → 18 m²).

const movedWalls = [
  w('wall-s', [0, 0], [6, 0]),
  w('wall-e', [6, 0], [6, 3]),
  w('wall-n', [6, 3], [0, 3]),
  w('wall-w', [0, 3], [0, 0]),
];

const prediction = predictRoomGeometry(
  movedWalls as never,
  { wallId: 'wall-n', baseLine: [{ x: 6, z: 3 }, { x: 0, z: 3 }] },
  [makeRoom()] as never,
);

const determined = prediction.rooms.filter((r) => r.kind === 'determined');
floors.push({ what: 'rooms with a DETERMINED prediction from the real predictor', measured: determined.length, min: 1 });
floors.push({ what: 'rooms considered by the predictor', measured: prediction.rooms.length, min: 1 });

if (determined.length === 0) {
  lines.push('⚠  the predictor produced no determined prediction — no fidelity verdict is possible.');
} else {
  const p = determined[0] as Extract<typeof determined[number], { kind: 'determined' }>;
  const predicted: PredictedRoomGeometry = {
    elementId: p.roomId, polygon: p.polygon, area: p.area, perimeter: p.perimeter,
    centroid: p.centroid, boundingBox: p.boundingBox,
  };

  // ── CHECK 1 · FIDELITY ────────────────────────────────────────────────────
  const store = new RoomStore([makeRoom()]);
  const cmd = new ApplyPredictedRoomGeometryCommand([predicted]);
  cmd.execute(ctxOf(store));
  const committed = store.getById('room-1');
  const diverged = divergences(predicted, committed);

  if (diverged.length > 0) {
    findingNames.push(`FIDELITY: committed geometry differs from predicted — ${diverged.join('; ')}`);
    lines.push(`❌ CHECK 1 · FIDELITY: ${diverged.join(' · ')}`);
  } else {
    lines.push(
      `✓  CHECK 1 · FIDELITY: the committed polygon is BYTE-IDENTICAL to the predicted one ` +
      `(${p.polygon.length} vertices, ${p.area.toFixed(4)} m² — predicted by the SAME function the preview calls).`,
    );
  }

  // ── CHECK 2 · SEMANTICS + AUTHORED PROVENANCE UNTOUCHED ───────────────────
  const lost: string[] = [];
  const base = makeRoom();
  if (committed.id !== base.id) lost.push(`id (${base.id} → ${committed.id})`);
  if (committed.name !== SEMANTICS.name) lost.push(`name`);
  if (committed.roomNumber !== SEMANTICS.roomNumber) lost.push('roomNumber');
  if (committed.occupancyType !== SEMANTICS.occupancyType) lost.push('occupancyType');
  if (JSON.stringify(committed.finishes) !== JSON.stringify(SEMANTICS.finishes)) lost.push('finishes');
  if (committed.ifcData?.guid !== SEMANTICS.ifcData.guid) lost.push('ifcData.guid — the IFC round-trip JOIN KEY');
  if (committed.revitId !== SEMANTICS.revitId) lost.push('revitId');
  if (JSON.stringify(committed.boundingWallIds) !== JSON.stringify(base.boundingWallIds)) lost.push('boundingWallIds (MEMBERSHIP — a reshape may not re-partition)');
  if (committed.boundary?.detectionMethod !== 'manual-boundary') lost.push(`boundary.detectionMethod (manual-boundary → ${committed.boundary?.detectionMethod}) — AUTHORED provenance destroyed by a system write (C75 §1.1)`);
  if (committed.metadata?.createdBy !== 'cert-user') lost.push('metadata.createdBy');
  if (committed.metadata?.createdAt !== 1) lost.push('metadata.createdAt');

  if (lost.length > 0) {
    findingNames.push(`SEMANTICS: a geometry-only reshape altered ${lost.join('; ')}`);
    lines.push(`❌ CHECK 2 · SEMANTICS: ${lost.join(' · ')}`);
  } else {
    lines.push('✓  CHECK 2 · SEMANTICS: id, name, roomNumber, occupancy, finishes, ifcData.guid, revitId, membership and authored detectionMethod all survive the reshape.');
  }

  // ── CHECK 4 · NO RECOMPUTE ────────────────────────────────────────────────
  // A prediction whose `area` deliberately disagrees with a shoelace of its own
  // ring. A command that WRITES WHAT IT WAS GIVEN stores 999; a command that
  // "helpfully" recomputes stores the shoelace — and a recomputing command is a
  // second algorithm by definition.
  const sentinel: PredictedRoomGeometry = { ...predicted, area: 999, perimeter: 888 };
  const s2 = new RoomStore([makeRoom()]);
  new ApplyPredictedRoomGeometryCommand([sentinel]).execute(ctxOf(s2));
  const got = s2.getById('room-1');
  if (got.computed?.area !== 999 || got.computed?.perimeter !== 888) {
    findingNames.push(`NO-RECOMPUTE: the command derived its own metrics (area ${got.computed?.area}, perimeter ${got.computed?.perimeter}) instead of writing the supplied 999/888`);
    lines.push(`❌ CHECK 4 · NO-RECOMPUTE: the command RECOMPUTED — area=${got.computed?.area}, perimeter=${got.computed?.perimeter}, expected the supplied 999/888. A recomputing executor IS the second algorithm.`);
  } else {
    lines.push('✓  CHECK 4 · NO-RECOMPUTE: the command wrote the supplied metrics verbatim; it derives nothing.');
  }

  // ── POSITIVE CONTROL — the comparator must SEE a deviation ────────────────
  // Simulate the suppression failing and RoomDetectionEngine overwriting the ring.
  const hijacked = structuredClone(committed);
  hijacked.boundary.polygon = [
    { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2.95 }, { x: 0, z: 2.95 },
  ];
  const controlDiverged = divergences(predicted, hijacked);
  floors.push({
    what: 'POSITIVE CONTROL — divergences the comparator reports over a deliberately hijacked commit',
    measured: controlDiverged.length, min: 1,
  });
  lines.push(
    controlDiverged.length > 0
      ? `✓  POSITIVE CONTROL: a rival polygon written over the committed one IS detected (${controlDiverged.length} field(s) diverged) — the comparator is not blind.`
      : '❌ POSITIVE CONTROL: the comparator reported IDENTICAL over a commit known to differ. Every green above is meaningless.',
  );
}

// ── CHECK 3 · UNDETERMINED IS NEVER "UNCHANGED" ────────────────────────────
// Drive the moved baseline THROUGH the room's interior — a genuine split/merge
// that the pure predictor must refuse rather than answer.
const crossing = predictRoomGeometry(
  [w('wall-s', [0, 0], [6, 0]), w('wall-e', [6, 0], [6, 4]), w('wall-n', [6, 4], [0, 4]), w('wall-w', [0, 4], [0, 0])] as never,
  { wallId: 'wall-s', baseLine: [{ x: 3, z: -2 }, { x: 3, z: 6 }] },
  [makeRoom()] as never,
);
const refusals = crossing.rooms.filter((r) => r.kind === 'undetermined');
floors.push({ what: 'typed per-room refusals produced by the real predictor', measured: refusals.length, min: 1 });

if (refusals.length === 0) {
  findingNames.push('UNDETERMINED: the predictor answered confidently for a move that crosses the room interior');
  lines.push('❌ CHECK 3 · UNDETERMINED: a baseline driven through the room interior produced NO refusal — a split/merge was answered as a recompute.');
} else {
  const r = refusals[0] as Extract<typeof refusals[number], { kind: 'undetermined' }>;
  const store = new RoomStore([makeRoom()]);
  const cmd = new ApplyPredictedRoomGeometryCommand([], [
    { elementId: r.roomId, reason: r.reason, detail: r.detail },
  ]);
  const res = cmd.execute(ctxOf(store));
  const after = store.getById('room-1');
  const untouched = after.computed.area === 24
    && JSON.stringify(after.boundary.polygon) === JSON.stringify(makeRoom().boundary.polygon);
  const reported = cmd.undeterminedRooms.length === 1;

  if (!untouched || !reported || res.affectedElementIds.length !== 0) {
    findingNames.push(`UNDETERMINED: untouched=${untouched}, reported=${reported}, written=${res.affectedElementIds.length}`);
    lines.push(`❌ CHECK 3 · UNDETERMINED (${r.reason}): untouched=${untouched} reported=${reported} written=${res.affectedElementIds.length}. An unpredictable room was either written or silently dropped.`);
  } else {
    lines.push(`✓  CHECK 3 · UNDETERMINED (${r.reason}): the room is NOT touched, IS reported, and nothing was written — "could not predict" never became "nothing changed".`);
  }
}

const result: GateResult = {
  gate: 'check-room-reshape-fidelity',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0, NO BASELINE. There is no tolerable level of "the committed shape is
  // not the shape the human approved" — the whole safety property is binary.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
