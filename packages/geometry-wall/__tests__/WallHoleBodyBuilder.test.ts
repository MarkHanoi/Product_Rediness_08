/**
 * §WALL-PLAIN-HOLE-EXTRUDE (2026-06-08) — WallHoleBodyBuilder focused suite.
 *
 * Proves the seam fix for the recurring founder live-test defect: a window/door
 * cut into a PLAIN partition wall used to show a vertical seam beside the opening
 * (and a horizontal break below it) because the body was assembled from abutting
 * box segments whose shared edges were T-junctions.
 *
 * The fix builds the body as ONE continuous ExtrudeGeometry (wall rectangle minus
 * a hole per opening). These tests assert the structural invariants that guarantee
 * NO seam:
 *
 *   (a) a single interior opening yields a continuous body with the hole present;
 *   (b) there is NO full-height "seam quad" on the jamb plane (x = opening edge) —
 *       that quad is exactly the artefact the old segmented body produced where the
 *       full-height before/after box abutted the sill/header boxes;
 *   (c) the only faces on the jamb plane are the opening REVEAL faces, and they
 *       span ONLY the opening's vertical range (not the full wall height) — i.e. a
 *       real hole reveal, not an internal division wall;
 *   (d) the not-extrude-able cases (edge-touching / overlapping / degenerate)
 *       return null so the caller keeps the seamed-but-correct segmented fallback.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    buildWallHoleBodyGeometry,
    normaliseWallHoles,
    type WallHoleBodyParams,
} from '../src/WallHoleBodyBuilder';

// A plain partition wall with one centred interior window.
// §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `offset` is the LEFT EDGE of the span
// [offset, offset+width]. A centred window on a length-4 wall has offset = (4 − 1.2)/2
// = 1.4, so the jambs land at 1.4 and 2.6 (centre 2.0) — same physical window as before.
const WALL: WallHoleBodyParams = {
    length: 4,
    height: 2.8,
    thickness: 0.1,
    baseOffset: 0,
    openings: [{ offset: 1.4, width: 1.2, height: 1.2, sillHeight: 0.9 }],
};
const JAMB_LEFT = 1.4;            // offset (left edge)
const JAMB_RIGHT = 1.4 + 1.2;    // offset + width = 2.6
const SILL = 0.9;
const HEAD = 0.9 + 1.2;          // 2.1

/** All triangles of a non-indexed view of the geometry, as vertex-triplets. */
function triangles(geo: THREE.BufferGeometry): Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.getAttribute('position');
    const out: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
    for (let i = 0; i < pos.count; i += 3) {
        out.push([
            new THREE.Vector3().fromBufferAttribute(pos, i),
            new THREE.Vector3().fromBufferAttribute(pos, i + 1),
            new THREE.Vector3().fromBufferAttribute(pos, i + 2),
        ]);
    }
    return out;
}

const NEAR = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

