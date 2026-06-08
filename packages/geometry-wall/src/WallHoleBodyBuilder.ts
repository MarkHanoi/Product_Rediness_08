/**
 * WallHoleBodyBuilder — §WALL-PLAIN-HOLE-EXTRUDE (2026-06-08)
 *
 * Builds the body of a PLAIN straight wall with openings as ONE continuous
 * `ExtrudeGeometry`: the wall face rectangle (x = wall length axis, y = vertical)
 * minus one rectangular hole per opening, extruded through the wall thickness.
 *
 * WHY THIS EXISTS — the seam defect it fixes:
 *   The previous body was assembled from abutting box segments (before / sill /
 *   header / after). Those boxes touch but are SEPARATE quads: the full-height
 *   before/after face has no vertex at the sill or head line of the opening, so
 *   the shared edge is a T-junction. T-junctions shade as a visible vertical seam
 *   beside the hole and a horizontal break below/above it — even after
 *   `mergeGeometries` + `toCreasedNormals` (which weld co-located vertices and
 *   recompute normals but cannot heal a T-junction). A single Shape-with-holes
 *   extrude has ONE continuous front face, ONE continuous back face, and
 *   continuous reveal (jamb / sill / lintel) faces around each hole — seamless by
 *   construction, no CSG/WASM.
 *
 * PURITY: this module takes plain numbers + THREE primitives and returns a
 * `THREE.BufferGeometry`. It performs NO scene mutation, NO store access, NO DOM
 * work — so it is unit-testable in isolation (see WallHoleBodyBuilder.test.ts).
 * P2-safe: THREE is imported only via the single sanctioned renderer-three facade.
 *
 * LOCAL FRAME (matches the box-segment convention it replaces):
 *   x ∈ [0, length], y ∈ [baseOffset, baseOffset + height], z centred on 0.
 *   ExtrudeGeometry runs the profile in z ∈ [0, depth]; we translate z by
 *   −thickness/2 so the body straddles the baseline like the z-centred boxes.
 */

import * as THREE from '@pryzm/renderer-three/three';

/** A rectangular opening in the wall face, in wall-local (x along wall) metres. */
export interface WallOpeningRect {
    /** Centre offset along the wall (metres from the wall start). */
    readonly offset: number;
    /** Opening width (metres). */
    readonly width: number;
    /** Opening height (metres). */
    readonly height: number;
    /** Sill height above the wall base (metres). */
    readonly sillHeight: number;
}

export interface WallHoleBodyParams {
    readonly length: number;
    readonly height: number;
    readonly thickness: number;
    readonly baseOffset: number;
    readonly openings: ReadonlyArray<WallOpeningRect>;
}

const EPS = 1e-4;

/** A validated opening rectangle in wall-local metres, classified by kind. */
export interface NormRect { x0: number; x1: number; y0: number; y1: number; floorNotch: boolean }

export interface NormWallHoles {
    /** Interior openings (sill > 0, head < height) → ExtrudeGeometry holes (windows). */
    readonly holes: NormRect[];
    /** Floor-reaching openings (sill ≈ 0, head < height) → outer-profile notches (doors). */
    readonly notches: NormRect[];
}

/**
 * Normalise + validate the opening rectangles, classifying each as an interior
 * HOLE (window) or a floor-reaching NOTCH (door). Returns null when the openings
 * cannot be represented cleanly as one continuous extrude (the caller then keeps
 * the segmented + merge fallback — never an empty wall). Rejected cases:
 *   • degenerate wall / opening dimensions,
 *   • an opening touching a side edge or the head reaching the wall top (the box
 *     path's job — these are not closed holes or simple bottom notches),
 *   • overlapping openings (extrude self-intersection).
 *
 * Exported so the body builder AND the test share ONE definition of "extrude-able".
 */
export function normaliseWallHoles(p: WallHoleBodyParams): NormWallHoles | null {
    if (!(p.length > 0 && p.height > 0 && p.thickness > 0)) return null;
    if (!p.openings || p.openings.length === 0) return null;

    const rects: NormRect[] = [];
    for (const op of p.openings) {
        if (!(op.width > 0 && op.height > 0)) return null;
        const x0 = op.offset - op.width / 2;
        const x1 = op.offset + op.width / 2;
        const y0 = op.sillHeight ?? 0;
        const y1 = y0 + op.height;
        // Must sit strictly inside the wall in x; the head must stay below the top
        // (a full-height opening is a wall split, not a hole/notch — box path).
        if (x0 <= EPS || x1 >= p.length - EPS) return null;
        if (y1 >= p.height - EPS) return null;
        // Sill at (or below) the floor → floor notch (door); else interior hole.
        const floorNotch = y0 <= EPS;
        rects.push({ x0, x1, y0: floorNotch ? 0 : y0, y1, floorNotch });
    }

    // Overlapping openings self-intersect in the extrude — reject (segmented fallback).
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j];
            if (a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS &&
                a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS) {
                return null;
            }
        }
    }

    return {
        holes: rects.filter((r) => !r.floorNotch),
        notches: rects.filter((r) => r.floorNotch).sort((a, b) => a.x0 - b.x0),
    };
}

/**
 * Build the continuous wall body geometry, or return `null` when the openings are
 * not extrude-able (see `normaliseWallHoles`). Interior openings (windows) become
 * ExtrudeGeometry holes; floor-reaching openings (doors) are carved out of the
 * bottom edge of the outer profile so the body remains ONE continuous surface with
 * continuous reveals — no internal seam. The returned geometry is in the wall-local
 * frame described in the module header; the caller positions/rotates it onto the
 * wall direction.
 */
export function buildWallHoleBodyGeometry(p: WallHoleBodyParams): THREE.BufferGeometry | null {
    const norm = normaliseWallHoles(p);
    if (!norm) return null;

    const { length, height, thickness, baseOffset } = p;
    const { holes, notches } = norm;
    const yb = baseOffset;            // wall bottom
    const yt = baseOffset + height;   // wall top

    // Outer profile (CCW). Walk the bottom edge left→right, dipping UP and over each
    // floor-reaching opening (door) so its reveal becomes part of the outer boundary,
    // then across the top edge back to the origin. Notches are pre-sorted by x0 and
    // proven non-overlapping above, so the bottom walk is monotonic in x.
    const shape = new THREE.Shape();
    shape.moveTo(0, yb);
    for (const n of notches) {
        shape.lineTo(n.x0, yb);            // bottom edge up to the door's left jamb
        shape.lineTo(n.x0, yb + n.y1);     // up the left jamb to the head
        shape.lineTo(n.x1, yb + n.y1);     // across the head
        shape.lineTo(n.x1, yb);            // down the right jamb back to the floor
    }
    shape.lineTo(length, yb);              // remainder of the bottom edge
    shape.lineTo(length, yt);              // right edge up
    shape.lineTo(0, yt);                   // top edge back
    shape.lineTo(0, yb);                   // left edge down (close)

    // Interior openings (windows) → holes, wound opposite to the outer profile.
    for (const h of holes) {
        const path = new THREE.Path();
        path.moveTo(h.x0, yb + h.y0);
        path.lineTo(h.x0, yb + h.y1);
        path.lineTo(h.x1, yb + h.y1);
        path.lineTo(h.x1, yb + h.y0);
        path.lineTo(h.x0, yb + h.y0);
        shape.holes.push(path);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
        steps: 1,
    });
    geo.translate(0, 0, -thickness / 2);
    return geo;
}
