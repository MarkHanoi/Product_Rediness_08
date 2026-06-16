// D2.5 / T2.5 — `validateFrontage` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// §9.2 D2.5 + §19.2 T2.5; APARTMENT-COGNITION-STACK L1-α-1/3).
//
// HARD-rejects layouts where a room with `frontage: 'required'` (T1.6:
// living / kitchen / master / bedroom) ends up FULLY INTERIOR — none of
// its rect edges sit on the shell perimeter. Such a room is a daylight-
// less black hole and breaks G8 / Building Regs habitability.
//
// SOFT-penalises rooms with `frontage: 'preferred'` (dining / study)
// that are fully interior — geometrically possible but a quality miss.
//
// Pairs with the existing `daylight` objective axis (which depth-weights
// the AREA of fronting rooms): T2.5 catches the binary "is this room
// even on the perimeter at all" failure that a smooth axis can miss.
//
// L2-pure: no THREE / DOM / RNG. Tests in plain Node.

import { roomRule } from '../rules/programRules.js';
import type { RoomType } from '../types.js';
import type { DimensionalValidation, ValidationFinding } from './types.js';
import type { Pt, Rect } from '../tgl/rectDecomposition.js';

const EPS = 1e-4;       // 0.1 mm tolerance — rooms may sit on the perimeter to ±1e-4 m