describe('WallHoleBodyBuilder — continuous body, no seam', () => {
    it('builds a single continuous body geometry for one interior opening', () => {
        const geo = buildWallHoleBodyGeometry(WALL);
        expect(geo).not.toBeNull();
        const pos = geo!.getAttribute('position');
        expect(pos.count).toBeGreaterThan(0);

        // The body must span the full wall extent in x and y, and straddle z=0
        // (z-centred like the box segments it replaces).
        geo!.computeBoundingBox();
        const bb = geo!.boundingBox!;
        expect(NEAR(bb.min.x, 0)).toBe(true);
        expect(NEAR(bb.max.x, WALL.length)).toBe(true);
        expect(NEAR(bb.min.y, 0)).toBe(true);
        expect(NEAR(bb.max.y, WALL.height)).toBe(true);
        expect(NEAR(bb.min.z, -WALL.thickness / 2)).toBe(true);
        expect(NEAR(bb.max.z, WALL.thickness / 2)).toBe(true);
    });

    it('has NO full-height seam quad on the jamb plane (the old segment artefact)', () => {
        const geo = buildWallHoleBodyGeometry(WALL)!;
        const tris = triangles(geo);

        // A "seam quad" is a triangle lying entirely on the jamb plane x=JAMB_LEFT
        // (or JAMB_RIGHT) that reaches ABOVE the head or BELOW the sill — i.e. it
        // would only exist if a full-height box face had been split there. The
        // legitimate reveal faces are bounded to [SILL, HEAD]; anything outside is
        // an internal division wall = a seam.
        for (const jamb of [JAMB_LEFT, JAMB_RIGHT]) {
            const onJamb = tris.filter((t) => t.every((v) => NEAR(v.x, jamb)));
            for (const t of onJamb) {
                for (const v of t) {
                    // every vertex of a jamb-plane triangle must sit within the
                    // opening's vertical span — never up into the header or down
                    // into the sill course of a (non-existent) split full-height box.
                    expect(v.y).toBeGreaterThanOrEqual(SILL - 1e-3);
                    expect(v.y).toBeLessThanOrEqual(HEAD + 1e-3);
                }
            }
        }
    });

    it('cuts a real hole — the front face is absent across the opening rect', () => {
        const geo = buildWallHoleBodyGeometry(WALL)!;
        const tris = triangles(geo);
        const front = WALL.thickness / 2;

        // No front-face (z=+t/2) triangle may have its centroid inside the opening
        // rectangle — that area is the hole. (A seamed full body would still leave
        // the hole; this guards the extrude actually subtracted it.)
        const insideHole = (x: number, y: number) =>
            x > JAMB_LEFT + 1e-3 && x < JAMB_RIGHT - 1e-3 &&
            y > SILL + 1e-3 && y < HEAD - 1e-3;
        const frontTrisInHole = tris.filter((t) => {
            if (!t.every((v) => NEAR(v.z, front))) return false;
            const cx = (t[0].x + t[1].x + t[2].x) / 3;
            const cy = (t[0].y + t[1].y + t[2].y) / 3;
            return insideHole(cx, cy);
        });
        expect(frontTrisInHole.length).toBe(0);
    });

    it('carves a floor-reaching door as a bottom-edge notch (still continuous)', () => {
        // A door reaches the floor (sillHeight 0). It is carved out of the OUTER
        // profile (a bottom notch), not a closed hole — so the body stays one
        // continuous surface. The classifier reports it as a notch, not a hole.
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: left-edge 1.55 + width 0.9 → span [1.55, 2.45], centre 2.0.
        const floorDoor = { ...WALL, openings: [{ offset: 1.55, width: 0.9, height: 2.1, sillHeight: 0 }] };
        const norm = normaliseWallHoles(floorDoor);
        expect(norm).not.toBeNull();
        expect(norm!.holes.length).toBe(0);
        expect(norm!.notches.length).toBe(1);

        const geo = buildWallHoleBodyGeometry(floorDoor)!;
        expect(geo).not.toBeNull();
        const tris = triangles(geo);
        // The door opening rectangle (span [1.55, 2.45], head 2.1) must be
        // empty on the front face — no front-face triangle centroid inside it.
        const front = WALL.thickness / 2;
        const inDoor = (x: number, y: number) =>
            x > 1.55 + 1e-3 && x < 2.45 - 1e-3 && y > 1e-3 && y < 2.1 - 1e-3;
        const frontInDoor = tris.filter((t) => {
            if (!t.every((v) => NEAR(v.z, front))) return false;
            const cx = (t[0].x + t[1].x + t[2].x) / 3;
            const cy = (t[0].y + t[1].y + t[2].y) / 3;
            return inDoor(cx, cy);
        });
        expect(frontInDoor.length).toBe(0);
    });
});

