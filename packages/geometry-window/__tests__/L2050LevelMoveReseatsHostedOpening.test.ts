/**
 * §LEVEL-DATUM-IS-NOT-IN-THE-KEY (L-2050..L-2053) — MOVE A LEVEL, AND THE WINDOWS MUST COME.
 *
 * ── THE FOUNDER'S REPORT (2026-08-21, prod 071a7b2c) ────────────────────────
 * *"windows on raked wall don't stick when levels do"* — window frames floating free
 * in space, detached from any wall, some hanging over a balcony.
 *
 * ── THE DISCRIMINATOR IS **NOT** RAKE. MEASURED, NOT REASONED. ──────────────
 * The probe this file grew from drove the REAL `WallFragmentBuilder` through the exact
 * call `apps/editor/src/engine/initWallLevelSubscribers.ts` makes on a level-elevation
 * reconcile — `updateWall(wall, null, renderMap)` — with the level moved 3.0 m → 4.3 m:
 *
 *     [PROBE vertical] rake=null base1=3 base2=3 moved=false delta=0
 *     [PROBE raked70]  rake=70   base1=3 base2=3 moved=false delta=0
 *     [PROBE forced]                base1=3 base2=4.3 moved=true
 *
 * A PLUMB wall failed identically to a raked one. Rake is not the cause — it is the
 * AMPLIFIER. A wall that leans stands at a different XZ at every height, so a leaf left
 * at the wrong height is also at the wrong PLACE and hangs in mid-air; the same error on
 * a plumb wall leaves the leaf in the façade plane, merely too low, and nobody files it.
 * Curvature and multi-level were never reached: the failure is already total at one
 * straight, single-level, vertical wall.
 *
 * ── THE ROOT ────────────────────────────────────────────────────────────────
 * `_composeCacheKey` folded `_renderVersion | joinHash | slabBaseOffset | rake | profile`
 * — every term of `worldY = level.elevation + slabBaseOffset + wall.baseOffset` EXCEPT
 * `level.elevation`. That is the only one of the three that moves without any wall record
 * changing (`BimKernel.updateLevel` writes the LEVEL and fires
 * `spatial-authority-reconcile`; no `WallStore.update`, so no `_renderVersion` bump).
 * The key came out byte-identical, `_buildWallInternal` returned at the version guard,
 * and `publishWallBaseY` was never called.
 *
 * ⭐ WHY THAT DESTROYS HOSTED OPENINGS SPECIFICALLY. `SpatialAuthority` classifies
 * windows/doors `DETERMINED-HOSTED` and deliberately EXCLUDES them from the reconcile,
 * on the stated ground that they are *"re-rendered by the host wall's own rebuild"*.
 * Their ONLY re-seat channel is `onWallBaseYChanged`, which fires only from
 * `publishWallBaseY` inside a real build. One skipped rebuild severs the whole chain, and
 * `WindowBuilder` then reads the STALE plane back out of `resolveWallBaseYOrLevel` and
 * re-seats the leaf exactly where it already was.
 *
 * ── WHAT THIS FILE MEASURES ─────────────────────────────────────────────────
 * Geometry against geometry, never a formula against itself: the hole is read as a real
 * y-break in the WALL's own vertex buffers, and the leaf as its actual world transform
 * from the REAL `WindowBuilder`. `[[committed-is-not-reachable]]`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { WallFragmentBuilder, clearWallBaseY, resolveWallBaseY, onWallBaseYChanged } from '@pryzm/geometry-wall';

const LEVEL_ID = 'L1';
const W_ID = 'w-host';

const E0 = 3.0;        // the level datum before the drag
const E1 = 4.3;        // …and after. The founder's console showed exactly this shape.
const DELTA = E1 - E0; // 1.3 m

const BASE_OFF = 0.15; // a 150 mm plinth — non-zero so no two terms can collapse
const RAKE = 70;       // a leaning façade: cot(70°) ≈ 0.364 of lateral shift per metre

const WIN = {
    id: 'win-1', wallId: W_ID, openingId: 'op-1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

/**
 * The wall RECORD. Note what it does NOT contain: the level elevation. A level move
 * leaves every byte of this object untouched — which is precisely why a
 * `_renderVersion`-addressed cache could not see it.
 */
