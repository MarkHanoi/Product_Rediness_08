// @vitest-environment happy-dom
//
// §WJFIX92 F-2 (L-11311) + F-3 (L-11312) — AN OPENING EDIT MUST NOT OPEN A MITRED JOINT.
//
// THE PRODUCTION DEFECT (founder, 2026-08-25): *"I updated all windows via RAC — some
// windows on update CORRUPTED the wall they were hosted on and the mitred joint went out"*,
// permanently, surviving undo. The measured chain (WINJOINT91):
//
//   opening-only wall update
//     → the openings-only fast path's §DIAG-OPENING-VOID check fails (F-1's false positive,
//       or a genuine un-carved body) → `_rebuildWalls` → the whole-level `_flush`
//     → `_flush` re-resolved the level at a CAMERA-DERIVED snapRadius (0.05–1.0 m) instead
//       of the 0.5 m `DEFAULT_SNAP_RADIUS` the junctions were solved at
//     → junctions outside the new tolerance vanish from `adjustments`
//     → §STALE-CACHE-FIX rebuilds those walls with `joinData = null` — SQUARE CAPS — and
//       `_prevJoinMap` is wiped, so the good mitre is unrecoverable.
//
// Probe `packages/geometry-wall/probes/probe-wj91-01-snapradius-mitre-loss.local.mts`
// measured the cost on a 0.20 m welded-band corner: at 0.50 m both walls are mitred with
// joint gap 0.0000 m; at 0.12 m and 0.05 m there are NO adjustments, both miter normals are
// false, and the gap opens to 0.2000 m. THIS SUITE USES THAT EXACT CORNER.
//
// What is REAL here: a real `WallStore`, the real `WallRebuildCoordinator`, the real
// `WallJoinResolver.resolveLevel` inside `_flush`, and a camera stub that yields the
// TIGHTEST production tolerance (0.05 m) — the value that USED to reach the resolver.
// Only the render seam (FragmentBuilder) is stubbed, and it records the `JoinData` each
// wall was built with, which is the whole subject. Harness shape mirrors the sibling
// `postResolvePreserveLoadFlush.test.ts`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallStore, WallJoinResolver, DEFAULT_SNAP_RADIUS } from '@pryzm/geometry-wall';
import type { WallData, Level, JoinData } from '@pryzm/geometry-wall';
import { ProjectContext, getWorldToleranceForActiveCamera, DEFAULT_SNAP_PIXEL_RADIUS } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

const LEVEL_ID = 'L';

/** The tightest tolerance production can hand the resolver — what the removed
 *  `getWorldToleranceForActiveCamera` call produced at close zoom. Asserted, not assumed. */
const TIGHT_TOL = 0.05;

function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

/**
 * A camera + canvas making `getWorldToleranceForActiveCamera(8, cam, canvas)` = 0.05 m:
 *   viewWidth = (right-left)/zoom = 10/1 = 10 ; 8 px * 10 / 1600 px = 0.05 m.
 * If F-2 ever regresses, THIS is the number that reaches `resolveLevel` and the S2 corner
 * loses its mitre. (Borrowed from `wallCreateOnHostBodyStoredBaseline.test.ts`.)
 */
function makeCameraStub() {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    const domElement = { clientWidth: 1600, clientHeight: 900, width: 1600, height: 900 };
    return { camera, domElement };
}

