/**
 * DrawingConstants — Contract 23 §1.4 / §7.2
 *
 * Single source of truth for all drawing-engine constants and helper functions.
 * ALL drawing-engine modules import from here — never redeclare locally.
 *
 * Contract compliance:
 *   Contract 23 §1.4 — tolerance constants (EPSILON, SNAP_TOLERANCE, COLLINEAR_ANGLE)
 *   Contract 23 §7   — pen/pixel conversion (pxPerMm, SCREEN_DPI, EXPORT_DPI)
 *   Contract 23 §10  — cache key helpers (hashViewRange, hashMatrix4, classificationCacheKey)
 */

import * as THREE from '@pryzm/renderer-three/three';

// ─── Tolerance constants ────────────────────────────────────────────────────

/** Floating-point comparison epsilon. Used in geometric tests. */
export const EPSILON = 1e-6;

/**
 * Polygon stitching snap tolerance in metres (5 mm).
 * Segment endpoints within this distance are merged into one vertex.
 */
export const SNAP_TOLERANCE = 0.005;

/**
 * Dot-product threshold for declaring two edge directions collinear.
 * Edges with abs(dot) >= COLLINEAR_ANGLE are merged during simplification.
 */
export const COLLINEAR_ANGLE = 0.999;

// ─── DPI / pixel scale constants ────────────────────────────────────────────

/** Logical DPI used for screen Canvas2D rendering (CSS pixel space). */
export const SCREEN_DPI = 96;

/** Physical DPI target for raster (PNG) export. */
export const EXPORT_DPI = 300;

/** Millimetres per inch — ISO 31-1. */
export const MM_PER_INCH = 25.4;

/**
 * Convert millimetres to CSS pixels for the given DPI context.
 *
 * Usage:
 *   ctx.lineWidth = widthMm * pxPerMm(SCREEN_DPI);    // screen rendering
 *   ctx.lineWidth = widthMm * pxPerMm(EXPORT_DPI);    // PNG export
 *
 * For PDF vector export, use widthMm directly — no pixel conversion required.
 */
export function pxPerMm(dpi: number): number {
    return dpi / MM_PER_INCH;
}

// ─── Pre-computed screen constant (avoid recalculating per-frame) ─────────────

/**
 * CSS pixels per drawing millimetre at screen DPI.
 * Equivalent to pxPerMm(SCREEN_DPI).  Use this for all Canvas2D lineWidth
 * assignments during interactive screen rendering.
 */
export const SCREEN_PX_PER_MM: number = SCREEN_DPI / MM_PER_INCH; // ≈ 3.779

// ─── Classification cache key helpers ───────────────────────────────────────

/** ViewRangeSettings shape — duplicated here to avoid circular imports. */
export interface ViewRangeHashInput {
    topY:    number;
    cutY:    number;
    bottomY: number;
    depthY:  number;
}

/**
 * Deterministic hash string for a ViewRange.
 * Precision: 6 decimal places (sub-micrometre).
 */
export function hashViewRange(vr: ViewRangeHashInput): string {
    return `${vr.topY.toFixed(6)}:${vr.cutY.toFixed(6)}:${vr.bottomY.toFixed(6)}:${vr.depthY.toFixed(6)}`;
}

/**
 * Deterministic hash string for a THREE.Matrix4.
 * All 16 elements serialised to 6 decimal places.
 */
export function hashMatrix4(m: THREE.Matrix4): string {
    return m.elements.map(e => e.toFixed(6)).join(',');
}

/**
 * Full classification cache key combining element identity, view range state,
 * and world transform state.  Invalidate cache entry when any component changes.
 *
 * Contract 23 §3.4:
 *   cacheKey = elementId + "::" + hashViewRange(viewRange) + "::" + hashMatrix4(worldMatrix)
 */
export function classificationCacheKey(
    elementId:   string,
    viewRange:   ViewRangeHashInput,
    worldMatrix: THREE.Matrix4,
): string {
    return `${elementId}::${hashViewRange(viewRange)}::${hashMatrix4(worldMatrix)}`;
}

/**
 * Style resolver cache key combining element, view, and zone.
 *
 * Contract 23 §7.4:
 *   cacheKey = (elementId, viewId, zone)
 */
export function styleResolverCacheKey(
    elementId: string,
    viewId:    string,
    zone:      string,
): string {
    return `${elementId}::${viewId}::${zone}`;
}
