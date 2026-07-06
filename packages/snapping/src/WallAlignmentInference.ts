/**
 * WallAlignmentInference — pure plan-view wall alignment / inference snap.
 *
 * §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135, founder 2026-07-06)
 *
 * Brings the 3D wall tool's Revit-style alignment inference guides — implemented
 * for the 3D `WallTool` by `packages/geometry-wall/src/WallAlignmentGuide.ts`
 * (§04-15 + §FIX-ALIGN-GUIDE-PERPENDICULAR, L-26) — to the 2D plan wall tool,
 * which previously had no inference at all.
 *
 * This module is the PURE, THREE-free mirror of that inference maths:
 *
 *   - AXIS ALIGNMENT — for each existing wall endpoint / midpoint the cursor may
 *     align on the world-X axis (constant z, horizontal guide) or the world-Z
 *     axis (constant x, vertical guide). When the cursor falls within the soft
 *     tolerance of an axis the placed point snaps to it and a dashed guide is
 *     drawn from the reference through the snapped point.
 *   - PERPENDICULAR PREFERENCE — a guide colinear with the current draw direction
 *     merely extends the line the user is already dragging (conveys nothing), so
 *     it is suppressed in favour of the PERPENDICULAR (cross-axis) guide — the
 *     founder's core ask. Mirrors WallAlignmentGuide.guideAxisPreference.
 *   - ENDPOINT / MIDPOINT SNAP — landing directly on an existing reference point
 *     snaps exactly to it.
 *   - COLLINEAR / EXTENSION — the cursor near the infinite line through an
 *     existing wall (beyond its ends) snaps onto that line, extending the wall.
 *
 * PURE: no DOM, no THREE, no canvas — plain 2D {x,z} maths (plan frame, metres)
 * so it is fully unit-testable without a browser or a THREE.Scene. The render
 * layer (WallPlanToolHandler) converts the returned guides to screen space and
 * draws them; the snapped point is committed through the existing wall-creation
 * command (P6). Distances are in metres so the caller supplies a zoom-aware
 * tolerance (pixel budget ÷ pixels-per-unit).
 *
 * NOTE (fence / consolidation): the 3D tool keeps its own scene-coupled
 * `WallAlignmentGuide` renderer. Ideally that class's inference maths would be
 * refactored to consume THIS shared pure helper so both tools share one source
 * of truth — but `packages/geometry-wall` is out of the L-135 fence (owned by
 * L-130). That consolidation is a follow-up cross-fence refactor; this module is
 * a faithful mirror, not an independent fork, precisely so it can absorb the 3D
 * path later without behavioural drift.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('@pryzm/snapping.wall-alignment-inference', '0.1.0');

/** A 2D point (plan frame, metres). */
export interface AlignPtXZ {
    readonly x: number;
    readonly z: number;
}

/** The kind of feature a reference point came from. */
export type AlignReferenceKind = 'endpoint' | 'midpoint';

/** An existing wall feature point the cursor may align to. */
export interface AlignReference extends AlignPtXZ {
    readonly kind: AlignReferenceKind;
}

/** An existing wall baseline segment (for collinear / extension inference). */
export interface AlignSegment {
    readonly a: AlignPtXZ;
    readonly b: AlignPtXZ;
}

/** What a rendered dashed guide line represents. */
export type AlignGuideKind = 'perpendicular' | 'alignment' | 'extension';

/** A dashed inference guide the render layer should draw. */
export interface AlignGuide {
    /** Reference end (an existing wall feature). */
    readonly from: AlignPtXZ;
    /** Snapped end, slightly overshot past the cursor for visibility. */
    readonly to: AlignPtXZ;
    readonly kind: AlignGuideKind;
    /** True for the double-lock (both axes matched) — rendered in a distinct colour. */
    readonly isIntersection: boolean;
}

/** The dominant inference that produced the snap (drives the label). */
export type AlignPrimaryKind =
    | 'endpoint'
    | 'midpoint'
    | 'perpendicular'
    | 'intersection'
    | 'extension';

export interface WallAlignmentInferenceResult {
    /** The snapped 2nd point the tool should place / preview. */
    readonly snapped: AlignPtXZ;
    /** Dashed guides to render (may be empty for a pure endpoint snap). */
    readonly guides: readonly AlignGuide[];
    readonly primaryKind: AlignPrimaryKind;
    /** Short human label for a snap chip ("Perpendicular" / "Endpoint" / …). */
    readonly label: string;
    /** True when the snap is a double-axis lock (an intersection). */
    readonly isIntersection: boolean;
}

export interface WallAlignmentOptions {
    /** Soft-snap tolerance for axis alignment + extension (metres). Default 0.15. */
    readonly axisThresholdM?: number;
    /** Direct endpoint / midpoint snap tolerance (metres). Default = axisThresholdM. */
    readonly pointThresholdM?: number;
    /** Exclude references within this distance of `start` (metres). Default 0.05. */
    readonly excludeEpsilonM?: number;
    /** Guide overshoot past the snapped point (metres). Default 0.35. */
    readonly overshootM?: number;
    /** Minimum draw length before perpendicular-preference kicks in (metres). Default 0.02. */
    readonly minDrawLenM?: number;
}

