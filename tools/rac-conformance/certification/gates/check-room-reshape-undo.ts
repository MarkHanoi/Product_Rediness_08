// ─── GATE · check-room-reshape-undo ──────────────────────────────────────────
//
// THE INVARIANT (the founder's non-negotiable):
//   ONE WALL DRAG + ITS ROOM CONSEQUENCES = ONE UNDO UNIT.
//   One Ctrl+Z reverts the wall AND the rooms — together, or the model is left in
//   a state the user never created and cannot see is wrong.
//
// ─── WHY THIS GATE EXISTS ────────────────────────────────────────────────────
// The reshape chain crosses two undo mechanisms and one non-undoable command, and
// every one of those seams is a way for half a gesture to survive a Ctrl+Z:
//
//  1. `ReDetectRoomsCommand` — the command that USED to reshape rooms after a wall
//     move — is `nonUndoable` by its own header ("automatic background
//     operation"). A wall move followed by a redetect was therefore ALREADY only
//     half-undoable: Ctrl+Z put the wall back and left the rooms detected against
//     the new wall position. The new `ApplyPredictedRoomGeometryCommand` is
//     UNDOABLE precisely to close that, and CHECK 3 below pins the difference —
//     because "we made it undoable" is a claim about a class, and a claim about a
//     class is worth nothing without a measurement.
//  2. PRYZM has TWO undo stacks (C03 §4.4) and one user action can land in both.
//     `performUndo` tells a TWIN from two separate actions by GESTURE ID
//     (§UNDO-GESTURE-ID) — and an entry with NO id is never a twin of anything.
//     A room mutation dispatched without the wall's gesture id is, by that rule,
//     a SEPARATE user action, and needs a SECOND Ctrl+Z. That is the failure this
//     gate's CHECK 2 measures directly.
//  3. Undo snapshots of a room are nested objects (`boundary`, `computed`). A
//     shallow snapshot aliases the record it is about to replace and "restores"
//     the NEW value — an undo that silently does nothing. CHECK 4.
//
// ─── THE CHECKS ──────────────────────────────────────────────────────────────
//   CHECK 1 · UNDO RESTORES. Execute the reshape, undo it, and the room's polygon,
//             area, perimeter, centroid and bounding box are all back to their
//             pre-execute values — exactly, not approximately.
//   CHECK 2 · ONE GESTURE. The wall dispatch and the room reshape carry the SAME
//             gesture id. Driven through the REAL `ConsequenceExecutionService`
//             over a recording bus, so this measures the wiring, not a comment.
//   CHECK 3 · UNDOABILITY CLASS. `ApplyPredictedRoomGeometryCommand` implements a
//             real `undo` and does NOT declare itself non-undoable — unlike
//             `ReDetectRoomsCommand`, which is asserted to still BE non-undoable
//             so the distinction cannot silently collapse in either direction.
//   CHECK 4 · IDENTITY + DEEP SNAPSHOT. Undo adds no room, removes none, and
//             restores nested geometry (the aliasing bug above).
//
// ─── POSITIVE CONTROL — EXECUTED ON EVERY RUN (a FLOOR, not a check) ─────────
// The undo checker is re-run against a DELIBERATELY BROKEN reshape — a command
// double whose `undo` returns success but restores NOTHING, which is exactly what
// a non-undoable room mutation looks like from the outside. The checker MUST
// report that the room failed to revert. If it reports "reverted" over a room that
// plainly did not, the checker is BLIND and this gate exits 2 MISCONFIGURED. That
// is what makes CHECK 1's green mean anything.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED / blind comparator · 3 exceeded.
// HARD-0: half-undone geometry has no acceptable level.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { ApplyPredictedRoomGeometryCommand } from '../../../../packages/command-registry/src/rooms/ApplyPredictedRoomGeometryCommand.js';
import type { PredictedRoomGeometry } from '../../../../packages/command-registry/src/rooms/ApplyPredictedRoomGeometryCommand.js';
import { ConsequenceExecutionService } from '../../../../apps/editor/src/engine/consequence/ConsequenceExecutionService.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');

const lines: string[] = [];
const findingNames: string[] = [];
const floors: Floor[] = [];

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── The world ───────────────────────────────────────────────────────────────

const PRE_POLYGON = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];
const PRE_COMPUTED = {
  area: 24, grossArea: 24, perimeter: 20, volume: 64.8,
  centroid: { x: 3, z: 2 }, boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 4 },
};

const makeRoom = (id = 'room-1'): any => ({
  id, levelId: 'L1', name: 'Kitchen', roomNumber: '00-004',
  boundingWallIds: ['wall-s', 'wall-e', 'wall-n', 'wall-w'],
  boundary: { polygon: structuredClone(PRE_POLYGON), height: 2.7, baseOffset: 0, detectionMethod: 'manual-boundary' },
  computed: structuredClone(PRE_COMPUTED),
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

const PREDICTED: PredictedRoomGeometry = {
  elementId: 'room-1',
  polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }],
  area: 18, perimeter: 18, centroid: { x: 3, z: 1.5 },
  boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 3 },
};

