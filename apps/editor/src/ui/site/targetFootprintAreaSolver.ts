// §RESI-ORCH-TARGET-AREA (lane RESI-ORCH, 2026-09-04) — *"I want ~120 m² on the ground floor."*
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §5 asks for a target-AREA entry alongside the buildable
// envelope, and states the refusal in the same breath: when the target exceeds what the ordinance
// permits, **say so with BOTH numbers** — not "no", not a silently clipped 92 m².
//
// ── WHY THIS EXISTS AS ITS OWN MODULE, AND WHY IT IS NOT A NEW ENVELOPE ─────────────────────
// The §MANUALENV159 height entry (`buildUserSuppliedStudyEnvelope`) is the proven sibling of this
// feature, and it is deliberately NOT reused: that path exists for the case where **no normative
// envelope resolves at all** ("PRYZM cannot find a height — type one"), and it therefore mints a
// CONTEXT-DERIVED STUDY with its own status. This is the opposite case. A target ground-floor area
// is only a meaningful question once a PERMITTED footprint exists — it is the thing the answer must
// be measured, and refused, against. So this produces a PROPOSAL inside a determination, never a
// rival determination, and it never touches `BuildableEnvelope`.
//
// ── THE SOLVER IS A REUSE, NOT A NEW GEOMETRY ENGINE ────────────────────────────────────────
// ⭐ `insetPolygonPerEdge` (`@pryzm/site-parcel-data`, §INSET-ROUND-JOIN / L-586) is THE erosion in
// this repo. It was measured block-by-block against an independent grid oracle precisely because
// the DIRECTION of the error is the compliance question, and it is documented never to return a
// ring LARGER than the true erosion. Writing a second inset here — a naive edge-offset, say — would
// be a rival with the opposite error direction, and the one that draws would win silently
// (§GREP-FOR-THE-EXISTING-SOLVER-FIRST). This module contributes exactly one thing that solver does
// not have: the INVERSE. It searches for the uniform erosion distance whose area hits a target.
//
// The search is a bisection on a monotone function: eroding further can only ever remove area. It
// is deterministic, bounded, and independent of the starting ring's winding (the erosion
// canonicalises internally).
//
// ── WHAT IT REFUSES, AND WHY EACH REFUSAL IS A DIFFERENT SENTENCE ───────────────────────────
// ⛔ Every refusal carries the numbers it was decided from. A bare "cannot" is the defect this
// lane's whole brief is written against: the user cannot tell "you asked for more than the law
// allows" from "PRYZM has no footprint for this parcel" from "the shape cannot shrink that far
// without falling apart", and those three demand three different next actions.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG. Never throws.

import { trace } from '@opentelemetry/api';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { insetPolygonPerEdge } from '@pryzm/site-parcel-data';

const _tracer = trace.getTracer('pryzm.site.targetFootprintAreaSolver');

/**
 * Why a target ground-floor area could not be proposed. CLOSED — a seventh arm must be added here
 * with its own sentence, and the type error at every `switch` is the feature.
 */
export type TargetFootprintRefusalReason =
    /** No `ok` envelope, or its inset ring is degenerate — there is nothing to measure against. */
    | 'no-permitted-footprint'
    /** The field was empty or not a number. */
    | 'target-not-a-number'
    /** Zero or negative. */
    | 'target-not-positive'
    /** ⭐ THE ONE §5 NAMES. Both numbers travel with it. */
    | 'exceeds-permitted-footprint'
    /** Monotone search ran out of room before reaching the target — a shape, not a law, problem. */
    | 'unreachable-inset';

/** A proposed ground-floor plate: compliant by construction, because it is an erosion of the
 *  permitted footprint. Still a STUDY — see `statement`. */
export interface TargetFootprintProposal {
    readonly ok: true;
    /** Scene-XZ metres, the same frame as the parcel ring and the envelope's `insetPolygon`. */
    readonly ring: readonly Pt[];
    /** ⚠ WHAT WAS ACHIEVED, never the target echoed back. They differ, and the difference is the
     *  user's to see: an erosion cannot hit an arbitrary area exactly on an arbitrary polygon. */
    readonly achievedAreaM2: number;
    readonly targetAreaM2: number;
    readonly permittedAreaM2: number;
    /** The uniform erosion distance that produced it (metres) — the "how", not just the "what". */
    readonly insetM: number;
    /** Plain language, ready to render. Names both areas and says what this is NOT. */
    readonly statement: string;
}