const DEFAULT_AXIS_THRESHOLD_M = 0.15;
const DEFAULT_EXCLUDE_EPS_M = 0.05;
const DEFAULT_OVERSHOOT_M = 0.35;
const DEFAULT_MIN_DRAW_LEN_M = 0.02;
/**
 * Draw-direction dominance ratio beyond which a world axis is "dominant" so the
 * colinear guide on that axis is suppressed. tan(67.5°) ≈ 2.414 → axes within
 * ±22.5° of a world axis are dominant; the ±22.5° cone around 45° keeps both.
 * Mirrors WallAlignmentGuide.AXIS_DOMINANCE_RATIO.
 */
const AXIS_DOMINANCE_RATIO = 2.414;

const isFinitePt = (p: AlignPtXZ | null | undefined): p is AlignPtXZ =>
    !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

const dist2D = (a: AlignPtXZ, b: AlignPtXZ): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Extend `to` past itself, away from `from`, by `overshoot` metres. */
function extendPoint(from: AlignPtXZ, to: AlignPtXZ, overshoot: number): AlignPtXZ {
    const d = dist2D(from, to);
    if (d < 1e-8) return { x: to.x, z: to.z };
    const ux = (to.x - from.x) / d;
    const uz = (to.z - from.z) / d;
    return { x: to.x + ux * overshoot, z: to.z + uz * overshoot };
}

interface GuideAxisPreference {
    suppressX: boolean;
    suppressZ: boolean;
}

/**
 * Pure axis-selection policy (mirror of WallAlignmentGuide.guideAxisPreference).
 * Given the horizontal draw direction, decide which inference-guide axes are
 * colinear with the draw and should be suppressed so the PERPENDICULAR axis wins.
 * Kept internal (not exported) — exercised via computeWallAlignmentInference.
 */
function guideAxisPreference(dx: number, dz: number, minDrawLenM: number): GuideAxisPreference {
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    if (Math.hypot(adx, adz) < minDrawLenM) return { suppressX: false, suppressZ: false };
    // Draw runs clearly along world-X → horizontal 'X' guide is colinear → suppress it.
    if (adx >= adz * AXIS_DOMINANCE_RATIO) return { suppressX: true, suppressZ: false };
    // Draw runs clearly along world-Z → vertical 'Z' guide is colinear → suppress it.
    if (adz >= adx * AXIS_DOMINANCE_RATIO) return { suppressX: false, suppressZ: true };
    // Diagonal / neutral zone — keep both.
    return { suppressX: false, suppressZ: false };
}

/** Nearest existing reference point within `pointThreshold` of the cursor, or null. */
function nearestReference(
    cursor: AlignPtXZ,
    refs: readonly AlignReference[],
    pointThreshold: number,
): AlignReference | null {
    let best: AlignReference | null = null;
    let bestDist = pointThreshold;
    for (const r of refs) {
        const d = dist2D(cursor, r);
        if (d <= bestDist) {
            best = r;
            bestDist = d;
        }
    }
    return best;
}

/** Collinear / extension of an existing wall's infinite line (beyond its ends). */
function extensionCandidate(
    cursor: AlignPtXZ,
    segments: readonly AlignSegment[],
    threshold: number,
    overshoot: number,
): WallAlignmentInferenceResult | null {
    let best: WallAlignmentInferenceResult | null = null;
    let bestDist = threshold;
    for (const seg of segments) {
        if (!isFinitePt(seg?.a) || !isFinitePt(seg?.b)) continue;
        const dx = seg.b.x - seg.a.x;
        const dz = seg.b.z - seg.a.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 1e-8) continue;
        // Parametric projection of the cursor onto the infinite line.
        const t = ((cursor.x - seg.a.x) * dx + (cursor.z - seg.a.z) * dz) / lenSq;
        // Only the EXTENSION beyond the wall ends is novel value — the on-segment
        // body is already served by centreline / edge snap elsewhere.
        if (t > 0 && t < 1) continue;
        const projX = seg.a.x + t * dx;
        const projZ = seg.a.z + t * dz;
        const perpDist = Math.hypot(cursor.x - projX, cursor.z - projZ);
        if (perpDist > bestDist) continue;
        bestDist = perpDist;
        const snapped: AlignPtXZ = { x: projX, z: projZ };
        const anchor: AlignPtXZ = t < 0 ? { x: seg.a.x, z: seg.a.z } : { x: seg.b.x, z: seg.b.z };
        best = {
            snapped,
            guides: [{
                from: anchor,
                to: extendPoint(anchor, snapped, overshoot),
                kind: 'extension',
                isIntersection: false,
            }],
            primaryKind: 'extension',
            label: 'Extension',
            isIntersection: false,
        };
    }
    return best;
}

