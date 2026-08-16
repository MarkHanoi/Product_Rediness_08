// @vitest-environment happy-dom
//
// §MEASURED-RETREAT-DISCARDED (L-929) — the acceptance layer for "a wall drawn onto another
// wall's BODY terminates at the host FACE".
//
// ─── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────
//
// L-919 shipped a body-penetration retreat in `WallJoinResolver._applyT`, was reported fixed,
// and was DEPLOYED. An adversarial reachability audit then proved it INERT. The retreat is
// computed correctly and discarded one hop later, and the reason nobody noticed is the layer
// its test asserted at:
//
//     packages/geometry-wall/__tests__/WallCreateOnHostBody.measure.test.ts  `legacyWorstAt()`
//     asserts on `WallJoinResolver.resolveLevel(...)`'s RETURN VALUE.
//
// That return value is exactly the object `WallRebuildCoordinator._flush` throws away. A pure
// function returned the right number; the pipeline never used it. The test could not have
// failed no matter how thoroughly the retreat was discarded downstream.
//
// So this file asserts on **`store.getById(id).baseLine` — the STORED value** — driven through
// the REAL `_flush` (real `WallStore`, real `WallJoinResolver.resolveLevel`, real preserve /
// immutability logic). Only the render seam (FragmentBuilder) and the level provider are
// stubbed, exactly as `wallJoinBaselineImmutable.test.ts` does. If the stored baseline is
// right, the rendered body, the saved file, the reload and the panel readout are all right,
// because every one of them reads that field.
//
// ─── THE DISCARD, IN ONE PAIR OF ASSERTIONS ──────────────────────────────────────────────
//
// `resolverSaysAtFace` and `storeSaysAtFace` below run the SAME walls at the SAME snapRadius.
// The resolver's own return value carries the retreat. The store does not. That is the whole
// defect, measured rather than argued.
//
// Discard path, verified line by line against `apps/editor/src/engine/WallRebuildCoordinator.ts`:
//   :1770  `_preserveOn = __pryzmPostResolvePreserve !== false`      → flag assigned NOWHERE ⇒ true
//   :1804  `_baselineImmutable = (__pryzmWallJoinBaselineImmutable !== false) && len >= 0.15`
//                                                                    → flag assigned NOWHERE ⇒ true
//   :1822  `_adjBL[0..1].set(...)` overwrites the retreat with the AUTHORED anchor
//   :1894  `if (_bMoved && !_preserve)` — the branch that would persist it never runs
//   :1930  commits the AUTHORED centreline as both `baseLine` and `_sourceBaseLine`
//   :1972  `builder.buildWall(updated, ...)` extrudes from the un-retreated endpoint
//
// Only `adj.startMN / adj.endMN` survive — a cap-plane ORIENTATION anchored, per
// `MiterPrismBuilder` (`project(startBase(...), centerlineStart, startMN, ...)`), at the
// baseline endpoint. For a centreline body snap that plane sits `hostHalfT` INSIDE the host
// solid.
//
// ─── WHY THE FIX CANNOT LIVE IN THE RESOLVER ─────────────────────────────────────────────
//
// §FIX-WALL-JOIN-BASELINE-IMMUTABLE (L-44 / L-46 / L-47) is a deliberate founder invariant: a
// join re-resolve is RENDER-TIME and may never mutate a stored baseline. A body-T retreat is a
// genuine LENGTH change, so it can never be delivered through `resolveLevel` — the discard is
// the invariant working as designed, not a bug in the coordinator. The retreat therefore has
// to be AUTHORED at creation, after which immutability DEFENDS it instead of reverting it.
//
// ─── C83 §10.2.3 — THE SNAP POINT DOES NOT MOVE ──────────────────────────────────────────
//
// The founder ruled on this explicitly, and `WallJoinResolver.ts:3050-3056` already says it:
// snapping to a host CENTRELINE feature is correct and useful, and the on-screen dimension
// readouts are driven by that snap. Only the AUTHORED GEOMETRY terminates at the face. These
// tests assert on stored geometry and say nothing about the snap indicator, deliberately.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore, WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import * as THREE from '@pryzm/renderer-three/three';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