/** A refusal, carrying the numbers it was decided from. */
export interface TargetFootprintRefusal {
    readonly ok: false;
    readonly reason: TargetFootprintRefusalReason;
    /** `null` only where the input itself was unreadable. */
    readonly targetAreaM2: number | null;
    /** `null` only where there is no permitted footprint to state. */
    readonly permittedAreaM2: number | null;
    readonly statement: string;
}

export type TargetFootprintResult = TargetFootprintProposal | TargetFootprintRefusal;

export interface TargetFootprintInputs {
    /** The PERMITTED buildable footprint ring (`BuildableEnvelope.insetPolygon`), scene-XZ metres. */
    readonly permittedRing: ReadonlyArray<Pt>;
    /**
     * The permitted footprint area the CARD is showing (`insetAreaM2 || area(ring)`).
     *
     * ⚠ PASSED IN, NEVER RE-DERIVED. The card has ONE producer of this number
     * (`permittedStudyFigures`, C06 §13.3). If this module measured the ring itself, a card reading
     * 92 m² could refuse a 92 m² request using its own 91.7 m² — the user would be told they had
     * exceeded a limit the screen says they had met.
     */
    readonly permittedAreaM2: number;
    /** What the user typed, in m². Any garbage is fine — it is classified, not trusted. */
    readonly targetAreaM2: unknown;
}

/** Iterations of bisection. 60 halvings of a ≤ 512 m band is far below float resolution; the loop
 *  exits on tolerance long before this, and the bound exists so a pathological ring cannot spin. */
const MAX_BISECTION_STEPS = 60;

/** Upper bound on the erosion search (metres). Larger than any residential parcel's inradius. */
const MAX_INSET_M = 512;

/**
 * How close is "hit the target". The looser of 0.25 m² and 0.25 % of the target — a fixed epsilon
 * would demand impossible precision on a 20 m² utility plot and pointless precision on 4,000 m².
 */
function toleranceFor(targetM2: number): number {
    return Math.max(0.25, targetM2 * 0.0025);
}

/** Shoelace area (m²), sign-independent. Local because this module must stay dependency-light and
 *  the formula has one correct form. */
