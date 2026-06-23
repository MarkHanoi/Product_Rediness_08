// @vitest-environment happy-dom
//
// §POST-RESOLVE-PRESERVE-ANCHOR — REAL load-flush integration test.
//
// The sibling suite `postResolvePreserveReloadStability.test.ts` MODELS the
// resolver (it replays the `_flush` store-write decision with a hand-written
// `pivotResolve` stand-in). This suite closes that gap: it drives the REAL
// `WallRebuildCoordinator` load path end to end —
//
//   • a REAL `WallStore` (constructed against a minimal real level provider),
//   • the coordinator's PUBLIC load entry `window.__wallRebuildControl.resumeAndFlush()`
//     (`_resumeAndFlush` → `_flush`, the exact entry the engine launcher calls when a
//     project finishes loading — it pauses the pipeline during the bulk `store.add`
//     burst, then resumes-and-flushes once the scene is populated),
//   • the REAL `WallJoinResolver.resolveLevel` inside `_flush`,
//   • the REAL `WallRebuildCoordinator.decidePreservedBaseline` + the REAL
//     `store.update` write-back that anchors the preserved baseline.
//
// Only the RENDER seam (the FragmentBuilder) and the level provider are stubbed —
// neither participates in the endpoint-stability decision, which lives entirely in
// `_flush` (resolve → preserve decision → `store.update`). No decision logic is faked.
//
// The persisted scene is a 3-way COLLINEAR PASS-THROUGH junction: two long
// collinear walls A—B sharing an interior point, plus a diagonal stem landing on
// that shared point. That is the founder's signature cluster (the diagonal stem is
// the wall that drifted ~403mm on every open). We run load→flush TWICE (simulating
// open, then save+reload+open) and assert every wall endpoint is STABLE (≤1mm)
// across the two loads.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

const LEVEL_ID = 'L';

// ── Minimal REAL level provider (the WallStore's only non-wall dependency) ──────────
// WallStore reads levels exclusively through `bimKernel.getLevelById` / `.getLevels`.
// This is a legitimate seam (ILevelProvider), not a faked decision path.
function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

// ── Render-seam stub. None of these methods influence the committed baseline —
//    they only paint geometry. Recorded counts let us assert the rebuild ran. ──────
function makeBuilderStub() {
    return {
        builds: 0,
        removeWall(_id: string): void { /* render seam */ },
        buildWall(_wall: WallData, _adj: unknown, _renderMap: unknown, _worldY: number): void { this.builds++; },
        recordBuiltVersion(_id: string, _wall: WallData, _adj: unknown, _slabOff: number): void { /* render seam */ },
        updateWall(_wall: WallData, _join: unknown, _renderMap: unknown, _slabOff: number): void { /* render seam */ },
        // refreshV2Cache intentionally ABSENT → the coordinator's `typeof refresh === 'function'`
        // guard skips the V2 path (it is a render-cache hand-off, not a baseline decision).
    };
}

// A duck-typed scene satisfying WallJunctionInfillManager.update(infills, scene):
// it only ever calls scene.remove / scene.add, and only when meshes exist (none here).
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
        // camera null → getWorldToleranceForActiveCamera returns the clamped legacy
        // default (deterministic), renderer.domElement undefined is tolerated, scene
        // is the duck-typed no-op above.
        world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
    });
    return { coord, builder };
}

let _seq = 0;
function mkWall(bl: BL, thickness: number): WallData {
    return {
        id: `wr_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-XX-${_seq.toString().padStart(3, '0')}` },
        childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1 },
    } as unknown as WallData;
}

/** Serialize the store the way ProjectSerializer does (§WALL-JOIN-SAVE-FIX: save
 *  `_sourceBaseLine ?? baseLine`; the loaded wall has NO `_sourceBaseLine` field —
 *  it is folded into `baseLine` on save) and return plain wall records ready to be
 *  re-`add`ed to a fresh store. This is the disk round-trip. */
function persist(store: WallStore): WallData[] {
    return store.getAll().map((w) => {
        const src = (w as unknown as { _sourceBaseLine?: BL })._sourceBaseLine ?? (w.baseLine as unknown as BL);
        return {
            ...w,
            baseLine: [{ ...src[0] }, { ...src[1] }],
            _sourceBaseLine: undefined,
        } as unknown as WallData;
    });
}

/** Build a fresh store + coordinator, add the persisted scene (each `add` emits to the
 *  coordinator → queued while paused), then drive the REAL load entry. Returns the
 *  resulting store + the per-wall endpoint snapshot keyed by id. */
