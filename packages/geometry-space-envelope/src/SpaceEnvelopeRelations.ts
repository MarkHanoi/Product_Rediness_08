// SpaceEnvelopeRelations — the awareness axes, computed ON DEMAND and never stored.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §8a / §9a / §12 · ADR-0380 D3 / D4.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S FOUR AWARENESS AXES, AND WHY NONE OF THEM IS A STORED FIELD
// ═══════════════════════════════════════════════════════════════════════════════
//
// The directive (§3) says an envelope knows *"which other envelopes are within it,
// around it, and on top of it"*. ADR-0380 D3 ruled that only ONE of those is stored:
//
//   within   — AUTHORED. The user says so. Lives in `withinId` on the record.
//   around   — DERIVED. A function of two footprints and a tolerance.
//   on top of— DERIVED. A function of two [base, top] intervals plus footprint overlap.
//
// ⭐ THE DERIVED TWO GET NO STORAGE AND NO GRAPH EDGE, AND THAT IS THE DESIGN, NOT A
// SHORTCUT. Storing a derived predicate is a CACHE, and a cache is a second answer to
// a question the geometry already answers (C84 EI-9). C71 §2.5 forbids the writer-first
// graph edge outright — *"writing edges nothing reads is how `sitsOn` spent months as
// measured-but-meaningless coverage"*. Because these are recomputed on read, there is
// no cascade to reverse on undo and no way for them to fall out of sync (C114 §8a).
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// L2. Imports `@opentelemetry/api`, `@pryzm/site-parcel-data` (L2, THREE-free) and
// this package. No THREE (P2), no DOM.
//
// ⛔ IT DOES NOT IMPORT `@pryzm/spatial-index`, AND THAT IS DELIBERATE: that package
// imports THREE, which would make this one un-testable in a `node` environment and
// break the purity that lets a test assert exactly what production computes.

import { trace, type Tracer } from '@opentelemetry/api';
import { checkEnvelopeContainment, type XZ } from '@pryzm/site-parcel-data';
// ⭐ `pointInRing` MOVED to SpaceEnvelopeGeometry (2026-09-07, lane FACE-DRAG) and is imported
// rather than kept private here: the ray/plan face PICKER needs the identical test, and two
// crossing-number implementations of "is this point inside this ring?" is the C84 EI-9 defect —
// the pick would disagree with the containment relation on exactly the boundary cases where it
// matters. One definition, both callers.
import {
    footprintAreaM2,
    pointInRing,
    prismVerticalExtent,
    type EnvelopePoint,
} from './SpaceEnvelopeGeometry.js';
import type { SpaceEnvelopePrism } from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

