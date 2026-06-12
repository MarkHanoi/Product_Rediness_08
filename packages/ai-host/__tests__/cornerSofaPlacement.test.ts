// §67.3 (2026-06-12) — CORNER (L-shape) sofa placement regression.
//
// Founder defect (3D screenshot): the corner_sofa floated in the MIDDLE of the
// living room. Root cause: it was placed by the generic straight-sofa wall path,
// which emits a wall-anchored CENTRE as `position` — but the editor interprets a
// corner_sofa's `position` as the INSIDE-BACK CORNER (CornerSofaBuilder origin),
// so the L's corner landed at that centre and the body sprawled into the room.
//
// The fix seats the inside-back corner in a real room corner: both backs flush on
// two perpendicular walls, the open seat quadrant facing into the room / media
// wall. The coffee table + rug sit in the L's inner pocket.
//
// These asserts pin: (1) corner_sofa is chosen for a large living room; (2) its
// two backs lie flush (≤ ~0.06 m) on two perpendicular room walls; (3) the open
// quadrant points into the room; (4) the coffee table is centred in the pocket
// within the gap band, clear of the seat legs.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import type { FurnishRoomInput, Pt } from '../src/workflows/furnishLayout/types.js';

/** Rectangular room [0,0]→[w,d], 4 walls, one door on the bottom (z=0) wall. */
function rectRoom(occupancy: string, w: number, d: number): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'r1', levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [],
        levelElevation: 0,
    };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Distance from point p to wall segment w's infinite line; +∞ if outside span. */
function distToWall(p: Pt, w: FurnishRoomInput['walls'][number]): number {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const t = (p.x - w.a.x) * ux + (p.z - w.a.z) * uz;
    if (t < -0.05 || t > len + 0.05) return Infinity;
    const px = w.a.x + ux * t, pz = w.a.z + uz * t;
    return Math.hypot(p.x - px, p.z - pz);
}

