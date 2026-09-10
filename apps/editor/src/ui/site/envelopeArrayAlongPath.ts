// §ARRAY-ALONG-PATH (ADR-0386, lane ARRAY-ALONG-PATH, 2026-09-10) — ONE PROTOTYPE RING + ONE SPINE
// + ONE SPACING → N RINGS. NOTHING ELSE.
//
// ADR-0386 D1–D7 · ADR-0383 D2 / D4 · C114 §6a / §12 · C58 §1.19 · C16 CA-18 · C73 · P6.
//
// THE FOUNDER'S ASK, verbatim (2026-09-10):
//   *"we need to enable not only an option to create envelope BUT to create envelopes following a
//    LINE. The user first defines the first envelope, then as it would be a wall tool (with all the
//    wall modes — straight, ortho, curved etc.) creates a line starting from the CENTRE of the first
//    envelope and ending wherever it wants. Then define the FREQUENCY — and the tool creates
//    footprints following the first envelope alongside — every, let's say, 10 metres. Like that you
//    can easily create all perimeter envelopes as independent building IFC units. Then select the
//    levels — e.g. 3 — and then apply, and all envelopes will create at once."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ WHAT THIS MODULE IS, STATED FIRST BECAUSE IT IS THE WHOLE RISK OF THE LANE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is a **PROFILE GENERATOR**. It is NOT a create path, and it must never become one.
//
// Everything downstream of *"here are N footprints"* already shipped and is proven end-to-end:
//   · `drawnEnvelopeFootprintState`   — the transient PROFILE ROSTER this generator's output is
//                                       appended to (ADR-0383 S5). Session-only, never persisted.
//   · `masterPlanSection`             — renders the roster, takes the storey count, owns the ONE
//                                       **Create all blocks** button.
//   · `masterPlanAuthoringPlan`       — N profiles → ONE `spaceEnvelope.batch.create` → ONE Ctrl+Z,
//                                       with per-profile refusals and the measured same-storey
//                                       overlap advisory.
//   · ADR-0383 `SpaceEnvelope.group` + ADR-0385 — each profile becomes its own massing group and
//                                       is projected into `hierarchyStore` as a distinct
//                                       **IfcBuilding**. That IS the founder's *"independent
//                                       building IFC units"*, and it was already working.
//
// ⛔ SO THIS FILE HOLDS: ZERO command dispatches, ZERO store writes, ZERO id mints, ZERO storey
// logic, ZERO ordinance logic, ZERO overlap logic, ZERO undo story. A second batch-create beside
// `masterPlanAuthoringPlan` is the one forbidden outcome of this lane —
// [[same-rule-two-implementations]] has recurred eight times in this repository and the fix always
// lands in the copy nobody is looking at.
//
// ⭐ AND IT DOES NOT RE-DERIVE THE OVERLAP ADVISORY EITHER (ADR-0386 D5). A copy that lands on top
// of its neighbour, or off the parcel, is an ADVISORY WITH BOTH NUMBERS and never a refusal
// (ADR-0383 D4 · C114 §12) — and the module that measures it, through the kernel's oracle-pinned
// `intersectPolygons2D`, is `findMassingGroupOverlaps`, reached by `buildMasterPlanAuthoringPlan`
// the moment these copies are in the roster. Measuring it a second time here would be two answers
// to one question, and the panel would have to choose between them.
//
// PURE. No DOM, no THREE, no Cesium, no bus, no store, no module-level state. Everything it
// returns is a value the caller may render, discard, or hand to the roster.

import { trace } from '@opentelemetry/api';
import { ringCentroid } from '@pryzm/geometry-space-envelope';

const _tracer = trace.getTracer('pryzm.site.envelopeArrayAlongPath');

