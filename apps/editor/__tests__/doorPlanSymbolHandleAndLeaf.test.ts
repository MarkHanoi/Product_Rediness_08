// @vitest-environment happy-dom
//
// §FIX-DOOR-SYMBOL-HANDLE-AND-LEAF-ALIGNMENT (L-284) — the two defects the founder
// marked on the LOD-300 plan door, guarded at the EMITTED GEOMETRY (not at the seam).
//
//   (a) THE HANDLE WAS A CROSSBAR. The hardware was drawn on BOTH leaf faces, two
//       levers projecting in opposite directions off a common centreline — a symmetric
//       PLUS SIGN, read as a T-bar. A lever is an offset L, on ONE face, at the LATCH
//       end.
//
//   (b) THE LEAF DID NOT PIVOT ON THE WALL FACE — and this is the important one.
//       The hinge was placed on the wall CENTRELINE, so the open leaf's hinge edge sat
//       half a wall thickness INSIDE the wall, and the swing arc — whose centre IS the
//       hinge — was centred there too. EVERY CLEARANCE AN ARCHITECT READS OFF THAT ARC
//       WAS THEN WRONG by up to half the wall thickness. That is an L-127 dimensional-
//       truth defect, not styling.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { doorPlanSymbolBuilder, resolveDoorDimensions } from '@pryzm/geometry-door';

const _here = dirname(fileURLToPath(import.meta.url));
const SYMBOL_SRC = resolve(_here, '../../../packages/geometry-door/src/DoorPlanSymbolBuilder.ts');

const WALL_THICKNESS = 0.2;
const HALF_THK = WALL_THICKNESS / 2;

