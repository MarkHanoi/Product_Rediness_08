/**
 * §WALL-Y-DATUM (L-968) — A WINDOW MUST SIT IN ITS OWN HOLE AT A NON-ZERO BASE OFFSET.
 *
 * C84 §9 recorded the leaf-vs-hole delta as LATENT on the ground that *"nothing
 * authors either offset non-zero"*. Both offsets are authorable from two shipped
 * surfaces — the property panel's editable **Base Offset** row
 * (`PropertyDescriptorGenerator.ts:64` wall, `:89` slab) and the `set-base-offset`
 * chat capability — so one *"set the base offset to 150 mm"* displaced every window
 * on that wall by `slabBaseOffset + 2 × wall.baseOffset`.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE WALL LEDGER ─────────────────────
 *
 * `geometry-wall/__tests__/WallYDatumAgreement.test.ts` measures the wall body, the
 * hole and the shared arithmetic. It CANNOT measure the leaf: `@pryzm/geometry-window`
 * depends on `@pryzm/geometry-wall`, not the other way round. The thing the user
 * actually looks through is built HERE, by `WindowBuilder`, as a separate scene
 * object in WORLD space.
 *
 * So this file drives BOTH builders — the real `WallFragmentBuilder` and the real
 * `WindowBuilder` — over one wall, and compares built geometry to built geometry.
 * COMMITTED ≠ REACHABLE ≠ MEASURED: the hole is read as a real y-break in the wall's
 * vertex buffers and the leaf as its actual world transform. Neither side is a pure
 * function's return value, and neither is a restatement of the other's formula.
 *
 * ⚠ EVERY OFFSET HERE IS NON-ZERO AND DISTINCT. At zero offsets the pre-fix and
 * post-fix expressions collapse to the same number, which is exactly how this
 * survived unmeasured. The final test pins that collapse as the non-vacuity control.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { WallFragmentBuilder, wallBaseY, clearWallBaseY, resolveWallBaseY } from '@pryzm/geometry-wall';

const LEVEL_ID  = 'L1';
const ELEVATION = 3.0;      // storey 1
const SLAB_OFF  = 0.10;     // a 100 mm raised podium slab
const BASE_OFF  = 0.15;     // a 150 mm plinth, typed into the Base Offset row

const W_HEIGHT  = 3.0;
const W_THICK   = 0.2;

const WIN = {
    id: 'win-1', wallId: 'w-host', openingId: 'op-1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

/**
 * A LAYERED host, because the layered arm is the one that emits an explicit void
 * band (`LayeredWallOpeningBuilder`) — i.e. the one whose hole bottom is a real,
 * measurable y-break rather than an implied edge.
 */
function hostWall(baseOffset: number) {
    return {
        id: 'w-host',
        levelId: LEVEL_ID,
        // §BASELINE-Y — stamped as `elevation + baseOffset` by `CreateWallCommand.ts:341`.
        baseLine: [{ x: 0, y: ELEVATION + baseOffset, z: 0 }, { x: 6, y: ELEVATION + baseOffset, z: 0 }],
        height: W_HEIGHT,
        thickness: W_THICK,
        baseOffset,
        layers: [
            { name: 'Render',    function: 'finish-exterior', thickness: 0.02, materialColor: '#e2c044' },
            { name: 'Structure', function: 'structure',       thickness: 0.16, materialColor: '#d9d4cc' },
            { name: 'Paint',     function: 'finish-interior', thickness: 0.02, materialColor: '#f4f1ec' },
        ],
        openings: [{
            id: WIN.openingId, elementId: WIN.id, type: 'window',
            offset: WIN.offset, width: WIN.width, height: WIN.height, sillHeight: WIN.sillHeight,
        }],
    };
}