/** Render seam. Records the LAST `JoinData` each wall was built/updated with. */
function makeBuilderStub() {
    const lastJoin = new Map<string, JoinData | null>();
    const buildCount = new Map<string, number>();
    return {
        lastJoin,
        buildCount,
        _rec(wall: WallData, join: unknown): void {
            lastJoin.set(wall.id, (join ?? null) as JoinData | null);
            buildCount.set(wall.id, (buildCount.get(wall.id) ?? 0) + 1);
        },
        removeWall(_id: string): void { /* render seam */ },
        buildWall(wall: WallData, join: unknown, _renderMap: unknown, _worldY: number): void { this._rec(wall, join); },
        updateWall(wall: WallData, join: unknown, _renderMap: unknown, _slabOff: number): void { this._rec(wall, join); },
        recordBuiltVersion(_id: string, _w: WallData, _a: unknown, _s: number): void { /* render seam */ },
        // §DIAG-OPENING-VOID needs a group to inspect. Returning `undefined` is the
        // `path=no-group` arm ⇒ voidCut=false ⇒ the openings-only fast path routes to the
        // whole-level `_rebuildWalls` fallback. That is DELIBERATE: the fallback IS the
        // corruption vector under test, and this is the cheapest honest way to reach it.
        getWallRoot(_id: string): undefined { return undefined; },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

function makeCoordinator(store: WallStore) {
    const coord = new WallRebuildCoordinator();
    const builder = makeBuilderStub();
    const { camera, domElement } = makeCameraStub();
    coord.init({
        wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
        slabStore: { getAll: () => [] },
        bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
        doorBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        world: {
            camera: { three: camera },
            renderer: { three: { domElement } },
            scene: { three: fakeScene },
        },
    });
    return { coord, builder };
}

function mkWall(id: string, bl: BL, thickness: number, openings: Array<{ id: string; elementId: string }> = []): WallData {
    return {
        id,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-XX-${id}` },
        // `WallDataAddSchema` requires childrenIds ⊇ openings[*].elementId (C15 §8).
        childrenIds: openings.map(o => o.elementId),
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness,
        baseOffset: 0,
        openings,
        // LAYERED, exactly as probe 1's fixture and the founder's walls are: the layer
        // stack is what routes the body through `LayeredWallOpeningBuilder` (F-1's arm) and
        // it is an input the resolver reads, so a plain wall is a different measurement.
        layers: [
            { name: 'finish-ext', function: 'finish-exterior', thickness: 0.02 },
            { name: 'core',       function: 'structure',      thickness: 0.26 },
            { name: 'finish-int', function: 'finish-interior', thickness: 0.02 },
        ],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** The wall-side opening record. `elementId` is REQUIRED by `OpeningSchema`. */
const WIN = (width: number): { id: string; elementId: string } => ({
    id: 'op-1', type: 'window', offset: 2.0, width, height: 1.5, sillHeight: 0.9,
    elementId: 'win-1',
} as unknown as { id: string; elementId: string });

/** The WallStore's own thin window record — `updateWindow` returns early without it, so
 *  without this the opening edit would silently write nothing and emit no wall event. */
const WIN_RECORD = {
    id: 'win-1', type: 'window', wallId: 'A2', openingId: 'op-1',
    width: 1.2, height: 1.5, sillHeight: 0.9, offset: 2.0,
    frameThickness: 0.05, frameWidth: 0.05,
    properties: {}, childrenIds: [],
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
};

/**
 * PROBE 1's S2, TRANSCRIBED EXACTLY — a corner whose two endpoints are 0.20 m APART: the
 * routine "welded band" state a hand-drawn near-corner, a weld inside `weldTol`, or a store
 * still holding a POST-TRIM baseline (§V2-PRETRIM-FIX) all leave behind.
 *   A2 (0,0) → (5.80,0) ; B2 (6.0,0) → (6.0,4) ; thickness 0.3.
 * Measured: mitred at 0.50 m with jointGap 0.0000 m; NO adjustments at 0.12 / 0.05 m, both
 * miter normals false, jointGap 0.2000 m.
 */
function s2Corner(openings: Array<{ id: string; elementId: string }> = []): WallData[] {
    return [
        mkWall('A2', [{ x: 0, y: 0, z: 0 }, { x: 5.8, y: 0, z: 0 }], 0.3, openings),
        mkWall('B2', [{ x: 6.0, y: 0, z: 0 }, { x: 6.0, y: 0, z: 4 }], 0.3),
    ];
}

/**
 * Probe 1's number, measured WHERE IT IS MEANINGFUL — on the RESOLVER's own output.
 * The gap between the two walls' resolved ends at the corner: 0.0000 m when the junction
 * is seen (the shorter wall's end is carried to the crossing), 0.2000 m when it is not.
 *
 * ⚠ NOT applicable to the JoinData the COORDINATOR hands the builder. That JoinData
 * deliberately carries the wall's AUTHORED baseline — §FIX-WALL-JOIN-BASELINE-IMMUTABLE
 * (L-44/46/47): "a join is a RENDER-TIME footprint operation and must NEVER mutate/persist
 * another wall's stored baseline". Measured on this fixture: the coordinator builds A2 from
 * [0,0]→[5.8,0] WITH `endMN` set, so a baseline-gap assertion there reads 0.2 on a perfectly
 * mitred joint. On that path the MITER NORMAL is the mitre, and that is what is asserted.
 */
function resolverJointGap(snapRadius: number): number {
    const adj = WallJoinResolver.resolveLevel(
        s2Corner().map(w => ({ ...w })) as never, { snapRadius },
    ) as Map<string, JoinData>;
    const a = adj.get('A2');
    const b = adj.get('B2');
    const ae = a ? a.baseLine[1] : { x: 5.8, z: 0 };
    const bs = b ? b.baseLine[0] : { x: 6.0, z: 0 };
    return Math.hypot(bs.x - ae.x, bs.z - ae.z);
}

const hasMiter = (j: JoinData | null | undefined, end: 'start' | 'end'): boolean =>
    !!j && (end === 'start' ? j.startMN : j.endMN) !== null;

/** The mitre, as a comparable value: the miter normal at the corner end, rounded. */
function miterSig(j: JoinData | null | undefined, end: 'start' | 'end'): string {
    const mn = j ? (end === 'start' ? j.startMN : j.endMN) : null;
    return mn ? `${mn.nx.toFixed(9)},${mn.nz.toFixed(9)}` : 'SQUARE-CAP';
}

/** Both ends of the corner as one comparable value. */
const cornerSig = (b: ReturnType<typeof makeBuilderStub>): string =>
    `A2.end=${miterSig(b.lastJoin.get('A2'), 'end')} B2.start=${miterSig(b.lastJoin.get('B2'), 'start')}`;

function loadScene(walls: WallData[]) {
    const provider = makeLevelProvider();
    const store = new WallStore(new ProjectContext(), provider as unknown as ConstructorParameters<typeof WallStore>[1]);
    const { coord, builder } = makeCoordinator(store);
    window.__wallRebuildControl!.pause();
    for (const w of walls) store.add({ ...w, baseLine: [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] } as WallData);
    if (walls.some(w => (w.openings ?? []).length > 0)) store.addWindow({ ...WIN_RECORD } as never);
    window.__wallRebuildControl!.resumeAndFlush();
    return { store, coord, builder };
}

/**
 * The RAC window edit: change ONLY the opening's width on the host wall.
 *
 * TWO drains, deliberately. The first runs the openings-only fast path
 * (`classifyWallDelta` → `_flushOpeningsOnly`); its §DIAG-OPENING-VOID check fails on this
 * render stub and calls `_rebuildWalls`, which QUEUES the walls and schedules a rAF that no
 * test frame ever runs. The second drain is that frame — i.e. it is the whole-level fallback
 * itself, the exact leg that lost the founder's mitre. Without it this suite would assert
 * against the fast path's cached join and never reach the defect.
 */
function editOpeningWidth(store: WallStore, wallId: string, width: number): void {
    store.updateOpening(wallId, WIN(width) as never);
    // The §DIAG-OPENING-VOID fallback, invoked through its OWN public entry:
    // `_flushOpeningsOnly` calls `this._rebuildWalls(_voidNotCut)` and
    // `__wallRebuildControl.rebuildWalls` is that same method. It queues the wall as an
    // `update` with NO prevState, which is what makes `classifyWallDelta` return
    // 'whole-level' and drives the authoritative resolve — the leg that lost the mitre.
    // (Its own doc comment at the control surface already names the hazard in the
    // codebase's words: "that ZOOM-DEPENDENT re-resolve perturbs the shell baselines".)
    window.__wallRebuildControl!.rebuildWalls([wallId]);
    window.__wallRebuildControl!.resumeAndFlush();
}

describe('§WJFIX92 — a window edit on a host wall never opens its mitred joint', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        vi.restoreAllMocks();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    });

    it('CONTROL — the camera stub really does yield 0.05 m, and 0.05 m really does lose this corner', () => {
        const { camera, domElement } = makeCameraStub();
        const tol = getWorldToleranceForActiveCamera(
            DEFAULT_SNAP_PIXEL_RADIUS, camera as never, domElement as never,
        );
        expect(tol).toBeCloseTo(TIGHT_TOL, 12);
        expect(TIGHT_TOL).toBeLessThan(DEFAULT_SNAP_RADIUS);

        // The resolver's own verdict on this corner at each radius — probe 1, re-measured.
        const at = (r: number) => WallJoinResolver.resolveLevel(
            s2Corner().map(w => ({ ...w })) as never, { snapRadius: r },
        );
        expect(at(DEFAULT_SNAP_RADIUS).size, 'at 0.5 m the corner IS a junction').toBeGreaterThan(0);
        expect(at(TIGHT_TOL).size, 'at 0.05 m it is NOT — this is what F-2 stops reaching _flush').toBe(0);
        // …and the cost of not seeing it, in metres. THE plan's headline number.
        expect(resolverJointGap(DEFAULT_SNAP_RADIUS)).toBeCloseTo(0, 6);
        expect(resolverJointGap(TIGHT_TOL)).toBeCloseTo(0.2, 6);
    });

    it('F-2 — `_flush` resolves at DEFAULT_SNAP_RADIUS, never at the camera tolerance', () => {
        const spy = vi.spyOn(WallJoinResolver, 'resolveLevel');
        loadScene(s2Corner());
        expect(spy).toHaveBeenCalled();
        for (const call of spy.mock.calls) {
            const opts = call[1] as { snapRadius?: number } | undefined;
            expect(opts?.snapRadius, 'a zoom-derived radius reached the join solver').toBe(DEFAULT_SNAP_RADIUS);
        }
    });

    it('F-2 — the welded-band corner is MITRED after load (both ends carry a miter normal)', () => {
        const { builder } = loadScene(s2Corner());
        expect(hasMiter(builder.lastJoin.get('A2'), 'end'), 'A2.end miter normal').toBe(true);
        expect(hasMiter(builder.lastJoin.get('B2'), 'start'), 'B2.start miter normal').toBe(true);
    });

    it('F-2 — an OPENING-ONLY edit on the host leaves the joint BYTE-IDENTICALLY mitred', () => {
        const { store, builder } = loadScene(s2Corner([WIN(1.2)]));
        const before = cornerSig(builder);
        expect(before).not.toContain('SQUARE-CAP');

        // The founder's action: a RAC batch changing the window's width. Nothing about the
        // wall's baseline, thickness or neighbours moves.
        editOpeningWidth(store, 'A2', 1.4);

        expect(store.getById('A2')!.openings![0]!.width, 'the edit really landed').toBeCloseTo(1.4, 9);
        expect(builder.buildCount.get('A2') ?? 0, 'the host was actually rebuilt').toBeGreaterThan(1);
        expect(hasMiter(builder.lastJoin.get('A2'), 'end'), 'A2 lost its miter normal').toBe(true);
        expect(hasMiter(builder.lastJoin.get('B2'), 'start'), 'B2 lost its miter normal').toBe(true);
        // Not merely "still mitred" — mitred THE SAME. A window edit is not a joint edit.
        expect(cornerSig(builder), 'the joint MOVED on an opening-only edit').toBe(before);
    });

    it('F-3 — a solver that returns nothing while NO join input moved cannot unmitre a standing joint', () => {
        const { store, builder } = loadScene(s2Corner([WIN(1.2)]));
        const before = cornerSig(builder);
        expect(before).not.toContain('SQUARE-CAP');

        // Simulate ANY future path that re-resolves and comes back empty — a wrong
        // tolerance, a memo miss, a resolver regression. F-3 is the layer that makes the
        // mitre survive it regardless of cause, which is the point of defence in depth.
        const blind = vi.spyOn(WallJoinResolver, 'resolveLevel').mockReturnValue(new Map() as never);
        editOpeningWidth(store, 'A2', 1.4);
        expect(blind).toHaveBeenCalled();

        expect(hasMiter(builder.lastJoin.get('A2'), 'end'), 'A2 was square-capped by an empty solve').toBe(true);
        expect(hasMiter(builder.lastJoin.get('B2'), 'start'), 'B2 was square-capped by an empty solve').toBe(true);
        expect(cornerSig(builder)).toBe(before);

        // And it must still be there for the NEXT rebuild — the "unrecoverable" half of the
        // defect was `_prevJoinMap` being wiped, not just one bad frame.
        blind.mockRestore();
        editOpeningWidth(store, 'A2', 1.6);
        expect(hasMiter(builder.lastJoin.get('A2'), 'end')).toBe(true);
        expect(cornerSig(builder)).toBe(before);
    });

    it('F-3 CONTROL — when a wall genuinely MOVES APART, the joint is still dropped (no blanket retention)', () => {
        const { store, builder } = loadScene(s2Corner([WIN(1.2)]));
        expect(hasMiter(builder.lastJoin.get('A2'), 'end')).toBe(true);

        // B2 leaves: a REAL topology change, so the join inputs signature moves and the
        // retention guard must NOT fire — a retained mitre here would be a new defect.
        const b = store.getById('B2')!;
        store.update('B2', {
            ...b,
            baseLine: [{ x: 20, y: 0, z: 20 }, { x: 20, y: 0, z: 26 }],
        } as unknown as Partial<WallData>);
        window.__wallRebuildControl!.resumeAndFlush();

        expect(hasMiter(builder.lastJoin.get('A2'), 'end'), 'A2 kept a mitre for a neighbour that left').toBe(false);
    });
});
