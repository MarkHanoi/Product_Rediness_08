/**
 * UpdateFloorBoundaryCommand / UpdateCeilingBoundaryCommand — the transactional
 * write path of §FINISH-FOLLOWS-WALL, tested against the REAL stores.
 *
 * The relative import into command-registry source follows the worked precedent
 * of `geometry-slab/__tests__/c79MovePropagation.test.ts:79` (this suite lives
 * beside the trackers because the two are one capability: geometry upstream,
 * transaction here).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { FloorStore, CeilingStore, type FloorData, type CeilingData, type FloorSketchEdge } from '@pryzm/core-app-model/stores';
import { UpdateFloorBoundaryCommand } from '../../command-registry/src/floors/UpdateFloorBoundaryCommand';
import { UpdateCeilingBoundaryCommand } from '../../command-registry/src/ceilings/UpdateCeilingBoundaryCommand';
import type { CommandContext } from '../../command-registry/src/types';
import type { XZ } from '../src/FinishSegmentAdapter';

const RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];
const MOVED_RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 5.9 },
    { x: 0.1, z: 5.9 },
];

/** Host edges here are FIXTURE data for the STORE WRITE under test — the command
 *  never interprets them (the attribution/geometry paths have their own suites
 *  driven by the production producer, per C74 §3.4). */
function sketchEdges(ring: ReadonlyArray<XZ>, hostIds: (string | null)[]): FloorSketchEdge[] {
    return ring.map((p, i) => {
        const q = ring[(i + 1) % ring.length]!;
        const hostId = hostIds[i];
        return hostId
            ? { type: 'hostReference' as const, hostId, hostType: 'wall' as const, reference: 'centerLine' as const, offset: 0, fallback: { start: { ...p }, end: { ...q } } }
            : { type: 'freeLine' as const, start: { ...p }, end: { ...q } };
    });
}

const HOSTS = ['w-south', 'w-east', 'w-north', 'w-west'];

function seedFloor(store: FloorStore, id: string): void {
    store.add({
        id,
        type: 'floor',
        levelId: 'L0',
        label: `Floor-${id}`,
        floorNumber: `F.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
        sketch: { outerLoop: { edges: sketchEdges(RING, HOSTS) } },
        finishSpec: { exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: [...HOSTS],
        visible: true,
        properties: {},
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as FloorData);
}

function seedCeiling(store: CeilingStore, id: string): void {
    store.add({
        id,
        type: 'ceiling',
        levelId: 'L0',
        label: `Ceiling-${id}`,
        ceilingNumber: `C.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), height: 2.5, thickness: 0.05, baseOffset: 0, detectionMethod: 'from-room' },
        sketch: { outerLoop: { edges: sketchEdges(RING, HOSTS) } },
        finishSpec: { exposedStructure: false },
        holeElements: [],
        coveredRoomIds: [],
        boundingWallIds: [...HOSTS],
        visible: true,
        properties: {},
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcCovering', predefinedType: 'CEILING' },
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as CeilingData);
}

let floorStore: FloorStore;
let ceilingStore: CeilingStore;
let context: CommandContext;

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    floorStore = new FloorStore();
    ceilingStore = new CeilingStore();
    context = { stores: { floorStore, ceilingStore } } as unknown as CommandContext;
});

describe('UpdateFloorBoundaryCommand — reproject mode', () => {
    it('writes polygon + sketch, reports success, and is nonUndoable (derived-state maintenance)', () => {
        seedFloor(floorStore, 'fl-1');
        const cmd = new UpdateFloorBoundaryCommand({
            floorId: 'fl-1',
            mode: 'reproject',
            polygon: MOVED_RING,
            outerLoopEdges: sketchEdges(MOVED_RING, HOSTS),
            cause: { wallId: 'w-north', kind: 'wall-moved' },
        });

        expect(cmd.nonUndoable).toBe(true);
        expect(cmd.canExecute(context).ok).toBe(true);

        const result = cmd.execute(context);
        expect(result.success).toBe(true);
        expect(result.affectedElementIds).toEqual(['fl-1']);

        const stored = floorStore.getById('fl-1')!;
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 9);
        expect(stored.sketch!.outerLoop.edges).toHaveLength(4);

        // nonUndoable undo is the mandated no-op — it must not touch the store.
        const undoResult = cmd.undo(context);
        expect(undoResult.success).toBe(true);
        expect(Math.max(...floorStore.getById('fl-1')!.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 9);
    });

    it('refuses a reproject without a valid polygon, naming the count', () => {
        seedFloor(floorStore, 'fl-2');
        const cmd = new UpdateFloorBoundaryCommand({
            floorId: 'fl-2',
            mode: 'reproject',
            polygon: [{ x: 0, z: 0 }],
            outerLoopEdges: sketchEdges(MOVED_RING, HOSTS),
            cause: { wallId: 'w-north', kind: 'wall-moved' },
        });
        const validation = cmd.canExecute(context);
        expect(validation.ok).toBe(false);
        expect(validation.reason).toContain('1 vertices');
    });
});

