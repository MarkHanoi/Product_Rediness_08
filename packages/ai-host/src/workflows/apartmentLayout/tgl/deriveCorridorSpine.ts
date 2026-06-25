// §SPINE-FIRST P1 (ADR-0073 HAG, founder "must work for ANY layout", 2026-06-21) — derive the
// corridor SPINE from the FOOTPRINT, before any room packing. This is the inversion the
// GENERATIVE-ROBUSTNESS-STEPBACK audit calls for: circulation is a DRIVER (derived first from the
// shell's long axis + anchored to the stair/entry), not a side effect of area packing.
//
// PURE + deterministic (ADR-0061): NO geometry/THREE/DOM, NO RNG, NO Date.now. Metres, world XZ.
// The output is a set of centre-line SEGMENTS (+ a width) — straight for a rectangle, an L/T when a
// leg must reach an edge stair. P2 (`packRoomsAlongSpine`) consumes this to band rooms off the spine.
//
// The deriver is intentionally shape-general: the long-axis chord is computed by intersecting a line
// through the shell's cross-centre with the (convex) shell polygon, so it adapts to skewed quads and
// non-axis-aligned plates — exactly the layouts the area-first packer fails on.

import type { Pt, Rect } from './rectDecomposition.js';

/** One centre-line segment of the spine (metres, world XZ). */
export interface SpineSegment { readonly a: Pt; readonly b: Pt }

/** A derived corridor spine: ordered centre-line segments + the corridor width. */
export interface SpinePath {
    /** ≥1 segment. segments[0] is the primary long-axis run; later segments are legs (to the stair). */
    readonly segments: readonly SpineSegment[];
    readonly widthM: number;
    /** 'x' ⇒ the primary run is horizontal (long axis = x); 'z' ⇒ vertical. */
    readonly primaryAxis: 'x' | 'z';
}

export interface DeriveSpineOptions {
    /** Corridor width (m). Default 1.2 (the walkable minimum the carve uses). */
    readonly widthM?: number;
    /** Inset (m) of the primary run from the shell wall at each end. Default 0.3. */
    readonly endMarginM?: number;
    /** Stair keep-out rect; when the primary run doesn't reach it, a perpendicular leg is added. */
    readonly stairKeepOut?: Rect;
    /** Front-door / entry anchor (perimeter). Used to orient the primary run toward the entry end. */
    readonly entry?: Pt;
}

const EPS = 1e-6;
const DOOR_W = 0.8;

const bboxOf = (poly: readonly Pt[]): Rect => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
};

/** x-range where the horizontal line z=zc crosses the polygon boundary (min,max), or null. */
function horizontalChord(poly: readonly Pt[], zc: number): readonly [number, number] | null {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const zlo = Math.min(a.z, b.z), zhi = Math.max(a.z, b.z);
        if (zc < zlo - EPS || zc > zhi + EPS) continue;
        if (Math.abs(b.z - a.z) < EPS) { xs.push(a.x, b.x); continue; }   // edge lies on the line
        const t = (zc - a.z) / (b.z - a.z);
        xs.push(a.x + t * (b.x - a.x));
    }
    if (xs.length < 2) return null;
    return [Math.min(...xs), Math.max(...xs)];
}

/** z-range where the vertical line x=xc crosses the polygon boundary (min,max), or null. */
function verticalChord(poly: readonly Pt[], xc: number): readonly [number, number] | null {
    const zs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const xlo = Math.min(a.x, b.x), xhi = Math.max(a.x, b.x);
        if (xc < xlo - EPS || xc > xhi + EPS) continue;
        if (Math.abs(b.x - a.x) < EPS) { zs.push(a.z, b.z); continue; }
        const t = (xc - a.x) / (b.x - a.x);
        zs.push(a.z + t * (b.z - a.z));
    }
    if (zs.length < 2) return null;
    return [Math.min(...zs), Math.max(...zs)];
}

/**
 * Derive the corridor spine for a (convex) shell polygon. The primary run lies along the shell's
 * LONG axis, centred on the short axis; a perpendicular leg is added to reach an edge stair keep-out
 * when the primary run doesn't already pass within a door-width of it. Pure + deterministic.
 *
 * Returns null only for a degenerate shell (no chord through the centre) — callers fall back to the
 * legacy carve.
 */