function loadAndFlush(records: WallData[]): { store: WallStore; ends: Map<string, BL>; builds: number } {
    const provider = makeLevelProvider();
    const store = new WallStore(new ProjectContext(), provider as unknown as ConstructorParameters<typeof WallStore>[1]);
    const { coord, builder } = makeCoordinator(store);

    // §F.2 — the launcher PAUSES the wall pipeline during the bulk load burst so the
    // resolver runs ONCE at the end, not once per added wall. Mirror that exactly.
    window.__wallRebuildControl!.pause();
    for (const rec of records) {
        store.add({ ...rec, baseLine: [{ ...rec.baseLine[0] }, { ...rec.baseLine[1] }] } as WallData);
    }
    // THE REAL LOAD ENTRY — resumeAndFlush() resumes the pipeline and synchronously
    // drains the queued adds through the real _flush (resolve → preserve → store.update).
    window.__wallRebuildControl!.resumeAndFlush();

    // Stop the coordinator from reacting to later stores in the same test.
    void coord;

    const ends = new Map<string, BL>();
    for (const w of store.getAll()) {
        ends.set(w.id, [
            { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z },
            { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z },
        ]);
    }
    return { store, ends, builds: builder.builds };
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);
function endpointDrift(a: BL, b: BL): number {
    return Math.max(dist(a[0], b[0]), dist(a[1], b[1]));
}

describe('§POST-RESOLVE-PRESERVE-ANCHOR — real load→flush is idempotent (≤1mm across reloads)', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    });

    /** The founder's 3-way collinear pass-through cluster:
     *   A: (10, 2.815) → (16, 2.815)   collinear, thick shell
     *   B: (16, 2.815) → (22, 2.815)   collinear continuation of A (shared interior pt)
     *   stem: (15.815, 3.044) → (16.309, 4.356)  diagonal landing ON the shared point
     */
    function buildScene(): WallData[] {
        const A = mkWall([{ x: 10.0, y: 0, z: 2.815 }, { x: 16.0, y: 0, z: 2.815 }], 0.2);
        const B = mkWall([{ x: 16.0, y: 0, z: 2.815 }, { x: 22.0, y: 0, z: 2.815 }], 0.2);
        const stem = mkWall([{ x: 15.815, y: 0, z: 3.044 }, { x: 16.309, y: 0, z: 4.356 }], 0.1);
        return [A, B, stem];
    }

    it('drives the REAL __wallRebuildControl.resumeAndFlush() load entry (rebuild actually runs)', () => {
        const r1 = loadAndFlush(buildScene());
        // The whole-level rebuild ran for every wall through the real _flush → buildWall.
        expect(r1.builds).toBeGreaterThan(0);
        // Every wall endpoint is finite (no NaN escaped resolveLevel + the preserve path).
        for (const bl of r1.ends.values()) {
            expect(Number.isFinite(bl[0].x) && Number.isFinite(bl[0].z)).toBe(true);
            expect(Number.isFinite(bl[1].x) && Number.isFinite(bl[1].z)).toBe(true);
        }
    });

    it('load → flush TWICE keeps every wall endpoint STABLE (≤1mm) across the reload', () => {
        // ── Open #1 ──
        const r1 = loadAndFlush(buildScene());

        // ── Save (disk round-trip) + Open #2 ──
        const reloaded = persist(r1.store);
        const r2 = loadAndFlush(reloaded);

        // Same wall set, same ids.
        expect([...r2.ends.keys()].sort()).toEqual([...r1.ends.keys()].sort());

        for (const [id, bl1] of r1.ends) {
            const bl2 = r2.ends.get(id)!;
            const drift = endpointDrift(bl1, bl2);
            // eslint-disable-next-line no-console
            console.log(`[load-flush] wall ${id} drift across reload = ${(drift * 1000).toFixed(3)}mm`);
            expect(drift).toBeLessThanOrEqual(0.001);
        }
    });

    it('a THIRD reload stays pinned to the second (no slow walk)', () => {
        const r1 = loadAndFlush(buildScene());
        const r2 = loadAndFlush(persist(r1.store));
        const r3 = loadAndFlush(persist(r2.store));
        for (const [id, bl2] of r2.ends) {
            const bl3 = r3.ends.get(id)!;
            const drift = endpointDrift(bl2, bl3);
            expect(drift).toBeLessThanOrEqual(0.001);
        }
    });
});
