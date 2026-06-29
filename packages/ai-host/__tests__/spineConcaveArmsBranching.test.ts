// §SPINE-CONCAVE-ARMS (founder "I never saw a corridor BRANCH on an L/T/U shape really connecting all
// required rooms; the graph is never all-blue", 2026-06-28).
//
// THE DEFECT (live, any non-rectangular house footprint): on a CONCAVE axis-rectilinear shell the
// corridor stayed a single straight (I) run, and rooms banded off the arm the straight run never
// traversed were placed in the NOTCH (outside the building) and clipped away → SEALED / unreachable
// (the founder's red circulation graph). Root cause (3 coupled bugs, all in apartmentLayout/tgl/):
//   1. deriveCorridorSpine derived ONE bbox-centre run — no leg into a perpendicular arm.
//   2. packRoomsAlongSpineTree built the corridor strip + residual room bands against the BBOX, so a
//      band (and the rooms in it) spilled into the notch (outside the shell).
//   3. subdivide's §SPINE-TREE consumer convex-clamped the corridor cells (clampRectToConvexShell is
//      convex-only), which on a concave shell collapsed them so the L/T corridor RING was lost → the
//      corridor lifted as one rect → most rooms shipped sealed.
//
// THE FIX: deriveCorridorSpine now decomposes a concave axis-rectilinear shell into its arm rects
// (decomposeToRects) and routes a BRANCHING corridor through every arm (each secondary arm's strip
// hugs the junction so its full depth is one façade band); packRoomsAlongSpineTree tiles the ARM
// rects (never the bbox) so no room lands in the notch; the consumer skips the convex clamp on a
// concave shell so the L/T corridor ring survives. These tests pin: a real branching corridor + every
// room placed inside the shell AND sharing a corridor wall, on L / T / U footprints.

import { describe, expect, it } from 'vitest';
import { deriveCorridorSpine } from '../src/workflows/apartmentLayout/tgl/deriveCorridorSpine.js';
import { packRoomsAlongSpineTree, type SpineRoom } from '../src/workflows/apartmentLayout/tgl/packRoomsAlongSpine.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const DOOR_W = 0.8;

const bboxOf = (poly: readonly Pt[]): Rect => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { x0, z0, x1, z1 };
};
const sharedWallM = (a: Rect, b: Rect): number => {
    const vAbut = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
    const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const hAbut = Math.abs(a.z1 - b.z0) < 0.05 || Math.abs(b.z1 - a.z0) < 0.05;
    const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return Math.max(vAbut && zOv > 0 ? zOv : 0, hAbut && xOv > 0 ? xOv : 0);
};
const overlapM2 = (a: Rect, b: Rect): number =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
/** Even-odd point-in-(rectilinear)-polygon: a room centre INSIDE the real L/T/U shell. */
function pointInPoly(p: Pt, poly: readonly Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        if ((a.z > p.z) !== (b.z > p.z)) {
            const xCross = a.x + ((p.z - a.z) / (b.z - a.z)) * (b.x - a.x);
            if (p.x < xCross) inside = !inside;
        }
    }
    return inside;
}

function rooms(): SpineRoom[] {
    return [
        { id: 'living', targetAreaM2: 24, needsWindow: true, minShortSideM: 3.2 },
        { id: 'kitchen', targetAreaM2: 14, needsWindow: true, minShortSideM: 1.8 },
        { id: 'bed1', targetAreaM2: 16, needsWindow: true, minShortSideM: 2.6 },
        { id: 'bed2', targetAreaM2: 16, needsWindow: true, minShortSideM: 2.6 },
        { id: 'bath', targetAreaM2: 6, needsWindow: false, minShortSideM: 1.8 },
    ];
}

// L: a horizontal bar (z 0..6, x 0..16) + a vertical arm (x 0..6, z 6..14). Notch = x>6, z>6.
const L_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 14 }, { x: 0, z: 14 }];
// T: a top bar (z 0..6, x 0..18) + a central stem (x 6..12, z 6..14).
const T_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 6 }, { x: 12, z: 6 }, { x: 12, z: 14 }, { x: 6, z: 14 }, { x: 6, z: 6 }, { x: 0, z: 6 }];
// U: two legs (x 0..6 and x 12..18, both z 0..14) joined by a bottom bar (z 0..6, x 0..18).
const U_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 14 }, { x: 12, z: 14 }, { x: 12, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 14 }, { x: 0, z: 14 }];

