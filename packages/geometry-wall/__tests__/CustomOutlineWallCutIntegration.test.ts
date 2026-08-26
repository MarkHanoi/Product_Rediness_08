/**
 * §WINDOW122 (L-11920) — THE WALL OPENING, THROUGH THE REAL BUILDER, FOR A `'custom'` PROFILE.
 *
 * ⭐ THIS IS THE PR-4 GEOMETRIC PIN L-11263 NAMED AND LEFT OPEN. `CustomOutline.test.ts` pins
 * the PURE layer (`validateCustomOutline`, `openingOutline`'s `'custom'` arm) and
 * `OpeningProfileSlice1.test.ts` pins the pure `buildOpeningProfileGasket` function against a
 * CIRCULAR outline. Neither drives the REAL `WallFragmentBuilder` with a CONCAVE `'custom'`
 * ring, which is exactly the gap the ISSUE LOG recorded as open: "the PR-4 face-on-outline
 * geometric pin (concave ring through arms A/C, THREE-based) was NOT written... ad hoc probing
 * suggested the existing bbox-gasket logic already handles a concave ring correctly; not
 * committed as a pin."
 *
 * ⛔ THE PROBING WAS WRONG, AND THIS FILE IS WHY. Two of the three real arms build their opening
 * rectangle from a hand-assembled object literal that copies `offset/width/height/sillHeight/
 * openingProfile` — and NEVER `customOutline`:
 *
 *   Arm A — `WallFragmentBuilder._rebuildPlainWallBodyAsHoleExtrude`'s `_openingRects` (feeds
 *           `buildWallHoleBodyGeometry` → `WallHoleBodyBuilder.holeWalk` → `openingOutline`)
 *   Arm B — the gasket construction inside the box-segment loop (feeds
 *           `buildOpeningProfileGasket` → `openingOutline`)
 *
 * `openingOutline()`'s `'custom'` arm returns `null` when `customOutline` is absent
 * (`resolveCustomOutlineInput(undefined)` has no ring to resolve), so both call sites silently
 * fell back to their PLAIN-RECTANGLE path: arm A's `pushHoles` draws the four `h.x0/h.x1/h.y0/
 * h.y1` lines, and arm B's gasket never gets built at all. Only arm C
 * (`LayeredWallOpeningBuilder.normaliseOpeningRects`) already threaded the field. The window's
 * OWN frame mesh (`WindowBuilder._buildProfiledVisuals`) reads the full opening record and DOES
 * carry `customOutline`, so the window rendered its true shape while the wall around it kept
 * cutting a rectangle — exactly the founder's report: "the profile editor works great, but the
 * opening doesn't adapt, remains rectangle."
 *
 * Both call sites are fixed in this same commit. This file proves it with the REAL builder, not
 * the pure function in isolation — sampling whether wall material exists at a world point,
 * which is the same "is there solid material here" question `OpeningProfileSlice1.test.ts`'s
 * `solidAt` asks, generalised across every mesh a real `buildWall()` call emits (box segments +
 * gasket for arm B, one continuous extrude for arm A).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { mk, levelProvider, specOf } from './support/wallJointHarness';
import type { CustomOutline } from '../src/CustomOutline';

// An L missing its top-right quarter, in the window's normalised [0,1]x[0,1] frame.
// Touches all four bbox edges (D3's tight-bbox rule) and keeps 75% of the unit area.
const L_SHAPE: CustomOutline = {
    vertices: [
        { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 0.5 },
        { u: 0.5, v: 0.5 }, { u: 0.5, v: 1 }, { u: 0, v: 1 },
    ],
};

const OFFSET = 2, WIDTH = 1.2, HEIGHT = 1.2, SILL = 0.9, T = 0.2;

function customWindow(id = 'w-custom') {
    return {
        id, type: 'window' as const, offset: OFFSET, width: WIDTH, height: HEIGHT, sillHeight: SILL,
        openingProfile: 'custom' as const, customOutline: L_SHAPE,
    };
}
function rectWindow(id = 'w-rect') {
    return { id, type: 'window' as const, offset: OFFSET, width: WIDTH, height: HEIGHT, sillHeight: SILL };
}

/** World-space triangles of every wall-BODY mesh under `root` (segments, gasket, extrude body). */
function worldTriangles(root: THREE.Object3D): number[][][] {
    root.updateMatrixWorld(true);
    const out: number[][][] = [];
    root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        const ud = m.userData as { role?: string; elementType?: string };
        if (ud?.role !== 'geometry') return;
        if (ud.elementType !== undefined && ud.elementType !== 'WallLayer' && ud.elementType !== 'WallPart') return;
        const geo = m.geometry as THREE.BufferGeometry;
        const pos = geo.getAttribute('position');
        if (!pos) return;
        const idx = geo.getIndex();
        const at = (i: number): number[] => {
            const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            m.localToWorld(v);
            return [v.x, v.y, v.z];
        };
        const n = idx ? idx.count : pos.count;
        const vi = (k: number) => (idx ? idx.getX(k) : k);
        for (let i = 0; i + 2 < n; i += 3) {
            out.push([at(vi(i)), at(vi(i + 1)), at(vi(i + 2))]);
        }
    });
    return out;
}

