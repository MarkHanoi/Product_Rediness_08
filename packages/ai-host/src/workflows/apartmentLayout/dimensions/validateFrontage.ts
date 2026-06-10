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
import type { Pt } from '../tgl/rectDecomposition.js';

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

    for (const r of input.rooms) {
        const rule = roomRule(r.type);
        if (rule.frontage === 'none') continue;
        const touches = rectTouchesPerimeter(r.rect, input.shellPolygon);
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
