// §MULTI-PART-EXPLICIT-AREA — RING VALIDATION: name a geometry's defect, never repair it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — a silent repair is a wrong answer with no error raised
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Teaching the `explicit-area` primitive to accept MULTI-PART published footprints (a byggefelt
// with N separate building fields, a Madrid fondo published as several polygons) means it now
// ingests a lot more third-party geometry, and third-party geometry is sometimes broken. The
// tempting move at that point is to "clean" it — snap a nearly-closed ring shut, drop a
// zero-length spur, run a buffer(0) to un-self-intersect.
//
// ⚠ DO NOT. That is the L-616 shape: a repaired ring produces a plausible number with NO error
// raised anywhere, and a plausible-but-wrong buildable area is strictly worse than a refusal,
// because a refusal is visible and a wrong footprint is not. So this module DETECTS and NAMES a
// defect; it never returns a fixed ring. The caller's only options are "use it" or "refuse with
// this reason", which is exactly the choice C58 §1.4 wants it to have.
//
// ⚠ THE ONE NORMALISATION THAT IS NOT A REPAIR. `normaliseRing` drops CONSECUTIVE duplicate
// vertices and the closing duplicate. That is a change of ENCODING, not of shape: GeoJSON rings
// are closed (first == last) while PRYZM `Pt[]` rings are open, and the two describe the identical
// polygon. Every other defect is reported, never fixed — and `validateRing` is deliberately run on
// the RAW ring so `unclosed` is still detectable before that encoding change is applied.
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no RNG, no clock. Deterministic (C58 §1.1).
// Jurisdiction-agnostic (C58 §1.5): plain rings, zero knowledge of any city.

import { trace } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning.geometry');

/**
 * Cross-product magnitude below which two segments are treated as collinear, in m² AFTER the ring
 * has been translated to its own centroid.
 *
 * ⚠ THE CENTROID SHIFT IS LOAD-BEARING, not tidiness. EPSG:25832 northings are ~6.2e6, so a raw
 * cross product of two 1 m segments there is ~1e13 and floating-point noise alone is ~1e-3 — an
 * absolute epsilon chosen for scene-XZ coordinates would classify genuinely distinct points as
 * collinear (or the reverse) purely because of where in Denmark the parcel is. Shifting to the
 * centroid puts every coordinate in the ±(ring size) range, where 1e-7 m² is unambiguously zero.
 */
const CROSS_EPS_M2 = 1e-7;

/** Two vertices closer than this (metres) are the same vertex. Matches the other clippers. */
const COINCIDENT_EPS_M = 1e-6;

/**
 * A named geometric defect. A CLOSED vocabulary, because these have different meanings for the
 * publisher: `unclosed` and `self-intersecting` say the SOURCE data is malformed and should be
 * reported upstream, while `too-few-vertices` / `zero-area` usually say a real feature degenerated
 * in projection. Collapsing them into one "bad geometry" string would lose that routing.
 */
export type RingDefect =
    /** Fewer than 3 DISTINCT vertices — not a polygon at all. */
    | 'too-few-vertices'
    /** A coordinate is NaN / Infinity — almost always a failed parse or a failed projection. */
    | 'non-finite-coordinate'
    /**
     * The ring's first and last vertex differ, in a context whose contract says rings are CLOSED
     * (GeoJSON). Reported rather than closed for the caller: a ring that should be closed and is
     * not may be TRUNCATED, and silently joining the last vertex to the first would invent an edge
     * the publisher never drew.
     */
    | 'unclosed'
    /** |signed area| is ~0 — a sliver or an all-collinear ring. Cannot bound a buildable area. */
    | 'zero-area'
    /**
     * Two non-adjacent edges touch or cross. A self-intersecting ring has no well-defined interior,
     * so every downstream area/clip answer would be arbitrary. ⚠ NEVER "fixed" by a buffer(0):
     * that silently picks one of several possible interiors and reports success.
     */
    | 'self-intersecting';

export interface RingValidationOptions {
    /**
     * Demand `first == last` (the GeoJSON linear-ring contract). Set TRUE when validating raw
     * source geometry straight off a WFS; leave FALSE for PRYZM-internal open `Pt[]` rings.
     */
    readonly requireClosed?: boolean;
}

/** Drop consecutive duplicate vertices and the closing duplicate. An ENCODING change, not a repair. */
export function normaliseRing(ring: ReadonlyArray<Pt>): Pt[] {
    const out: Pt[] = [];
    for (const p of ring) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > COINCIDENT_EPS_M) {
            out.push({ x: p.x, z: p.z });
        }
    }
    while (out.length > 1) {
        const first = out[0]!;
        const last = out[out.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) <= COINCIDENT_EPS_M) out.pop();
        else break;
    }
    return out;
}