const SHAPES: Array<[string, Pt[]]> = [['L', L_SHELL], ['T', T_SHELL], ['U', U_SHELL]];

describe('§SPINE-CONCAVE-ARMS — the corridor BRANCHES through every arm of an L/T/U shell', () => {
    for (const [name, shell] of SHAPES) {
        describe(`${name}-shaped footprint`, () => {
            it('derives a BRANCHING spine (≥2 perpendicular corridor segments — not a single straight run)', () => {
                const spine = deriveCorridorSpine(shell, { widthM: 1.2 });
                expect(spine, 'a spine was derived').not.toBeNull();
                expect(spine!.segments.length, 'a branching corridor has ≥2 segments').toBeGreaterThanOrEqual(2);
                // At least one horizontal AND one vertical segment ⇒ the corridor genuinely turns.
                const hasH = spine!.segments.some(s => Math.abs(s.a.z - s.b.z) < 1e-6 && Math.abs(s.a.x - s.b.x) > 0.5);
                const hasV = spine!.segments.some(s => Math.abs(s.a.x - s.b.x) < 1e-6 && Math.abs(s.a.z - s.b.z) > 0.5);
                expect(hasH && hasV, `${name} corridor must run in BOTH axes (an L/T/+), not one straight I-run`).toBe(true);
            });

            it('places every room — NO drops — and never in the notch (all inside the real shell)', () => {
                const spine = deriveCorridorSpine(shell, { widthM: 1.2 })!;
                const res = packRoomsAlongSpineTree(bboxOf(shell), spine, rooms(), { shellPolygon: shell })!;
                expect(res).not.toBeNull();
                expect(res.dropped, `no room dropped on the ${name} plate`).toEqual([]);
                expect(res.rooms.map(r => r.roomId).sort()).toEqual(['bath', 'bed1', 'bed2', 'kitchen', 'living']);
                for (const room of res.rooms) {
                    const c = { x: (room.rect.x0 + room.rect.x1) / 2, z: (room.rect.z0 + room.rect.z1) / 2 };
                    expect(pointInPoly(c, shell), `${room.roomId} centre must be INSIDE the ${name} shell (not the notch)`).toBe(true);
                }
            });

            it('every room shares a ≥ door-width wall with a corridor cell (reachable circulation)', () => {
                const spine = deriveCorridorSpine(shell, { widthM: 1.2 })!;
                const res = packRoomsAlongSpineTree(bboxOf(shell), spine, rooms(), { shellPolygon: shell })!;
                for (const room of res.rooms) {
                    const best = Math.max(...res.corridorCells.map(c => sharedWallM(room.rect, c)));
                    expect(best, `${room.roomId} must abut the corridor (got ${best.toFixed(2)}m)`).toBeGreaterThanOrEqual(DOOR_W);
                }
            });

            it('no room overlaps a corridor cell (the corridor stays clear)', () => {
                const spine = deriveCorridorSpine(shell, { widthM: 1.2 })!;
                const res = packRoomsAlongSpineTree(bboxOf(shell), spine, rooms(), { shellPolygon: shell })!;
                for (const room of res.rooms)
                    for (const c of res.corridorCells)
                        expect(overlapM2(room.rect, c), `${room.roomId} overlaps a corridor cell`).toBeLessThan(1e-2);
            });
        });
    }

    it('a RECTANGLE is unchanged — a single straight run (no branching, byte-identical legacy path)', () => {
        const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 10 }, { x: 0, z: 10 }];
        const spine = deriveCorridorSpine(RECT, { widthM: 1.2 })!;
        expect(spine.segments.length, 'a rectangle keeps a single straight run').toBe(1);
    });

    it('is deterministic — identical inputs give an identical branching spine', () => {
        const a = deriveCorridorSpine(L_SHELL, { widthM: 1.2 });
        const b = deriveCorridorSpine(L_SHELL, { widthM: 1.2 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
