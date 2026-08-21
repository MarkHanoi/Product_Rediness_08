/**
 * §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090 · C79 §5 · C72 §5 · C78 §1.4)
 *
 * THE FOUNDER'S DEFECT, 2026-08-21, production `071a7b2c`. He moved wall
 * `wall_01M0D7Z3SGD4FGPGRNZH12K6PG` (WA-00-006, Ground, 19.444 m) and his
 * console shows the cascade doing four things and not doing a fifth:
 *
 *     [CommandManager] EXECUTE: UPDATE_WALL_BASELINE
 *     [CommandManager] EXECUTE: CASCADE_WALL_BASELINE
 *     [CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE re-seated window … ×5
 *     [WallMoveReweldService] §MOVE-REWELD-EMPTY-PLAN … 0 re-weld entries
 *     [UpdateWallBaselineCommand] §GR12-BOUNDARY-INVALIDATION — room(s) … invalidated
 *     [CommandManager] EXECUTE: REDETECT_ROOMS → Detected 1 room(s) on level 'L0'
 *     [RoomTagAutoPopulator] … 1 refreshed
 *
 * Openings ✅ · rooms ✅ · room tags ✅ · re-weld ✅. **Floor finish: not one
 * line.** Not a refusal — SILENCE. `FinishHostDependencyTracker.onWallUpdated`
 * returned on `dependents.size === 0` with no output, so
 *   (a) "this wall bounds no finish" and
 *   (b) "every finish it bounds was created by a path that records no
 *        relationship"
 * were THE SAME VALUE. That is failure-as-emptiness (C78 §1.4), and (b) is what
 * was true: of the three floor-creation paths in this tree, only
 * `CreateFloorCommand` mints `sketch.outerLoop` host references.
 * `plugins/floor/src/handlers/CreateFloor.ts:137` and the §P3.2-FL bus→legacy
 * mirror in `initTools.ts` both write `boundingWallIds: []` and NO sketch at
 * all (L-2091), so a finish created either way is structurally incapable of
 * following a wall.
 *
 * ── WHAT THIS SPEC ASSERTS, and why each arm is not the fixture ─────────────
 * The subject is the PRODUCTION construction shape: the real
 * `FloorHostDependencyTracker`, the real `WallFaceResolver` +
 * `SketchLoopIntersector`, the real `UpdateFloorBoundaryCommand`, the real
 * `FloorStore`, and the real `attributeFinishAgainstMovedWall` hook —
 * `initTools.ts` passes exactly these. Only the wall store is a probe double,
 * and it is the SUBJECT of the move, never the source of the answer.
 *
 * Fixtures mirror `finishHostTrackerWiring.spec.ts` (6 × 4 m room, 0.2 m walls,
 * ring inset 0.1 m → 22.04 m²; north wall +2 m → 33.64 m²) so the two suites
 * cross-read: that spec drives a finish WITH a recorded sketch, this one drives
 * the identical geometry with NONE.
 *
 * CONTROLS (C74 §6.2 — an arm never watched failing is UNPROVEN):
 *   N1 — the identical move with the hook NOT wired must leave the floor at
 *        22.04 m² AND still print. Watched red for both halves: this is the
 *        pre-fix behaviour for the geometry, and the anti-silence assertion for
 *        the report. Without N1, arm 1 could be measuring the fixture.
 *   N2 — moving a wall on the SAME level that bounds no edge of the finish must
 *        attribute nothing and must say so ("checked N … none is bounded by
 *        it"). An attributor that claims every wall would pass arm 1 and fail
 *        here.
 *   N3 — a finish on a DIFFERENT storey must not be attributed at all. C79 §2.3
 *        wrong-host: `FinishHostDependencyTracker` keys on `hostId` alone and
 *        consults no level, so an unscoped repair would make a first-floor
 *        finish follow a ground-floor wall — strictly worse than inert.
 *   N4 — a record that ALREADY carries a host reference is never re-attributed.
 *        The recorded relationship is the authority (C79 §2.2).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    FloorHostDependencyTracker,
    signedAreaXZ,
    type FinishBoundaryWritePayload,
    type FinishCommandManagerRef,
    type XZ,
} from '@pryzm/finish-host-tracker';
import { UpdateFloorBoundaryCommand } from '@pryzm/command-registry';
import { WallFaceResolver, SketchLoopIntersector } from '@pryzm/geometry-slab';
import { FloorStore, type FloorData } from '@pryzm/core-app-model/stores';

// THE SUBJECT — the production hook, imported by `initTools.ts` from this path.
import { attributeFinishAgainstMovedWall } from '../finishLateAttribution';

// ── probe wall store (the wiring spec's double, plus the storey the scoping
//    needs — C79 §2.3) ─────────────────────────────────────────────────────────

type ProbeWall = { id: string; levelId: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
type WallEvent = 'add' | 'update' | 'remove';
type Listener = (e: WallEvent, w: ProbeWall, prev?: ProbeWall) => void;

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: Listener[] = [];
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    subscribe(cb: Listener): () => void {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
    }
    /** Emits the §STEP7 three-argument shape — `prevState` is the whole reason a
     *  re-projection can measure an inset at all (C72 §3.1/§3.5). */
    move(id: string, dx: number, dz: number): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        const prev: ProbeWall = { ...w, baseLine: w.baseLine.map((p) => ({ ...p })) };
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        for (const l of this.listeners) l('update', w, prev);
    }
}

const RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];

let walls: ProbeWallStore;

function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number, levelId = 'L0'): ProbeWall => ({
        id, levelId,
        baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
        thickness: 0.2,
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
    // N2's subject: same storey, parallel to the north wall, 16 m away — far
    // outside `_attributeEdge`'s PERP_TOL_M + thickness/2 band.
    store.seed(w('w-detached', 0, 20, 6, 20));
}

/**
 * THE FOUNDER'S RECORD SHAPE, verbatim in the fields that matter: a real
 * boundary polygon, `boundingWallIds: []`, and **no `sketch` key at all** —
 * exactly what `plugins/floor/src/handlers/CreateFloor.ts:118-152` and the
 * §P3.2-FL mirror write.
 */
function unattributedFloor(id: string, levelId = 'L0'): FloorData {
    return {
        id,
        type: 'floor',
        levelId,
        parentId: levelId,
        label: `Floor-${id}`,
        floorNumber: `F.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'manual-polygon' },
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        visible: true,
        opacity: 1,
        properties: {},
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcCovering', predefinedType: 'FLOORING' },
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as FloorData;
}

const areaOf = (polygon: ReadonlyArray<XZ>): number => Math.abs(signedAreaXZ(polygon));

const finishGeometryServices = { resolver: WallFaceResolver, intersector: SketchLoopIntersector };

interface RecordingCmRef extends FinishCommandManagerRef {
    executions: number;
    metadatas: Array<{ source: string } | undefined>;
}

function makeCmRef(context: unknown): RecordingCmRef {
    const ref: RecordingCmRef = {
        executions: 0,
        metadatas: [],
        current: {
            getContext: () => context,
            execute: (cmd: unknown, metadata?: { source: 'STRUCTURAL_CASCADE' }) => {
                ref.executions += 1;
                ref.metadatas.push(metadata);
                return (cmd as { execute(ctx: unknown): unknown }).execute(context);
            },
        },
    };
    return ref;
}

/** The exact `initTools.ts` construction, with the hook made optional so N1 can
 *  withhold it and watch the arm go red. */
function makeTracker(floorStore: FloorStore, cmRef: FinishCommandManagerRef, withHook: boolean) {
    return new FloorHostDependencyTracker(
        floorStore, walls as never, finishGeometryServices, cmRef,
        (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
            floorId: payload.elementId,
            mode: payload.mode,
            polygon: payload.polygon,
            outerLoopEdges: payload.outerLoopEdges,
            cause: payload.cause,
        }),
        withHook ? attributeFinishAgainstMovedWall : undefined,
    );
}

const warnsMatching = (needle: string): string[] =>
    vi.mocked(console.warn).mock.calls.map((c) => String(c[0])).filter((s) => s.includes(needle));
const logsMatching = (needle: string): string[] =>
    vi.mocked(console.log).mock.calls.map((c) => String(c[0])).filter((s) => s.includes(needle));

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    // WallFaceResolver reads window.wallStore (its documented TASK-08 seam).
    (window as unknown as { wallStore: unknown }).wallStore = walls;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    delete (window as unknown as { wallStore?: unknown }).wallStore;
    vi.restoreAllMocks();
});

describe('§FINISH-FOLLOW-LATE-ATTRIBUTION — a finish whose relationship was NEVER RECORDED still follows its wall', () => {
    it('ARM 1 — a floor with NO sketch follows a moved wall, through the command, exactly once', () => {
        const floorStore = new FloorStore();
        const cmRef = makeCmRef({ stores: { floorStore } });
        const tracker = makeTracker(floorStore, cmRef, true);

        floorStore.add(unattributedFloor('fl-founder'));
        // Precondition: the tracker knows the record and can attribute it to NOTHING.
        expect(floorStore.getById('fl-founder')!.sketch).toBeUndefined();
        expect(tracker.unattributedCount()).toBe(1);
        expect(areaOf(floorStore.getById('fl-founder')!.boundary.polygon)).toBeCloseTo(22.04, 6);

        walls.move('w-north', 0, 2);

        const stored = floorStore.getById('fl-founder')!;
        // THE DEFECT, CLOSED: the beige slab no longer sits on the old footprint.
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 6);
        // §FINISH-TRACKER-REENTRANT-SET — one move, ONE command.
        expect(cmRef.executions).toBe(1);
        // C81 / ADR-0121 — a cascade costs the user ONE undo, not two. The write is
        // announced as a structural child of the gesture that spawned it.
        expect(cmRef.metadatas[0]).toEqual({ source: 'STRUCTURAL_CASCADE' });
        // The repair is AUDIBLE: it is correct behaviour AND a standing data defect.
        expect(warnsMatching('§FINISH-FOLLOW-LATE-ATTRIBUTION')).toHaveLength(1);
        expect(warnsMatching('§FINISH-FOLLOW-LATE-ATTRIBUTION')[0]).toContain('fl-founder');
        expect(warnsMatching('§FINISH-FOLLOW-LATE-ATTRIBUTION')[0]).toContain('w-north');
        // Never the audible direct-write fallback.
        expect(warnsMatching('NOT be undoable')).toHaveLength(0);
        tracker.dispose();
    });

    it('ARM 2 — the repair RECORDS the relationship, so the next move takes the recorded path', () => {
        const floorStore = new FloorStore();
        const cmRef = makeCmRef({ stores: { floorStore } });
        const tracker = makeTracker(floorStore, cmRef, true);
        floorStore.add(unattributedFloor('fl-persist'));

        walls.move('w-north', 0, 2);

        const afterFirst = floorStore.getById('fl-persist')!;
        const hostEdges = afterFirst.sketch!.outerLoop.edges.filter((e) => e.type === 'hostReference');
        expect(hostEdges).toHaveLength(1);
        expect((hostEdges[0] as { hostId: string }).hostId).toBe('w-north');
        // No longer part of the unattributed population.
        expect(tracker.unattributedCount()).toBe(0);

        vi.mocked(console.warn).mockClear();
        walls.move('w-north', 0, 1);

        // Followed again — and WITHOUT a second late attribution, because the
        // relationship is now recorded and the recorded path owns it.
        expect(Math.max(...floorStore.getById('fl-persist')!.boundary.polygon.map((p) => p.z))).toBeCloseTo(6.9, 6);
        expect(warnsMatching('§FINISH-FOLLOW-LATE-ATTRIBUTION')).toHaveLength(0);
        expect(cmRef.executions).toBe(2);
        tracker.dispose();
    });

    it('CONTROL N1 (negative) — WITHOUT the hook the floor does NOT move, and the tracker is NOT silent', () => {
        const floorStore = new FloorStore();
        const cmRef = makeCmRef({ stores: { floorStore } });
        const tracker = makeTracker(floorStore, cmRef, /* withHook */ false);
        floorStore.add(unattributedFloor('fl-nohook'));

        walls.move('w-north', 0, 2);

        // The pre-fix geometry outcome — this is what the founder saw. Arm 1 is
        // therefore measuring the hook and not the fixture.
        expect(areaOf(floorStore.getById('fl-nohook')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        expect(cmRef.executions).toBe(0);
        // …but NOT the pre-fix silence. This half is the C78 §1.4 assertion: an
        // unserved dependent is REPORTED even when nothing can be done for it.
        const reports = warnsMatching('RELATIONSHIP_NOT_RECORDED');
        expect(reports).toHaveLength(1);
        expect(reports[0]).toContain('w-north');
        expect(reports[0]).toContain('UNMEASURED');
        tracker.dispose();
    });

    it('CONTROL N2 (negative) — a same-storey wall that bounds no edge attributes NOTHING, and says so', () => {
        const floorStore = new FloorStore();
        const cmRef = makeCmRef({ stores: { floorStore } });
        const tracker = makeTracker(floorStore, cmRef, true);
        floorStore.add(unattributedFloor('fl-discriminate'));

        walls.move('w-detached', 0, 1);

        expect(areaOf(floorStore.getById('fl-discriminate')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        expect(cmRef.executions).toBe(0);
        expect(warnsMatching('§FINISH-FOLLOW-LATE-ATTRIBUTION')).toHaveLength(0);
        // "Checked, and none of them touch this wall" — a DIFFERENT value from the
        // silence this whole change replaces.
        const checked = logsMatching('none is bounded by it');
        expect(checked).toHaveLength(1);
        expect(checked[0]).toContain('w-detached');
        expect(checked[0]).toContain('checked 1 unattributed floor(s)');
        tracker.dispose();
    });

    it('CONTROL N3 (negative) — a finish on ANOTHER storey is never attributed to this storey\'s wall', () => {
        const floorStore = new FloorStore();
        const cmRef = makeCmRef({ stores: { floorStore } });
        const tracker = makeTracker(floorStore, cmRef, true);
        // Identical geometry, different level — the wrong-host case C79 §2.3 names.
        floorStore.add(unattributedFloor('fl-upstairs', 'L1'));

        walls.move('w-north', 0, 2);

        expect(areaOf(floorStore.getById('fl-upstairs')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        expect(cmRef.executions).toBe(0);
        expect(warnsMatching('§FINISH-FOLLOW-LATE-ATTRIBUTION')).toHaveLength(0);
        tracker.dispose();
    });

    it('CONTROL N4 (negative) — an ALREADY-ATTRIBUTED record is never re-attributed by the repair', () => {
        const alreadyRecorded = {
            id: 'fl-recorded',
            boundary: { polygon: RING },
            sketch: {
                outerLoop: {
                    edges: [
                        { type: 'hostReference' as const },
                        { type: 'freeLine' as const },
                        { type: 'freeLine' as const },
                        { type: 'freeLine' as const },
                    ],
                },
            },
        };
        const prevWall = { id: 'w-north', baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }], thickness: 0.2 };
        expect(attributeFinishAgainstMovedWall(alreadyRecorded, prevWall)).toBeNull();

        // …and the identical record WITHOUT the recorded edges does attribute, so
        // the null above is the guard and not a broken fixture.
        const bare = { id: 'fl-bare', boundary: { polygon: RING } };
        const edges = attributeFinishAgainstMovedWall(bare, prevWall);
        expect(edges).not.toBeNull();
        expect(edges!.filter((e) => e.type === 'hostReference')).toHaveLength(1);
    });
});