describe('§67.3 corner sofa — corner-anchored, not floating', () => {
    // A generous 5 × 4.5 (22.5 m²) living room: above L_SOFA_MIN_AREA_M2 and big
    // enough that the L (2.60 × 2.00) fits with circulation → corner_sofa chosen.
    const room = (): FurnishRoomInput => rectRoom('living-room', 5, 4.5);

    it('chooses the corner_sofa for a large living room', () => {
        const items = furnishRoom(room());
        expect(items.some(i => i.kind === 'corner_sofa')).toBe(true);
    });

    it('seats the L back + side flush against two perpendicular walls', () => {
        const r = room();
        const items = furnishRoom(r);
        const sofa = items.find(i => i.kind === 'corner_sofa')!;
        expect(sofa).toBeDefined();

        // position = inside-back corner origin. Reconstruct the two run directions
        // from the yaw (localX→u main run, localZ→v side run) and the two BACK
        // wall faces: the main-run back lies on the line through `corner` along u
        // (outward normal -v), the side-run back along v (outward normal -u).
        const yaw = sofa.rotationY;
        const u: Pt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        const v: Pt = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const corner: Pt = { x: sofa.position.x, z: sofa.position.z };

        // The corner origin must sit ≈ on a room corner (a polygon vertex), within
        // the GAP inset (a few cm).
        const verts = r.polygon as Pt[];
        const nearestVert = verts.reduce((best, p) => dist(corner, p) < dist(corner, best) ? p : best, verts[0]!);
        expect(dist(corner, nearestVert)).toBeLessThan(0.15);

        // Both backs flush: the main-run back midpoint (corner + u·(w/2)) and the
        // side-run back midpoint (corner + v·(l/2)) each lie on SOME room wall
        // within ~6 cm (GAP-flush). And those two walls are perpendicular.
        const w = sofa.footprint.w, l = sofa.footprint.l;
        const mainBackMid: Pt = { x: corner.x + u.x * (w / 2), z: corner.z + u.z * (w / 2) };
        const sideBackMid: Pt = { x: corner.x + v.x * (l / 2), z: corner.z + v.z * (l / 2) };
        const mainWall = r.walls.reduce((b, wl) => distToWall(mainBackMid, wl) < distToWall(mainBackMid, b) ? wl : b, r.walls[0]!);
        const sideWall = r.walls.reduce((b, wl) => distToWall(sideBackMid, wl) < distToWall(sideBackMid, b) ? wl : b, r.walls[0]!);
        expect(distToWall(mainBackMid, mainWall)).toBeLessThan(0.08);
        expect(distToWall(sideBackMid, sideWall)).toBeLessThan(0.08);
        // perpendicular walls
        const dirM = { x: mainWall.b.x - mainWall.a.x, z: mainWall.b.z - mainWall.a.z };
        const dirS = { x: sideWall.b.x - sideWall.a.x, z: sideWall.b.z - sideWall.a.z };
        const lm = Math.hypot(dirM.x, dirM.z) || 1, ls = Math.hypot(dirS.x, dirS.z) || 1;
        const cosAng = (dirM.x * dirS.x + dirM.z * dirS.z) / (lm * ls);
        expect(Math.abs(cosAng)).toBeLessThan(0.2);
    });

    it('opens into the room (open quadrant points toward the room interior)', () => {
        const r = room();
        const items = furnishRoom(r);
        const sofa = items.find(i => i.kind === 'corner_sofa')!;
        const yaw = sofa.rotationY;
        const u: Pt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        const v: Pt = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const corner: Pt = { x: sofa.position.x, z: sofa.position.z };
        // The opening bisector (u+v) should point from the corner toward the room
        // centroid (positive dot product), i.e. the seats face inward, not at a wall.
        const open = { x: u.x + v.x, z: u.z + v.z };
        const toCentroid = { x: r.centroid.x - corner.x, z: r.centroid.z - corner.z };
        expect(open.x * toCentroid.x + open.z * toCentroid.z).toBeGreaterThan(0);
    });

    it('places the coffee table centred in the L pocket within the gap band', () => {
        const r = room();
        const items = furnishRoom(r);
        const sofa = items.find(i => i.kind === 'corner_sofa')!;
        const table = items.find(i => i.kind === 'coffee_table');
        expect(table, 'coffee table must place in the pocket').toBeDefined();

        const yaw = sofa.rotationY;
        const u: Pt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        const v: Pt = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const corner: Pt = { x: sofa.position.x, z: sofa.position.z };
        const tc: Pt = { x: table!.position.x, z: table!.position.z };
        // table centre in the L's local (u,v) frame
        const du = (tc.x - corner.x) * u.x + (tc.z - corner.z) * u.z;
        const dv = (tc.x - corner.x) * v.x + (tc.z - corner.z) * v.z;
        // table must lie in the pocket: past both seat fronts (0.90) on both axes,
        // and within the L extent (main run 2.60 along u, side run 2.00 along v).
        expect(du).toBeGreaterThan(0.90);
        expect(dv).toBeGreaterThan(0.90);
        expect(du).toBeLessThan(sofa.footprint.w);
        expect(dv).toBeLessThan(sofa.footprint.l);
        // aligned to the sofa facing (same yaw)
        expect(table!.rotationY).toBeCloseTo(sofa.rotationY, 6);
        // within the gap band: the table's nearest edge to each seat front is
        // ~POCKET_GAP (0.40 m). Edge along u = du − fp.w/2; gap from seat front 0.90.
        const gapU = (du - table!.footprint.w / 2) - 0.90;
        const gapV = (dv - table!.footprint.l / 2) - 0.90;
        expect(gapU).toBeGreaterThan(0.30);
        expect(gapU).toBeLessThan(0.55);
        expect(gapV).toBeGreaterThan(0.30);
        expect(gapV).toBeLessThan(0.55);
    });

    it('is deterministic', () => {
        expect(JSON.stringify(furnishRoom(room()))).toEqual(JSON.stringify(furnishRoom(room())));
    });
});
