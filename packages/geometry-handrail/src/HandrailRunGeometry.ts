// HandrailRunGeometry — §HANDRAIL-WALL-PARITY (ADR-0332).
//
// The single source of truth for what a handrail RUN is: where its centreline
// goes (straight or arced), which stations its repeated members sit at, and
// which rakes it may hold. PURE module: no THREE, no DOM, no store reads — so
// it is safe to import from stores, commands, tools, builders and tests alike.
//
// ─── WHY THIS FILE EXISTS RATHER THAN MORE CODE IN THE BUILDER ────────────────
//
// `HandrailFragmentBuilder` is a THREE module. Every geometric DECISION it made
// was therefore untestable without a scene, and — measured 2026-08-18 — there
// was no test anywhere asserting that any `HandrailData` field affects the
// emitted mesh. Moving the decisions here makes them assertable as numbers.
//
// ─── WHAT IS REUSED, AND WHY THAT MATTERS ─────────────────────────────────────
//
// The arc maths is `WallArcParam`'s, NOT a copy of it. That module's
// `ArcHostWall` is declared STRUCTURALLY:
//
//     { baseLine: readonly [ArcPointXZ, ArcPointXZ]; curve?: {control, segments} | null }
//
// A `HandrailData` carrying a `curve` of the same shape satisfies it as-is, so
// `wallCentreline` / `arcFrameAt` / `arcLengthAtPointXZ` serve a handrail with
// ZERO new geometry bodies. This is deliberate compliance with C73 and with
// `check-predicate-canonical` (138/138): a second quadratic-Bézier
// parameterisation would be a duplicate body and would breach it.
//
// The rake TRIGONOMETRY is `WallRake`'s, imported, not restated — same sign
// convention, same authorable range, same "absent means 90° vertical" rule, so
// a raked handrail and a raked wall lean the same way by construction.
//
// ─── WHAT IS *NOT* REUSED, AND WHY ────────────────────────────────────────────
//
// `WallRake.rakeAuthorability` is NOT called here, and this module does not
// modify it. That file's header records that it has exactly one home because
// copy-drift caused a real bug. The instruction there is that ONE SUBJECT HAS
// ONE GATE — not that every subject shares one function. A handrail's refusals
// are genuinely different from a wall's:
//
//   • a wall refuses rake × LAYERS (perpendicular layer thickness) — a handrail
//     has no layers;
//   • a wall refuses rake × HOSTED OPENINGS (C15's vertical carve) — a handrail
//     hosts nothing;
//   • a handrail must refuse rake × GLASS INFILL, which a wall has no concept of.
//
// A shared function would need a union of fields irrelevant to both and would
// answer questions about walls that no handrail can ask. So the POLICY lives
// here and the MATHS is imported. Exactly one gate still governs a handrail.

import {
    wallCentreline,
    arcFrameAt,
    type WallCentreline,
    type WallArcFrame,
} from '@pryzm/geometry-wall';
import {
    RAKE_MIN_DEG,
    RAKE_MAX_DEG,
    isVerticalRake,
    isRakeInRange,
    rakeShearPerMetre,
    resolveRakeDeg,
} from '@pryzm/geometry-wall';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Planar point. `y` is carried but every computation here is XZ. */
export interface HandrailPointXZ {
    x: number;
    y?: number;
    z: number;
}

/**
 * A handrail's arc descriptor. SAME SHAPE as `WallData.curve` (quadratic Bézier
 * control point + tessellation count), deliberately, so the two remain
 * substitutable rather than merely similar and `WallArcParam` accepts a handrail
 * without an adapter.
 */
export interface HandrailCurve {
    control: HandrailPointXZ;
    segments: number;
}