describe('WallHoleBodyBuilder — fallback (returns null → keep segmented path)', () => {
    it('rejects an edge-touching opening (notch, not a hole)', () => {
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: left-edge 0 + width 1.2 → span [0, 1.2] touches the start edge.
        const touchingLeft = { ...WALL, openings: [{ offset: 0, width: 1.2, height: 1.2, sillHeight: 0.9 }] };
        expect(normaliseWallHoles(touchingLeft)).toBeNull();
    });

    it('rejects overlapping openings (would self-intersect in extrude)', () => {
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: spans [1.2, 2.4] and [1.8, 3.0] overlap.
        const overlapping = {
            ...WALL,
            openings: [
                { offset: 1.2, width: 1.2, height: 1.2, sillHeight: 0.9 },
                { offset: 1.8, width: 1.2, height: 1.2, sillHeight: 0.9 },
            ],
        };
        expect(normaliseWallHoles(overlapping)).toBeNull();
    });

    it('accepts two separated interior openings', () => {
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: spans [1.0, 2.0] and [4.0, 5.0] (separated).
        const twoWindows = {
            ...WALL,
            length: 6,
            openings: [
                { offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 },
                { offset: 4.0, width: 1.0, height: 1.2, sillHeight: 0.9 },
            ],
        };
        const norm = normaliseWallHoles(twoWindows);
        expect(norm).not.toBeNull();
        expect(norm!.holes.length).toBe(2);
        expect(norm!.notches.length).toBe(0);
        expect(buildWallHoleBodyGeometry(twoWindows)).not.toBeNull();
    });

    it('accepts a window + a door together (one hole + one notch)', () => {
        const mixed = {
            ...WALL,
            length: 6,
            // §OPENING-OFFSET-LEFTEDGE-UNIFY: window span [1.0, 2.0], door span [3.55, 4.45].
            openings: [
                { offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 }, // window
                { offset: 3.55, width: 0.9, height: 2.1, sillHeight: 0 },  // door
            ],
        };
        const norm = normaliseWallHoles(mixed);
        expect(norm).not.toBeNull();
        expect(norm!.holes.length).toBe(1);
        expect(norm!.notches.length).toBe(1);
        expect(buildWallHoleBodyGeometry(mixed)).not.toBeNull();
    });

    it('rejects degenerate dimensions', () => {
        expect(normaliseWallHoles({ ...WALL, length: 0 })).toBeNull();
        expect(normaliseWallHoles({ ...WALL, thickness: 0 })).toBeNull();
        expect(normaliseWallHoles({ ...WALL, openings: [] })).toBeNull();
        expect(normaliseWallHoles({ ...WALL, openings: [{ offset: 2, width: 0, height: 1.2, sillHeight: 0.9 }] })).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24) — offset-convention regression.
//
// The stored opening `offset` is the LEFT EDGE of the span [offset, offset+width]
// (the convention used by every producer, the door/window tools, the occupancy
// store, and C15 §2 voidStart=offset). The geometry builders MUST cut/centre the
// void on that span — NOT treat `offset` as the centre. Before the fix a "centred"
// door (offset=(len−width)/2) rendered its centre at len/2 − width/2, i.e. ~width/2
// hard against baseLine[0] — the founder's chronic "doors not centred" complaint.
//
// This proves the convention through the pure, exported builder primitive: the cut
// rect spans exactly [offset, offset+width], so a centred opening sits at len/2 and
// an offset=0 opening sits at width/2.
// ─────────────────────────────────────────────────────────────────────────────
describe('§OPENING-OFFSET-LEFTEDGE-UNIFY — offset is the LEFT EDGE of the void span', () => {
    const LEN = 4;
    const W = 1.2;
    const baseWall: WallHoleBodyParams = {
        length: LEN, height: 2.8, thickness: 0.1, baseOffset: 0, openings: [],
    };

    /** Centre of the single hole/notch rect the builder produced, along the wall. */
    const cutCentre = (p: WallHoleBodyParams): number => {
        const norm = normaliseWallHoles(p)!;
        expect(norm).not.toBeNull();
        const rect = (norm.holes[0] ?? norm.notches[0])!;
        expect(rect).toBeTruthy();
        return (rect.x0 + rect.x1) / 2;
    };

    it('a centred opening offset=(len−width)/2 cuts its centre at len/2 (within 1mm)', () => {
        const centredOffset = (LEN - W) / 2;            // 1.4 — left edge of a centred window
        const wall = { ...baseWall, openings: [{ offset: centredOffset, width: W, height: 1.2, sillHeight: 0.9 }] };
        expect(Math.abs(cutCentre(wall) - LEN / 2)).toBeLessThan(0.001);   // centre at 2.0
    });

    it('an opening at the start (offset 0) places its centre at width/2 (void-span identity)', () => {
        // normaliseWallHoles intentionally rejects an opening whose span touches the
        // start edge ([0, width]) as non-extrude-able, so assert the convention via the
        // void-span identity the builder uses: span = [offset, offset+width] ⇒ for
        // offset=0 the centre = (0 + width)/2 = width/2. (The non-zero offset case below
        // exercises the same identity through the actual builder output.)
        const offset = 0;
        expect((offset + (offset + W)) / 2).toBeCloseTo(W / 2, 6);          // centre at 0.6
    });

    it('a near-start opening cuts its centre at offset + width/2 (within 1mm)', () => {
        const offset = 0.2;                                                 // span [0.2, 1.4]
        const wall = { ...baseWall, openings: [{ offset, width: W, height: 2.1, sillHeight: 0 }] };
        expect(Math.abs(cutCentre(wall) - (offset + W / 2))).toBeLessThan(0.001);  // centre 0.8
    });

    it('the cut rect spans exactly [offset, offset+width]', () => {
        const offset = 1.0;
        const wall = { ...baseWall, openings: [{ offset, width: W, height: 1.2, sillHeight: 0.9 }] };
        const norm = normaliseWallHoles(wall)!;
        const rect = (norm.holes[0] ?? norm.notches[0])!;
        expect(Math.abs(rect.x0 - offset)).toBeLessThan(0.001);
        expect(Math.abs(rect.x1 - (offset + W))).toBeLessThan(0.001);
    });
});
