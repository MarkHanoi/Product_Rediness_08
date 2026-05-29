// L1-α-1 — `FacadeValueField` per-edge shell scoring
// (APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29 §3.A
// Environmental Intelligence Engine; §7.A "today: ❌ Largely absent.
// FacadeOrientationService returns per-shell-edge cardinal direction. No
// daylight depth, no noise, no view, no thermal, no field representation.").
//
// PURE per-edge scoring. The cognition-stack target is six continuous fields
// (daylightField / privacyField / noiseField / thermalDesirabilityField /
// viewQualityField / ventilationField). This first slice ships the three
// scores that derive ENTIRELY FROM SHELL GEOMETRY — no external BIM metadata
// needed:
//   • orientation (cardinal/intercardinal direction)
//   • sunlightScore (orientation-driven; south best, north worst)
//   • cornerExposureScore (edges adjacent to a corner score higher — dual-aspect)
//   • overallValue (weighted aggregate, in [0, 1])
//
// noise / view / ventilation / thermal are queued for a follow-up slice that
// integrates with the BIM scene to read context (neighbouring buildings, road
// classification, etc.).
//
// Wire-in (L1-α-3 "plumb the FacadeValueField into bubbleGraph.scaleProgramToShell")
// is a SEPARATE later commit. This file is pure data + computation only.

import type { Pt } from '../tgl/rectDecomposition.js';

/**
 * 8-direction cardinal compass with intercardinals. North = +Z by convention
 * (world plan frame); +X = East, +Z = North (matches the existing
 * FacadeOrientationService convention in `packages/spatial-index/`).
 */
export type Cardinal = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * Per-edge value record. One per shell perimeter edge, in polygon order.
 */
export interface FacadeEdgeValue {
    /** Index of the edge in the shell polygon: edge i goes from polygon[i] to polygon[(i+1) % n]. */
    readonly edgeIndex: number;
    /** Start + end points of the edge (world {x, z}). */
    readonly a: Pt;
    readonly b: Pt;
    /** Edge length in metres. */
    readonly length: number;
    /** Cardinal direction of the OUTWARD-facing normal (away from interior centroid). */
    readonly orientation: Cardinal;
    /** Sunlight score — south-facing best, north-facing worst. ∈ [0, 1]. */
    readonly sunlightScore: number;
    /**
     * Corner-exposure score — edges adjacent to a non-shallow exterior corner
     * score higher (dual-aspect potential). ∈ [0, 1]. Computed as
     * `1 − cos(turn)` where `turn` is the absolute exterior turn angle at the
     * shared corner with the longer of the two neighbouring edges. A straight
     * extension (turn → 0) scores 0; a right-angle corner (turn = π/2) scores
     * 1. Capped at 1.
     */
    readonly cornerExposureScore: number;
    /** Weighted aggregate. ∈ [0, 1]. */
    readonly overallValue: number;
}

export interface FacadeValueField {
    readonly edges: readonly FacadeEdgeValue[];
    /**
     * Polygon winding consumed (after canonicalisation). CCW is the engine's
     * convention — the outward normal of edge `a → b` is `(b - a)` rotated by
     * -90 °. Exposed so the caller can verify their polygon matches.
     */
    readonly winding: 'CCW' | 'CW';
}

const TWO_PI = Math.PI * 2;
const clamp01 = (n: number): number => n < 0 ? 0 : n > 1 ? 1 : n;

/**
 * Convert a planar normal vector (in {x, z} where +z = North) to a cardinal
 * compass direction. Bisector boundaries are at ±22.5 ° from each axis so
 * the 8 sectors are 45 ° wide each.
 */
function normalToCardinal(nx: number, nz: number): Cardinal {
    // atan2 with z first because +z = N (0°), +x = E (90°), -z = S (180°), -x = W (270°).
    let theta = Math.atan2(nx, nz);             // [-π, π]
    if (theta < 0) theta += TWO_PI;             // [0, 2π)
    const slice = Math.round((theta / TWO_PI) * 8) % 8;
    const compass: readonly Cardinal[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return compass[slice]!;
}

/**
 * Sunlight score per cardinal direction. Hard-coded UK / mid-latitude default:
 *   S (best) > SE / SW > E / W > NE / NW > N (worst).
 *
 * Future enhancement (queued with L1-α-2 daylight depth field): scale by
 * latitude + seasonal sun-path.
 */
const SUNLIGHT_BY_CARDINAL: Readonly<Record<Cardinal, number>> = {
    S:  1.00,
    SE: 0.85, SW: 0.85,
    E:  0.65, W:  0.55,    // east morning vs west afternoon — slight asymmetry
    NE: 0.40, NW: 0.35,
    N:  0.25,
};

/** Shoelace signed area — positive ⇒ CCW. */
function signedArea(poly: readonly Pt[]): number {
    let s = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % n]!;
        s += a.x * b.z - b.x * a.z;
    }
    return s / 2;
}