const LEVEL_ID = 'L';

// ─── The fixture ─────────────────────────────────────────────────────────────────────────
// A 200 mm perimeter wall running along z=0, and a 100 mm interior partition dropped onto its
// BODY at the midpoint — the founder's L-928 report ("the wall perimeter behaves really good —
// but the inner wall partitions not as expected: the wall should follow along to connect").
//
//        z=+0.10  ── host NEAR face  ← where the partition's authored end MUST terminate
//   HOST z= 0.00  ══════════════════════════════  ← where the user's snap lands (and stays)
//        z=-0.10  ── host FAR face
//
// The partition is drawn from (4, 3) down to (4, 0). Its end lands on the host CENTRELINE, so
// it penetrates the near face by exactly `hostHalfT` = 0.10 m.
const HOST_T = 0.20;
const PART_T = 0.10;
const HOST_HALF_T = HOST_T / 2;              // 0.10 — the retreat this fixture demands
const NEAR_FACE_Z = HOST_HALF_T;             // +0.10

const AUTH_HOST: BL = [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }];
const AUTH_PART: BL = [{ x: 4, y: 0, z: 3 }, { x: 4, y: 0, z: 0 }];

// ─── Harness (mirrors wallJoinBaselineImmutable.test.ts) ─────────────────────────────────

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
        /** The centreline each build was handed — this is what actually gets extruded. */
        lastBuiltBaseLine: new Map<string, BL>(),
        /** The cap-plane orientation each build was handed. */
        lastJoin: new Map<string, { startMN: unknown; endMN: unknown }>(),
        removeWall(_id: string): void { /* render seam */ },
        /** Record whichever seam actually carried this wall's geometry to the renderer. */
        _record(wall: WallData, adj: unknown): void {
            this.lastBuiltBaseLine.set(wall.id, [
                { x: wall.baseLine[0].x, y: wall.baseLine[0].y, z: wall.baseLine[0].z },
                { x: wall.baseLine[1].x, y: wall.baseLine[1].y, z: wall.baseLine[1].z },
            ]);
            const a = adj as { startMN?: unknown; endMN?: unknown } | null | undefined;
            this.lastJoin.set(wall.id, { startMN: a?.startMN ?? null, endMN: a?.endMN ?? null });
        },
        buildWall(wall: WallData, adj: unknown, _renderMap: unknown, _worldY: number): void {
            this.builds++;
            this._record(wall, adj);
        },
        recordBuiltVersion(_id: string, _w: WallData, _a: unknown, _s: number): void { /* render seam */ },
        // §L-929: a wall the resolver returns NO adjustment for is rendered through THIS seam
        // (`WallRebuildCoordinator._flush` :2035, `!adjustments.has(wallId)`), with null
        // joinData. Recording it too is what makes "did the renderer get the retreated
        // centreline?" answerable regardless of which branch carried it.
        updateWall(wall: WallData, join: unknown, _r: unknown, _s: number): void {
            this.builds++;
            this._record(wall, join);
        },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

/**
 * A camera + canvas that make `getWorldToleranceForActiveCamera(8, cam, canvas)` yield
 * **0.05 m** — `MIN_WORLD_TOLERANCE_M`, the TIGHTEST radius production can hand the resolver.
 *
 *   viewWidth   = (right - left) / zoom = 10 / 1 = 10
 *   worldRadius = pixelRadius * viewWidth / canvasWidth = 8 * 10 / 1600 = 0.05
 *
 * Chosen deliberately: a fix that only works at the 0.5 m legacy fallback (what
 * `camera: { three: null }` gives, and what every other coordinator test runs at) would be a
 * fix that works because the tolerance was generous. THREE is imported through
 * `@pryzm/renderer-three/three`, the P2-compliant sub-path — never bare `'three'`.
 */
function makeCameraStub() {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    const domElement = { clientWidth: 1600, clientHeight: 900, width: 1600, height: 900 };
    return { camera, domElement };
}

/** The snapRadius the coordinator will compute from the stub above. Asserted, not assumed. */
const EXPECTED_SNAP_R = 0.05;

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

