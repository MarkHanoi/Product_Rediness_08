// @vitest-environment happy-dom
//
// §FIX-WALL-JOIN-BASELINE-IMMUTABLE (L-44 / L-46 / L-47, founder 2026-07-02) — a wall's
// authored BASELINE is IMMUTABLE except by an explicit user move/edit. A whole-level JOIN
// re-resolve (triggered by a NEARBY CREATE, a TYPE CHANGE, an undo/redo, or a project open)
// is a RENDER-TIME footprint operation and must NEVER mutate/persist another wall's stored
// baseline/length.
//
// THE unified founder defect (three reports, one root cause):
//   • L-44 — a 3-wall T renders a perfect PREVIEW but a wrong COMMIT: the legacy resolver
//     square-capped a stem arm 0.004 m off the node and persisted that trimmed baseline.
//   • L-46 — changing a wall's TYPE shrank the wall (§DIAG-WALL-SPIKE srcLen→newLen,
//     bMoved=true): the type re-resolve's trim was persisted.
//   • L-47 — drawing a NEARBY wall shrank an unrelated, already-cleanly-joined wall: the
//     nearby re-resolve trimmed its endpoint "to consensus" and wrote it back.
//
// ROOT CAUSE: `WallRebuildCoordinator._rebuildWalls` wrote the resolver's TRIMMED baseline
// back to the store (`store.update({ baseLine: _newBL })`) for any move the destructive-only
// §POST-RESOLVE-PRESERVE guard did not classify as a spike/collapse/lateral-pivot. Small
// along-axis join trims sailed through and mutated the authored length.
//
// THE FIX (WallRebuildCoordinator §FIX-WALL-JOIN-BASELINE-IMMUTABLE): anchor EVERY moved,
// authored-valid wall back to its `_sourceBaseLine` on a join re-resolve — the store length
// never changes on a join. The trim still flows to the render footprint via the JoinData
// miter normals + the V2 footprint (both computed from the authored source), so joins still
// mitre/butt cleanly; only the PERSIST is suppressed.
//
// This suite drives the REAL `WallRebuildCoordinator` load/edit path end to end (real
// `WallStore`, real `WallJoinResolver.resolveLevel` inside the real `_flush`) — only the
// render seam (FragmentBuilder) + level provider are stubbed. It asserts baselines are
// byte-stable across: the initial 3-wall T commit, a nearby-wall create, and a type change.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

const LEVEL_ID = 'L';

function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