/**
 * Compute the FacadeValueField for a shell polygon. Pure: no I/O, no THREE,
 * no DOM, no RNG. Caller MUST pass a CLOSED polygon (≥ 3 distinct vertices);
 * winding is canonicalised to CCW internally before scoring.
 *
 * Degenerate polygons (< 3 vertices OR zero area) return an empty field.
 */
export function computeFacadeValueField(polygon: readonly Pt[]): FacadeValueField {
    if (polygon.length < 3) {
        return { edges: [], winding: 'CCW' };
    }
    const sa = signedArea(polygon);
    if (Math.abs(sa) < 1e-9) {
        return { edges: [], winding: 'CCW' };
    }
    // Canonicalise to CCW.
    const ccw = sa > 0 ? polygon : [...polygon].reverse();
    const n = ccw.length;

    // First pass: per-edge length + outward-normal-driven orientation + sunlight.
    interface Scratch { a: Pt; b: Pt; length: number; orientation: Cardinal; sunlightScore: number; turn: number }
    const scratch: Scratch[] = [];
    for (let i = 0; i < n; i++) {
        const a = ccw[i]!;
        const b = ccw[(i + 1) % n]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-9) continue;
        // CCW polygon outward normal = (dz, -dx) / len.
        const ox = dz / len;
        const oz = -dx / len;
        const orientation = normalToCardinal(ox, oz);
        scratch.push({
            a, b, length: len, orientation,
            sunlightScore: SUNLIGHT_BY_CARDINAL[orientation],
            turn: 0,                                                    // filled below
        });
    }

    // Second pass: corner-exposure. The turn at corner `i` is the absolute
    // exterior angle between edge `i-1` and edge `i`. We attribute that turn
    // to BOTH adjacent edges; an edge's cornerExposureScore is the MAX of its
    // two end-turns (so a single sharp corner gives a strong score to both
    // adjacent edges).
    const m = scratch.length;
    if (m === 0) return { edges: [], winding: 'CCW' };
    const turns: number[] = new Array(m).fill(0);
    for (let i = 0; i < m; i++) {
        const prev = scratch[(i - 1 + m) % m]!;
        const curr = scratch[i]!;
        // Direction of edge as unit vectors.
        const pdx = (prev.b.x - prev.a.x) / prev.length;
        const pdz = (prev.b.z - prev.a.z) / prev.length;
        const cdx = (curr.b.x - curr.a.x) / curr.length;
        const cdz = (curr.b.z - curr.a.z) / curr.length;
        // dot ∈ [-1, 1]. Straight extension ⇒ dot = 1. Right angle ⇒ 0. Reverse ⇒ -1.
        const dot = pdx * cdx + pdz * cdz;
        // turn ∈ [0, π]; map to a score `(1 − dot) / 2` so straight = 0, right
        // angle = 0.5, reverse = 1.
        turns[i] = clamp01((1 - dot) / 2);
    }

    // Third pass: assemble edge records with corner-exposure (max of two end-turns).
    const edges: FacadeEdgeValue[] = [];
    for (let i = 0; i < m; i++) {
        const s = scratch[i]!;
        const startTurn = turns[i]!;
        const endTurn = turns[(i + 1) % m]!;
        const cornerExposureScore = Math.max(startTurn, endTurn);
        // Aggregate: 60 % sunlight + 40 % corner exposure. Weights chosen so a
        // south-facing corner edge tops out near 1 and a north-facing straight
        // edge bottoms out near 0.1.
        const overallValue = clamp01(0.6 * s.sunlightScore + 0.4 * cornerExposureScore);
        edges.push({
            edgeIndex: i,
            a: s.a, b: s.b, length: s.length,
            orientation: s.orientation,
            sunlightScore: s.sunlightScore,
            cornerExposureScore,
            overallValue,
        });
    }

    return { edges, winding: 'CCW' };
}