/**
 * THE UNDO CHECKER — one implementation, used by the real check AND the positive
 * control. Returns the fields that did NOT revert. Empty = fully reverted.
 */
function revertFailures(after: any): string[] {
  const bad: string[] = [];
  if (JSON.stringify(after?.boundary?.polygon) !== JSON.stringify(PRE_POLYGON)) {
    bad.push(`polygon (expected ${JSON.stringify(PRE_POLYGON)}, got ${JSON.stringify(after?.boundary?.polygon)})`);
  }
  if (after?.computed?.area !== PRE_COMPUTED.area) bad.push(`area (${PRE_COMPUTED.area} → ${after?.computed?.area})`);
  if (after?.computed?.perimeter !== PRE_COMPUTED.perimeter) bad.push(`perimeter (${PRE_COMPUTED.perimeter} → ${after?.computed?.perimeter})`);
  if (JSON.stringify(after?.computed?.centroid) !== JSON.stringify(PRE_COMPUTED.centroid)) bad.push('centroid');
  if (JSON.stringify(after?.computed?.boundingBox) !== JSON.stringify(PRE_COMPUTED.boundingBox)) bad.push('boundingBox');
  return bad;
}

// ─── CHECK 1 · UNDO RESTORES ─────────────────────────────────────────────────

const store = new RoomStore([makeRoom()]);
const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
const execRes = cmd.execute(ctxOf(store));
const midArea = store.getById('room-1')?.computed?.area;

floors.push({
  what: 'rooms actually RESHAPED before undo is measured (an unexecuted reshape cannot prove an undo)',
  measured: execRes.affectedElementIds.length, min: 1,
});
floors.push({
  what: 'the reshape CHANGED the area (a no-op execute would make undo vacuously "correct")',
  measured: midArea === PRE_COMPUTED.area ? 0 : 1, min: 1,
});

const undoRes = cmd.undo(ctxOf(store));
const failures = revertFailures(store.getById('room-1'));

if (failures.length > 0 || !undoRes.success) {
  findingNames.push(`UNDO: the room did not revert — ${failures.join('; ')}`);
  lines.push(`❌ CHECK 1 · UNDO: ${failures.join(' · ')}`);
} else {
  lines.push(`✓  CHECK 1 · UNDO: the reshape (${PRE_COMPUTED.area} → ${midArea} m²) reverted EXACTLY — polygon, area, perimeter, centroid and bounding box all restored.`);
}

// ─── CHECK 2 · ONE GESTURE (driven through the REAL service) ─────────────────

const dispatchedGestures: (string | undefined)[] = [];
let reshapeGesture: string | undefined;

const planStub: any = {
  planId: 'p', planHash: 'H', stateHash: 'S',
  command: { type: 'wall.move', payload: { id: 'wall-n' } },
  direct: { kind: 'determined', elements: ['wall-n'] },
  indirect: { kind: 'determined', elements: ['room-1'] },
  changed: [], excluded: [],
  topology: { added: [], removed: [], modified: [] },
  validation: { violationsCreated: [], violationsResolved: [] },
  regeneration: { required: [], skipped: [] },
  refused: [], undetermined: [],
  predictedGeometry: [PREDICTED],
};

const service = new ConsequenceExecutionService({
  bus: {
    executeCommand: async (_t: string, _p: unknown, o?: { gestureId?: string }) => {
      dispatchedGestures.push(o?.gestureId);
      return { id: 'evt-cert' } as any;
    },
  },
  // A planner that reproduces the supplied hash ⇒ the plan BINDS and the reshape runs.
  planners: new Map([['wall.move', { plan: async () => planStub }]]) as any,
  context: () => ({ getStore: () => undefined }),
  applyPredictedRoomGeometry: (_pred: unknown, _u: unknown, g: string) => {
    reshapeGesture = g;
    return { applied: ['room-1'], levelIds: ['L1'] };
  },
  readRoomGeometry: () => [PREDICTED as any],
} as any);

await service.execute(
  { type: 'wall.updateBaseline', payload: { wallId: 'wall-n', newBaseLine: [] } } as any,
  { plan: planStub },
);

floors.push({
  what: 'wall dispatches observed through the real ConsequenceExecutionService',
  measured: dispatchedGestures.length, min: 1,
});
floors.push({
  what: 'room reshapes invoked by the real service (0 ⇒ the plan did not bind and CHECK 2 would pass vacuously)',
  measured: reshapeGesture === undefined ? 0 : 1, min: 1,
});

const wallGesture = dispatchedGestures[0];
if (!wallGesture || reshapeGesture !== wallGesture) {
  findingNames.push(`GESTURE: wall dispatch carried "${String(wallGesture)}" but the room reshape carried "${String(reshapeGesture)}" — two gestures, two Ctrl+Z presses`);
  lines.push(`❌ CHECK 2 · ONE GESTURE: wall="${String(wallGesture)}" room="${String(reshapeGesture)}". An unmatched id makes the room mutation a SEPARATE user action (§UNDO-GESTURE-ID).`);
} else {
  lines.push(`✓  CHECK 2 · ONE GESTURE: the wall dispatch and the room reshape both carry "${wallGesture}" — one user action, one undo unit.`);
}

