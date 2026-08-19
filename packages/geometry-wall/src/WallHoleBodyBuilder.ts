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
import { openingOutline, isRectangularProfile, type OpeningProfileKind } from './OpeningProfile';

/** A rectangular opening in the wall face, in wall-local (x along wall) metres. */
export interface WallOpeningRect {
    /**
     * §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): LEFT-EDGE offset of the opening
     * span [offset, offset+width] along the wall (metres from the wall start).
     */
    readonly offset: number;
    /** Opening width (metres). */
    readonly width: number;
    /** Opening height (metres). */
    readonly height: number;
    /** Sill height above the wall base (metres). */
    readonly sillHeight: number;
    /**
     * §OPENING-PROFILE (L-1200) — the void's SHAPE. Absent ⇒ rectangular ⇒ byte-identical output.
     *
     * ⭐ THIS ARM IS THE ONE THAT CARRIES A CURVE NATIVELY, AND IT ALWAYS COULD HAVE. The body is
     * already a `THREE.Shape` with `THREE.Path` holes, and a `Path` accepts an arc exactly where it
     * accepts a `lineTo`. C86 §10.1 measured that: of five wall-body arms this is the only one whose
     * representation admits a non-rectangular void with no new dependency, no CSG and no WASM.
     *
     * ⚠ It is also the arm that runs on the FEWEST walls — the caller gates it on having no mitre
     * join and no rake cap-drift, and an ordinary closed room mitres both ends of every wall. That
     * is why `OpeningProfileGasket` exists for the other two straight arms, and why "it already
     * works" was the wrong answer to the founder's question.
     */
    readonly openingProfile?: OpeningProfileKind;
}

export interface WallHoleBodyParams {
    readonly length: number;
    readonly height: number;
    readonly thickness: number;
    readonly baseOffset: number;
    readonly openings: ReadonlyArray<WallOpeningRect>;
}

const OPENING_EPS_M = 1e-4;   // C73 §2.3 — 0.1 mm, in wall-local METRES: the margin that keeps a flush opening off the wall ends and stops two merely-touching rects reading as overlapping.