describe('UpdateFloorBoundaryCommand — degrade mode (C79 §4.2: undoable)', () => {
    it('degrades the sketch without moving the boundary, and undo restores the references VERBATIM', () => {
        seedFloor(floorStore, 'fl-3');
        const before = floorStore.getById('fl-3')!;
        const degradedEdges = sketchEdges(RING, ['w-south', 'w-east', null, 'w-west']); // north → freeLine

        const cmd = new UpdateFloorBoundaryCommand({
            floorId: 'fl-3',
            mode: 'degrade',
            outerLoopEdges: degradedEdges,
            cause: { wallId: 'w-north', kind: 'wall-removed' },
        });
        expect(cmd.nonUndoable).toBe(false);
        expect(cmd.execute(context).success).toBe(true);

        const after = floorStore.getById('fl-3')!;
        expect(after.boundary.polygon).toEqual(before.boundary.polygon); // §4.1 — geometry survives
        expect(after.sketch!.outerLoop.edges.filter((e) => e.type === 'hostReference')).toHaveLength(3);

        const undone = cmd.undo(context);
        expect(undone.success).toBe(true);
        const restored = floorStore.getById('fl-3')!;
        expect(restored.sketch!.outerLoop.edges.filter((e) => e.type === 'hostReference')).toHaveLength(4);
        expect(restored.sketch).toEqual(before.sketch);
        // preserveMetadata=true on undo — the audit trail is not corrupted by the restore.
        expect(restored.metadata.version).toBe(floorStore.getById('fl-3')!.metadata.version);
    });

    it('names the missing record and the missing store in its refusals', () => {
        const cmd = new UpdateFloorBoundaryCommand({
            floorId: 'fl-missing',
            mode: 'degrade',
            outerLoopEdges: sketchEdges(RING, HOSTS),
            cause: { wallId: 'w-north', kind: 'wall-removed' },
        });
        expect(cmd.canExecute(context).reason).toContain('fl-missing');

        const bare = { stores: {} } as unknown as CommandContext;
        expect(cmd.canExecute(bare).reason).toContain('floorStore');
    });

    it('§NO-EMPTY-MEANS-UNKNOWN — execute WITHOUT canExecute refuses an absent edge payload rather than writing an empty loop', () => {
        seedFloor(floorStore, 'fl-noedges');
        const before = floorStore.getById('fl-noedges')!;
        const cmd = new UpdateFloorBoundaryCommand({
            floorId: 'fl-noedges',
            mode: 'degrade',
            outerLoopEdges: undefined,
            cause: { wallId: 'w-north', kind: 'wall-removed' },
        });
        // Deliberately NOT calling canExecute — the guard must hold inside
        // execute too, or a caller skipping validation writes `[]` over a
        // recorded relationship (failure-as-emptiness, C78 §1.4).
        const result = cmd.execute(context);
        expect(result.success).toBe(false);
        expect(result.error).toContain('refusing');
        expect(floorStore.getById('fl-noedges')!.sketch).toEqual(before.sketch);
    });

    it('serialize → deserialize round-trips the payload', () => {
        const cmd = new UpdateFloorBoundaryCommand({
            floorId: 'fl-ser',
            mode: 'degrade',
            outerLoopEdges: sketchEdges(RING, HOSTS),
            cause: { wallId: 'w-north', kind: 'wall-removed' },
        });
        const revived = UpdateFloorBoundaryCommand.deserialize(cmd.serialize());
        expect(revived.type).toBe(cmd.type);
        expect(revived.targetIds).toEqual(['fl-ser']);
        expect(revived.nonUndoable).toBe(false);
    });
});

describe('UpdateCeilingBoundaryCommand — the byte-identical twin', () => {
    it('reproject writes polygon + sketch through the real CeilingStore', () => {
        seedCeiling(ceilingStore, 'cl-1');
        const cmd = new UpdateCeilingBoundaryCommand({
            ceilingId: 'cl-1',
            mode: 'reproject',
            polygon: MOVED_RING,
            outerLoopEdges: sketchEdges(MOVED_RING, HOSTS),
            cause: { wallId: 'w-north', kind: 'wall-moved' },
        });
        expect(cmd.nonUndoable).toBe(true);
        expect(cmd.canExecute(context).ok).toBe(true);
        expect(cmd.execute(context).success).toBe(true);
        expect(Math.max(...ceilingStore.getById('cl-1')!.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 9);
    });

    it('degrade + undo restores the ceiling references verbatim', () => {
        seedCeiling(ceilingStore, 'cl-2');
        const before = ceilingStore.getById('cl-2')!;
        const cmd = new UpdateCeilingBoundaryCommand({
            ceilingId: 'cl-2',
            mode: 'degrade',
            outerLoopEdges: sketchEdges(RING, ['w-south', 'w-east', null, 'w-west']),
            cause: { wallId: 'w-north', kind: 'wall-removed' },
        });
        expect(cmd.nonUndoable).toBe(false);
        expect(cmd.execute(context).success).toBe(true);
        expect(ceilingStore.getById('cl-2')!.sketch!.outerLoop.edges.filter((e) => e.type === 'hostReference')).toHaveLength(3);

        expect(cmd.undo(context).success).toBe(true);
        expect(ceilingStore.getById('cl-2')!.sketch).toEqual(before.sketch);
        expect(ceilingStore.getById('cl-2')!.boundary.polygon).toEqual(before.boundary.polygon);
    });

    it('a CeilingStore polygon refusal surfaces as a FAILED command, never a silent clamp', () => {
        seedCeiling(ceilingStore, 'cl-3');
        const degenerate: XZ[] = [
            { x: 0, z: 0 },
            { x: 0, z: 0 },
            { x: 0, z: 0 },
        ];
        const cmd = new UpdateCeilingBoundaryCommand({
            ceilingId: 'cl-3',
            mode: 'reproject',
            polygon: degenerate,
            outerLoopEdges: sketchEdges(degenerate, HOSTS),
            cause: { wallId: 'w-north', kind: 'wall-moved' },
        });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result = cmd.execute(context);
        expect(result.success).toBe(false);
        expect(result.error).toContain('refused');
        // The stored ceiling is untouched.
        expect(Math.max(...ceilingStore.getById('cl-3')!.boundary.polygon.map((p) => p.z))).toBeCloseTo(3.9, 9);
    });
});