/** Shoelace signed area of an OPEN ring (positive = CCW in the x/z convention). */
function signedArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

function orient(a: Pt, b: Pt, c: Pt): number {
    const v = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(v) < CROSS_EPS_M2) return 0;
    return v > 0 ? 1 : -1;
}

/** Is collinear point `p` inside the axis-aligned box of segment a→b? */
function onSegment(a: Pt, b: Pt, p: Pt): boolean {
    return (
        p.x <= Math.max(a.x, b.x) + COINCIDENT_EPS_M &&
        p.x >= Math.min(a.x, b.x) - COINCIDENT_EPS_M &&
        p.z <= Math.max(a.z, b.z) + COINCIDENT_EPS_M &&
        p.z >= Math.min(a.z, b.z) - COINCIDENT_EPS_M
    );
}

/** Do segments p1→p2 and p3→p4 intersect AT ALL (crossing or merely touching)? */
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const o1 = orient(p1, p2, p3);
    const o2 = orient(p1, p2, p4);
    const o3 = orient(p3, p4, p1);
    const o4 = orient(p3, p4, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p2, p3)) return true;
    if (o2 === 0 && onSegment(p1, p2, p4)) return true;
    if (o3 === 0 && onSegment(p3, p4, p1)) return true;
    if (o4 === 0 && onSegment(p3, p4, p2)) return true;
    return false;
}

/**
 * Report the FIRST defect in `ring`, or `null` when it is a usable simple polygon.
 *
 * ⚠ Returns a defect — NEVER a repaired ring. See the module header for why.
 *
 * Order of checks is meaningful: coordinate sanity, then the encoding contract, then the topology.
 * A ring full of NaN would "fail" the self-intersection test in an arbitrary way, so the cheap,
 * unambiguous defects are named first and the expensive O(n²) topology test runs last.
 *
 * ⚠ ONE KNOWN OVERLAP, RECORDED SO NOBODY RE-DISCOVERS IT: an exactly-balanced bow-tie (whose two
 * lobes have equal and opposite signed area) is BOTH zero-area and self-intersecting, and is
 * reported `zero-area` because that check runs first. Keeping `zero-area` first is deliberate — it
 * is what names an all-collinear sliver correctly, and a collinear ring with ≥ 4 vertices would
 * otherwise be reported as "self-intersecting", which would send a publisher chasing the wrong
 * defect. Either way the ring is unusable and every caller refuses, so the ORDER changes the label,
 * never the outcome.
 *
 * P8 — emits `pryzm.zoning.geometry.validateRing`.
 */