export function deriveCorridorSpine(
    shell: readonly Pt[],
    opts: DeriveSpineOptions = {},
): SpinePath | null {
    if (shell.length < 3) return null;
    const widthM = opts.widthM ?? 1.2;
    const margin = opts.endMarginM ?? 0.3;
    const bb = bboxOf(shell);
    const w = bb.x1 - bb.x0, d = bb.z1 - bb.z0;
    if (w < EPS || d < EPS) return null;

    // Long axis = the longer bbox dimension. Primary run is centred on the SHORT axis.
    const primaryAxis: 'x' | 'z' = w >= d ? 'x' : 'z';
    const segments: SpineSegment[] = [];

    if (primaryAxis === 'x') {
        const zc = (bb.z0 + bb.z1) / 2;
        const chord = horizontalChord(shell, zc);
        if (!chord) return null;
        let [xL, xR] = chord;
        xL += margin; xR -= margin;
        if (xR - xL < EPS) return null;
        segments.push({ a: { x: xL, z: zc }, b: { x: xR, z: zc } });
        addStairLegX(segments, shell, zc, xL, xR, widthM, opts.stairKeepOut);
    } else {
        const xc = (bb.x0 + bb.x1) / 2;
        const chord = verticalChord(shell, xc);
        if (!chord) return null;
        let [zL, zR] = chord;
        zL += margin; zR -= margin;
        if (zR - zL < EPS) return null;
        segments.push({ a: { x: xc, z: zL }, b: { x: xc, z: zR } });
        addStairLegZ(segments, shell, xc, zL, zR, widthM, opts.stairKeepOut);
    }

    return { segments, widthM, primaryAxis };
}

/** Add a vertical leg from the horizontal primary run to an edge stair, when not already reached. */
function addStairLegX(
    segments: SpineSegment[], _shell: readonly Pt[], zc: number, xL: number, xR: number,
    widthM: number, stair?: Rect,
): void {
    if (!stair) return;
    const half = widthM / 2;
    // Already reached? The run's strip [zc±half] overlaps the stair AND the stair's x-range overlaps [xL,xR].
    const stripOverlapsStairZ = zc + half >= stair.z0 - DOOR_W && zc - half <= stair.z1 + DOOR_W;
    const xOverlap = Math.min(xR, stair.x1) - Math.max(xL, stair.x0) > DOOR_W;
    if (stripOverlapsStairZ && xOverlap) return;
    // Joint on the run beneath/above the stair; clamp into both the run span and the stair x-range.
    const jointX = Math.min(Math.max((stair.x0 + stair.x1) / 2, xL), xR);
    const stairCz = (stair.z0 + stair.z1) / 2;
    const targetZ = stairCz > zc ? stair.z0 : stair.z1;             // near edge of the stair facing the run
    if (Math.abs(targetZ - zc) < EPS) return;
    segments.push({ a: { x: jointX, z: zc }, b: { x: jointX, z: targetZ } });
}

/** Add a horizontal leg from the vertical primary run to an edge stair, when not already reached. */
function addStairLegZ(
    segments: SpineSegment[], _shell: readonly Pt[], xc: number, zL: number, zR: number,
    widthM: number, stair?: Rect,
): void {
    if (!stair) return;
    const half = widthM / 2;
    const stripOverlapsStairX = xc + half >= stair.x0 - DOOR_W && xc - half <= stair.x1 + DOOR_W;
    const zOverlap = Math.min(zR, stair.z1) - Math.max(zL, stair.z0) > DOOR_W;
    if (stripOverlapsStairX && zOverlap) return;
    const jointZ = Math.min(Math.max((stair.z0 + stair.z1) / 2, zL), zR);
    const stairCx = (stair.x0 + stair.x1) / 2;
    const targetX = stairCx > xc ? stair.x0 : stair.x1;
    if (Math.abs(targetX - xc) < EPS) return;
    segments.push({ a: { x: xc, z: jointZ }, b: { x: targetX, z: jointZ } });
}

/** Total centre-line length of the spine (m). Pure helper for tests/scoring. */
export function spineLengthM(spine: SpinePath): number {
    let len = 0;
    for (const s of spine.segments) len += Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    return len;
}