export interface FrontageRoomInput {
    readonly roomId: string;
    readonly type: RoomType;
    readonly name?: string;
    /** Axis-aligned rectangle in metres. x0 < x1, z0 < z1. */
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

export interface FrontageInput {
    /** Apartment shell polygon (world XZ, metres). */
    readonly shellPolygon: readonly Pt[];
    /** All placed rooms in the candidate layout. */
    readonly rooms: readonly FrontageRoomInput[];
    /**
     * §FRONTAGE-TILING-FRAME (rotated non-quad frontage false-negative cure, 2026-06-16;
     * ADR-0063 §8.7). OPTIONAL set of axis-aligned rects = the EXACT decomposition the rooms
     * were tiled against (`decomposeToRects(shell)` in the SAME frame as `rect`). When supplied,
     * frontage is tested against the OUTER BOUNDARY OF THIS RECT UNION instead of `shellPolygon`.
     *
     * WHY: on a freehand L/U/T drawn at an angle, the principal-axis de-rotation aligns the
     * shell's DOMINANT edge family but leaves the individual edges slightly DIAGONAL; the rooms,
     * however, were tiled onto the AXIS-ALIGNED stair-step grid `decomposeToRects` produced.
     * `rectTouchesPerimeter` only matches axis-aligned shell edges, so every room reads INTERIOR
     * against the diagonal shell → every frontage:'required' room false-fails (founder v107 218 m²
     * rotated L-plate). `rectifyConvexQuad` cures only the CONVEX-QUAD case (it is the identity for
     * > 4 vertices / concave). Testing against the rect-union boundary tests against the very grid
     * the rooms occupy — the genuinely same-frame perimeter — so it cures L/U/T/concave too.
     *
     * BYTE-IDENTITY: absent ⇒ the `shellPolygon` path is untouched (every existing caller). For a
     * CONVEX QUAD, `decomposeToRects` rectifies to a single bbox rect, so the rect-union boundary ≡
     * the rectified bbox ring (same verdict as today's `rectifyConvexQuad`). For an axis-aligned
     * rectangle / L / U / T (and the flat apartment plates), `decomposeToRects` reproduces the shell
     * exactly, so the rect-union boundary ≡ the shell perimeter (same verdict as `shellPolygon`).
     */
    readonly perimeterRects?: readonly Rect[];
}

/** Is the point strictly inside ANY rect of the set (interior, not on an edge)? */
function pointStrictlyInAnyRect(x: number, z: number, rects: readonly Rect[]): boolean {
    for (const r of rects) {
        if (x > r.x0 + EPS && x < r.x1 - EPS && z > r.z0 + EPS && z < r.z1 - EPS) return true;
    }
    return false;
}

/** Does the point lie ON an edge of ANY rect of the set (within EPS)? */
function pointOnAnyRectEdge(x: number, z: number, rects: readonly Rect[]): boolean {
    for (const r of rects) {
        const onV = (Math.abs(x - r.x0) < EPS || Math.abs(x - r.x1) < EPS) && z > r.z0 - EPS && z < r.z1 + EPS;
        const onH = (Math.abs(z - r.z0) < EPS || Math.abs(z - r.z1) < EPS) && x > r.x0 - EPS && x < r.x1 + EPS;
        if (onV || onH) return true;
    }
    return false;
}

/**
 * Test whether a room rect touches the OUTER BOUNDARY of a rect union (the
 * §FRONTAGE-TILING-FRAME perimeter — the exact axis-aligned grid the rooms were tiled
 * onto). A room edge is "on the perimeter" when its midpoint lies on a rect edge AND the
 * point just OUTSIDE that edge is exterior to the whole union (not inside another rect) —
 * so an INTERNAL shared edge between two abutting tiles never counts as frontage. Pure.
 */
export function rectTouchesRectSet(
    rect: FrontageRoomInput['rect'],
    rects: readonly Rect[],
): boolean {
    if (rects.length === 0) return false;
    const mx = (rect.x0 + rect.x1) / 2, mz = (rect.z0 + rect.z1) / 2;
    // Probe each room edge's midpoint, nudged a hair outward; "out" point exterior ⇒ boundary.
    const out = 0.05;
    const edges: ReadonlyArray<readonly [number, number, number, number]> = [
        [mx, rect.z0, 0, -out],   // south
        [mx, rect.z1, 0, +out],   // north
        [rect.x0, mz, -out, 0],   // west
        [rect.x1, mz, +out, 0],   // east
    ];
    for (const [px, pz, ox, oz] of edges) {
        if (!pointOnAnyRectEdge(px, pz, rects)) continue;
        if (!pointStrictlyInAnyRect(px + ox, pz + oz, rects)) return true;
    }
    return false;
}

/**
 * Distance (metres) from a room rect to the nearest OUTER boundary of a rect union, in the
 * §FRONTAGE-TILING-FRAME. Mirrors `rectDistToPerimeter` but against the rect-union boundary;
 * 0 when the rect already touches it. Diagnostic only (§DIAG-FRONTAGE-DIST). Pure; no I/O.
 */
export function rectDistToRectSet(
    rect: FrontageRoomInput['rect'],
    rects: readonly Rect[],
): number {
    if (rects.length === 0) return Number.POSITIVE_INFINITY;
    if (rectTouchesRectSet(rect, rects)) return 0;
    // Otherwise measure to the nearest boundary edge whose span overlaps the rect, using the
    // SAME convention as rectDistToPerimeter but only for boundary (not internal) rect edges.
    let best = Number.POSITIVE_INFINITY;
    const isBoundaryV = (x: number, zMid: number): boolean =>
        !pointStrictlyInAnyRect(x + 0.05, zMid, rects) || !pointStrictlyInAnyRect(x - 0.05, zMid, rects);
    const isBoundaryH = (z: number, xMid: number): boolean =>
        !pointStrictlyInAnyRect(xMid, z + 0.05, rects) || !pointStrictlyInAnyRect(xMid, z - 0.05, rects);
    for (const r of rects) {
        // vertical edges of r
        const zMid = (Math.max(rect.z0, r.z0) + Math.min(rect.z1, r.z1)) / 2;
        if (rect.z1 > r.z0 + EPS && rect.z0 < r.z1 - EPS) {
            if (isBoundaryV(r.x0, zMid)) best = Math.min(best, Math.abs(rect.x0 - r.x0), Math.abs(rect.x1 - r.x0));
            if (isBoundaryV(r.x1, zMid)) best = Math.min(best, Math.abs(rect.x0 - r.x1), Math.abs(rect.x1 - r.x1));
        }
        const xMid = (Math.max(rect.x0, r.x0) + Math.min(rect.x1, r.x1)) / 2;
        if (rect.x1 > r.x0 + EPS && rect.x0 < r.x1 - EPS) {
            if (isBoundaryH(r.z0, xMid)) best = Math.min(best, Math.abs(rect.z0 - r.z0), Math.abs(rect.z1 - r.z0));
            if (isBoundaryH(r.z1, xMid)) best = Math.min(best, Math.abs(rect.z0 - r.z1), Math.abs(rect.z1 - r.z1));
        }
    }
    return best;
}

/**
 * Test whether a room rect touches the shell perimeter. Returns true when
 * any rect edge sits on (or extends to) any perimeter edge within EPS.
 *
 * Axis-aligned rectangles + axis-aligned shell perimeters (D-TGL invariant)
 * make this a cheap edge-coincidence check — for each shell edge, test
 * whether either rect edge along the same axis lies on it.
 */
export function rectTouchesPerimeter(
    rect: FrontageRoomInput['rect'],
    shellPolygon: readonly Pt[],
): boolean {
    if (shellPolygon.length < 3) return false;
    const n = shellPolygon.length;
    for (let i = 0; i < n; i++) {
        const a = shellPolygon[i]!;
        const b = shellPolygon[(i + 1) % n]!;
        // Vertical shell edge (constant X) — rect's x0 OR x1 must equal that X,
        // AND the rect's z range must overlap the edge's z range.
        if (Math.abs(a.x - b.x) < EPS) {
            const shellX = a.x;
            if (Math.abs(rect.x0 - shellX) < EPS || Math.abs(rect.x1 - shellX) < EPS) {
                const zMin = Math.min(a.z, b.z);
                const zMax = Math.max(a.z, b.z);
                if (rect.z1 > zMin + EPS && rect.z0 < zMax - EPS) return true;
            }
        }
        // Horizontal shell edge (constant Z) — symmetric.
        else if (Math.abs(a.z - b.z) < EPS) {
            const shellZ = a.z;
            if (Math.abs(rect.z0 - shellZ) < EPS || Math.abs(rect.z1 - shellZ) < EPS) {
                const xMin = Math.min(a.x, b.x);
                const xMax = Math.max(a.x, b.x);
                if (rect.x1 > xMin + EPS && rect.x0 < xMax - EPS) return true;
            }
        }
        // Diagonal shell edges — not supported by the D-TGL invariant; skip.
        // Future work: handle non-rectilinear shells.
    }
    return false;
}

/**
 * Distance (metres) from a room rect to the NEAREST shell-perimeter edge, measured in
 * the SAME frame the rect is tested in. Used by the §DIAG-FRONTAGE-DIST diagnostic to
 * distinguish a FALSE-NEGATIVE frontage fail (distance ≈ 0 — room IS on the edge but the
 * coincidence test missed it) from a GENUINE interior room (distance ≫ 0 — the room was
 * pushed inward by a corridor carve / stair keep-out). Diagnostic only — not a gate.
 *
 * Matches `rectTouchesPerimeter`'s convention: only axis-aligned shell edges contribute;
 * for each such edge the distance is the gap between the nearest parallel rect edge and
 * the shell edge (0 when the rect already touches it). Returns +∞ when no axis-aligned
 * shell edge overlaps the rect's span (no edge to measure to). Pure; no I/O.
 */
export function rectDistToPerimeter(
    rect: FrontageRoomInput['rect'],
    shellPolygon: readonly Pt[],
): number {
    if (shellPolygon.length < 3) return Number.POSITIVE_INFINITY;
    const n = shellPolygon.length;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
        const a = shellPolygon[i]!;
        const b = shellPolygon[(i + 1) % n]!;
        if (Math.abs(a.x - b.x) < EPS) {
            // Vertical shell edge — only if the rect's z-span overlaps the edge's z-span.
            const zMin = Math.min(a.z, b.z), zMax = Math.max(a.z, b.z);
            if (rect.z1 > zMin + EPS && rect.z0 < zMax - EPS) {
                best = Math.min(best, Math.abs(rect.x0 - a.x), Math.abs(rect.x1 - a.x));
            }
        } else if (Math.abs(a.z - b.z) < EPS) {
            const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
            if (rect.x1 > xMin + EPS && rect.x0 < xMax - EPS) {
                best = Math.min(best, Math.abs(rect.z0 - a.z), Math.abs(rect.z1 - a.z));
            }
        }
    }
    return best;
}