/**
 * Compute the plan-view wall alignment inference for the placed 2nd point.
 *
 * Priority (strongest first):
 *   1. ENDPOINT / MIDPOINT — cursor within `pointThresholdM` of a reference point.
 *   2. AXIS ALIGNMENT — perpendicular / double-lock inference (perpendicular
 *      preference applied against the draw direction start → cursor).
 *   3. COLLINEAR / EXTENSION — cursor near the extension of an existing wall.
 *
 * Returns `null` when no candidate is within tolerance (the caller then uses the
 * raw cursor — the flag-OFF / no-inference behaviour). `start` may be null before
 * the 2nd point (no perpendicular preference is then applied).
 *
 * P8: emits `pryzm.wall.plan_align_inference`.
 */
export function computeWallAlignmentInference(
    start: AlignPtXZ | null,
    cursor: AlignPtXZ,
    references: readonly AlignReference[],
    segments: readonly AlignSegment[],
    opts: WallAlignmentOptions = {},
): WallAlignmentInferenceResult | null {
    return _tracer.startActiveSpan('pryzm.wall.plan_align_inference', (span) => {
        try {
            if (!isFinitePt(cursor)) {
                span.setAttribute('pryzm.wall.align_hit', false);
                return null;
            }
            const axisT = opts.axisThresholdM ?? DEFAULT_AXIS_THRESHOLD_M;
            const pointT = opts.pointThresholdM ?? axisT;
            const excludeEps = opts.excludeEpsilonM ?? DEFAULT_EXCLUDE_EPS_M;
            const overshoot = opts.overshootM ?? DEFAULT_OVERSHOOT_M;
            const minDrawLen = opts.minDrawLenM ?? DEFAULT_MIN_DRAW_LEN_M;

            // Exclude references coincident with the start anchor (no self-snap).
            const refs = references.filter(
                (r): r is AlignReference =>
                    isFinitePt(r) && (!start || dist2D(r, start) > excludeEps),
            );

            // ── Priority 1: direct endpoint / midpoint snap ─────────────────────
            const nearRef = nearestReference(cursor, refs, pointT);
            if (nearRef) {
                span.setAttribute('pryzm.wall.align_hit', true);
                span.setAttribute('pryzm.wall.align_kind', nearRef.kind);
                return {
                    snapped: { x: nearRef.x, z: nearRef.z },
                    guides: [],
                    primaryKind: nearRef.kind,
                    label: nearRef.kind === 'midpoint' ? 'Midpoint' : 'Endpoint',
                    isIntersection: false,
                };
            }

            // ── Priority 2: axis alignment (mirror of WallAlignmentGuide.update) ─
            // xMatches → horizontal guide (constant z); zMatches → vertical guide (constant x).
            let xMatches = refs.filter((r) => Math.abs(cursor.z - r.z) < axisT);
            let zMatches = refs.filter((r) => Math.abs(cursor.x - r.x) < axisT);

            if (start) {
                const pref = guideAxisPreference(cursor.x - start.x, cursor.z - start.z, minDrawLen);
                if (pref.suppressX) xMatches = [];
                if (pref.suppressZ) zMatches = [];
            }

            if (xMatches.length > 0 || zMatches.length > 0) {
                // Nearest reference per axis.
                xMatches = xMatches.slice().sort((a, b) => Math.abs(cursor.z - a.z) - Math.abs(cursor.z - b.z));
                zMatches = zMatches.slice().sort((a, b) => Math.abs(cursor.x - a.x) - Math.abs(cursor.x - b.x));

                const hasX = xMatches.length > 0;
                const hasZ = zMatches.length > 0;
                const snappedX = hasZ ? zMatches[0]!.x : cursor.x;
                const snappedZ = hasX ? xMatches[0]!.z : cursor.z;
                const snapped: AlignPtXZ = { x: snappedX, z: snappedZ };
                const isIntersection = hasX && hasZ;

                const guides: AlignGuide[] = [];
                const pushGuide = (ref: AlignReference): void => {
                    const from: AlignPtXZ = { x: ref.x, z: ref.z };
                    if (dist2D(from, snapped) > 0.005) {
                        guides.push({
                            from,
                            to: extendPoint(from, snapped, overshoot),
                            kind: isIntersection ? 'alignment' : 'perpendicular',
                            isIntersection,
                        });
                    }
                };
                if (hasX) pushGuide(xMatches[0]!);
                if (hasZ) pushGuide(zMatches[0]!);

                if (guides.length > 0) {
                    const primaryKind: AlignPrimaryKind = isIntersection ? 'intersection' : 'perpendicular';
                    const label = isIntersection ? 'Align' : 'Perpendicular';
                    span.setAttribute('pryzm.wall.align_hit', true);
                    span.setAttribute('pryzm.wall.align_kind', primaryKind);
                    return { snapped, guides, primaryKind, label, isIntersection };
                }
            }

            // ── Priority 3: collinear / extension of an existing wall ───────────
            const ext = extensionCandidate(cursor, segments, axisT, overshoot);
            if (ext) {
                span.setAttribute('pryzm.wall.align_hit', true);
                span.setAttribute('pryzm.wall.align_kind', 'extension');
                return ext;
            }

            span.setAttribute('pryzm.wall.align_hit', false);
            return null;
        } finally {
            span.end();
        }
    });
}