function hostWall(rakeAngleDeg: number | null) {
    return {
        id: W_ID,
        levelId: LEVEL_ID,
        _renderVersion: 7,
        baseLine: [{ x: 0, y: E0 + BASE_OFF, z: 0 }, { x: 6, y: E0 + BASE_OFF, z: 0 }],
        height: 3.0,
        thickness: 0.2,
        baseOffset: BASE_OFF,
        rakeAngleDeg,
        layers: [
            { name: 'Render', function: 'finish-exterior', thickness: 0.02, materialColor: '#e2c044' },
            { name: 'Structure', function: 'structure', thickness: 0.16, materialColor: '#d9d4cc' },
            { name: 'Paint', function: 'finish-interior', thickness: 0.02, materialColor: '#f4f1ec' },
        ],
        openings: [{
            id: WIN.openingId, elementId: WIN.id, type: 'window',
            offset: WIN.offset, width: WIN.width, height: WIN.height, sillHeight: WIN.sillHeight,
        }],
    };
}

/** A MUTABLE level provider. The datum is the thing that moves. */
function levelProvider(state: { elevation: number }) {
    const lvl = () => ({ id: LEVEL_ID, name: 'Storey 1', elevation: state.elevation, height: 3.2, childrenIds: [W_ID] });
    return { getLevelById: (id: string) => (id === LEVEL_ID ? lvl() : undefined), getLevels: () => [lvl()] };
}

/** Builds the REAL window leaf against whatever plane the wall last PUBLISHED. */
function buildLeaf(wall: ReturnType<typeof hostWall>, state: { elevation: number }): THREE.Group {
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: LEVEL_ID, elevation: state.elevation }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(WIN);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === WIN.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

/** Distinct WORLD Y values across every mesh under `root` — the hole, as built. */
function worldYs(root: THREE.Object3D): number[] {
    const out = new Set<number>();
    const v = new THREE.Vector3();
    root.traverse((o: THREE.Object3D) => {
        const pos = ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)
            ?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
            out.add(Number(v.y.toFixed(6)));
        }
    });
    return [...out].sort((a, b) => a - b);
}

const hasBreak = (ys: number[], y: number) => ys.some(v => Math.abs(v - y) < 1e-4);

/** World point `localY` metres above the leaf's own centre — through its FULL matrix. */
function leafWorld(group: THREE.Group, localY: number): THREE.Vector3 {
    return new THREE.Vector3(0, localY, 0).applyMatrix4(group.matrixWorld);
}

/**
 * Drives the level move through the production call shape and returns everything
 * measured on both sides of it.
 */
function moveTheLevel(rake: number | null) {
    clearWallBaseY();
    const state = { elevation: E0 };
    const wall = hostWall(rake);
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider(state) as never);

    const notified: number[] = [];
    const un = onWallBaseYChanged((id, y) => { if (id === W_ID) notified.push(y); });

    // ── BEFORE ──────────────────────────────────────────────────────────────
    builder.updateWall(wall as never, null, undefined, 0);
    const baseBefore = resolveWallBaseY(W_ID)!;
    const rootBefore = (builder as unknown as { getWallRoot(id: string): THREE.Object3D }).getWallRoot(W_ID);
    rootBefore.updateMatrixWorld(true);
    const holeYsBefore = worldYs(rootBefore);
    const leafBefore = buildLeaf(wall, state);

    // ── THE LEVEL MOVES. The wall RECORD is not touched — exactly as in production. ──
    state.elevation = E1;
    builder.updateWall(wall as never, null, undefined, 0);

    const baseAfter = resolveWallBaseY(W_ID)!;
    const rootAfter = (builder as unknown as { getWallRoot(id: string): THREE.Object3D }).getWallRoot(W_ID);
    rootAfter.updateMatrixWorld(true);
    const holeYsAfter = worldYs(rootAfter);
    const leafAfter = buildLeaf(wall, state);

    un();
    return { baseBefore, baseAfter, holeYsBefore, holeYsAfter, leafBefore, leafAfter, notified, builder };
}

beforeEach(() => { clearWallBaseY(); });

