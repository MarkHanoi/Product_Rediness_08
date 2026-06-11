/**
 * §68.10 — GROUND-SHELL multi-opening + mitered-corner regression.
 *
 * THE FOUNDER DEFECT (tracker §68.10): on a generated house the GROUND-floor
 * perimeter shell (the DRAWN boundary that hosts the entrance door + façade
 * windows on long, mitered perimeter walls) rendered with (a) the openings NOT
 * present (no hole carved / lintel+sill pieces vanished) and (b) the perimeter
 * corners NOT joined/mitred — while the UPPER floors (minted perimeter rings)
 * rendered fine.
 *
 * THE PRIME SUSPECT: v147 §WALL-PLAIN-SEAM-MERGE-ATTR. It changed
 * `WallFragmentBuilder._mergeWallBodySegments` to normalise every wall-body
 * segment to the minimal `position`+`normal` attribute set (dropping `uv` from
 * the opening box segments) so a mitered partition's prism segment merges with
 * the opening box segments into ONE continuous creased body. The hypothesis was
 * that this normalisation (or the merge) was DROPPING the opening void or the
 * corner miter prism on the ground shell — the only wall that carries BOTH a
 * mitered corner AND openings on the same body.
 *
 * THIS TEST reproduces the EXACT segment set the plain-wall-with-openings mitered
 * path emits for a ground-shell wall (a `buildMiterPrism` first segment carrying
 * the START corner miter, box gap/sill/header segments built AROUND a window +
 * a door opening, and a `buildMiterPrism` last segment carrying the END corner
 * miter), runs the v147 normalise+merge primitive verbatim, and asserts that the
 * merged body STILL:
 *
 *   (1) carries the opening VOIDS — there is NO body geometry inside either
 *       opening rectangle (the hole survives the merge);
 *   (2) keeps the CORNER MITER — the start/end faces are angled (the miter
 *       prism's slanted end-cut is present in the merged vertex set), not the
 *       square cut a plain box would leave.
 *
 * It is the failing-then-passing regression for §68.10 AND the guard that v147's
 * win (no fragmentation: a SINGLE merged body, not N separate meshes) is kept.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries, toCreasedNormals } from '@pryzm/renderer-three';
import { buildMiterPrism } from '../src/MiterPrismBuilder';

// ── Ground-shell wall under test ─────────────────────────────────────────────
// A long perimeter run, mitered at BOTH ends (45° corners → miter normal at the
// corner bisector), hosting a façade WINDOW and the entrance DOOR.
const LEN = 6;
const HEIGHT = 2.8;
const THICK = 0.2;
const HALF_T = THICK / 2;
const BASE = 0;

// Two openings: a window (sill > 0) and a door (sill = 0), well separated so they
// form two distinct clusters (exactly the ground-shell case).
const WINDOW = { offset: 1.5, width: 1.0, height: 1.2, sillHeight: 0.9 };
const DOOR = { offset: 4.5, width: 0.9, height: 2.1, sillHeight: 0.0 };

// 45° corner miter normals at each end (a rectangular footprint corner → the
// shared miter plane normal is the 45° bisector). Non-axis-aligned so a square
// box end cap is provably distinguishable from the mitered one.
const START_MN = { nx: Math.SQRT1_2, nz: Math.SQRT1_2 };
const END_MN = { nx: Math.SQRT1_2, nz: -Math.SQRT1_2 };

/** A box body segment (before/sill/header/after) — z-centred, HAS a uv + index. */
function boxSeg(x0: number, x1: number, y0: number, y1: number): THREE.BufferGeometry {
    const w = x1 - x0;
    const h = y1 - y0;
    const g = new THREE.BoxGeometry(w, h, THICK);
    // Position the box like the builder's positionLocal: centre at the segment mid.
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    return g;
}

/** The mitered end segment MiterPrismBuilder emits — position + normal, NO uv. */
function miterSeg(x0: number, x1: number, mn: { nx: number; nz: number } | null, end: boolean): THREE.BufferGeometry {
    const segStart = new THREE.Vector3(x0, 0, 0);
    const segEnd = new THREE.Vector3(x1, 0, 0);
    return buildMiterPrism(
        segStart, segEnd, segStart, segEnd,
        HALF_T, HEIGHT, BASE,
        end ? null : mn,
        end ? mn : null,
    );
}

/**
 * Build the full segment set the plain-wall mitered+openings path emits for the
 * ground-shell wall, then run the v147 normalise+merge primitive verbatim.
 */
