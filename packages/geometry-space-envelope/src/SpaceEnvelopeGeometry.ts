// SpaceEnvelopeGeometry — the prism, and the ONE writer of the derived metrics.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §2b / §10 · ADR-0380.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// Imports `@opentelemetry/api` and this package's own types. No THREE (P2), no DOM,
// no I/O beyond the tracer.

import { trace, type Tracer } from '@opentelemetry/api';
import {
    MIN_FOOTPRINT_AREA_M2,
    PARALLEL_CROSS_EPSILON,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
} from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

/** A point on the level's XZ plane. `y` is carried so callers round-trip `Vec3`. */
export interface EnvelopePoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AREA — signed, because the SIGN is load-bearing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shoelace over the XZ plane. **Signed** — and the sign is not an implementation
 * detail: it encodes the winding, and a face move that flips it has turned the
 * footprint inside out (C114 §12's `face-move-inverts-ring`). A function that
 * returned only `Math.abs` would make that defect invisible to its own caller.
 */
export function signedFootprintAreaM2(ring: readonly EnvelopePoint[]): number {
    const n = ring.length;
    if (n < 3) return 0;
    let acc = 0;
    for (let i = 0; i < n; i += 1) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        acc += a.x * b.z - b.x * a.z;
    }
    return acc / 2;
}