/** A point in project-frame scene-XZ metres — the SAME frame as `SceneXZPoint` and the parcel ring. */
export interface ArrayPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * ⭐ ADR-0386 D2 — HOW A COPY IS ORIENTED, AND WHY IT IS A CHOICE RATHER THAN A DEFAULT NOBODY SEES.
 *
 * `tangent`   — every copy is rotated so it meets the spine at the same angle the prototype does.
 *               This is the DEFAULT: *"all perimeter envelopes"* along a curving street is the
 *               reading the founder's sentence carries, and a terrace of blocks that all face the
 *               original bearing while the street bends is not a thing anyone draws on purpose.
 * `prototype` — every copy keeps the prototype's own bearing. Correct for a rank of blocks on a
 *               shared orientation (solar, a grid master plan) where the spine is only a ruler.
 *
 * ⛔ ON A STRAIGHT SPINE THE TWO ARE THE SAME VALUE, BY CONSTRUCTION — the rotation is measured
 * RELATIVE TO THE SPINE'S FIRST HEADING, so a straight path yields rotation 0 in both. That is what
 * lets the surface disclose the choice only when the ambiguity is REAL (`pathCurves`), which is the
 * shape §WHOSE-FOOTPRINT-IS-THE-SLAB already proved: a control offered when there is nothing to
 * choose teaches the user the two options differ when they do not.
 */
export type EnvelopeArrayOrientation = 'tangent' | 'prototype';

export const ENVELOPE_ARRAY_ORIENTATIONS: readonly EnvelopeArrayOrientation[] =
    Object.freeze(['tangent', 'prototype']);

export function isEnvelopeArrayOrientation(v: unknown): v is EnvelopeArrayOrientation {
    return v === 'tangent' || v === 'prototype';
}

/**
 * The smallest spacing that is a NUMBER rather than a degeneracy.
 *
 * ⛔ IT IS NOT A DESIGN OPINION AND MUST NOT BECOME ONE. "These blocks are 20 m wide so 4 m apart
 * is wrong" is an OVERLAP, and an overlap is an advisory carrying both numbers (D5) — never a
 * refusal, never a silently clamped number. This floor exists only because a spacing at or below
 * it turns a finite spine into an unbounded count, and it is stated in the refusal it produces.
 */
export const ENVELOPE_ARRAY_MIN_SPACING_M = 0.1;

/** Above this heading swing, the spine genuinely bends and the orientation choice is real. */
export const ENVELOPE_ARRAY_STRAIGHT_TOL_DEG = 1;

/** Consecutive spine vertices closer than this are one vertex — the gesture's own collapse rule. */
const EPS_M = 1e-3;

export interface EnvelopeArrayInput {
    /** The FIRST envelope's perimeter — profile #1, the thing being repeated. */
    readonly prototypeRing: readonly ArrayPoint[] | null | undefined;
    /**
     * That ring's area, m², from the SAME producer that supplied the ring.
     * ⛔ NOT RECOMPUTED HERE, and not recomputed for the copies either — see `EnvelopeArrayCopy`.
     */
    readonly prototypeAreaM2: number | null;
    /** The spine, project-frame scene-XZ metres, oldest vertex first. Open polyline, never a ring. */
    readonly path: readonly ArrayPoint[] | null | undefined;
    /** Straight off a text field, so `unknown` on purpose — CLASSIFIED here, never trusted. */
    readonly requestedSpacingM: unknown;
    readonly orientation: EnvelopeArrayOrientation;
    /**
     * How many copies the caller can actually accept — in production
     * `DRAWN_ENVELOPE_MAX_PROFILES − (roster length)`. ⛔ Supplied rather than assumed: this module
     * does not know what else is in the roster, and a generator that guessed the ceiling would
     * produce a plan the roster then silently truncated.
     */
    readonly maxCopies: number;
}

export type EnvelopeArrayRefusalReason =
    | 'no-prototype'
    | 'degenerate-prototype'
    | 'no-prototype-area'
    | 'no-path'
    | 'degenerate-path'
    | 'spacing-not-a-number'
    | 'spacing-not-positive'
    | 'spacing-below-floor'
    | 'spacing-exceeds-path'
    | 'no-room-for-copies';

export interface EnvelopeArrayRefusal {
    readonly ok: false;
    readonly reason: EnvelopeArrayRefusalReason;
    /** ⛔ Names BOTH numbers and the route back (C16 CA-18). One refusal, one wording. */
    readonly statement: string;
}