/** The subset of a handrail this module needs. Structural, so tests may pass literals. */
export interface HandrailRunSubject {
    readonly baseLine: readonly [HandrailPointXZ, HandrailPointXZ];
    readonly curve?: HandrailCurve | null;
    readonly rakeAngleDeg?: number;
    readonly fillType?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum tessellation, mirroring `WallDataSchema`'s `segments >= 4`. */
export const HANDRAIL_MIN_CURVE_SEGMENTS = 4;

/** Default tessellation when a curve omits `segments`. Mirrors `WallArcParam`. */
export const HANDRAIL_DEFAULT_CURVE_SEGMENTS = 16;

/** Re-exported so panels and commands quote ONE range, not a second copy of it. */
export { RAKE_MIN_DEG, RAKE_MAX_DEG };

// ─── Curve queries ────────────────────────────────────────────────────────────

/**
 * TRUE when this handrail must be treated as an arc.
 *
 * A curve descriptor with a non-finite control point is NOT a curve — it is
 * corrupt data, and treating it as straight is the safe reading (the rail still
 * renders, on the chord). Every branch in the builder asks THIS, never
 * `!!handrail.curve`, so there is one answer.
 */
export function isCurvedHandrail(subject: HandrailRunSubject | null | undefined): boolean {
    const c = subject?.curve?.control;
    if (!c) return false;
    return Number.isFinite(c.x) && Number.isFinite(c.z);
}

/**
 * Normalise a curve's tessellation to the honoured value. Exposed so the builder
 * and the tests agree on the station count without either re-deriving it.
 */
export function resolveCurveSegments(curve: HandrailCurve | null | undefined): number {
    const raw = curve?.segments;
    if (!Number.isFinite(raw as number)) return HANDRAIL_DEFAULT_CURVE_SEGMENTS;
    return Math.max(HANDRAIL_MIN_CURVE_SEGMENTS, Math.floor(raw as number));
}

/**
 * The handrail centreline, sampled to a polyline with cumulative arc lengths.
 *
 * Straight rail → the 2-point chord, so `length` is `Math.hypot(baseLine)` and
 * every downstream number is bit-identical to the pre-feature maths.
 */
export function handrailCentreline(subject: HandrailRunSubject): WallCentreline {
    if (!isCurvedHandrail(subject)) {
        return wallCentreline({ baseLine: [subject.baseLine[0], subject.baseLine[1]] });
    }
    return wallCentreline({
        baseLine: [subject.baseLine[0], subject.baseLine[1]],
        curve: {
            control: subject.curve!.control,
            segments: resolveCurveSegments(subject.curve),
        },
    });
}

/**
 * Total run length in metres — the ARC length for a curved rail, the chord
 * length for a straight one.
 *
 * THIS is the value every member-spacing computation must use in place of
 * `Math.hypot(baseLine)`. Measuring balusters along the chord of a curved rail
 * is what produces the visible defect: the last baluster falls short of the end
 * post by the arc-minus-chord difference.
 */
export function handrailRunLength(subject: HandrailRunSubject): number {
    return handrailCentreline(subject).length;
}

/** Local frame (position + tangent + normal) at arc length `s`. Clamped to the run. */
export function handrailFrameAt(
    subject: HandrailRunSubject,
    s: number,
    cl?: WallCentreline,
): WallArcFrame {
    const curve = isCurvedHandrail(subject)
        ? { control: subject.curve!.control, segments: resolveCurveSegments(subject.curve) }
        : undefined;
    return arcFrameAt({ baseLine: [subject.baseLine[0], subject.baseLine[1]], curve }, s, cl);
}

// ─── Member stations ──────────────────────────────────────────────────────────

/**
 * The arc lengths at which INTERMEDIATE repeated members (balusters, mid posts)
 * sit, for a run of `runLength` metres at `spacing` metres apart.
 *
 * ⚠ THE COUNT RULE IS PRESERVED EXACTLY AS THE BUILDER HAD IT:
 * `count = floor(runLength / spacing) - 1`, stations at `i * spacing` for
 * `i = 1..count`. This is deliberately NOT "improved" — the existing rule is
 * what every currently-saved project renders with, and changing the count would
 * silently alter every handrail in every existing project. The rule moved
 * house; it did not change.
 *
 * Returns `[]` for a non-positive spacing or a run shorter than one spacing,
 * which is the same no-members outcome the builder produced by falling through
 * its `if`.
 */
export function intermediateMemberStations(runLength: number, spacing: number): number[] {
    if (!Number.isFinite(runLength) || !Number.isFinite(spacing)) return [];
    if (!(spacing > 0) || !(runLength > spacing)) return [];
    const count = Math.floor(runLength / spacing) - 1;
    const out: number[] = [];
    for (let i = 1; i <= count; i++) out.push(i * spacing);
    return out;
}

/**
 * The effective baluster spacing, resolving the builder's fallback chain
 * (`balusterSpacing ?? postSpacing ?? 0.11`) in ONE place so the panel, the
 * command validator and the builder cannot disagree about what "unset" means.
 */
export function resolveBalusterSpacing(
    balusterSpacing: number | undefined,
    postSpacing: number | undefined,
): number {
    if (Number.isFinite(balusterSpacing as number)) return balusterSpacing as number;
    if (Number.isFinite(postSpacing as number)) return postSpacing as number;
    return 0.11;
}

// ─── Rake ─────────────────────────────────────────────────────────────────────

/**
 * Horizontal displacement of a member's TOP relative to its BASE, per metre of
 * height, as a signed multiplier on the run's LEFT normal.
 *
 * This is `WallRake.rakeShearPerMetre` — imported, not restated — so a handrail
 * and a wall at the same angle lean the same way and by the same amount. 0 at
 * exactly 90° (and for an absent rake), which is what keeps the vertical code
 * path byte-identical.
 */
export function handrailShearPerMetre(rakeAngleDeg: number | null | undefined): number {
    return rakeShearPerMetre(rakeAngleDeg);
}

/**
 * The lateral (LOCAL +Z, i.e. LEFT) offset of a point at height `y` on a raked
 * handrail. Zero for a vertical rail — callers take the untouched legacy path.
 */
export function handrailRakeOffsetAt(rakeAngleDeg: number | null | undefined, y: number): number {
    const k = rakeShearPerMetre(rakeAngleDeg);
    if (k === 0 || !Number.isFinite(y)) return 0;
    return y * k;
}

/**
 * The tilt of a RAKED vertical member, expressed for a renderer.
 *
 * A member that rises `height` and displaces `height·k` sideways is the same
 * member rotated about the run axis by `atan(k)` and lengthened by
 * `sqrt(1 + k²)`. Returning both keeps the member's TOP at exactly `height`
 * (a naive rotation alone would shorten it), which is what makes a raked
 * balustrade meet its raked top rail.
 */
export function rakedMemberTilt(
    rakeAngleDeg: number | null | undefined,
    height: number,
): { tiltRad: number; scaledLength: number; topOffset: number } {
    const k = rakeShearPerMetre(rakeAngleDeg);
    if (k === 0 || !Number.isFinite(height)) {
        return { tiltRad: 0, scaledLength: height, topOffset: 0 };
    }
    const stretch = Math.sqrt(1 + k * k);
    return { tiltRad: Math.atan(k), scaledLength: height * stretch, topOffset: height * k };
}

// ─── Authorability (C65 §3.9 — no affordance without an implementation) ───────

export type HandrailRakeCode = 'out-of-range' | 'curved' | 'glass-infill';

export interface HandrailRakeAuthorability {
    readonly ok: boolean;
    /** Machine-readable reason. `undefined` when `ok`. */
    readonly code?: HandrailRakeCode;
    /** Human-readable reason, for a store error or a disabled-control tooltip. */
    readonly reason?: string;
}

const RAKE_OK: HandrailRakeAuthorability = { ok: true };

/**
 * Decide whether `subject` may hold a non-vertical rake.
 *
 * A VERTICAL handrail is ALWAYS authorable — this function never rejects a rail
 * that has no rake — so it can be called unconditionally on every write, which
 * is what makes it impossible to reach a refused combination by reordering
 * operations. `CreateHandrailCommand.canExecute` and
 * `UpdateHandrailCommand.canExecute` both consult it.
 *
 * ⚠ Note the direction of the last two checks. It is not enough to refuse a
 * rake on a curved rail; the write that ADDS a curve, or that switches the fill
 * to glass, must be refused too when a rake is already present. Refusing only
 * one direction is precisely the defect `WallRake.ts`'s header records
 * ("the panel refused rake-given-openings, nothing refused openings-given-rake"),
 * so both commands pass the POST-UPDATE subject, not the payload.
 */
export function handrailRakeAuthorability(subject: HandrailRunSubject): HandrailRakeAuthorability {
    const deg = subject.rakeAngleDeg;
    if (deg === undefined || deg === null || isVerticalRake(deg)) return RAKE_OK;

    if (!isRakeInRange(deg)) {
        return {
            ok: false,
            code: 'out-of-range',
            reason:
                `handrail.rakeAngleDeg must be within [${RAKE_MIN_DEG}, ${RAKE_MAX_DEG}] degrees ` +
                `(90 = vertical); received ${deg}.`,
        };
    }
    if (isCurvedHandrail(subject)) {
        return {
            ok: false,
            code: 'curved',
            reason:
                'handrail.rakeAngleDeg is not supported on a CURVED handrail: the lean direction is ' +
                'the run\'s plan normal, which varies along an arc, so a single lean would be correct ' +
                'at exactly one station. Straighten the handrail, or leave the rake at 90.',
        };
    }
    if (subject.fillType === 'glass') {
        return {
            ok: false,
            code: 'glass-infill',
            reason:
                'handrail.rakeAngleDeg is not supported with GLASS infill: the glass is built as a ' +
                'single upright panel swept on the rail axis, and the sheared parallelogram a rake ' +
                'requires is not implemented. Use baluster, panel or open infill, or leave the rake at 90.',
        };
    }
    return RAKE_OK;
}

/**
 * TRUE when the handrail is vertical — absent rake, or indistinguishable from
 * 90°. The builder branches on this to take the EXACT pre-feature code path, so
 * a legacy handrail is byte-identical.
 */
export function isVerticalHandrail(subject: HandrailRunSubject): boolean {
    return isVerticalRake(subject.rakeAngleDeg);
}

/** Resolve a possibly-absent rake to a concrete angle (absent ⇒ 90). */
export function resolveHandrailRakeDeg(rakeAngleDeg: number | null | undefined): number {
    return resolveRakeDeg(rakeAngleDeg);
}