function levelProvider() {
    const level = { id: LEVEL_ID, name: 'Storey 1', elevation: ELEVATION, height: 3.2, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

/** Builds the REAL wall. This is also what PUBLISHES the base plane the leaf reads. */
function buildHost(baseOffset: number, slabBaseOffset: number): THREE.Group {
    const wall = hostWall(baseOffset);
    const builder = new WallFragmentBuilder(new THREE.Scene(), levelProvider() as never);
    builder.buildWall(
        wall as never,
        null as never,
        undefined,
        // Exactly what `WallRebuildCoordinator.ts:546` passes: the BASE plane.
        wallBaseY(ELEVATION, slabBaseOffset, baseOffset),
    );
    const root = (builder as unknown as { getWallRoot(id: string): THREE.Object3D })
        .getWallRoot(wall.id) as THREE.Group;
    expect(root).toBeTruthy();
    root.updateMatrixWorld(true);
    return root;
}

/** Builds the REAL window leaf on that host. */
function buildLeaf(baseOffset: number): THREE.Group {
    const wall = hostWall(baseOffset);
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: LEVEL_ID, elevation: ELEVATION }),
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

/** Distinct WORLD Y values across every mesh under `root`. */
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

const hasBreak = (ys: number[], v: number) => ys.some(y => Math.abs(y - v) < 1e-4);

/** World Y of the point `localY` metres above the leaf's own centre. */
function leafWorldY(group: THREE.Group, localY: number): number {
    return new THREE.Vector3(0, localY, 0).applyMatrix4(group.matrixWorld).y;
}

beforeEach(() => { clearWallBaseY(); });

describe('§WALL-Y-DATUM (L-968) — the window leaf and the hole cut for it', () => {
    it('the wall PUBLISHES its base plane, and the leaf lands on it', () => {
        buildHost(BASE_OFF, SLAB_OFF);
        const expected = wallBaseY(ELEVATION, SLAB_OFF, BASE_OFF);   // 3.25

        // The link between the two builders, asserted as a value rather than assumed.
        expect(resolveWallBaseY('w-host')).toBeCloseTo(expected, 9);

        const leaf = buildLeaf(BASE_OFF);
        const centre = leafWorldY(leaf, 0);

        // POSITIVE — the leaf's centre is the host's base plane + sill + half height.
        expect(centre).toBeCloseTo(expected + WIN.sillHeight + WIN.height / 2, 5);

        // NEGATIVE, same expression — it is NOT the pre-fix datum
        // (`elevation + sill + height/2`, which read neither offset). The gap is the
        // full published base offset, not a rounding budget.
        const preFix = ELEVATION + WIN.sillHeight + WIN.height / 2;
        expect(Math.abs(centre - preFix)).toBeGreaterThan(1e-6);
        expect(centre - preFix).toBeCloseTo(SLAB_OFF + BASE_OFF, 5);
    });

    it('⭐ the leaf sits IN the hole — measured hole y-breaks vs measured leaf transform', () => {
        const host = buildHost(BASE_OFF, SLAB_OFF);
        const leaf = buildLeaf(BASE_OFF);

        const ys = worldYs(host);
        const base = wallBaseY(ELEVATION, SLAB_OFF, BASE_OFF);
        const holeBottom = base + WIN.sillHeight;
        const holeHead   = base + WIN.sillHeight + WIN.height;

        // The hole is REAL — these planes exist in the wall's own vertex buffers.
        expect(hasBreak(ys, holeBottom)).toBe(true);
        expect(hasBreak(ys, holeHead)).toBe(true);

        // POSITIVE — the leaf's sill and head are those same two planes. Zero delta.
        expect(leafWorldY(leaf, -WIN.height / 2)).toBeCloseTo(holeBottom, 5);
        expect(leafWorldY(leaf, +WIN.height / 2)).toBeCloseTo(holeHead, 5);

        // NEGATIVE, same expression — the PRE-FIX leaf would have been below the hole
        // by `slabBaseOffset + 2 × baseOffset`, and the wall would have carried its
        // hole `baseOffset` too high. Both halves are named so neither can regress
        // silently.
        const preFixLeafBottom = ELEVATION + WIN.sillHeight;
        const preFixHoleBottom = ELEVATION + SLAB_OFF + 2 * BASE_OFF + WIN.sillHeight;
        expect(preFixHoleBottom - preFixLeafBottom).toBeCloseTo(SLAB_OFF + 2 * BASE_OFF, 9);
        expect(hasBreak(ys, preFixHoleBottom)).toBe(false);
        expect(Math.abs(leafWorldY(leaf, -WIN.height / 2) - preFixLeafBottom)).toBeGreaterThan(1e-6);
    });

    it('a SLAB base offset alone moves the leaf — the term this package cannot see for itself', () => {
        // `slabBaseOffset` lives on the SLAB store, which `@pryzm/geometry-window`
        // does not depend on and may not read. Before L-968 that made it structurally
        // impossible for a leaf to follow a raised slab. It follows now, through the
        // wall's publication and nothing else — this test fails if the publication
        // link is ever cut, even though every expression in this file still compiles.
        buildHost(0, SLAB_OFF);
        const centre = leafWorldY(buildLeaf(0), 0);
        expect(centre).toBeCloseTo(ELEVATION + SLAB_OFF + WIN.sillHeight + WIN.height / 2, 5);
        expect(centre - (ELEVATION + WIN.sillHeight + WIN.height / 2)).toBeCloseTo(SLAB_OFF, 5);
    });

    it('CONTROL — at ZERO offsets the leaf is byte-for-byte where it always was', () => {
        // The non-vacuity guard, and the reason the defect was invisible: with no
        // plinth and no raised slab the pre-fix and post-fix expressions are the same
        // number, so an ordinary project must not move by a micron.
        buildHost(0, 0);
        const centre = leafWorldY(buildLeaf(0), 0);
        expect(centre).toBeCloseTo(ELEVATION + WIN.sillHeight + WIN.height / 2, 9);
    });
});