function toXZ(ring: readonly EnvelopePoint[]): XZ[] {
    return ring.map((p) => ({ x: p.x, z: p.z }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTAINMENT — ADVISORY, ALWAYS, AND THIS IS THE PRODUCT DECISION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⭐ `severity` IS NEVER `'refusal'`. ADR-0380 D4 and C114 §12: both containment
 * verdicts are ADVISORY.
 *
 * A room envelope sticking out of its level envelope is buildable and internally
 * consistent — it usually means *the level envelope needs to grow*, which is a design
 * act, not an error. And a level envelope outside the maximum buildable volume is the
 * decisive case: that volume is a **STUDY, not a permit** (C58/C74/C75). Refusing an
 * architect's edit on the authority of a study PRYZM computed would tell a
 * professional they may not draw something they may well be entitled to build —
 * C83 §5's *"fastest route to being muted"*.
 */
export interface SpaceEnvelopeContainmentFinding {
    readonly childId: string;
    readonly parentId: string;
    readonly contained: boolean;
    readonly severity: 'ok' | 'advisory';
    /** How far outside, horizontally, in metres. 0 when contained. */
    readonly horizontalExcursionM: number;
    /** How far outside, vertically, in metres. 0 when contained. */
    readonly verticalExcursionM: number;
    /**
     * ⭐ BOTH NUMBERS, in one sentence, read from the geometry and never re-typed
     * (C114 §12a). This is what a panel shows and what the RAC says out loud.
     */
    readonly message: string;
}

/**
 * Is `child` inside `parent`? Reported, never enforced.
 *
 * ⭐ THE HORIZONTAL HALF JOINS `checkEnvelopeContainment` RATHER THAN REBUILDING IT,
 * and C84 EI-9.2 is the reason it MUST: *"a containment test is a question, and the
 * gate, the pre-flight and the builder must ask the same one."* PRYZM already ships
 * that question — including the concave-notch case where every vertex is inside but
 * an edge bridges out, which a naive point-in-polygon loop gets wrong and which is
 * exactly the sort of thing a second implementation would get wrong differently.
 *
 * The VERTICAL half is added here because a prism is not a footprint: `[base, top]`
 * interval containment is a fact `checkEnvelopeContainment` does not model and should
 * not be taught, since its own subject is a 2-D zoning ring.
 */
export function assessSpaceEnvelopeContainment(
    child: SpaceEnvelopePrism,
    parent: SpaceEnvelopePrism,
): SpaceEnvelopeContainmentFinding {
    return getTracer().startActiveSpan('spaceEnvelope.assessContainment', (span) => {
        try {
            const report = checkEnvelopeContainment(toXZ(parent.footprint), [
                { id: child.id, kind: 'spaceEnvelope', ring: toXZ(child.footprint) },
            ]);
            const horizontalExcursionM = report.ok ? 0 : report.worstExcursionM;

            const c = prismVerticalExtent(child);
            const p = prismVerticalExtent(parent);
            const below = Math.max(0, p.baseY - c.baseY);
            const above = Math.max(0, c.topY - p.topY);
            const verticalExcursionM = Math.max(below, above);

            const contained = horizontalExcursionM === 0 && verticalExcursionM === 0;
            span.setAttribute('spaceEnvelope.contained', contained);

            return {
                childId: child.id,
                parentId: parent.id,
                contained,
                severity: contained ? ('ok' as const) : ('advisory' as const),
                horizontalExcursionM,
                verticalExcursionM,
                message: contained
                    ? `${child.id} is inside ${parent.id}.`
                    : describeExcursion(child, parent, horizontalExcursionM, verticalExcursionM, p),
            };
        } finally {
            span.end();
        }
    });
}

function describeExcursion(
    child: SpaceEnvelopePrism,
    parent: SpaceEnvelopePrism,
    horizontal: number,
    vertical: number,
    parentExtent: { baseY: number; topY: number },
): string {
    const parts: string[] = [];
    if (horizontal > 0) {
        parts.push(
            `${horizontal.toFixed(2)} m outside it horizontally (the containing footprint `
            + `covers ${footprintAreaM2(parent.footprint).toFixed(2)} m²)`,
        );
    }
    if (vertical > 0) {
        parts.push(
            `${vertical.toFixed(2)} m outside it vertically (the containing envelope runs `
            + `${parentExtent.baseY.toFixed(2)} m to ${parentExtent.topY.toFixed(2)} m)`,
        );
    }
    return `${child.id} sits ${parts.join(' and ')}. `
        + 'This is reported, not refused — it usually means the containing envelope needs to grow.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// STACKING — "on top of", derived, no edge (ADR-0380 D3)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SpaceEnvelopeStackRelation {
    readonly lowerId: string;
    readonly upperId: string;
    /** Vertical gap in metres. 0 means they touch; negative means they interpenetrate. */
    readonly gapM: number;
}

/**
 * Is `b` on top of `a`? True when their footprints overlap in plan AND `b`'s base is
 * at or above `a`'s top (within `toleranceM`).
 *
 * ⛔ NO `stackedOn` UBG EDGE IS MINTED FOR THIS (ADR-0380 D3, C71 §2.5/§2.6). The
 * precedent is written down in the repo already:
 * `plugins/boundary-line/src/handlers/AttachToBoundaryLine.ts` — *"minting `boundOn`
 * would have been the rival vocabulary C84 EI-8 rules out."*
 */
export function stackRelation(
    a: SpaceEnvelopePrism,
    b: SpaceEnvelopePrism,
    toleranceM = 0.05,
): SpaceEnvelopeStackRelation | null {
    if (!footprintsOverlap(a.footprint, b.footprint)) return null;
    const ea = prismVerticalExtent(a);
    const eb = prismVerticalExtent(b);
    if (eb.baseY + toleranceM >= ea.topY) {
        return { lowerId: a.id, upperId: b.id, gapM: eb.baseY - ea.topY };
    }
    if (ea.baseY + toleranceM >= eb.topY) {
        return { lowerId: b.id, upperId: a.id, gapM: ea.baseY - eb.topY };
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADJACENCY — "around", derived, projected onto the EXISTING `adjacentTo` edge
// ═══════════════════════════════════════════════════════════════════════════════

export interface SpaceEnvelopeAdjacency {
    readonly aId: string;
    readonly bId: string;
    /** Closest horizontal distance between the two footprints, in metres. */
    readonly distanceM: number;
}

/**
 * Are these two envelopes adjacent? Within `thresholdM` horizontally AND overlapping
 * in vertical extent — two volumes on different storeys are not "around" each other.
 *
 * ⭐ PROJECTED ONTO THE EXISTING `adjacentTo` UBG EDGE, whose documented meaning is
 * already *"A is spatially adjacent to B"*. `UBG_EDGE_TYPES` gains no member.
 */
export function adjacency(
    a: SpaceEnvelopePrism,
    b: SpaceEnvelopePrism,
    thresholdM = 0.5,
): SpaceEnvelopeAdjacency | null {
    const ea = prismVerticalExtent(a);
    const eb = prismVerticalExtent(b);
    if (eb.baseY >= ea.topY || ea.baseY >= eb.topY) return null;
    const distanceM = ringDistanceM(a.footprint, b.footprint);
    return distanceM <= thresholdM ? { aId: a.id, bId: b.id, distanceM } : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDARY DISTANCE — the directive's *"distance to the perimeter boundaries"*
// ═══════════════════════════════════════════════════════════════════════════════

export interface BoundaryDistanceFinding {
    readonly envelopeId: string;
    /** Closest distance from the envelope footprint to the boundary ring, in metres. */
    readonly nearestDistanceM: number;
    /** Index of the envelope's own side face that is closest. */
    readonly nearestFaceIndex: number;
    /** True when the envelope crosses the boundary rather than standing off it. */
    readonly outside: boolean;
}

/**
 * How close does this envelope come to the parcel perimeter, and on which face?
 *
 * ⚠ THE ANSWER IS HORIZONTAL ONLY, AND SAYS SO. A setback is a plan-measured
 * quantity, and mixing a vertical term into it would produce a number that is not the
 * one any ordinance names.
 */
export function boundaryDistance(
    envelope: SpaceEnvelopePrism,
    boundaryRing: readonly EnvelopePoint[],
): BoundaryDistanceFinding {
    return getTracer().startActiveSpan('spaceEnvelope.boundaryDistance', (span) => {
        try {
            let best = Number.POSITIVE_INFINITY;
            let bestFace = -1;
            const n = envelope.footprint.length;
            for (let i = 0; i < n; i += 1) {
                const a = envelope.footprint[i]!;
                const b = envelope.footprint[(i + 1) % n]!;
                const d = segmentToRingDistance(a, b, boundaryRing);
                if (d < best) {
                    best = d;
                    bestFace = i;
                }
            }
            const report = checkEnvelopeContainment(toXZ(boundaryRing), [
                { id: envelope.id, kind: 'spaceEnvelope', ring: toXZ(envelope.footprint) },
            ]);
            span.setAttribute('spaceEnvelope.boundaryDistanceM', best);
            return {
                envelopeId: envelope.id,
                nearestDistanceM: Number.isFinite(best) ? best : 0,
                nearestFaceIndex: bestFace,
                outside: !report.ok,
            };
        } finally {
            span.end();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANE GEOMETRY HELPERS — private
// ═══════════════════════════════════════════════════════════════════════════════

function pointSegmentDistance(
    px: number, pz: number,
    ax: number, az: number,
    bx: number, bz: number,
): number {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function segmentToRingDistance(
    a: EnvelopePoint,
    b: EnvelopePoint,
    ring: readonly EnvelopePoint[],
): number {
    let best = Number.POSITIVE_INFINITY;
    const n = ring.length;
    for (let i = 0; i < n; i += 1) {
        const c = ring[i]!;
        const d = ring[(i + 1) % n]!;
        best = Math.min(
            best,
            pointSegmentDistance(a.x, a.z, c.x, c.z, d.x, d.z),
            pointSegmentDistance(b.x, b.z, c.x, c.z, d.x, d.z),
            pointSegmentDistance(c.x, c.z, a.x, a.z, b.x, b.z),
            pointSegmentDistance(d.x, d.z, a.x, a.z, b.x, b.z),
        );
    }
    return best;
}

function ringDistanceM(a: readonly EnvelopePoint[], b: readonly EnvelopePoint[]): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < a.length; i += 1) {
        best = Math.min(best, segmentToRingDistance(a[i]!, a[(i + 1) % a.length]!, b));
    }
    return best;
}

/** Cheap plan-overlap test: AABB rejection, then any-vertex-inside either way. */
function footprintsOverlap(a: readonly EnvelopePoint[], b: readonly EnvelopePoint[]): boolean {
    const ba = bounds(a);
    const bb = bounds(b);
    if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxZ < bb.minZ || bb.maxZ < ba.minZ) {
        return false;
    }
    return a.some((p) => pointInRing(p, b)) || b.some((p) => pointInRing(p, a));
}

function bounds(ring: readonly EnvelopePoint[]): {
    minX: number; maxX: number; minZ: number; maxZ: number;
} {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