function ringAreaM2(ring: ReadonlyArray<Pt>): number {
    if (ring.length < 3) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

/**
 * Erode `ring` uniformly by `d` metres through the ONE repo erosion, and measure the result.
 * Returns `null` when the erosion is degenerate (the shape has been consumed).
 *
 * Uniform on purpose: this is a STUDY plate the user asked to be smaller, not a setback rule. A
 * per-edge erosion here would silently invent a shaping decision the ordinance did not make.
 */
function erodeAndMeasure(
    ring: ReadonlyArray<Pt>,
    cls: ReadonlyArray<ParcelEdgeClassification>,
    d: number,
): { ring: Pt[]; areaM2: number } | null {
    const result = insetPolygonPerEdge(ring, cls, {
        front: d,
        side: d,
        rear: d,
        unclassified: d,
    });
    if (result.degenerate || result.polygon.length < 3) return null;
    return { ring: result.polygon, areaM2: ringAreaM2(result.polygon) };
}

/**
 * THE solver. Pure; total; never throws.
 *
 * ⭐ THE ORDER OF THE GUARDS IS LOAD-BEARING. The "exceeds permitted" refusal is decided BEFORE any
 * geometry runs, so a user who asks for more than the law allows gets the LAW's sentence — not a
 * geometry failure that happens to occur first. A refusal about coverage dressed as a refusal about
 * shape is the §CONTEXT-DATA-HONESTY conflation with a solver in the middle of it.
 */
export function solveTargetFootprintArea(inputs: TargetFootprintInputs): TargetFootprintResult {
    const span = _tracer.startSpan('pryzm.site.solveTargetFootprintArea');
    try {
        const permittedAreaM2 = Number.isFinite(inputs.permittedAreaM2) ? inputs.permittedAreaM2 : 0;
        const ring = inputs.permittedRing;

        // ── 1. Is there anything to measure against? ──
        if (ring.length < 3 || !(permittedAreaM2 > 0)) {
            span.setAttribute('pryzm.targetFootprint.refusal', 'no-permitted-footprint');
            return {
                ok: false,
                reason: 'no-permitted-footprint',
                targetAreaM2: typeof inputs.targetAreaM2 === 'number' ? inputs.targetAreaM2 : null,
                permittedAreaM2: null,
                statement:
                    'PRYZM has not solved a buildable footprint for this parcel, so there is nothing '
                    + 'to fit a target area inside. A target only means something against a permitted '
                    + 'footprint — without one, any shape PRYZM drew would be a guess.',
            };
        }

        // ── 2. Is the input a number at all? ──
        const raw = inputs.targetAreaM2;
        const target = typeof raw === 'number' ? raw : Number(raw);
        if (typeof raw === 'boolean' || raw === null || raw === undefined || !Number.isFinite(target)) {
            span.setAttribute('pryzm.targetFootprint.refusal', 'target-not-a-number');
            return {
                ok: false,
                reason: 'target-not-a-number',
                targetAreaM2: null,
                permittedAreaM2,
                statement:
                    `Enter a ground-floor area in m². The permitted buildable footprint on this parcel `
                    + `is ${permittedAreaM2.toFixed(0)} m².`,
            };
        }
        if (!(target > 0)) {
            span.setAttribute('pryzm.targetFootprint.refusal', 'target-not-positive');
            return {
                ok: false,
                reason: 'target-not-positive',
                targetAreaM2: target,
                permittedAreaM2,
                statement:
                    `A ground-floor area has to be greater than zero. The permitted buildable footprint `
                    + `on this parcel is ${permittedAreaM2.toFixed(0)} m².`,
            };
        }

        // ── 3. ⭐ THE §5 REFUSAL, WITH BOTH NUMBERS, BEFORE ANY GEOMETRY. ──
        // ⛔ DO NOT SOFTEN THIS INTO "we drew you the largest one that fits". Silently substituting
        // the permitted footprint for the request is how a user comes to believe they asked for
        // 120 m² and got it. The refusal states the gap and leaves the decision with them, which is
        // this product's entire posture: guide the human, do not replace the human.
        const tol = toleranceFor(target);
        if (target > permittedAreaM2 + tol) {
            span.setAttribute('pryzm.targetFootprint.refusal', 'exceeds-permitted-footprint');
            return {
                ok: false,
                reason: 'exceeds-permitted-footprint',
                targetAreaM2: target,
                permittedAreaM2,
                statement:
                    `You asked for ${target.toFixed(0)} m² on the ground floor. The permitted buildable `
                    + `footprint on this parcel is ${permittedAreaM2.toFixed(0)} m² — `
                    + `${(target - permittedAreaM2).toFixed(0)} m² less than you asked for. PRYZM will not `
                    + `propose a footprint that exceeds it. To build ${target.toFixed(0)} m², you would need `
                    + `more than one storey, a different parcel, or a change to the rule that sets this limit.`,
            };
        }

        // ── 4. The target IS the permitted footprint (within tolerance) — no erosion needed. ──
        // A real answer, not a special case dodged: eroding by 0 is the identity, and saying so is
        // more honest than running a search that returns d ≈ 0 with a rounding wobble.
        const cls: ParcelEdgeClassification[] = new Array(ring.length).fill('unclassified');
        if (target >= permittedAreaM2 - tol) {
            span.setAttribute('pryzm.targetFootprint.insetM', 0);
            return {
                ok: true,
                ring: ring.map((p) => ({ x: p.x, z: p.z })),
                achievedAreaM2: permittedAreaM2,
                targetAreaM2: target,
                permittedAreaM2,
                insetM: 0,
                statement:
                    `${target.toFixed(0)} m² is the whole permitted buildable footprint `
                    + `(${permittedAreaM2.toFixed(0)} m²), so the proposed ground floor IS that footprint. `
                    + `This is a study of what fits, not a permit.`,
            };
        }

        // ── 5. Bisect the monotone erosion. ──
        // Bracket first: grow the upper bound until the area drops below the target (or the shape is
        // consumed). Doubling from 0.5 m reaches 512 m in ten steps, so this is bounded by
        // construction and needs no "is it converging" heuristic.
        let lo = 0;
        let hi = 0;
        let hiHit: { ring: Pt[]; areaM2: number } | null = null;
        let bracketed = false;
        for (let d = 0.5; d <= MAX_INSET_M; d *= 2) {
            const probe = erodeAndMeasure(ring, cls, d);
            if (probe === null || probe.areaM2 <= target) {
                hi = d;
                hiHit = probe;
                bracketed = true;
                break;
            }
            lo = d;
        }
        if (!bracketed) {
            span.setAttribute('pryzm.targetFootprint.refusal', 'unreachable-inset');
            return {
                ok: false,
                reason: 'unreachable-inset',
                targetAreaM2: target,
                permittedAreaM2,
                statement:
                    `PRYZM could not shrink the permitted footprint down to ${target.toFixed(0)} m² — the `
                    + `search ran past ${MAX_INSET_M} m of inset without reaching it. This is a shape `
                    + `problem, not a legal one: the permitted footprint is ${permittedAreaM2.toFixed(0)} m².`,
            };
        }

        // Invariant: area(lo) > target ≥ area(hi) (or hi is degenerate). Best = the tightest ring
        // found so far that is still ≥ the target, so a returned proposal is never SMALLER than
        // asked for by more than the tolerance — under-delivering silently is the same defect as
        // over-delivering silently, just quieter.
        let best: { ring: Pt[]; areaM2: number; d: number } | null =
            hiHit !== null && hiHit.areaM2 >= target - tol ? { ...hiHit, d: hi } : null;
        for (let i = 0; i < MAX_BISECTION_STEPS; i++) {
            const mid = (lo + hi) / 2;
            const probe = erodeAndMeasure(ring, cls, mid);
            if (probe === null) {
                hi = mid;
                continue;
            }
            if (Math.abs(probe.areaM2 - target) <= tol) {
                best = { ...probe, d: mid };
                break;
            }
            if (probe.areaM2 > target) {
                lo = mid;
                if (best === null || probe.areaM2 < best.areaM2) best = { ...probe, d: mid };
            } else {
                hi = mid;
            }
            if (hi - lo < 1e-4) break;
        }

        if (best === null) {
            span.setAttribute('pryzm.targetFootprint.refusal', 'unreachable-inset');
            return {
                ok: false,
                reason: 'unreachable-inset',
                targetAreaM2: target,
                permittedAreaM2,
                statement:
                    `PRYZM could not find a shape of about ${target.toFixed(0)} m² inside the permitted `
                    + `footprint: every inset it tried either overshot or collapsed the outline. This `
                    + `happens on very narrow or heavily notched plots. The permitted footprint is `
                    + `${permittedAreaM2.toFixed(0)} m².`,
            };
        }

        span.setAttribute('pryzm.targetFootprint.insetM', best.d);
        span.setAttribute('pryzm.targetFootprint.achievedM2', best.areaM2);
        const off = best.areaM2 - target;
        // ⚠ THE ACHIEVED NUMBER LEADS. Echoing the request back as though it had been met is the
        // small lie that makes every later number wrong.
        const fit = Math.abs(off) <= tol
            ? `about the ${target.toFixed(0)} m² you asked for`
            : `${best.areaM2.toFixed(0)} m² — the closest this outline gets to ${target.toFixed(0)} m²`;
        return {
            ok: true,
            ring: best.ring,
            achievedAreaM2: best.areaM2,
            targetAreaM2: target,
            permittedAreaM2,
            insetM: best.d,
            statement:
                `Proposed ground floor: ${fit}, set in ${best.d.toFixed(2)} m from the permitted `
                + `buildable footprint (${permittedAreaM2.toFixed(0)} m²). This is a STUDY of what fits — `
                + `it is not a permit, and PRYZM has not checked it against anything except the footprint.`,
        };
    } finally {
        span.end();
    }
}