/**
 * Validate that every required-frontage room touches the perimeter.
 *
 * HARD-REJECT when a `frontage: 'required'` room is fully interior.
 * SOFT penalty when a `frontage: 'preferred'` room is fully interior.
 * Rooms with `frontage: 'none'` (corridor / hall / wet / utility) are skipped.
 *
 * Degenerate inputs (shell < 3 vertices, empty room list) return admissible
 * with no findings (nothing to validate).
 */
export function validateFrontage(input: FrontageInput): DimensionalValidation {
    if (input.shellPolygon.length < 3 || input.rooms.length === 0) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];

    // §FRONTAGE-TILING-FRAME — when the caller threads the rect decomposition the rooms
    // were tiled against, test against THAT union's outer boundary (the genuinely same-frame
    // perimeter); otherwise fall back to the shell-polygon edge-coincidence test (byte-identical
    // for every existing caller — see `FrontageInput.perimeterRects`).
    const useRectSet = input.perimeterRects !== undefined && input.perimeterRects.length > 0;

    for (const r of input.rooms) {
        const rule = roomRule(r.type);
        if (rule.frontage === 'none') continue;
        const touches = useRectSet
            ? rectTouchesRectSet(r.rect, input.perimeterRects!)
            : rectTouchesPerimeter(r.rect, input.shellPolygon);
        if (touches) continue;
        const label = r.name ?? r.roomId;
        if (rule.frontage === 'required') {
            hard.push({
                roomId: r.roomId, severity: 'hard', metric: 'frontageRequired', delta: 1.0,
                reason: `room "${label}" (${r.type}) is fully interior but frontage is REQUIRED — no perimeter wall to host a window (G8 / Building Reg habitability)`,
            });
        } else if (rule.frontage === 'preferred') {
            soft.push({
                roomId: r.roomId, severity: 'soft', metric: 'frontagePreferred', delta: 0.4,
                reason: `room "${label}" (${r.type}) is fully interior; frontage is preferred (loses natural light + view)`,
            });
        }
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
