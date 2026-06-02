// A.1 (Phase A · Sprint 1) — Stage 2 helpers: siteContext.
//
// Stage 2 derives orientation, gross site area, and the bbox of the
// parcel boundary from the C19 SiteContextSnapshot.  Every pack uses
// these helpers; per-typology stages add typology-specific derivations
// (eg apartment pack derives "is courtyard buildable" — needs site
// width / depth ratio).

import type { SiteContextSnapshot } from '../types.js';

/**
 * Compute the polygon's signed area in square metres (shoelace formula).
 * Positive when the boundary is CCW in scene-XZ; negative if CW.  The
 * absolute value is the gross site area.
 *
 * NOTE: scene-XZ is RIGHT-HANDED in PRYZM (per C12), so the canonical
 * CCW winding gives a POSITIVE result.  We return the unsigned area —
 * winding-direction analysis is a separate helper.
 */
export function computeParcelArea(snapshot: SiteContextSnapshot): number {
    const poly = snapshot.parcelBoundary;
    if (poly.length < 3) return 0;
    let signed = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        signed += a.x * b.z - b.x * a.z;
    }
    return Math.abs(signed) / 2;
}

/**
 * Compute the axis-aligned bounding box of the parcel polygon.  Returns
 * `null` for an empty polygon (not-yet-authored boundary).
 */
export function computeParcelBbox(
    snapshot: SiteContextSnapshot,
): { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number } | null {
    const poly = snapshot.parcelBoundary;
    if (poly.length === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, minZ, maxX, maxZ };
}
