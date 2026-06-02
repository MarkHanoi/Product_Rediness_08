// A.7.d (Phase A · Sprint 2) — Pure polygon geometry helpers.
//
// L2-layer: zero I/O, no THREE, no DOM. Imports ONLY the `Pt` type
// from @pryzm/schemas — these helpers work in scene-XZ metres (the
// PRYZM-canonical 2D coordinate frame; per C12).
//
// All functions are PURE (no globals, no allocations beyond the
// returned value) — safe to call in tight inner loops.

import type { Pt } from '@pryzm/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Polygon area (shoelace formula).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the unsigned area of a closed polygon in square metres.
 * Returns 0 for degenerate polygons (< 3 vertices). Winding-invariant:
 * CCW and CW polygons give the same unsigned result.
 *
 * Per C12, scene-XZ is right-handed; the canonical CCW winding gives a
 * positive signed area. This function returns the absolute value —
 * use `polygonSignedArea` if you need winding orientation.
 */
export function polygonArea(polygon: ReadonlyArray<Pt>): number {
    return Math.abs(polygonSignedArea(polygon));
}

/**
 * Signed area of a closed polygon. Positive when CCW in scene-XZ;
 * negative when CW. Returns 0 for degenerate polygons.
 */
export function polygonSignedArea(polygon: ReadonlyArray<Pt>): number {
    const n = polygon.length;
    if (n < 3) return 0;
    let signed = 0;
    for (let i = 0; i < n; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % n]!;
        signed += a.x * b.z - b.x * a.z;
    }
    return signed / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Point in polygon (even-odd rule / ray casting).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test whether a 2D point is inside a closed polygon. Uses the
 * even-odd rule (ray-casting). Robust against horizontal edges via the
 * standard half-open test (`>=` vs `<`).
 *
 * Points exactly on the boundary are treated as INSIDE — useful for
 * containment checks where a vertex landing on a setback line should
 * pass rather than fail (the strict-interior test is also exported).
 */
export function pointInPolygon(p: Pt, polygon: ReadonlyArray<Pt>): boolean {
    const n = polygon.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const pi = polygon[i]!;
        const pj = polygon[j]!;
        const intersect =
            pi.z > p.z !== pj.z > p.z &&
            p.x < ((pj.x - pi.x) * (p.z - pi.z)) / (pj.z - pi.z) + pi.x;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Distance from a 2D point to a line segment. Used by the setback
 * compliance check (per-edge distance ≥ setback).
 */
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) {
        const ax = p.x - a.x;
        const az = p.z - a.z;
        return Math.sqrt(ax * ax + az * az);
    }
    const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2),
    );
    const cx = a.x + t * dx;
    const cz = a.z + t * dz;
    const ex = p.x - cx;
    const ez = p.z - cz;
    return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Distance from a 2D point to the nearest edge of a polygon. Returns
 * `+Infinity` for degenerate polygons (< 2 vertices).
 */
export function pointPolygonEdgeDistance(
    p: Pt,
    polygon: ReadonlyArray<Pt>,
): number {
    const n = polygon.length;
    if (n < 2) return Number.POSITIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % n]!;
        const d = pointSegmentDistance(p, a, b);
        if (d < min) min = d;
    }
    return min;
}

// ─────────────────────────────────────────────────────────────────────────────
// Containment check — every vertex of `inner` lies inside `outer`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strict containment: every vertex of `inner` MUST lie inside `outer`
 * (per the even-odd test in `pointInPolygon`). Returns `true` only if
 * all vertices pass. Empty inner polygons trivially pass; empty outer
 * polygons trivially fail.
 */
export function polygonContains(
    outer: ReadonlyArray<Pt>,
    inner: ReadonlyArray<Pt>,
): boolean {
    if (outer.length < 3) return false;
    if (inner.length === 0) return true;
    for (const v of inner) {
        if (!pointInPolygon(v, outer)) return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical polygon fingerprint (per C19 §1.4 polygon-immutability).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical string fingerprint of a polygon. Used by C19 §1.4 +
 * §2.7 invariant 4 (polygon-immutability hash) — set at `site.create`
 * and verified on every subsequent read; mismatch throws.
 *
 * Format: `<x>,<z>|<x>,<z>|...` — vertex coordinates rendered with
 * `Number.prototype.toString()` (full IEEE-754 precision; lossless).
 * Order-sensitive: a rotated polygon has a different fingerprint
 * (matches the C19 immutability semantics — you cannot legally reorder
 * a parcel polygon either).
 *
 * Returns the empty string for an empty polygon.
 */
export function polygonFingerprint(polygon: ReadonlyArray<Pt>): string {
    if (polygon.length === 0) return '';
    const parts: string[] = new Array(polygon.length);
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i]!;
        parts[i] = `${p.x},${p.z}`;
    }
    return parts.join('|');
}