/** ONE generated footprint. The prototype is copy 0 and is NEVER one of these (D3). */
export interface EnvelopeArrayCopy {
    /** 1-based along the spine. Copy 1 sits one spacing from the anchor. */
    readonly index: number;
    readonly ring: readonly ArrayPoint[];
    /**
     * ⭐ THE PROTOTYPE'S AREA, CARRIED VERBATIM — never recomputed for the copy.
     *
     * A rotation about the centroid followed by a translation is RIGID: the area is the same
     * number. Re-running the shoelace over the transformed ring would return the same figure to
     * within float noise, and it is exactly that noise that produces a roster where Profile 1 reads
     * `842.0 m²` and its own copy reads `841.9 m²`. C84 EI-9 — one producer, one figure.
     */
    readonly areaM2: number;
    /** Arc length from the spine's first vertex, metres. `index × spacingM` by construction. */
    readonly arcPositionM: number;
    /** Where this copy's ring centre landed. */
    readonly centre: ArrayPoint;
    /** The spine's heading at `arcPositionM`, radians, atan2(dz, dx). */
    readonly headingRad: number;
    /** What was applied to the prototype ring. Exactly 0 in `prototype` orientation. */
    readonly rotationRad: number;
}

export interface EnvelopeArrayPlan {
    readonly ok: true;
    readonly copies: readonly EnvelopeArrayCopy[];
    /** The CLASSIFIED spacing, metres — what was actually used, never the raw field value. */
    readonly spacingM: number;
    readonly orientation: EnvelopeArrayOrientation;
    readonly pathLengthM: number;
    /**
     * ⭐ D4 — the arc left after the last copy. A remainder shorter than the spacing does NOT get a
     * squeezed copy: the frequency the user asked for is the frequency they get, and the leftover
     * is REPORTED so they can lengthen the spine or change the number.
     */
    readonly leftoverM: number;
    /** Copies that fit on the spine but exceeded `maxCopies`. Both numbers reach the surface. */
    readonly truncatedBy: number;
    /** True when the spine bends by more than `ENVELOPE_ARRAY_STRAIGHT_TOL_DEG`. Drives D2. */
    readonly pathCurves: boolean;
    readonly maxHeadingSwingDeg: number;
    /**
     * How far the spine's first vertex is from the prototype's centre, metres.
     *
     * ⚠ ZERO IN PRODUCTION, BY CONSTRUCTION AND NOT BY LUCK — the array gesture SEEDS the spine's
     * first vertex with the prototype centre (D3), so *"the line starts from the CENTRE of the
     * first envelope"* is a property of the gesture rather than an instruction the user can miss.
     * It is measured and carried anyway, because Backspace can pop that seeded vertex and a user
     * who did that deserves the number rather than a silently re-anchored array.
     */
    readonly anchorOffsetM: number;
    /** The prototype's centre — copy 0's position, and the arc origin. */
    readonly anchorCentre: ArrayPoint;
    readonly statement: string;
}

export type EnvelopeArrayResult = EnvelopeArrayPlan | EnvelopeArrayRefusal;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

const refuse = (reason: EnvelopeArrayRefusalReason, statement: string): EnvelopeArrayRefusal =>
    Object.freeze({ ok: false as const, reason, statement });

const fmt = (n: number, dp = 1): string => n.toFixed(dp).replace(/\.0+$/, '');

/** Consecutive-coincident collapse — the SAME rule the draw gesture applies, and for the reason. */
function collapseConsecutive(pts: readonly ArrayPoint[]): ArrayPoint[] {
    const out: ArrayPoint[] = [];
    for (const p of pts) {
        if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) continue;
        const prev = out[out.length - 1];
        if (prev && Math.abs(prev.x - p.x) < EPS_M && Math.abs(prev.z - p.z) < EPS_M) continue;
        out.push({ x: p.x, z: p.z });
    }
    return out;
}

/** Normalise an angle difference into (−π, π]. */
function wrapPi(a: number): number {
    let v = a;
    while (v > Math.PI) v -= 2 * Math.PI;
    while (v <= -Math.PI) v += 2 * Math.PI;
    return v;
}

