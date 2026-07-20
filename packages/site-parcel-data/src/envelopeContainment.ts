// §L-428 — ENVELOPE CONTAINMENT VALIDATOR.
//
// WHY THIS EXISTS
// ---------------
// L-401 made the generators build FROM the buildable-envelope inset, which makes the
// footprint compliant BY CONSTRUCTION — but "by construction" is a claim, and the founder
// reported slabs and apartment cells escaping the envelope while the shell walls obeyed it.
// The compliance promise is only as good as our ability to DETECT a breach; without a check,
// a regression in any downstream stage (slabs, roof, room dissection) silently un-does L-401
// and the UI keeps saying "compliant".
//
// So this is the verification half of compliance-by-construction: given the envelope and the
// footprints actually authored, report every element that crosses the line, and by how much.
// It mirrors §HOUSE-SHELL-CONTAIN-ALL-FLOORS (ADR-0097), which does the same job for the
// house shell.
//
// PURE — no I/O, no THREE, no DOM. Unit-testable, and callable from a post-generate hook or
// a test without standing up a scene.
//
// THE CASE THAT MAKES THIS NON-TRIVIAL: a buildable-envelope inset is frequently CONCAVE
// (setbacks applied to an irregular parcel — the founder's case was a 12-vertex ring). For a
// concave container, "every vertex is inside" does NOT imply containment: an element edge can
// bridge across a notch while both its endpoints sit inside. A vertex-only test would pass
// that and report compliance on a building that visibly pokes out. We therefore test vertices
// AND edge crossings.

/** A point in world XZ metres. */
export interface XZ {
    readonly x: number;
    readonly z: number;
}

/** One element's footprint to test against the envelope. */
export interface FootprintToCheck {
    readonly id: string;
    /** 'wall' | 'slab' | 'room' | 'roof' | … — free-form, echoed into the report. */
    readonly kind: string;
    /** Closed or open ring in world XZ metres. */
    readonly ring: ReadonlyArray<XZ>;
}

export interface ContainmentViolation {
    readonly id: string;
    readonly kind: string;
    /** How far the worst offending vertex lies OUTSIDE the envelope, in metres. */
    readonly maxExcursionM: number;
    /** Vertices found outside (may be 0 when only an EDGE crosses a concave notch). */
    readonly verticesOutside: number;
    /** True when an edge crosses the envelope boundary — the concave-notch case. */
    readonly edgeCrosses: boolean;
    readonly explanation: string;
}

export interface ContainmentReport {
    readonly ok: boolean;
    readonly checked: number;
    readonly violations: ReadonlyArray<ContainmentViolation>;
    /** Worst excursion across all elements (m); 0 when compliant. */
    readonly worstExcursionM: number;
    readonly summary: string;
}

/**
 * Tolerance (metres). An element is only reported when it exceeds the envelope by MORE than
 * this. Set at 1 cm: below that, a "violation" is floating-point noise or a wall-centreline
 * rounding artefact, and reporting it would train the reader to ignore the check — the
 * failure mode where a validator that cries wolf is worse than no validator.
 */
export const CONTAINMENT_TOLERANCE_M = 0.01;

/** Ray-casting point-in-polygon. Boundary points count as INSIDE (see distanceOutside). */
function pointInRing(p: XZ, ring: ReadonlyArray<XZ>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        const straddles = (a.z > p.z) !== (b.z > p.z);
        if (!straddles) continue;
        const xCross = ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
        if (p.x < xCross) inside = !inside;
    }
    return inside;
}

/** Shortest distance from p to segment a→b. */
function distToSegment(p: XZ, a: XZ, b: XZ): number {
    const dx = b.x - a.x, dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq <= 1e-12) return Math.hypot(p.x - a.x, p.z - a.z);
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** Distance from p to the ring's boundary (0 when exactly on it). */
function distToRing(p: XZ, ring: ReadonlyArray<XZ>): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const d = distToSegment(p, a, b);
        if (d < best) best = d;
    }
    return best === Infinity ? 0 : best;
}

/** True when segments p1→p2 and p3→p4 properly cross (shared endpoints do not count). */
function segmentsCross(p1: XZ, p2: XZ, p3: XZ, p4: XZ): boolean {
    const d = (a: XZ, b: XZ, c: XZ): number => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    const EPS = 1e-9;
    // Strict sign change on BOTH segments — touching at a vertex is tolerated, because
    // building exactly TO the setback line is the intended design move, not a violation.
    return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS))
        && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/**
 * Check every footprint against the buildable envelope.
 *
 * @param envelopeRing the C58 envelope INSET ring (the setback line) in world XZ metres.
 * @param footprints   the element footprints actually authored.
 * @param toleranceM   see {@link CONTAINMENT_TOLERANCE_M}.
 */