function makeBuilderStub() {
    return {
        builds: 0,
        removeWall(_id: string): void { /* render seam */ },
        buildWall(_wall: WallData, _adj: unknown, _renderMap: unknown, _worldY: number): void { this.builds++; },
        recordBuiltVersion(_id: string, _wall: WallData, _adj: unknown, _slabOff: number): void { /* render seam */ },
        updateWall(_wall: WallData, _join: unknown, _renderMap: unknown, _slabOff: number): void { /* render seam */ },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

function makeCoordinator(store: WallStore) {
    const coord = new WallRebuildCoordinator();
    const builder = makeBuilderStub();
    coord.init({
        wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
        slabStore: { getAll: () => [] },
        bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
        doorBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
    });
    return { coord, builder };
}

let _seq = 0;
function mkWall(id: string, bl: BL, thickness: number): WallData {
    return {
        id,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-XX-${(++_seq).toString().padStart(3, '0')}` },
        childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);
function endpointDrift(a: BL, b: BL): number {
    return Math.max(dist(a[0], b[0]), dist(a[1], b[1]));
}
function blOf(store: WallStore, id: string): BL {
    const w = store.getById(id)!;
    return [
        { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z },
        { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z },
    ];
}

/** Build a store + coordinator, add the scene while paused, then drive the real load flush. */
function setup(records: WallData[]): { store: WallStore } {
    const provider = makeLevelProvider();
    const store = new WallStore(new ProjectContext(), provider as unknown as ConstructorParameters<typeof WallStore>[1]);
    makeCoordinator(store);
    window.__wallRebuildControl!.pause();
    for (const rec of records) {
        store.add({ ...rec, baseLine: [{ ...rec.baseLine[0] }, { ...rec.baseLine[1] }] } as WallData);
    }
    window.__wallRebuildControl!.resumeAndFlush();
    return { store };
}

/** Apply an edit while paused, then drain it through the real whole-level `_flush`. */
function editAndFlush(fn: () => void): void {
    window.__wallRebuildControl!.pause();
    fn();
    window.__wallRebuildControl!.resumeAndFlush();
}

// The founder's L-44 T of THREE DIFFERENT walls: two collinear bar walls of different
// thickness meeting at the node (4,0) + a perpendicular stem of a third thickness whose
// start lands 0.004 m off the node — the exact "angled arm 0.004m off junction" report.
const AUTH = {
    barL: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] as BL,
    barR: [{ x: 4, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }] as BL,
    stem: [{ x: 4, y: 0, z: 0.004 }, { x: 4, y: 0, z: 4 }] as BL,
};
function buildT(): WallData[] {
    return [
        mkWall('barL', AUTH.barL, 0.20),
        mkWall('barR', AUTH.barR, 0.16),
        mkWall('stem', AUTH.stem, 0.10),
    ];
}

describe('§FIX-WALL-JOIN-BASELINE-IMMUTABLE — a join never mutates a stored baseline', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    });

    it('the 3-wall T commits with every baseline byte-unchanged (== authored) — L-44', () => {
        const { store } = setup(buildT());
        expect(endpointDrift(blOf(store, 'barL'), AUTH.barL)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'barR'), AUTH.barR)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'stem'), AUTH.stem)).toBeLessThanOrEqual(1e-4);
    });

    it('creating a NEARBY wall does NOT change any existing wall length/baseline — L-47', () => {
        const { store } = setup(buildT());
        const before = { barL: blOf(store, 'barL'), barR: blOf(store, 'barR'), stem: blOf(store, 'stem') };
        // A new wall forming an L-corner at the stem's free end (4,4) — the classic re-resolve
        // that trimmed the neighbour's endpoint "to consensus" and shrank it before the fix.
        editAndFlush(() => {
            store.add(mkWall('neo', [{ x: 4, y: 0, z: 4 }, { x: 7, y: 0, z: 4 }], 0.12));
        });
        expect(endpointDrift(blOf(store, 'stem'), before.stem)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'barL'), before.barL)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'barR'), before.barR)).toBeLessThanOrEqual(1e-4);
        // ...and each still equals the AUTHORED line (no cumulative drift either).
        expect(endpointDrift(blOf(store, 'stem'), AUTH.stem)).toBeLessThanOrEqual(1e-4);
    });

    it('changing a wall TYPE (thickness) leaves the baseline byte-identical — L-46', () => {
        const { store } = setup(buildT());
        const before = blOf(store, 'stem');
        // Simulate UPDATE_WALL_SYSTEM_TYPE: thickness/material change, baseline untouched by
        // the command — the whole-level re-resolve it triggers must not shrink the wall.
        editAndFlush(() => {
            store.update('stem', { thickness: 0.20, _renderVersion: 1 } as unknown as Partial<WallData>);
        });
        expect(store.getById('stem')!.thickness).toBeCloseTo(0.20, 6);
        expect(endpointDrift(blOf(store, 'stem'), before)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'stem'), AUTH.stem)).toBeLessThanOrEqual(1e-4);
    });

    it('repeated join re-resolves (create → type change) never drift the baseline', () => {
        const { store } = setup(buildT());
        editAndFlush(() => store.add(mkWall('neo', [{ x: 4, y: 0, z: 4 }, { x: 7, y: 0, z: 4 }], 0.12)));
        editAndFlush(() => store.update('barR', { thickness: 0.24, _renderVersion: 1 } as unknown as Partial<WallData>));
        editAndFlush(() => store.update('stem', { thickness: 0.14, _renderVersion: 2 } as unknown as Partial<WallData>));
        expect(endpointDrift(blOf(store, 'stem'), AUTH.stem)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'barL'), AUTH.barL)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'barR'), AUTH.barR)).toBeLessThanOrEqual(1e-4);
    });
});