export function validateRing(
    ring: ReadonlyArray<Pt>,
    options: RingValidationOptions = {},
): RingDefect | null {
    const span = tracer.startSpan('pryzm.zoning.geometry.validateRing');
    try {
        if (!Array.isArray(ring) || ring.length === 0) {
            span.setAttribute('defect', 'too-few-vertices');
            return 'too-few-vertices';
        }
        for (const p of ring) {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) {
                span.setAttribute('defect', 'non-finite-coordinate');
                return 'non-finite-coordinate';
            }
        }
        if (options.requireClosed === true) {
            const first = ring[0]!;
            const last = ring[ring.length - 1]!;
            if (ring.length < 4 || Math.hypot(first.x - last.x, first.z - last.z) > COINCIDENT_EPS_M) {
                span.setAttribute('defect', 'unclosed');
                return 'unclosed';
            }
        }

        const open = normaliseRing(ring);
        if (open.length < 3) {
            span.setAttribute('defect', 'too-few-vertices');
            return 'too-few-vertices';
        }

        // Translate to the centroid so the epsilon means the same thing in EPSG:25832 and scene-XZ.
        let cx = 0;
        let cz = 0;
        for (const p of open) {
            cx += p.x;
            cz += p.z;
        }
        cx /= open.length;
        cz /= open.length;
        const local = open.map((p) => ({ x: p.x - cx, z: p.z - cz }));

        if (Math.abs(signedArea(local)) <= CROSS_EPS_M2) {
            span.setAttribute('defect', 'zero-area');
            return 'zero-area';
        }

        // Non-adjacent edge pairs must not touch. Adjacent pairs legitimately share one endpoint,
        // and edge 0 / edge n-1 do too, so both are excluded by the index guard below.
        const n = local.length;
        for (let i = 0; i < n; i += 1) {
            const a1 = local[i]!;
            const a2 = local[(i + 1) % n]!;
            for (let j = i + 1; j < n; j += 1) {
                if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
                const b1 = local[j]!;
                const b2 = local[(j + 1) % n]!;
                if (segmentsIntersect(a1, a2, b1, b2)) {
                    span.setAttribute('defect', 'self-intersecting');
                    return 'self-intersecting';
                }
            }
        }

        span.setAttribute('defect', 'none');
        return null;
    } finally {
        span.end();
    }
}

/** One-line English for a defect, for a refusal `detail` a human will read. */
export function describeRingDefect(defect: RingDefect): string {
    switch (defect) {
        case 'too-few-vertices':
            return 'fewer than 3 distinct vertices — not a polygon';
        case 'non-finite-coordinate':
            return 'a coordinate is NaN or Infinity (failed parse or failed projection)';
        case 'unclosed':
            return 'the ring is not closed (first vertex ≠ last vertex) although its source contract says it must be — it may be truncated, and closing it here would invent an edge the publisher never drew';
        case 'zero-area':
            return 'zero enclosed area (a sliver or an all-collinear ring)';
        case 'self-intersecting':
            return 'two non-adjacent edges touch or cross, so the ring has no well-defined interior — refused rather than repaired, because a repair silently picks one of several possible interiors and reports success';
    }
}

/** Axis-aligned bounds of a ring. Used for the cheap, SOUND disjointness proof in the clipper. */
export interface RingBounds {
    readonly minX: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxZ: number;
}

export function ringBounds(ring: ReadonlyArray<Pt>): RingBounds | null {
    if (ring.length === 0) return null;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of ring) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, minZ, maxX, maxZ };
}

/**
 * Are two bounds provably disjoint?
 *
 * ⚠ ONE-SIDED BY DESIGN. `true` PROVES the two polygons cannot overlap (their bounding boxes do
 * not), so the part can be skipped without any clip — which is what makes a 55-part byggefelt cheap.
 * `false` proves nothing and the real clip must still run. Reading this as "they overlap" would be
 * the classic bbox fallacy.
 */
export function boundsDisjoint(a: RingBounds, b: RingBounds): boolean {
    return (
        a.maxX < b.minX - COINCIDENT_EPS_M ||
        b.maxX < a.minX - COINCIDENT_EPS_M ||
        a.maxZ < b.minZ - COINCIDENT_EPS_M ||
        b.maxZ < a.minZ - COINCIDENT_EPS_M
    );
}