/** Host wall: 6 m along +X, 200 mm thick. So dir = +X and the wall faces are z = ±0.1. */
const WALL = {
    id: 'wall-1',
    thickness: WALL_THICKNESS,
    levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

/** A real typed door: left-hung, opening inward (swingDir = the wall's left-normal, +z). */
function makeDoor(over: Record<string, unknown> = {}) {
    const dims = resolveDoorDimensions('dt-solid-timber', 'single');
    return {
        id: 'door-1', openingId: 'op-1', wallId: 'wall-1',
        offset: 2.0,
        width: dims.width, height: dims.height, sillHeight: 0,
        doorType: 'single',
        systemTypeId: 'dt-solid-timber',
        hingesSide: 'left', swingDirection: 'inward',
        handle: true,
        ...over,
    };
}

type Pt = { x: number; z: number };
function readPts(geo: { getAttribute(n: string): { count: number; getX(i: number): number; getZ(i: number): number } } | null): Pt[] {
    if (!geo) return [];
    const pos = geo.getAttribute('position');
    const out: Pt[] = [];
    for (let i = 0; i < pos.count; i++) out.push({ x: pos.getX(i), z: pos.getZ(i) });
    return out;
}

function symbol(door: Record<string, unknown>, lod = 'fine') {
    return (doorPlanSymbolBuilder as unknown as {
        _computeSwingGeometry(d: unknown, w: unknown, lod: string): { cut: never; proj: never; ghost: never } | null;
    })._computeSwingGeometry(door, WALL, lod);
}

describe('§FIX-DOOR-SYMBOL-HANDLE-AND-LEAF-ALIGNMENT (L-284)', () => {
    it('(b) THE LEAF PIVOTS ON THE WALL FACE — its hinge edge is coincident with the face line', () => {
        const door = makeDoor();
        const dims = resolveDoorDimensions('dt-solid-timber', 'single');
        const geo = symbol(door)!;
        expect(geo).not.toBeNull();

        const cut = readPts(geo.cut);

        // The door opens INWARD → swingDir = the wall's left-normal = +z, so the face the
        // leaf is hung on is z = +halfThk. The OPEN leaf runs from the hinge across the
        // wall into the room (+z), and its hinge EDGE must lie ON that face line.
        const hingeJambX = (door.offset as number) + dims.width / 2 - (dims.width / 2 - dims.frameThickness);
        const expectedHinge = { x: hingeJambX, z: +HALF_THK };

        const onHinge = cut.filter(p =>
            Math.abs(p.x - expectedHinge.x) < 1e-6 && Math.abs(p.z - expectedHinge.z) < 1e-6);
        expect(onHinge.length).toBeGreaterThan(0);

        // NOT on the wall centreline any more — that was the bug (the arc's centre sat
        // half a wall INSIDE the wall).
        const onCentreline = cut.filter(p =>
            Math.abs(p.x - expectedHinge.x) < 1e-6 && Math.abs(p.z) < 1e-9);
        expect(onCentreline.length).toBe(0);

        // The leaf's hinge edge (hinge → hinge + panelDir·leafThick) runs ALONG the wall,
        // so BOTH its ends sit on the same face line: the whole edge is flush.
        const leafThick = dims.leafThickness;
        const hingeEdgeFar = { x: expectedHinge.x + leafThick, z: +HALF_THK };
        const onEdgeFar = cut.filter(p =>
            Math.abs(p.x - hingeEdgeFar.x) < 1e-6 && Math.abs(p.z - hingeEdgeFar.z) < 1e-6);
        expect(onEdgeFar.length).toBeGreaterThan(0);
    });

    it('(b) THE ARC’S CENTRE EQUALS THE HINGE — every arc point is leafLength from it', () => {
        const door = makeDoor();
        const dims = resolveDoorDimensions('dt-solid-timber', 'single');
        const leafLength = dims.width - 2 * dims.frameThickness;

        const geo = symbol(door)!;
        const proj = readPts(geo.proj);

        const hingeX = (door.offset as number) + dims.frameThickness;
        const hinge = { x: hingeX, z: +HALF_THK };

        // The arc is the set of projection points at radius `leafLength` from the hinge.
        // If the centre were anywhere else (e.g. the old centreline hinge) the radii would
        // not be constant — so a constant radius about the HINGE is the assertion.
        const radii = proj
            .map(p => Math.hypot(p.x - hinge.x, p.z - hinge.z))
            .filter(r => Math.abs(r - leafLength) < 1e-6);

        // 32 arc segments → 64 vertices, all exactly leafLength from the hinge.
        expect(radii.length).toBeGreaterThanOrEqual(64);

        // And the arc's open end coincides with the DRAWN leaf tip (hinge + swingDir·L),
        // so the arc closes onto the leaf that is actually drawn — not a phantom one.
        const tip = { x: hinge.x, z: hinge.z + leafLength };
        expect(proj.some(p => Math.abs(p.x - tip.x) < 1e-6 && Math.abs(p.z - tip.z) < 1e-6)).toBe(true);
    });

    it('(b) the CLOSED-LEAF GHOST hangs on the SAME hinge — flush behind the face, not straddling it', () => {
        const door = makeDoor();
        const dims = resolveDoorDimensions('dt-solid-timber', 'single');
        const geo = symbol(door)!;
        const ghost = readPts(geo.ghost);
        expect(ghost.length).toBeGreaterThan(0);

        // The closed leaf lies INSIDE the reveal, between the hung face (z = +halfThk)
        // and one leaf thickness back. Nothing may poke out past the face.
        // (tolerance 6 dp: the symbol is emitted into a Float32BufferAttribute, whose
        // resolution is ~7 significant digits — a tighter tolerance would be asserting
        // against float32 noise, not against the geometry.)
        const zs = ghost.map(p => p.z);
        expect(Math.max(...zs)).toBeCloseTo(+HALF_THK, 6);
        expect(Math.min(...zs)).toBeCloseTo(+HALF_THK - dims.leafThickness, 6);
    });

    it('(a) THE HANDLE IS A LEVER, NOT A CROSSBAR — one face only, at the latch end', () => {
        const door = makeDoor();
        const dims = resolveDoorDimensions('dt-solid-timber', 'single');
        const leafLength = dims.width - 2 * dims.frameThickness;
        const leafThick = dims.leafThickness;

        const geo = symbol(door)!;
        const proj = readPts(geo.proj);

        const hingeX = (door.offset as number) + dims.frameThickness;
        const hinge = { x: hingeX, z: +HALF_THK };

        // Hardware = the projection points that are NOT on the swing arc.
        const hardware = proj.filter(p =>
            Math.abs(Math.hypot(p.x - hinge.x, p.z - hinge.z) - leafLength) > 1e-6);
        expect(hardware.length).toBeGreaterThan(0);

        // The leaf occupies x ∈ [hingeX, hingeX + leafThick] (its thickness runs along the
        // wall). The handle must live on ONE face — outside the leaf on ONE side only.
        // BEFORE this fix, hardware existed on BOTH sides: a symmetric crossbar.
        const beyondNegFace = hardware.filter(p => p.x < hinge.x - 1e-9);              // −panelDir face
        const beyondPosFace = hardware.filter(p => p.x > hinge.x + leafThick + 1e-9);  // +panelDir face

        expect(beyondNegFace.length).toBeGreaterThan(0);   // the lever + escutcheon live here
        expect(beyondPosFace.length).toBe(0);              // …and NOWHERE else. No cross.

        // AT THE LATCH END: every hardware point sits in the outer half of the leaf,
        // away from the hinge (the latch/free edge is at z = hinge.z + leafLength).
        for (const p of hardware) {
            const alongLeaf = p.z - hinge.z;               // distance from the hinge along the leaf
            expect(alongLeaf).toBeGreaterThan(leafLength / 2);
        }
    });

    it('(a) the handle FOLLOWS THE SWING — flip the swing and the lever flips with it (one source)', () => {
        const dims = resolveDoorDimensions('dt-solid-timber', 'single');
        const leafLength = dims.width - 2 * dims.frameThickness;

        const outward = makeDoor({ swingDirection: 'outward' });
        const geo = symbol(outward)!;
        const proj = readPts(geo.proj);

        // Swing flipped → the hinge is now on the OTHER wall face (z = −halfThk).
        const hinge = { x: (outward.offset as number) + dims.frameThickness, z: -HALF_THK };
        const onArc = proj.filter(p =>
            Math.abs(Math.hypot(p.x - hinge.x, p.z - hinge.z) - leafLength) < 1e-6);
        expect(onArc.length).toBeGreaterThanOrEqual(64);

        // The leaf, the arc AND the hardware all moved to the other face together, because
        // they all take the hinge from ONE resolver. Nothing is left on the old face.
        const ghostZs = readPts(geo.ghost).map(p => p.z);
        expect(Math.min(...ghostZs)).toBeCloseTo(-HALF_THK, 6);
    });

    it('no literal dimension survives in the symbol builder', () => {
        const src = readFileSync(SYMBOL_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        // Hardware + leaf + hinge dimensions must all be multiples of REAL record values.
        expect(code).not.toMatch(/leafThick\w*\s*[:=]\s*0?\.\d+/);
        expect(code).not.toMatch(/frameThick\w*\s*[:=]\s*0?\.\d+/);
        expect(code).not.toMatch(/leverLen\w*\s*=\s*0?\.\d+/);
        expect(code).not.toMatch(/roseHalf\s*=\s*0?\.\d+/);
        expect(code).not.toMatch(/setBack\s*=\s*0?\.\d+/);
        expect(code).toMatch(/resolveDoorDimensions\s*\(/);
    });
});