// ─── CHECK 3 · UNDOABILITY CLASS ─────────────────────────────────────────────
// Read the two source files: the new command must implement undo and NOT be
// non-undoable; ReDetectRoomsCommand must STILL be non-undoable. Asserting both
// directions stops the distinction collapsing silently either way.

const applySrc = readFileSync(resolve(REPO, 'packages/command-registry/src/rooms/ApplyPredictedRoomGeometryCommand.ts'), 'utf8');
const redetectSrc = readFileSync(resolve(REPO, 'packages/command-registry/src/rooms/ReDetectRoomsCommand.ts'), 'utf8');

floors.push({ what: 'source bytes read for the undoability comparison', measured: applySrc.length + redetectSrc.length, min: 2000 });

const applyHasUndo = /\bundo\s*\(/.test(applySrc);
const applyNonUndoable = /nonUndoable\s*(=|:)\s*true/.test(applySrc);
const redetectNonUndoable = /nonUndoable\s*(=|:)\s*true/.test(redetectSrc);

if (!applyHasUndo || applyNonUndoable) {
  findingNames.push(`UNDOABILITY: ApplyPredictedRoomGeometryCommand hasUndo=${applyHasUndo} nonUndoable=${applyNonUndoable}`);
  lines.push(`❌ CHECK 3 · UNDOABILITY: the reshape command must implement undo and must not be non-undoable (hasUndo=${applyHasUndo}, nonUndoable=${applyNonUndoable}).`);
} else if (!redetectNonUndoable) {
  findingNames.push('UNDOABILITY: ReDetectRoomsCommand is no longer declared non-undoable — the distinction this phase rests on has collapsed');
  lines.push('❌ CHECK 3 · UNDOABILITY: ReDetectRoomsCommand is no longer non-undoable. Either it became undoable (a change outside this phase) or the marker moved; the comparison is no longer meaningful.');
} else {
  lines.push('✓  CHECK 3 · UNDOABILITY: the reshape command is UNDOABLE while ReDetectRoomsCommand remains non-undoable — the reshape is on the undo path, the background redetect is not.');
}

// ─── CHECK 4 · IDENTITY + DEEP SNAPSHOT ──────────────────────────────────────

const s4 = new RoomStore([makeRoom(), makeRoom('room-2')]);
const idsBefore = s4.getAll().map((r) => r.id).sort().join(',');
const c4 = new ApplyPredictedRoomGeometryCommand([PREDICTED]);
c4.execute(ctxOf(s4));
const idsMid = s4.getAll().map((r) => r.id).sort().join(',');
c4.undo(ctxOf(s4));
const idsAfter = s4.getAll().map((r) => r.id).sort().join(',');
const deepOk = revertFailures(s4.getById('room-1')).length === 0;

if (idsBefore !== idsMid || idsBefore !== idsAfter || !deepOk) {
  findingNames.push(`IDENTITY/DEEP: ids ${idsBefore} → ${idsMid} → ${idsAfter}, nested-restore-ok=${deepOk}`);
  lines.push(`❌ CHECK 4 · IDENTITY/DEEP: ids ${idsBefore} → ${idsMid} → ${idsAfter}; nested geometry restored=${deepOk}. A shallow snapshot aliases the record it replaces and "restores" the new value.`);
} else {
  lines.push('✓  CHECK 4 · IDENTITY/DEEP: no room added or removed across execute+undo, and nested boundary/computed restored — the snapshot is a real deep copy.');
}

// ─── POSITIVE CONTROL — the undo checker must SEE a failure to revert ────────
// A reshape whose undo reports success and restores nothing: precisely what a
// non-undoable room mutation looks like from outside.

const ctrlStore = new RoomStore([makeRoom()]);
ctrlStore.update('room-1', {
  ...ctrlStore.getById('room-1'),
  boundary: { ...ctrlStore.getById('room-1').boundary, polygon: structuredClone(PREDICTED.polygon) },
  computed: { ...PRE_COMPUTED, area: PREDICTED.area, perimeter: PREDICTED.perimeter },
});
const controlFailures = revertFailures(ctrlStore.getById('room-1'));
floors.push({
  what: 'POSITIVE CONTROL — revert failures the checker reports over a room that was NOT reverted',
  measured: controlFailures.length, min: 1,
});
lines.push(
  controlFailures.length > 0
    ? `✓  POSITIVE CONTROL: a room left in its reshaped state IS reported as un-reverted (${controlFailures.length} field(s)) — the checker is not blind.`
    : '❌ POSITIVE CONTROL: the checker reported "fully reverted" over a room still holding its reshaped geometry. Every green above is meaningless.',
);

const result: GateResult = {
  gate: 'check-room-reshape-undo',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0. A gesture that undoes halfway leaves the model in a state the user
  // never created — worse than either endpoint, and invisible.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