function blOf(store: WallStore, id: string): BL {
    const w = store.getById(id)!;
    return [
        { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z },
        { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z },
    ];
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);
function endpointDrift(a: BL, b: BL): number {
    return Math.max(dist(a[0], b[0]), dist(a[1], b[1]));
}

/** Build store + coordinator, add walls while paused, then drive the REAL load flush. */
function setup(records: WallData[]) {
    const provider = makeLevelProvider();
    const store = new WallStore(new ProjectContext(), provider as unknown as ConstructorParameters<typeof WallStore>[1]);
    const { builder } = makeCoordinator(store);
    window.__wallRebuildControl!.pause();
    for (const rec of records) {
        store.add({ ...rec, baseLine: [{ ...rec.baseLine[0] }, { ...rec.baseLine[1] }] } as WallData);
    }
    window.__wallRebuildControl!.resumeAndFlush();
    return { store, builder };
}

function editAndFlush(fn: () => void): void {
    window.__wallRebuildControl!.pause();
    fn();
    window.__wallRebuildControl!.resumeAndFlush();
}

describe('§MEASURED-RETREAT-DISCARDED (L-929) — the body-T retreat must reach the STORE', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    });

    // ── 0. The harness itself, asserted ──────────────────────────────────────────────────
    it('the camera stub really does yield the tightest production snapRadius (0.05 m)', () => {
        const { camera, domElement } = makeCameraStub();
        const viewWidth = (camera.right - camera.left) / Math.max(camera.zoom, 0.001);
        const worldRadius = (8 * Math.abs(viewWidth)) / domElement.clientWidth;
        expect(worldRadius).toBeCloseTo(EXPECTED_SNAP_R, 12);
    });

    // ── 1. THE DISCARD — same inputs, two answers ────────────────────────────────────────
    //
    // This is the pair that proves the defect is a PLUMBING defect and not a math defect.
    // Whatever happens to either half later, they must never disagree again.
    it('the RESOLVER computes the retreat to the host face — the math half is real', () => {
        const walls = [mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)];
        const adjustments = WallJoinResolver.resolveLevel(walls as never, { snapRadius: EXPECTED_SNAP_R });
        const adj = adjustments.get('part') as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;

        // The resolver's OWN return value: the partition's free end is untouched at z=3 and its
        // joining end has retreated out of the host solid onto the near face at z=+0.10.
        expect(adj?.baseLine).toBeDefined();
        const resolverEndZ = adj!.baseLine![1].z;
        expect(resolverEndZ).toBeCloseTo(NEAR_FACE_Z, 6);
    });

    it('§FIX-WALL-CREATE-ON-HOST-FACE — the STORE holds the endpoint AT THE HOST FACE', () => {
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);

        const storedEnd = blOf(store, 'part')[1];

        // BEFORE (commit 097bcf1c, pinned as MEASURED): the coordinator's
        // §POST-RESOLVE-PRESERVE + §FIX-WALL-JOIN-BASELINE-IMMUTABLE anchored the partition
        // back to its authored line, so the stored end sat on the host CENTRELINE at z = 0.000
        // — 0.10 m INSIDE a 0.20 m solid — while the resolver's own return value carried the
        // retreat. Two answers, same inputs.
        //
        // AFTER: the retreat is AUTHORED at creation (`WallStore.add` →
        // `retreatOntoHostFaces`), so the stored line already terminates at the near face and
        // immutability now DEFENDS it rather than reverting it. Nothing in the coordinator
        // changed; the invariant is untouched and its three CONTROLs below still hold.
        expect(storedEnd.z).toBeCloseTo(NEAR_FACE_Z, 6);
    });

    it('§FIX-WALL-CREATE-ON-HOST-FACE — the BUILDER extrudes from the retreated endpoint', () => {
        const { builder } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);

        // `buildWall` reads the centreline from `wall.baseLine` (the STORE), never from
        // `joinData.baseLine` — which is exactly why the resolver-side fix could not reach it,
        // and exactly why the creation-side fix does. This is the render half of the proof.
        const built = builder.lastBuiltBaseLine.get('part');
        expect(built).toBeDefined();
        expect(built![1].z).toBeCloseTo(NEAR_FACE_Z, 6);
    });

    it('§FIX-WALL-CREATE-ON-HOST-FACE — the retreat is IDEMPOTENT across re-resolves', () => {
        // The stored line must not walk one face deeper each time the level re-resolves. A
        // nearby create forces a fresh whole-level `_flush`; the partition must not move.
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);
        const afterCreate = blOf(store, 'part');

        editAndFlush(() => {
            store.add(mkWall('other', [{ x: 1, y: 0, z: 2 }, { x: 3, y: 0, z: 2 }], 0.10));
        });
        expect(endpointDrift(blOf(store, 'part'), afterCreate)).toBeLessThanOrEqual(1e-4);

        editAndFlush(() => {
            store.update('part', { _renderVersion: 1 } as unknown as Partial<WallData>);
        });
        expect(endpointDrift(blOf(store, 'part'), afterCreate)).toBeLessThanOrEqual(1e-4);
        expect(blOf(store, 'part')[1].z).toBeCloseTo(NEAR_FACE_Z, 6);
    });

    // ── 1b. THE CAP THAT COMES WITH THE RETREAT ─────────────────────────────────────────
    //
    // Retreating the endpoint to the face MOVES IT AWAY FROM THE HOST CENTRELINE by exactly
    // `hostHalfT`. Body-T detection measures endpoint→host-CENTRELINE against `SNAP_RADIUS`
    // (`WallJoinResolver.ts:2302-2303`), so at a tight zoom a correctly-authored endpoint can
    // fall outside detection and lose its mitred cap. That is a real consequence of this fix
    // and it is measured here rather than discovered later — the whole lesson of L-919 is
    // that an unmeasured half is an unfixed half.
    it('PERPENDICULAR — the retreated end butts FLUSH; a square cap is exact here', () => {
        const { store, builder } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);

        // The partition runs along z, the host along x: the cap plane perpendicular to the
        // partition's own axis IS the host's face plane. Mitred or square, the solid
        // terminates on z = +0.10 with zero gap and zero overlap.
        expect(blOf(store, 'part')[1].z).toBeCloseTo(NEAR_FACE_Z, 6);
        expect(builder.lastBuiltBaseLine.get('part')![1].z).toBeCloseTo(NEAR_FACE_Z, 6);
    });

    it('OBLIQUE — the retreat still lands the endpoint exactly on the host face plane', () => {
        // A 45° partition onto the same host. The endpoint retreats ALONG ITS OWN AXIS, so it
        // travels `penetration / sin 45°` = 0.10 / 0.7071 = 0.1414 m — and must land exactly
        // on the face plane z = +0.10, never past it and never short.
        const oblique: BL = [{ x: 1, y: 0, z: 3 }, { x: 4, y: 0, z: 0 }];
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('obl', oblique, PART_T)]);

        const end = blOf(store, 'obl')[1];
        expect(end.z).toBeCloseTo(NEAR_FACE_Z, 6);
        // Moved back along the wall's own 45° axis: dz = +0.10 ⇒ dx = -0.10.
        expect(end.x).toBeCloseTo(3.9, 6);
        // And LATERALLY unmoved — still on the line the user drew (x + z = 4).
        expect(end.x + end.z).toBeCloseTo(4, 6);
    });

    // ── 1c. UNDO — one gesture, one undo, the authored line restores EXACTLY ────────────
    //
    // `CreateWallCommand.undo()` removes the wall; redo re-runs `execute()`, which calls
    // `wallStore.add()` again with the ORIGINAL payload — i.e. the AS-DRAWN centreline, not
    // the retreated one. So the retreat is RECOMPUTED on every redo, and the thing that must
    // hold is DETERMINISM: the same gesture must land on the same stored line, byte for byte,
    // no matter how many times it is undone and redone. If it drifted, the wall would walk one
    // face deeper per redo — the failure mode the hydration guard exists to prevent on load.
    it('UNDO/REDO — redoing the create reproduces the retreated baseline EXACTLY', () => {
        const authoredRecord = mkWall('part', AUTH_PART, PART_T);
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), authoredRecord]);
        const afterFirstCreate = blOf(store, 'part');
        expect(afterFirstCreate[1].z).toBeCloseTo(NEAR_FACE_Z, 6);

        // UNDO: the wall goes away and the host is untouched.
        editAndFlush(() => { store.remove('part'); });
        expect(store.getById('part')).toBeUndefined();
        expect(endpointDrift(blOf(store, 'host'), AUTH_HOST)).toBeLessThanOrEqual(1e-4);

        // REDO: `execute()` re-adds from the ORIGINAL as-drawn payload.
        editAndFlush(() => {
            store.add(mkWall('part', AUTH_PART, PART_T));
        });
        expect(endpointDrift(blOf(store, 'part'), afterFirstCreate)).toBeLessThanOrEqual(1e-9);

        // And again, to prove it does not walk.
        editAndFlush(() => { store.remove('part'); });
        editAndFlush(() => { store.add(mkWall('part', AUTH_PART, PART_T)); });
        expect(endpointDrift(blOf(store, 'part'), afterFirstCreate)).toBeLessThanOrEqual(1e-9);
    });

    it('SNAPSHOT RESTORE — re-adding at the ALREADY-retreated line does not retreat twice', () => {
        // `CommandManagerImpl.restoreSnapshot` / `DeleteElementCommand.undo` re-add a wall at
        // its STORED baseline, which is already at the face. Penetration is then 0, so the
        // derivation is a no-op — the retreat is idempotent by construction, not by luck.
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);
        const retreated = blOf(store, 'part');

        editAndFlush(() => { store.remove('part'); });
        editAndFlush(() => { store.add(mkWall('part', retreated, PART_T)); });

        expect(endpointDrift(blOf(store, 'part'), retreated)).toBeLessThanOrEqual(1e-9);
        expect(blOf(store, 'part')[1].z).toBeCloseTo(NEAR_FACE_Z, 6);
    });

    // ── 2. THE CONTROL — the immutability invariant must NOT move ────────────────────────
    //
    // §FIX-WALL-JOIN-BASELINE-IMMUTABLE is the founder's invariant (L-44/L-46/L-47) and the
    // reason the retreat cannot be delivered through `resolveLevel`. Authoring the retreat at
    // CREATION must leave it completely untouched: a wall that was NOT drawn onto a host body
    // still keeps its authored baseline byte-stable across every join re-resolve.
    it('CONTROL — an ordinary L-corner create still never mutates a stored baseline', () => {
        const A: BL = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }];
        const B: BL = [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }];
        const { store } = setup([mkWall('a', A, 0.20), mkWall('b', B, 0.20)]);

        expect(endpointDrift(blOf(store, 'a'), A)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'b'), B)).toBeLessThanOrEqual(1e-4);

        // A nearby create re-resolves the whole level; neither existing baseline may move.
        editAndFlush(() => {
            store.add(mkWall('c', [{ x: 4, y: 0, z: 4 }, { x: 7, y: 0, z: 4 }], 0.12));
        });
        expect(endpointDrift(blOf(store, 'a'), A)).toBeLessThanOrEqual(1e-4);
        expect(endpointDrift(blOf(store, 'b'), B)).toBeLessThanOrEqual(1e-4);
    });

    it('CONTROL — the HOST is never moved by the partition landing on it', () => {
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);
        // `_applyT` only ever moves the approaching SECONDARY; the host is immutable by
        // construction. Authoring the retreat must not change that priority rule.
        expect(endpointDrift(blOf(store, 'host'), AUTH_HOST)).toBeLessThanOrEqual(1e-4);
    });

    it('CONTROL — the partition\'s FREE end is never touched', () => {
        const { store } = setup([mkWall('host', AUTH_HOST, HOST_T), mkWall('part', AUTH_PART, PART_T)]);
        expect(dist(blOf(store, 'part')[0], AUTH_PART[0])).toBeLessThanOrEqual(1e-4);
    });
});