describe('§LEVEL-DATUM-IS-NOT-IN-THE-KEY (L-2050) — a level move must re-seat hosted openings', () => {
    it('⭐ L-2050 the wall REBUILDS and re-publishes its base plane when only the LEVEL moved', () => {
        const r = moveTheLevel(RAKE);

        // POSITIVE — the published plane followed the datum, exactly.
        expect(r.baseBefore).toBeCloseTo(E0 + BASE_OFF, 9);
        expect(r.baseAfter).toBeCloseTo(E1 + BASE_OFF, 9);
        expect(r.baseAfter - r.baseBefore).toBeCloseTo(DELTA, 9);

        // NEGATIVE, the SAME expression — this is the measured pre-fix value. The probe
        // printed `base1=3 base2=3 moved=false`; if the level datum ever falls back out
        // of the cache key this line is what fails.
        expect(r.baseAfter).not.toBeCloseTo(r.baseBefore, 6);

        // ⭐ REACHABILITY, not arithmetic — the hosted re-seat CHANNEL actually fired.
        // `onWallBaseYChanged` is the sole route by which a window learns its host
        // moved, and it only fires from inside a real build.
        expect(r.notified.length).toBe(2);
        expect(r.notified[1]).toBeCloseTo(E1 + BASE_OFF, 9);
    });

    it('⭐ L-2051 RAKED host — the leaf is still IN ITS HOLE after the move (hole read from the wall\'s vertices)', () => {
        const r = moveTheLevel(RAKE);

        const holeBottom = r.baseAfter + WIN.sillHeight;
        const holeHead = r.baseAfter + WIN.sillHeight + WIN.height;

        // The hole is REAL — these planes exist in the rebuilt wall's own buffers…
        expect(hasBreak(r.holeYsAfter, holeBottom)).toBe(true);
        expect(hasBreak(r.holeYsAfter, holeHead)).toBe(true);
        // …and they are NOT where they were before the level moved.
        expect(hasBreak(r.holeYsAfter, r.baseBefore + WIN.sillHeight)).toBe(false);

        // …and the leaf's own sill and head ARE those two planes. Zero delta.
        expect(leafWorld(r.leafAfter, -WIN.height / 2).y).toBeCloseTo(holeBottom, 5);
        expect(leafWorld(r.leafAfter, +WIN.height / 2).y).toBeCloseTo(holeHead, 5);

        // NEGATIVE — the pre-fix leaf stayed at the OLD hole, a full DELTA below.
        expect(Math.abs(leafWorld(r.leafAfter, 0).y - leafWorld(r.leafBefore, 0).y)).toBeCloseTo(DELTA, 5);
    });

    it('⭐ L-2052 RAKED host — a datum move is PURELY VERTICAL: the leaf keeps its XZ', () => {
        const r = moveTheLevel(RAKE);
        const a = leafWorld(r.leafBefore, 0);
        const b = leafWorld(r.leafAfter, 0);

        // The rake displacement is `cot(rake) x (sillHeight + height/2)` — a height
        // ABOVE THE WALL BASE, so it is level-INVARIANT. Moving the storey must not
        // slide the leaf sideways along the lean.
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.z).toBeCloseTo(a.z, 9);
        expect(b.y - a.y).toBeCloseTo(DELTA, 5);

        // NON-VACUITY — the rake really is displacing this leaf, so "XZ unchanged"
        // is a live assertion and not a plumb wall in disguise.
        const plumb = moveTheLevel(null);
        const plumbXZ = leafWorld(plumb.leafAfter, 0);
        expect(Math.abs(b.z - plumbXZ.z)).toBeGreaterThan(0.3);
    });

    it('⭐ L-2053 CONTROL — a VERTICAL host fails and recovers IDENTICALLY. The discriminator is not rake.', () => {
        const r = moveTheLevel(null);

        expect(r.baseAfter - r.baseBefore).toBeCloseTo(DELTA, 9);
        expect(leafWorld(r.leafAfter, 0).y - leafWorld(r.leafBefore, 0).y).toBeCloseTo(DELTA, 5);

        // The measured pre-fix reading for BOTH arms was `base1=3 base2=3`. Pinning the
        // plumb arm here is what stops a future reader re-acquiring the belief that this
        // was ever a rake defect.
        expect(hasBreak(r.holeYsAfter, r.baseAfter + WIN.sillHeight)).toBe(true);
    });

    it('CONTROL — the cache is NOT defeated: re-dispatching with the level UNCHANGED still skips', () => {
        clearWallBaseY();
        const state = { elevation: E0 };
        const wall = hostWall(RAKE);
        const builder = new WallFragmentBuilder(new THREE.Scene(), levelProvider(state) as never);

        builder.updateWall(wall as never, null, undefined, 0);
        const afterFirst = builder.stats;

        // Same wall, same level, same everything — the version guard must still hold.
        builder.updateWall(wall as never, null, undefined, 0);
        const afterSecond = builder.stats;

        expect(afterSecond.builds).toBe(afterFirst.builds);
        expect(afterSecond.skips).toBe(afterFirst.skips + 1);
    });
});