export function checkEnvelopeContainment(
    envelopeRing: ReadonlyArray<XZ> | null | undefined,
    footprints: ReadonlyArray<FootprintToCheck>,
    toleranceM: number = CONTAINMENT_TOLERANCE_M,
): ContainmentReport {
    // No envelope ⇒ nothing to be compliant WITH. Report honestly rather than returning a
    // green "ok" that would read as "verified compliant" when nothing was verified.
    if (!envelopeRing || envelopeRing.length < 3) {
        return {
            ok: true,
            checked: 0,
            violations: [],
            worstExcursionM: 0,
            summary: 'No buildable envelope available — containment NOT checked (not a pass).',
        };
    }

    const violations: ContainmentViolation[] = [];
    let worst = 0;
    let checked = 0;

    for (const fp of footprints) {
        if (!fp.ring || fp.ring.length < 2) continue;
        checked++;

        // Exact vertex test — the common case, and what the report quotes.
        let verticesOutside = 0;
        let maxExcursion = 0;
        for (const v of fp.ring) {
            if (pointInRing(v, envelopeRing)) continue;
            const d = distToRing(v, envelopeRing);
            if (d <= toleranceM) continue;   // on the line within tolerance — building TO the setback
            verticesOutside++;
            if (d > maxExcursion) maxExcursion = d;
        }

        // Concave-notch case: all vertices inside, but an edge bridges across the boundary.
        //
        // THE TOLERANCE MUST APPLY HERE TOO. A crossing alone is not a breach: a vertex
        // sitting 5 mm outside makes its two edges "cross" the boundary, and flagging that
        // would report every maximal-but-compliant building — training the reader to ignore
        // the check, which is worse than not having it. So when an edge crosses, MEASURE how
        // far outside it actually goes (sampling the edge interior) and apply the same
        // tolerance as the vertex test.
        //
        // Sampling is an approximation: an excursion narrower than the sample spacing could
        // be missed. With 32 samples per edge that means a spike thinner than ~3% of an edge
        // AND shallower than the tolerance — far below anything a generator produces.
        let edgeCrosses = false;
        for (let i = 0; i < fp.ring.length; i++) {
            const a = fp.ring[i]!, b = fp.ring[(i + 1) % fp.ring.length]!;
            let crossesBoundary = false;
            for (let j = 0; j < envelopeRing.length; j++) {
                const c = envelopeRing[j]!, dpt = envelopeRing[(j + 1) % envelopeRing.length]!;
                if (segmentsCross(a, b, c, dpt)) { crossesBoundary = true; break; }
            }
            if (!crossesBoundary) continue;

            const SAMPLES = 32;
            for (let s = 1; s < SAMPLES; s++) {
                const t = s / SAMPLES;
                const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
                if (pointInRing(p, envelopeRing)) continue;
                const d = distToRing(p, envelopeRing);
                if (d <= toleranceM) continue;
                edgeCrosses = true;
                if (d > maxExcursion) maxExcursion = d;
            }
        }

        if (verticesOutside === 0 && !edgeCrosses) continue;

        if (maxExcursion > worst) worst = maxExcursion;
        violations.push({
            id: fp.id,
            kind: fp.kind,
            maxExcursionM: maxExcursion,
            verticesOutside,
            edgeCrosses,
            explanation: verticesOutside > 0
                ? `${fp.kind} ${fp.id}: ${verticesOutside} vertex/vertices outside the buildable envelope, worst by ${maxExcursion.toFixed(2)} m.`
                : `${fp.kind} ${fp.id}: all vertices inside, but an EDGE crosses the envelope boundary — the footprint bridges a concave notch.`,
        });
    }

    const ok = violations.length === 0;
    return {
        ok,
        checked,
        violations,
        worstExcursionM: worst,
        summary: ok
            ? `Containment OK — ${checked} footprint(s) inside the buildable envelope.`
            : `Containment FAILED — ${violations.length} of ${checked} footprint(s) breach the envelope; worst excursion ${worst.toFixed(2)} m.`,
    };
}
