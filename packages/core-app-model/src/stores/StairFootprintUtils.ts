// ─── Stair Footprint Utilities ───────────────────────────────────────────────
// Pure-data helpers (no THREE.js, no scene access) that compute the plan-view
// footprint of a stair from its semantic CreateStairInput. Used by
// CreateStairCommand to automatically punch an opening on the slab above so
// the stair has clear vertical headroom.
//
// Contract compliance:
// - §03-BIM-SEMANTIC-MODEL §1.1 — pure Vec3 math, no THREE imports.
// - §02-SPATIAL-PROJECTION — works in world XZ; Y is ignored (slab opening
//   is a 2D profile in the slab's local XY = world XZ frame).

import type { Vec3 } from './StairTypes';

export interface StairFootprintInput {
    shape: 'I' | 'L' | 'U' | 'spiral' | 'winder';
    width: number;
    treadDepth: number;
    startPosition: Vec3;
    flights: { direction: Vec3; riserCount: number; startOverride?: Vec3; treadDepth?: number }[];
    landings?: { depth: number }[];
}

interface XZ { x: number; z: number; }

/**
 * Compute the 4 corners of an oriented rectangle (aligned with the first
 * flight's direction) that tightly contains the entire stair footprint —
 * all flights AND all landings. Corners are returned in CCW order in world XZ.
 *
 * Returns null if the input is degenerate (no flights or zero-length dir1).
 *
 * Used by CreateStairCommand to compute an automatic opening on the slab
 * above the stair. The rectangle is intentionally axis-aligned to the stair
 * (not to the world axes) so it stays tight on rotated stairs.
 */
export function computeStairFootprintRect(
    input: StairFootprintInput
): XZ[] | null {
    if (!input.flights.length) return null;

    const dir1 = input.flights[0].direction;
    const dirLen = Math.hypot(dir1.x, dir1.z);
    if (dirLen < 1e-6) return null;

    // Stair-local frame: u = forward (dir1), v = perpendicular (left)
    const u: XZ = { x: dir1.x / dirLen, z: dir1.z / dirLen };
    const v: XZ = { x: -u.z, z: u.x };

    const origin = input.startPosition;
    const halfW = input.width / 2;

    // Project a world point into stair-local (u, v) coordinates relative to origin.
    const toLocal = (p: XZ): { u: number; v: number } => {
        const dx = p.x - origin.x;
        const dz = p.z - origin.z;
        return {
            u: dx * u.x + dz * u.z,
            v: dx * v.x + dz * v.z,
        };
    };

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    const accumulate = (p: XZ) => {
        const lp = toLocal(p);
        if (lp.u < minU) minU = lp.u;
        if (lp.u > maxU) maxU = lp.u;
        if (lp.v < minV) minV = lp.v;
        if (lp.v > maxV) maxV = lp.v;
    };

    // Add the 4 corners of an oriented rectangle defined by start, direction
    // (unit), length and half-width perpendicular.
    const addFlightRect = (start: XZ, dirN: XZ, length: number) => {
        const perpN: XZ = { x: -dirN.z, z: dirN.x };
        const end: XZ = {
            x: start.x + dirN.x * length,
            z: start.z + dirN.z * length,
        };
        const hw: XZ = { x: perpN.x * halfW, z: perpN.z * halfW };
        accumulate({ x: start.x - hw.x, z: start.z - hw.z });
        accumulate({ x: start.x + hw.x, z: start.z + hw.z });
        accumulate({ x: end.x - hw.x, z: end.z - hw.z });
        accumulate({ x: end.x + hw.x, z: end.z + hw.z });
        return end;
    };

    // Walk the flights, deriving each flight's start from either its
    // startOverride or the previous flight's end (+ landing offset along the
    // previous direction for L-shape; U-shape provides startOverride directly).
    let cursor: XZ = { x: origin.x, z: origin.z };
    let prevDir: XZ = u;

    for (let i = 0; i < input.flights.length; i++) {
        const f = input.flights[i];
        const dLen = Math.hypot(f.direction.x, f.direction.z);
        if (dLen < 1e-6) continue;
        const dN: XZ = { x: f.direction.x / dLen, z: f.direction.z / dLen };

        let start: XZ;
        if (f.startOverride) {
            start = { x: f.startOverride.x, z: f.startOverride.z };
        } else if (i === 0) {
            start = { x: origin.x, z: origin.z };
        } else {
            // L-shape path: previous flight ended at `cursor`; the landing
            // sits between the two runs and has depth = landing.depth along
            // the *previous* direction. The next flight starts at the far
            // edge of the landing.
            const landing = input.landings?.[i - 1];
            const landingDepth = landing?.depth ?? input.width;
            start = {
                x: cursor.x + prevDir.x * landingDepth,
                z: cursor.z + prevDir.z * landingDepth,
            };
        }

        // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — honour per-flight tread depth
        // so the footprint matches the per-flight geometry built by the mesh
        // builder (each flight's length equals its drawn polyline segment).
        const flightTread = f.treadDepth ?? input.treadDepth;
        const length = f.riserCount * flightTread;
        const end = addFlightRect(start, dN, length);

        // Add the landing rectangle that follows this flight (if any).
        // Landing extends forward along the *current* flight direction by
        // landing.depth, and across the stair width perpendicular. For U-shape
        // the landing spans both parallel runs (depth = 2×width); however
        // flight 2's startOverride already places its rectangle on the far
        // side, so the outer min/max naturally absorbs the full extent.
        if (i < input.flights.length - 1) {
            const landing = input.landings?.[i];
            if (landing) {
                const halfLW = input.width / 2;
                const perpN: XZ = { x: -dN.z, z: dN.x };
                const lEnd: XZ = {
                    x: end.x + dN.x * landing.depth,
                    z: end.z + dN.z * landing.depth,
                };
                accumulate({ x: end.x - perpN.x * halfLW, z: end.z - perpN.z * halfLW });
                accumulate({ x: end.x + perpN.x * halfLW, z: end.z + perpN.z * halfLW });
                accumulate({ x: lEnd.x - perpN.x * halfLW, z: lEnd.z - perpN.z * halfLW });
                accumulate({ x: lEnd.x + perpN.x * halfLW, z: lEnd.z + perpN.z * halfLW });
            }
        }

        cursor = end;
        prevDir = dN;
    }

    if (!isFinite(minU) || !isFinite(minV)) return null;

    // Expand back to world space — 4 CCW corners of the oriented rectangle.
    const corner = (lu: number, lv: number): XZ => ({
        x: origin.x + u.x * lu + v.x * lv,
        z: origin.z + u.z * lu + v.z * lv,
    });

    return [
        corner(minU, minV),
        corner(maxU, minV),
        corner(maxU, maxV),
        corner(minU, maxV),
    ];
}

/**
 * Convert a world-space XZ point to slab-local 2D (x, y) coordinates.
 * Mirrors the convention used by OpeningTool.complete():
 *   localX = worldX - slab.position.x
 *   localY = worldZ - slab.position.z
 */
export function worldXZToSlabLocal(
    point: XZ,
    slabPosition: { x: number; z: number }
): { x: number; y: number } {
    return {
        x: point.x - slabPosition.x,
        y: point.z - slabPosition.z,
    };
}
