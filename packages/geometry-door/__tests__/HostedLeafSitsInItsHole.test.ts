/**
 * §WALL-Y-DATUM (L-968) — A DOOR MUST SIT IN ITS OWN HOLE AT A NON-ZERO BASE OFFSET.
 *
 * The twin of `geometry-window/__tests__/HostedLeafSitsInItsHole.test.ts`, and it is
 * deliberately the same measurement rather than a door-flavoured variation of it:
 * `DoorBuilder.positionGroup` and `WindowBuilder.positionGroup` carried the SAME
 * defective expression (`elevation + sillHeight + height / 2`, reading neither
 * `slabBaseOffset` nor `wall.baseOffset`), so they must be held to the same pin or
 * one of them will drift back.
 *
 * A door makes one thing sharper than a window does: its sill height is normally
 * ZERO, so its leaf bottom IS the wall's base plane. Under the pre-L-968 datum a
 * door on a 150 mm plinth over a 100 mm slab had its threshold **400 mm** below the
 * bottom of its own opening — the leaf hanging through the floor while the hole sat
 * in the wall above it.
 *
 * COMMITTED ≠ REACHABLE ≠ MEASURED: the hole is read as a real y-break in the wall's
 * vertex buffers, the leaf as its actual world transform. Both builders are the
 * production ones.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';
import { WallFragmentBuilder, wallBaseY, clearWallBaseY, resolveWallBaseY } from '@pryzm/geometry-wall';

const LEVEL_ID  = 'L1';
const ELEVATION = 3.0;      // storey 1
const SLAB_OFF  = 0.10;     // a 100 mm raised podium slab
const BASE_OFF  = 0.15;     // a 150 mm plinth, typed into the Base Offset row

const W_HEIGHT = 3.0;
const W_THICK  = 0.2;

const DOOR = {
    id: 'd-1', wallId: 'w-host', openingId: 'op-1',
    offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', handleSide: 'right', swingDirection: 'inward',
    frameThickness: 0.05, frameDepth: 0.07, leafThickness: 0.04,
    frameColor: '#8b5a2b', leafColor: '#c8a165',
    handle: true, handleHeight: 1.05,
    threshold: false, thresholdHeight: 0.02, leafVisibleInPlan: false,
};

/**
 * A LAYERED host — the layered arm emits an explicit void band
 * (`LayeredWallOpeningBuilder`), so the hole's bottom and head are real, measurable
 * y-breaks rather than implied edges.
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
            id: DOOR.openingId, elementId: DOOR.id, type: 'door',
            offset: DOOR.offset, width: DOOR.width, height: DOOR.height, sillHeight: DOOR.sillHeight,
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

/** Builds the REAL door leaf on that host. */
function buildLeaf(baseOffset: number): THREE.Group {
    initDefaultViewsManager();                                   // ensures vd-sys-3d-1 exists
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: 'fine' } } as never);
    const wall = hostWall(baseOffset);
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: LEVEL_ID, elevation: ELEVATION }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new DoorBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(DOOR);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === DOOR.id && o !== scene) group = o as THREE.Group; });
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

describe('§WALL-Y-DATUM (L-968) — the door leaf and the hole cut for it', () => {
    it('the wall PUBLISHES its base plane, and the leaf lands on it', () => {
        buildHost(BASE_OFF, SLAB_OFF);
        const expected = wallBaseY(ELEVATION, SLAB_OFF, BASE_OFF);   // 3.25

        expect(resolveWallBaseY('w-host')).toBeCloseTo(expected, 9);

        const centre = leafWorldY(buildLeaf(BASE_OFF), 0);

        // POSITIVE — base plane + sill + half height.
        expect(centre).toBeCloseTo(expected + DOOR.sillHeight + DOOR.height / 2, 5);

        // NEGATIVE, same expression — NOT the pre-fix, offset-blind datum.
        const preFix = ELEVATION + DOOR.sillHeight + DOOR.height / 2;
        expect(Math.abs(centre - preFix)).toBeGreaterThan(1e-6);
        expect(centre - preFix).toBeCloseTo(SLAB_OFF + BASE_OFF, 5);
    });

    it('⭐ the threshold is the hole\'s own bottom, not 400 mm below it', () => {
        const host = buildHost(BASE_OFF, SLAB_OFF);
        const leaf = buildLeaf(BASE_OFF);

        const ys = worldYs(host);
        const base = wallBaseY(ELEVATION, SLAB_OFF, BASE_OFF);
        const holeBottom = base + DOOR.sillHeight;              // = the wall's own base
        const holeHead   = base + DOOR.sillHeight + DOOR.height;

        // The hole is REAL — these planes exist in the wall's own vertex buffers.
        expect(hasBreak(ys, holeBottom)).toBe(true);
        expect(hasBreak(ys, holeHead)).toBe(true);

        // POSITIVE — the leaf's threshold and head are those same two planes.
        expect(leafWorldY(leaf, -DOOR.height / 2)).toBeCloseTo(holeBottom, 5);
        expect(leafWorldY(leaf, +DOOR.height / 2)).toBeCloseTo(holeHead, 5);

        // NEGATIVE, same expression — the pre-fix pair, and the gap it left.
        const preFixLeafBottom = ELEVATION + DOOR.sillHeight;
        const preFixHoleBottom = ELEVATION + SLAB_OFF + 2 * BASE_OFF + DOOR.sillHeight;
        expect(preFixHoleBottom - preFixLeafBottom).toBeCloseTo(SLAB_OFF + 2 * BASE_OFF, 9);
        expect(hasBreak(ys, preFixHoleBottom)).toBe(false);
        expect(Math.abs(leafWorldY(leaf, -DOOR.height / 2) - preFixLeafBottom)).toBeGreaterThan(1e-6);
    });

    it('a SLAB base offset alone moves the leaf — the term this package cannot see for itself', () => {
        // `slabBaseOffset` lives on the SLAB store, which `@pryzm/geometry-door` does
        // not depend on and may not read. It reaches the leaf ONLY through the wall's
        // publication, so this test fails if that link is cut even though every
        // expression in this file would still compile.
        buildHost(0, SLAB_OFF);
        const centre = leafWorldY(buildLeaf(0), 0);
        expect(centre).toBeCloseTo(ELEVATION + SLAB_OFF + DOOR.sillHeight + DOOR.height / 2, 5);
        expect(centre - (ELEVATION + DOOR.sillHeight + DOOR.height / 2)).toBeCloseTo(SLAB_OFF, 5);
    });

    it('CONTROL — at ZERO offsets the leaf is exactly where it always was', () => {
        buildHost(0, 0);
        const centre = leafWorldY(buildLeaf(0), 0);
        expect(centre).toBeCloseTo(ELEVATION + DOOR.sillHeight + DOOR.height / 2, 9);
    });
});
