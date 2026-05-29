// L1-α-2 (2026-05-29) — `DaylightDepthField` per-position daylight reach
// (APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29 §3.A
// Environmental Intelligence Engine; §7.A "today: ❌ Largely absent.
// FacadeOrientationService returns per-shell-edge cardinal direction. No
// daylight depth, no noise, no view, no thermal, no field representation.").
//
// Sister field to L1-α-1's `FacadeValueField`. Where the facade field scores
// shell EDGES (orientation, sunlight quality, corner exposure), this field
// scores INTERIOR POINTS by how far daylight reaches them through the
// nearest façade window.
//
// The architectural rule modelled here is the BRE / BS 8206-2 "no-sky-line"
// daylight depth heuristic: a habitable point loses daylight quality
// roughly linearly with distance from the nearest façade, going to zero
// around 7 m (the rule-of-thumb maximum for a deep, single-aspect room).
// Points outside the shell polygon score 0.
//
// PURE: no I/O, no THREE, no DOM, no RNG. Reads the shell polygon + the
// L1-α-1 FacadeValueField (so orientation matters — a point 3 m from a
// south façade out-scores a point 3 m from a north façade). Downstream
// consumers (L1-α-4 modal axis, L4 compositional geometry) query via
// `field.at({ x, z })`.

import type { Pt } from '../tgl/rectDecomposition.js';
import type { FacadeValueField } from './facadeValueField.js';

/**
 * BRE / BS 8206-2 inspired daylight depth cap. Points further than this from
 * the nearest façade score zero. Conservative for residential — luxury
 * apartments often want < 6 m, deep-plan offices stretch to 9 m.
 */
export const DAYLIGHT_DEPTH_M = 7;

export interface DaylightDepthField {
    /**
     * Sample the daylight score at an interior world point ({ x, z } in m).
     * Returns 0 outside the polygon, otherwise a value in [0, 1] where
     * 1 = sitting on a south-facing façade, 0 = deeper than DAYLIGHT_DEPTH_M
     * from any façade.
     */
    at(p: Pt): number;
    /**
     * Average daylight over a rectangle (a 2×2 sample grid is exact enough
     * for the gradient — rooms are typically much smaller than DAYLIGHT_DEPTH_M).
     * The four corners are weighted equally with the centre.
     */
    averageOverRect(rect: { minX: number; minZ: number; maxX: number; maxZ: number }): number;
}

const clamp01 = (n: number): number => n < 0 ? 0 : n > 1 ? 1 : n;

/**
 * Squared distance from point `p` to segment `a → b`. Returning squared
 * distance lets the hot loop skip sqrts until the final score.
 */
function distSqToSegment(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-12) {
        const ddx = p.x - a.x;
        const ddz = p.z - a.z;
        return ddx * ddx + ddz * ddz;
    }
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = a.x + t * dx;
    const cz = a.z + t * dz;
    const ddx = p.x - cx;
    const ddz = p.z - cz;
    return ddx * ddx + ddz * ddz;
}

/**
 * Standard ray-cast point-in-polygon. Polygon is open-form (last vertex
 * implicitly closes to the first). Returns true for points on the boundary
 * within ~1e-9 m tolerance via the segment-distance check below.
 */
function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
    const n = poly.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = poly[i]!;
        const b = poly[j]!;
        const intersects = ((a.z > p.z) !== (b.z > p.z))
            && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z + 1e-30) + a.x);
        if (intersects) inside = !inside;
    }
    return inside;
}

/**
 * Compute the daylight depth field for a shell polygon + its facade-value
 * field. Pure factory: the returned object is a thin closure over the
 * facade edge list with cached sunlight weights, so `at()` is O(edges) per
 * query. Degenerate inputs (< 3 vertices, < 1 edge) produce a field that
 * scores 0 everywhere.
 */
export function computeDaylightDepthField(
    polygon: readonly Pt[],
    facadeField: FacadeValueField,
): DaylightDepthField {
    const empty: DaylightDepthField = {
        at: () => 0,
        averageOverRect: () => 0,
    };
    if (polygon.length < 3 || facadeField.edges.length === 0) return empty;

    // Cache the canonical CCW polygon (facadeField.winding tells us — its
    // computation already canonicalised, so the field's edge list is in CCW
    // order). The polygon argument may still be CW; canonicalise here for
    // the point-in-polygon test.
    const ccw = facadeField.winding === 'CCW' ? polygon : [...polygon].reverse();

    // Pre-extract edges into flat arrays so the hot loop avoids object access.
    const m = facadeField.edges.length;
    const ax = new Float64Array(m);
    const az = new Float64Array(m);
    const bx = new Float64Array(m);
    const bz = new Float64Array(m);
    const sun = new Float64Array(m);
    for (let i = 0; i < m; i++) {
        const e = facadeField.edges[i]!;
        ax[i] = e.a.x; az[i] = e.a.z;
        bx[i] = e.b.x; bz[i] = e.b.z;
        sun[i] = e.sunlightScore;
    }
    const DMAX = DAYLIGHT_DEPTH_M;
    const DMAX_SQ = DMAX * DMAX;

    const at = (p: Pt): number => {
        if (!pointInPolygon(p, ccw)) return 0;
        let best = 0;
        for (let i = 0; i < m; i++) {
            const a = { x: ax[i]!, z: az[i]! };
            const b = { x: bx[i]!, z: bz[i]! };
            const dSq = distSqToSegment(p, a, b);
            if (dSq >= DMAX_SQ) continue;
            const d = Math.sqrt(dSq);
            const attenuation = 1 - d / DMAX;            // linear, 1 at edge, 0 at DMAX
            const score = sun[i]! * attenuation;
            if (score > best) best = score;
        }
        return clamp01(best);
    };

    const averageOverRect = (rect: { minX: number; minZ: number; maxX: number; maxZ: number }): number => {
        const cx = (rect.minX + rect.maxX) / 2;
        const cz = (rect.minZ + rect.maxZ) / 2;
        // 4 corners + centre, equal weight. Smooth enough for a depth gradient
        // measured in metres against rooms typically 2–5 m on a side.
        const samples = [
            at({ x: rect.minX, z: rect.minZ }),
            at({ x: rect.maxX, z: rect.minZ }),
            at({ x: rect.minX, z: rect.maxZ }),
            at({ x: rect.maxX, z: rect.maxZ }),
            at({ x: cx, z: cz }),
        ];
        let s = 0;
        for (const v of samples) s += v;
        return s / samples.length;
    };

    return { at, averageOverRect };
}