function pointInTri(px: number, py: number, t: number[][]): boolean {
    const [a, b, c] = t as [number[], number[], number[]];
    const d = (b[1]! - c[1]!) * (a[0]! - c[0]!) + (c[0]! - b[0]!) * (a[1]! - c[1]!);
    if (Math.abs(d) < 1e-12) return false;
    const l1 = ((b[1]! - c[1]!) * (px - c[0]!) + (c[0]! - b[0]!) * (py - c[1]!)) / d;
    const l2 = ((c[1]! - a[1]!) * (px - c[0]!) + (a[0]! - c[0]!) * (py - c[1]!)) / d;
    const l3 = 1 - l1 - l2;
    return l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9;
}

/** Is there wall material at world (x, y), on the plane world-z ≈ `z`? */
function solidAt(root: THREE.Object3D, x: number, y: number, z: number, tol = 1e-3): boolean {
    for (const t of worldTriangles(root)) {
        if (t.every((v) => Math.abs(v[2]! - z) < tol) && pointInTri(x, y, t)) return true;
    }
    return false;
}

// Sample points in the window's WORLD frame (wall runs along +x from x=0, thickness centred on z=0).
const FRONT_Z = T / 2;
// In the REMOVED quadrant [0.5,1]x[0.5,1] of the unit box — must be SOLID for the L, a HOLE for a rectangle.
const NOTCH = { x: OFFSET + 0.75 * WIDTH, y: SILL + 0.75 * HEIGHT };
// Well inside the L's remaining body — must be a HOLE for both (non-vacuity: the opening still cuts).
const INTERIOR = { x: OFFSET + 0.25 * WIDTH, y: SILL + 0.25 * HEIGHT };

describe('§WINDOW122 — arm A (no-mitre plain wall): custom outline reaches the hole extrude', () => {
    function buildStandalone(op: ReturnType<typeof customWindow> | ReturnType<typeof rectWindow>) {
        const wall = mk([0, 0], [5, 0], { openings: [op] });
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, levelProvider() as never);
        builder.refreshV2Cache([specOf(wall)]);
        // A single, unjoined wall has nothing to mitre against — WallJoinResolver returns no join
        // for it, so `_hasMiterEnd` is false and `_rebuildPlainWallBodyAsHoleExtrude` (arm A) runs.
        const joins = WallJoinResolver.resolveLevel([{ ...wall }], { snapRadius: 0.5 });
        builder.buildWall(wall, (joins.get(wall.id) ?? null) as never, undefined, 0);
        const root = builder.getWallRoot(wall.id) as unknown as THREE.Object3D;
        expect(root, 'wall root must exist').toBeTruthy();
        return root;
    }

    it('⭐ the L-shaped custom window: SOLID in the removed corner, a HOLE in the body', () => {
        const root = buildStandalone(customWindow());
        expect(solidAt(root, NOTCH.x, NOTCH.y, FRONT_Z), 'removed corner must be solid material').toBe(true);
        expect(solidAt(root, INTERIOR.x, INTERIOR.y, FRONT_Z), 'the L body must still be a hole (non-vacuity)').toBe(false);
    });

    it('⛔ NON-VACUITY / regression — a PLAIN RECTANGULAR window is a hole at the SAME corner point', () => {
        // If this were false the test above would prove nothing: a builder that always leaves
        // every corner solid (e.g. because the gasket/hole logic silently no-ops) would also pass
        // the custom case. The rectangular window must cut straight through the same point.
        const root = buildStandalone(rectWindow());
        expect(solidAt(root, NOTCH.x, NOTCH.y, FRONT_Z)).toBe(false);
        expect(solidAt(root, INTERIOR.x, INTERIOR.y, FRONT_Z)).toBe(false);
    });
});

describe('§WINDOW122 — arm B (mitred wall): custom outline reaches the gasket', () => {
    function buildMitred(op: ReturnType<typeof customWindow> | ReturnType<typeof rectWindow>) {
        // An L-corner: wallA carries the window and shares its start (0,0) with wallB, so wallA
        // gets a real miter normal at that end and `_hasMiterEnd` is true — arm B (box segments +
        // `OpeningProfileGasket`) runs, never arm A.
        const wallA = mk([0, 0], [5, 0], { openings: [op] });
        const wallB = mk([0, 0], [0, 5], {});
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, levelProvider() as never);
        const walls = [wallA, wallB];
        builder.refreshV2Cache(walls.map(specOf));
        const joins = WallJoinResolver.resolveLevel(walls.map((w) => ({ ...w })), { snapRadius: 0.5 });
        for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
        const root = builder.getWallRoot(wallA.id) as unknown as THREE.Object3D;
        expect(root, 'wallA root must exist').toBeTruthy();
        return root;
    }

    it('⭐ the L-shaped custom window: SOLID in the removed corner, a HOLE in the body', () => {
        const root = buildMitred(customWindow());
        expect(solidAt(root, NOTCH.x, NOTCH.y, FRONT_Z), 'removed corner must be solid material (the gasket)').toBe(true);
        expect(solidAt(root, INTERIOR.x, INTERIOR.y, FRONT_Z), 'the L body must still be a hole (non-vacuity)').toBe(false);
    });

    it('⛔ NON-VACUITY / regression — a PLAIN RECTANGULAR window is a hole at the SAME corner point', () => {
        const root = buildMitred(rectWindow());
        expect(solidAt(root, NOTCH.x, NOTCH.y, FRONT_Z)).toBe(false);
        expect(solidAt(root, INTERIOR.x, INTERIOR.y, FRONT_Z)).toBe(false);
    });
});