/** A validated opening rectangle in wall-local metres, classified by kind. */
export interface NormRect { x0: number; x1: number; y0: number; y1: number; floorNotch: boolean; profile?: OpeningProfileKind }

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
        // §OPENING-OFFSET-LEFTEDGE-UNIFY: offset is the LEFT EDGE; span = [offset, offset+width].
        const x0 = op.offset;
        const x1 = op.offset + op.width;
        const y0 = op.sillHeight ?? 0;
        const y1 = y0 + op.height;
        // Must sit strictly inside the wall in x; the head must stay below the top
        // (a full-height opening is a wall split, not a hole/notch — box path).
        if (x0 <= OPENING_EPS_M || x1 >= p.length - OPENING_EPS_M) return null;
        if (y1 >= p.height - OPENING_EPS_M) return null;
        // Sill at (or below) the floor → floor notch (door); else interior hole.
        const floorNotch = y0 <= OPENING_EPS_M;
        rects.push({ x0, x1, y0: floorNotch ? 0 : y0, y1, floorNotch, profile: op.openingProfile });
    }

    // Overlapping openings self-intersect in the extrude — reject (segmented fallback).
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j];
            if (a.x0 < b.x1 - OPENING_EPS_M && b.x0 < a.x1 - OPENING_EPS_M &&
                a.y0 < b.y1 - OPENING_EPS_M && b.y0 < a.y1 - OPENING_EPS_M) {
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
        // §OPENING-PROFILE — walk the notch's OWN outline over the head, instead of the three
        // hard-coded lines this loop used to emit. `openingOutline` is the single producer
        // (C86 §10.1 PR-1); traversing its CCW points BACKWARDS from index 0 goes
        // foot → up the left jamb → over the head → down to the right foot, which for a
        // rectangle reproduces those three lines EXACTLY — the PR-2 byte-identity guarantee, kept
        // by construction rather than by a parallel branch that has to be maintained in step.
        // ⭐ This is what makes a ROUND-ARCHED DOOR the same code path as a rectangular one, which
        // is what the founder's "from the same place" actually requires below the UI.
        const walk = notchWalk(n);
        if (walk) {
            for (const pt of walk) shape.lineTo(pt.x, yb + pt.y);
        } else {
            shape.lineTo(n.x0, yb + n.y1);     // up the left jamb to the head
            shape.lineTo(n.x1, yb + n.y1);     // across the head
        }
        shape.lineTo(n.x1, yb);            // down the right jamb back to the floor
    }
    shape.lineTo(length, yb);              // remainder of the bottom edge
    shape.lineTo(length, yt);              // right edge up
    shape.lineTo(0, yt);                   // top edge back
    shape.lineTo(0, yb);                   // left edge down (close)

    // Interior openings (windows) → holes, wound opposite to the outer profile.
    //
    // §OPENING-PROFILE — the hole follows the opening's outline. A `THREE.Path` accepts an arc
    // wherever it accepts a segment, so a CIRCULAR window is expressed here EXACTLY: not sampled
    // into a staircase, not approximated by finer rectangles, and with the continuous reveal
    // (jamb / soffit) faces the Shape-extrude gives for free. The outline is CCW and the outer
    // profile is CCW, so the hole is walked in REVERSE to wind it the opposite way.
    for (const h of holes) {
        const path = new THREE.Path();
        const pts = holeWalk(h);
        if (pts) {
            path.moveTo(pts[0]!.x, yb + pts[0]!.y);
            for (let i = 1; i < pts.length; i++) path.lineTo(pts[i]!.x, yb + pts[i]!.y);
            path.lineTo(pts[0]!.x, yb + pts[0]!.y);
        } else {
            path.moveTo(h.x0, yb + h.y0);
            path.lineTo(h.x0, yb + h.y1);
            path.lineTo(h.x1, yb + h.y1);
            path.lineTo(h.x1, yb + h.y0);
            path.lineTo(h.x0, yb + h.y0);
        }
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

/**
 * The outline of a NormRect, or `null` when it is an ordinary rectangle (so the caller keeps its
 * pre-existing literal walk and the output is byte-identical) or when the profile cannot be built.
 *
 * ⚠ A `null` from a NON-rectangular profile means the authoring gate
 * (`openingProfileRefusal`) was skipped upstream: the caller then draws the rectangle it always
 * drew. That is a LOUD wrong — a visibly square hole where the user asked for a round one — not a
 * subtly wrong curve, which is the failure mode C86 §10.1 is organised to avoid.
 */
function outlineFor(r: NormRect): readonly { x: number; y: number }[] | null {
    if (isRectangularProfile(r.profile)) return null;
    const o = openingOutline({
        profile: r.profile,
        offset: r.x0,
        width: r.x1 - r.x0,
        height: r.y1 - r.y0,
        sillHeight: r.y0,
    });
    return o && !o.isRectangular ? o.points : null;
}

/** Notch (floor-reaching) walk: left foot → up → over the head → right foot, EXCLUDING both feet. */
function notchWalk(r: NormRect): readonly { x: number; y: number }[] | null {
    const pts = outlineFor(r);
    if (!pts) return null;
    // points[0] is the left foot (already reached by the caller) and points[1] the right foot
    // (emitted by the caller afterwards); everything between, walked backwards, is the head.
    const out: { x: number; y: number }[] = [];
    for (let i = pts.length - 1; i >= 2; i--) out.push({ x: pts[i]!.x, y: pts[i]!.y });
    return out;
}

/** Hole walk: the outline reversed, so the hole winds opposite the CCW outer profile. */
function holeWalk(r: NormRect): readonly { x: number; y: number }[] | null {
    const pts = outlineFor(r);
    if (!pts) return null;
    return [...pts].reverse();
}