/** Unsigned area in m². This is the number a human is shown. */
export function footprintAreaM2(ring: readonly EnvelopePoint[]): number {
    return Math.abs(signedFootprintAreaM2(ring));
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE DERIVED METRICS — C114 §2b names this the ONE writer
// ═══════════════════════════════════════════════════════════════════════════════

export interface SpaceEnvelopeMetrics {
    readonly footprintAreaM2: number;
    readonly volumeM3: number;
}

/**
 * ⭐ THE SINGLE AUTHORITY FOR `footprintAreaM2` AND `volumeM3` (C114 §2b).
 *
 * Every write of those two fields goes through here. A second writer would be C84
 * EI-9's *"two answers to one question"* with a rounding difference attached — and
 * the two answers would disagree only on some inputs, which is the shape that
 * survives review.
 *
 * ⛔ THE RESULT IS NOT A GROSS FLOOR AREA AND MUST NEVER BE SUMMED INTO ONE
 * (C114 §3a, ADR-0380 D5). `measureAuthoredDesign` answers *"how much has been
 * BUILT"* off real floor plates and refuses rather than guessing. This answers
 * *"how much is INTENDED"*. Blending them makes the feasibility panel's built-area
 * headline change when nothing was built.
 */
export function recomputeSpaceEnvelopeMetrics(prism: SpaceEnvelopePrism): SpaceEnvelopeMetrics {
    return getTracer().startActiveSpan('spaceEnvelope.recomputeMetrics', (span) => {
        try {
            const area = footprintAreaM2(prism.footprint);
            span.setAttribute('spaceEnvelope.id', prism.id);
            span.setAttribute('spaceEnvelope.vertexCount', prism.footprint.length);
            return { footprintAreaM2: area, volumeM3: area * prism.height };
        } finally {
            span.end();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACES
// ═══════════════════════════════════════════════════════════════════════════════

/** The ring centroid on the XZ plane — the reference the outward normal is tested against. */
export function ringCentroid(ring: readonly EnvelopePoint[]): { x: number; z: number } {
    const n = ring.length;
    if (n === 0) return { x: 0, z: 0 };
    let sx = 0;
    let sz = 0;
    for (const p of ring) {
        sx += p.x;
        sz += p.z;
    }
    return { x: sx / n, z: sz / n };
}

/**
 * The OUTWARD unit normal of side face `edgeIndex`, on the XZ plane.
 *
 * ⭐ THE NORMAL IS RESOLVED AGAINST THE CENTROID, NOT AGAINST THE WINDING, and that
 * is deliberate. Deriving it from the shoelace sign would make every face-move
 * silently depend on a convention the caller may not have honoured — and the schema
 * only says the ring is counter-clockwise "by convention", which is exactly the kind
 * of unenforced promise that produces an inward drag that looks like a sign bug.
 * Pointing away from the centroid is true for any convex ring under either winding.
 */
export function outwardNormal(
    ring: readonly EnvelopePoint[],
    edgeIndex: number,
): { x: number; z: number } | null {
    const n = ring.length;
    if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return null;
    const a = ring[edgeIndex]!;
    const b = ring[(edgeIndex + 1) % n]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < PARALLEL_CROSS_EPSILON) return null;
    // Both perpendiculars; pick the one pointing away from the centroid.
    let nx = dz / len;
    let nz = -dx / len;
    const c = ringCentroid(ring);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if ((mx - c.x) * nx + (mz - c.z) * nz < 0) {
        nx = -nx;
        nz = -nz;
    }
    return { x: nx, z: nz };
}

/** Every face of the prism, in the ONE indexing convention (`SpaceEnvelopeFaceRef`). */
export function spaceEnvelopeFaces(prism: SpaceEnvelopePrism): readonly SpaceEnvelopeFaceRef[] {
    const sides: SpaceEnvelopeFaceRef[] = prism.footprint.map((_, i) => ({
        kind: 'side' as const,
        edgeIndex: i,
    }));
    return [...sides, { kind: 'top' }, { kind: 'bottom' }];
}

/** World-space Y of the prism's base and top, in the LEVEL's datum (C114 §10a). */
export function prismVerticalExtent(prism: SpaceEnvelopePrism): {
    readonly baseY: number;
    readonly topY: number;
} {
    return { baseY: prism.baseOffset, topY: prism.baseOffset + prism.height };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RING VALIDITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Does the ring cross itself? A prism over a self-intersecting ring is not a solid,
 * and this is the geometric content of `face-move-inverts-ring`.
 *
 * O(n²) by construction and deliberately so: envelope rings are authored by hand and
 * are a handful of vertices. A sweep-line here would be a performance answer to a
 * question nobody has asked, and C66 §1's rule is that an unmeasured capacity claim
 * is not a supported one — so the honest note is that this is bounded by hand-drawn
 * ring size, not that it scales.
 */
export function ringSelfIntersects(ring: readonly EnvelopePoint[]): boolean {
    const n = ring.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            // Skip edges that share a vertex — they always "touch".
            if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
            if (
                segmentsProperlyIntersect(
                    ring[i]!,
                    ring[(i + 1) % n]!,
                    ring[j]!,
                    ring[(j + 1) % n]!,
                )
            ) {
                return true;
            }
        }
    }
    return false;
}

function cross(ox: number, oz: number, ax: number, az: number, bx: number, bz: number): number {
    return (ax - ox) * (bz - oz) - (az - oz) * (bx - ox);
}

function segmentsProperlyIntersect(
    p1: EnvelopePoint,
    p2: EnvelopePoint,
    p3: EnvelopePoint,
    p4: EnvelopePoint,
): boolean {
    const d1 = cross(p3.x, p3.z, p4.x, p4.z, p1.x, p1.z);
    const d2 = cross(p3.x, p3.z, p4.x, p4.z, p2.x, p2.z);
    const d3 = cross(p1.x, p1.z, p2.x, p2.z, p3.x, p3.z);
    const d4 = cross(p1.x, p1.z, p2.x, p2.z, p4.x, p4.z);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
        && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Is this ring usable as a footprint at all? Used by the planner's guards. */
export function ringIsDegenerate(ring: readonly EnvelopePoint[]): boolean {
    return ring.length < 3
        || footprintAreaM2(ring) < MIN_FOOTPRINT_AREA_M2
        || ringSelfIntersects(ring);
}

/**
 * The `y === 0` invariant, checked here as well as in the schema.
 *
 * ⭐ CHECKED TWICE ON PURPOSE. The schema `.refine` guards what is PERSISTED; this
 * guards what is COMPUTED, and a solver that trusted its caller would produce a
 * confidently wrong area for a ring that never reached the store. C84 EI-2.d names
 * the ignored component as a silent-narrowing landmine — the answer is to enforce
 * it at every boundary that could hide it, not to pick one.
 */
export function ringIsOnLevelPlane(ring: readonly EnvelopePoint[]): boolean {
    return ring.every((p) => p.y === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POINT-IN-RING — one definition, two callers (2026-09-07, lane FACE-DRAG)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crossing-number point-in-polygon on the XZ plane.
 *
 * ⭐ IT LIVES HERE RATHER THAN INSIDE ONE CALLER BECAUSE THERE ARE NOW TWO. It was
 * private to `SpaceEnvelopeRelations` (footprint overlap); the face PICKER needs the
 * identical test to decide whether a ray that crossed the top plane crossed it INSIDE
 * the ring. Two crossing-number implementations would be the C84 EI-9 defect in its
 * most expensive form: they would agree everywhere except on the boundary cases that
 * decide whether a click lands on a face or on nothing.
 *
 * ⚠ THE BOUNDARY IS NOT DEFINED, AND NEITHER CALLER MAY DEPEND ON IT. A point exactly
 * on an edge is reported by the parity of the crossings, which is an artefact of the
 * half-open `(a.z > p.z) !== (b.z > p.z)` test rather than a decision. A caller that
 * needs the boundary INCLUDED must widen its own ring or add its own tolerance — the
 * picker does exactly that, with a named epsilon, rather than asking this function for
 * a guarantee it does not make.
 *
 * `y` is ignored: this is a plan test.
 */
export function pointInRing(p: { readonly x: number; readonly z: number }, ring: readonly EnvelopePoint[]): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
        const a = ring[i]!;
        const b = ring[j]!;
        if ((a.z > p.z) !== (b.z > p.z)
            && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}