function buildMergedGroundShellBody(): THREE.BufferGeometry {
    const winL = WINDOW.offset - WINDOW.width / 2;   // 1.0
    const winR = WINDOW.offset + WINDOW.width / 2;    // 2.0
    const doorL = DOOR.offset - DOOR.width / 2;       // 4.05
    const doorR = DOOR.offset + DOOR.width / 2;       // 4.95

    const segs: THREE.BufferGeometry[] = [];

    // First segment [0, winL] carries the START corner miter (buildMiterPrism).
    segs.push(miterSeg(0, winL, START_MN, false));

    // Window cluster: sill box below + header box above (the void is the gap).
    segs.push(boxSeg(winL, winR, BASE, WINDOW.sillHeight));                       // sill
    segs.push(boxSeg(winL, winR, WINDOW.sillHeight + WINDOW.height, HEIGHT));      // header

    // Between window and door: a plain full-height box.
    segs.push(boxSeg(winR, doorL, BASE, HEIGHT));

    // Door cluster: header box above only (door reaches the floor → no sill box).
    segs.push(boxSeg(doorL, doorR, DOOR.sillHeight + DOOR.height, HEIGHT));        // header

    // Last segment [doorR, LEN] carries the END corner miter (buildMiterPrism).
    segs.push(miterSeg(doorR, LEN, END_MN, true));

    // ── v147 §WALL-PLAIN-SEAM-MERGE-ATTR primitive (verbatim) ────────────────
    const geos = segs.map((g) => (g.index ? g.toNonIndexed() : g));
    // Normalise to the common minimal attribute set (drop uv from the boxes).
    for (const g of geos) {
        for (const name of Object.keys(g.attributes)) {
            if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        }
    }
    const merged = mergeGeometries(geos, false);
    expect(merged).not.toBeNull();
    const creased = toCreasedNormals(merged!, THREE.MathUtils.degToRad(30));
    merged!.dispose();
    return creased;
}

/** All triangles of the geometry as vertex-triplets. */
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

/** Triangle centroid. */
function centroid(t: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 {
    return new THREE.Vector3().addVectors(t[0], t[1]).add(t[2]).multiplyScalar(1 / 3);
}

describe('§68.10 — ground-shell merged body keeps voids + corner miter (v147 exoneration)', () => {
    it('produces ONE merged body (v147 win: no fragmentation)', () => {
        const body = buildMergedGroundShellBody();
        expect(body.getAttribute('position').count).toBeGreaterThan(0);
        // A single merged geometry — the regression was N separate meshes.
        expect(body.getAttribute('normal')).toBeTruthy();
    });

    it('(1) the WINDOW void is preserved — NO body geometry inside the window hole', () => {
        const body = buildMergedGroundShellBody();
        const winL = WINDOW.offset - WINDOW.width / 2;
        const winR = WINDOW.offset + WINDOW.width / 2;
        const y0 = WINDOW.sillHeight;
        const y1 = WINDOW.sillHeight + WINDOW.height;
        // Inset so we test the hole INTERIOR, not the reveal faces on its boundary.
        const inset = 0.05;
        const offenders = triangles(body).filter((t) => {
            const c = centroid(t);
            return (
                c.x > winL + inset && c.x < winR - inset &&
                c.y > y0 + inset && c.y < y1 - inset
            );
        });
        expect(offenders.length).toBe(0);
    });

    it('(1b) the DOOR void is preserved — NO body geometry inside the door hole', () => {
        const body = buildMergedGroundShellBody();
        const doorL = DOOR.offset - DOOR.width / 2;
        const doorR = DOOR.offset + DOOR.width / 2;
        const y0 = DOOR.sillHeight;
        const y1 = DOOR.sillHeight + DOOR.height;
        const inset = 0.05;
        const offenders = triangles(body).filter((t) => {
            const c = centroid(t);
            return (
                c.x > doorL + inset && c.x < doorR - inset &&
                c.y > y0 + inset && c.y < y1 - inset
            );
        });
        expect(offenders.length).toBe(0);
    });

    it('(2) the START corner MITER is preserved — the start end-cut is angled, not square', () => {
        const body = buildMergedGroundShellBody();
        // The 45° start miter shears the start face: the outward (z = +HALF_T) edge
        // and the inner (z = -HALF_T) edge sit at DIFFERENT x. A square cut would put
        // every near-x=0 vertex at the same x regardless of z. Collect the minimum x
        // on the outer vs inner face and assert they differ by ~thickness (the shear).
        const pos = body.getAttribute('position');
        let minXOuter = Infinity;  // z ≈ +HALF_T
        let minXInner = Infinity;  // z ≈ -HALF_T
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            if (Math.abs(z - HALF_T) < 1e-4 && x < minXOuter) minXOuter = x;
            if (Math.abs(z + HALF_T) < 1e-4 && x < minXInner) minXInner = x;
        }
        expect(Number.isFinite(minXOuter)).toBe(true);
        expect(Number.isFinite(minXInner)).toBe(true);
        // A 45° miter on a THICK-thick wall shears the start by ~THICK along x.
        expect(Math.abs(minXOuter - minXInner)).toBeGreaterThan(THICK * 0.5);
    });

    it('(2b) the END corner MITER is preserved — the end end-cut is angled, not square', () => {
        const body = buildMergedGroundShellBody();
        const pos = body.getAttribute('position');
        let maxXOuter = -Infinity;  // z ≈ +HALF_T
        let maxXInner = -Infinity;  // z ≈ -HALF_T
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            if (Math.abs(z - HALF_T) < 1e-4 && x > maxXOuter) maxXOuter = x;
            if (Math.abs(z + HALF_T) < 1e-4 && x > maxXInner) maxXInner = x;
        }
        expect(Number.isFinite(maxXOuter)).toBe(true);
        expect(Number.isFinite(maxXInner)).toBe(true);
        expect(Math.abs(maxXOuter - maxXInner)).toBeGreaterThan(THICK * 0.5);
    });
});