interface Segment {
    readonly a: ArrayPoint;
    readonly b: ArrayPoint;
    readonly lengthM: number;
    /** Arc length at `a`. */
    readonly startM: number;
    readonly headingRad: number;
}

function buildSegments(path: readonly ArrayPoint[]): Segment[] {
    const segs: Segment[] = [];
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < EPS_M) continue;
        segs.push({ a, b, lengthM: len, startM: acc, headingRad: Math.atan2(dz, dx) });
        acc += len;
    }
    return segs;
}

/**
 * The point and heading at arc length `s`. `s` is clamped into `[0, total]` by the caller — this
 * never extrapolates, because a copy beyond the end of the spine is a copy the user did not draw a
 * place for.
 */
function sampleAt(segs: readonly Segment[], s: number): { p: ArrayPoint; headingRad: number } {
    const last = segs[segs.length - 1]!;
    for (const seg of segs) {
        const local = s - seg.startM;
        if (local <= seg.lengthM + EPS_M) {
            const t = Math.max(0, Math.min(1, local / seg.lengthM));
            return {
                p: { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t },
                headingRad: seg.headingRad,
            };
        }
    }
    return { p: { x: last.b.x, z: last.b.z }, headingRad: last.headingRad };
}

/** Rotate `ring` about `pivot` by `rad`, then move its pivot onto `to`. Rigid — area is preserved. */
function placeRing(
    ring: readonly ArrayPoint[],
    pivot: ArrayPoint,
    rad: number,
    to: ArrayPoint,
): ArrayPoint[] {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return ring.map((p) => {
        const dx = p.x - pivot.x;
        const dz = p.z - pivot.z;
        return Object.freeze({
            x: to.x + dx * c - dz * s,
            z: to.z + dx * s + dz * c,
        });
    });
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE ENTRY POINT
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ONE prototype + ONE spine + ONE spacing → N rings, or a refusal that names both numbers.
 *
 * P8: `pryzm.site.buildEnvelopeArrayAlongPath`.
 */
export function buildEnvelopeArrayAlongPath(input: EnvelopeArrayInput): EnvelopeArrayResult {
    const span = _tracer.startSpan('pryzm.site.buildEnvelopeArrayAlongPath');
    try {
        // ── the prototype ────────────────────────────────────────────────────────────────────
        const rawRing = Array.isArray(input.prototypeRing) ? input.prototypeRing : null;
        if (rawRing === null || rawRing.length === 0) {
            span.setAttribute('pryzm.envelopeArray.refused', 'no-prototype');
            return refuse('no-prototype',
                'There is no first envelope to repeat. Draw one profile\'s perimeter on the 2D Site '
                + 'Map or the 3D Site first — the array copies THAT ring along the spine, so it '
                + 'cannot start without it.');
        }
        const prototype = collapseConsecutive(rawRing);
        if (prototype.length < 3) {
            span.setAttribute('pryzm.envelopeArray.refused', 'degenerate-prototype');
            return refuse('degenerate-prototype',
                `The first envelope has ${prototype.length} distinct corner`
                + `${prototype.length === 1 ? '' : 's'}, and a perimeter needs at least 3. Nothing `
                + 'was generated — redraw that profile and try the array again.');
        }
        const areaM2 = input.prototypeAreaM2;
        if (typeof areaM2 !== 'number' || !Number.isFinite(areaM2) || areaM2 <= 0) {
            // ⛔ NOT recomputed here as a "fix". §CONTEXT-DATA-HONESTY: the producer could not state
            // an area, and inventing one would put a figure on the roster that nothing measured.
            span.setAttribute('pryzm.envelopeArray.refused', 'no-prototype-area');
            return refuse('no-prototype-area',
                'The first envelope\'s area was never stated by the gesture that drew it, and this '
                + 'tool copies that figure rather than computing a second one. Redraw the profile — '
                + 'nothing was generated.');
        }

        // ── the spine ────────────────────────────────────────────────────────────────────────
        const rawPath = Array.isArray(input.path) ? input.path : null;
        if (rawPath === null || rawPath.length === 0) {
            span.setAttribute('pryzm.envelopeArray.refused', 'no-path');
            return refuse('no-path',
                'No spine has been drawn. Press Draw the spine, then click along the line the '
                + 'blocks should follow — it starts at the first envelope\'s centre and ends '
                + 'wherever you finish.');
        }
        const path = collapseConsecutive(rawPath);
        const segs = buildSegments(path);
        if (segs.length === 0) {
            span.setAttribute('pryzm.envelopeArray.refused', 'degenerate-path');
            return refuse('degenerate-path',
                `The spine's ${rawPath.length} point${rawPath.length === 1 ? '' : 's'} are all on the `
                + 'same spot, so it has no length to array along. Draw it again with the end point '
                + 'away from the first envelope — nothing was generated.');
        }
        const pathLengthM = segs.reduce((t, s) => t + s.lengthM, 0);

        // ── the spacing, CLASSIFIED ──────────────────────────────────────────────────────────
        const raw = input.requestedSpacingM;
        const spacingM = typeof raw === 'number'
            ? raw
            : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN);
        if (!Number.isFinite(spacingM)) {
            span.setAttribute('pryzm.envelopeArray.refused', 'spacing-not-a-number');
            return refuse('spacing-not-a-number',
                'The spacing is not a number, so PRYZM cannot tell how often to place a block. '
                + 'Type a distance in metres — 10 places one every 10 m along the spine.');
        }
        if (spacingM <= 0) {
            span.setAttribute('pryzm.envelopeArray.refused', 'spacing-not-positive');
            return refuse('spacing-not-positive',
                `A spacing of ${fmt(spacingM)} m places every block on top of the first one. Type a `
                + 'distance greater than zero — nothing was generated.');
        }
        if (spacingM < ENVELOPE_ARRAY_MIN_SPACING_M) {
            span.setAttribute('pryzm.envelopeArray.refused', 'spacing-below-floor');
            return refuse('spacing-below-floor',
                `A spacing of ${fmt(spacingM, 3)} m is below the ${ENVELOPE_ARRAY_MIN_SPACING_M} m `
                + 'floor this tool can array at, which exists so a finite spine cannot ask for an '
                + 'unbounded number of blocks. It is NOT a judgement about how close your blocks '
                + 'may be — blocks that touch or overlap are reported as an advisory once they are '
                + 'in the roster, never refused.');
        }

        // ── ⭐ D1 — SPACING IS CENTRE-TO-CENTRE ARC LENGTH, MEASURED FROM THE PROTOTYPE'S CENTRE ─
        const anchorCentre = ringCentroid(prototype.map((p) => ({ x: p.x, y: 0, z: p.z })));
        const anchorOffsetM = Math.hypot(path[0]!.x - anchorCentre.x, path[0]!.z - anchorCentre.z);

        const fitCount = Math.floor((pathLengthM + EPS_M) / spacingM);
        if (fitCount < 1) {
            span.setAttribute('pryzm.envelopeArray.refused', 'spacing-exceeds-path');
            return refuse('spacing-exceeds-path',
                `The spine is ${fmt(pathLengthM)} m long and the spacing is ${fmt(spacingM)} m, so `
                + 'the first copy would land past the end of it and no block fits. Shorten the '
                + 'spacing or extend the spine — nothing was generated, and the first envelope is '
                + 'untouched.');
        }

        const room = Number.isFinite(input.maxCopies) ? Math.max(0, Math.floor(input.maxCopies)) : 0;
        if (room < 1) {
            span.setAttribute('pryzm.envelopeArray.refused', 'no-room-for-copies');
            return refuse('no-room-for-copies',
                `${fitCount} block${fitCount === 1 ? '' : 's'} fit on this spine, but the session `
                + 'roster has no room for another profile. Remove a profile you no longer want, or '
                + 'create the blocks you already have, then array again.');
        }
        const placed = Math.min(fitCount, room);
        const truncatedBy = fitCount - placed;

        // ── the heading swing, which decides whether D2's choice is disclosed ────────────────
        const heading0 = segs[0]!.headingRad;
        let maxSwing = 0;
        for (const s of segs) {
            const d = Math.abs(wrapPi(s.headingRad - heading0));
            if (d > maxSwing) maxSwing = d;
        }
        const maxHeadingSwingDeg = (maxSwing * 180) / Math.PI;
        const pathCurves = maxHeadingSwingDeg > ENVELOPE_ARRAY_STRAIGHT_TOL_DEG;

        // ── the copies ───────────────────────────────────────────────────────────────────────
        const copies: EnvelopeArrayCopy[] = [];
        for (let k = 1; k <= placed; k++) {
            const s = k * spacingM;
            const at = sampleAt(segs, Math.min(s, pathLengthM));
            const rotationRad = input.orientation === 'tangent'
                ? wrapPi(at.headingRad - heading0)
                : 0;
            copies.push(Object.freeze({
                index: k,
                ring: Object.freeze(placeRing(prototype, anchorCentre, rotationRad, at.p)),
                areaM2,
                arcPositionM: s,
                centre: Object.freeze({ x: at.p.x, z: at.p.z }),
                headingRad: at.headingRad,
                rotationRad,
            }));
        }

        const leftoverM = pathLengthM - placed * spacingM;

        // ── the sentence ─────────────────────────────────────────────────────────────────────
        const parts: string[] = [];
        parts.push(
            `${placed} more block${placed === 1 ? '' : 's'} at ${fmt(spacingM)} m centre to centre `
            + `along a ${fmt(pathLengthM)} m spine, ${placed + 1} in total with the first envelope.`,
        );
        if (truncatedBy > 0) {
            parts.push(
                `⚠ ${fitCount} would fit; the session roster has room for ${room}, so `
                + `${truncatedBy} `
                + `${truncatedBy === 1 ? 'was' : 'were'} not generated. Create what you have, or `
                + 'remove a profile, then array the rest.',
            );
        }
        if (leftoverM > EPS_M) {
            parts.push(
                `${fmt(leftoverM)} m of spine is left over after the last block — no squeezed copy `
                + 'is placed there, because the frequency you asked for is the frequency you get.',
            );
        }
        parts.push(pathCurves
            ? (input.orientation === 'tangent'
                ? `The spine bends by ${fmt(maxHeadingSwingDeg, 0)}°, so each block is turned to `
                  + 'meet it at the same angle as the first.'
                : `The spine bends by ${fmt(maxHeadingSwingDeg, 0)}°, and every block keeps the `
                  + 'first envelope\'s bearing rather than turning with it.')
            : 'The spine is straight, so every block keeps the first envelope\'s bearing — the two '
              + 'orientation options are the same drawing here.');
        if (anchorOffsetM > 0.5) {
            parts.push(
                `⚠ The spine starts ${fmt(anchorOffsetM)} m from the first envelope's centre, so `
                + 'the spacing is measured from there and not from the block. Redraw the spine to '
                + 'start it on the centre again.',
            );
        }
        parts.push('Nothing is created yet — these are profiles you can remove before pressing '
            + 'Create all blocks.');

        span.setAttribute('pryzm.envelopeArray.placed', placed);
        span.setAttribute('pryzm.envelopeArray.fitCount', fitCount);
        span.setAttribute('pryzm.envelopeArray.spacingM', spacingM);
        span.setAttribute('pryzm.envelopeArray.pathLengthM', pathLengthM);
        span.setAttribute('pryzm.envelopeArray.orientation', input.orientation);
        span.setAttribute('pryzm.envelopeArray.pathCurves', pathCurves);

        return Object.freeze({
            ok: true as const,
            copies: Object.freeze(copies),
            spacingM,
            orientation: input.orientation,
            pathLengthM,
            leftoverM,
            truncatedBy,
            pathCurves,
            maxHeadingSwingDeg,
            anchorOffsetM,
            anchorCentre: Object.freeze({ x: anchorCentre.x, z: anchorCentre.z }),
            statement: parts.join(' '),
        });
    } finally {
        span.end();
    }
}
