// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-RGEU-ART59 (lane ENVELOPE-IBERIA, 2026-09-04) — RGEU art. 59: THE 45° PLANE, as a SOLVER
// CONSTRAINT consuming the shared `geometry/inclinedTop.ts` (doctrine §3: "build it once, in the
// shared solver" — this file builds NO geometry engine; it resolves the article into planes).
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE RULE (doctrine §3, verbatim in substance):
//   art. 59      — a 45° plane from the OPPOSING building's alignment at ground level, in every
//                  vertical plane perpendicular to the façade; NEIGHBOUR-DEPENDENT, never a scalar.
//   art. 59 §1   — on sloping ground the line may start 1,50 m above ground on the DOWNHILL side.
//   art. 59 §2   — the corner rule: on two streets of different width (or level), the façade on
//                  the narrower/lower street may rise to the other's permitted height for a maximum
//                  run of 15 m from the corner.
//
// ⭐ WHY `governsExtent` HAD TO EXIST (the shared-solver change this lane made, minimally):
//   • §1 applies to the DOWNHILL band only. A frontage that slopes along part of its run needs two
//     plane segments (base 0 and base 1,50) each governing ONLY its band. Without extents the
//     tolerance is either dropped (silently ignored — round one's finding) or applied to the whole
//     run (OVERSTATES on the uphill part).
//   • §2 removes the narrower street's plane from the first 15 m and puts a different plane there.
//
// ⭐ THE §2 READING, STATED AS AN ASSUMPTION (doctrine §0.4): "may rise to the other's permitted
// height" is read in the article's OWN geometry — the same 45° line, started higher so that the
// façade on the corner run reaches the wider street's permitted façade height (i.e. the narrower
// plane with its base RAISED by the width difference, present only on the run). A FLAT cap at that
// height was considered and REJECTED: deep in the plot it would fall below the base rule's own
// plane (z + W_narrow), and an allowance cannot restrict. Every output with a corner carries this
// reading as an `assumed` basis; the volume difference between readings is not hidden.
//
// ⛔ WHAT THIS FILE NEEDS AND NEVER FABRICATES: the OPPOSING alignment (doctrine §2.5: alinhamento
// = public-domain boundary, ⛔ NOT the kerb) per frontage, the parcel's own alignment (to orient
// the plane and measure the street width), and the slope direction. Each is an INPUT; a missing
// slope flag yields base 0 with the direction of error stated, and a missing alignment REFUSES.
//
// ⚠ WATCH FLAG: RGEU revocation decreed, effects DEFERRED (`PT_RGEU_STATUS_WATCH`). Verify.
//
// PURITY: L2-pure. Geometry + data. No I/O.

import type { Pt } from '@pryzm/schemas';
import {
    solveInclinedTop,
    type InclinedPlaneSpec,
    type InclinedTopSolve,
} from '../../geometry/inclinedTop.js';
import { PT_RGEU_STATUS_WATCH } from './ptHeightQuantities.js';
import type { PtInstrumentRef } from './ptProvenance.js';

/** The citation every art. 59 output carries. */
export const PT_RGEU_ART59: PtInstrumentRef = {
    instrument: 'Regulamento Geral das Edificações Urbanas (RGEU, DL 38 382/1951, as amended)',
    version: 'RGEU — in force, revocation decreed with effects DEFERRED',
    dateInForce: null,
    article: 'art. 59.º — plano a 45° a partir do alinhamento da edificação fronteira; § 1.º tolerância 1,50 m do lado descendente; § 2.º regra do gaveto, extensão máxima 15 m',
};

/** art. 59 §1 — the downhill tolerance, metres. The article\'s own number, not a tunable. */
export const PT_RGEU_ART59_DOWNHILL_TOLERANCE_M = 1.5;
/** art. 59 §2 — the maximum corner run, metres. */
export const PT_RGEU_ART59_CORNER_RUN_M = 15;
/** 45° ⇒ one metre of height per metre of distance. */
export const PT_RGEU_ART59_SLOPE_PER_M = 1;

/** One along-line band of a frontage with its own §1 slope flag (fractions of the opposing segment). */
export interface PtArt59Band {
    /** Start of the band along the opposing alignment A→B, as a fraction in [0, 1]. */
    readonly from: number;
    /** End of the band, fraction in [0, 1], > from. */
    readonly to: number;
    /** §1 — does the ground slope with the PARCEL on the downhill side here? null = unknown. */
    readonly parcelOnDownhillSide: boolean | null;
}

export interface PtArt59Frontage {
    readonly id: string;
    /** The OPPOSING building's alignment at ground level, scene-XZ metres (⛔ not the kerb). */
    readonly opposingAlignmentA: Pt;
    readonly opposingAlignmentB: Pt;
    /** The parcel's own alinhamento on this street — orients the plane; measures the width for §2. */
    readonly parcelAlignmentA: Pt;
    readonly parcelAlignmentB: Pt;
    /** §1 flag for the whole frontage; ignored when `bands` is given. null = unknown. */
    readonly parcelOnDownhillSide: boolean | null;
    /** Optional split of the frontage into bands with their own §1 flags. */
    readonly bands?: ReadonlyArray<PtArt59Band> | null;
}

/** art. 59 §2 — which two frontages meet, and where. Width is measured, never supplied. */
export interface PtArt59Corner {
    readonly frontageIdA: string;
    readonly frontageIdB: string;
    readonly cornerPoint: Pt;
}

export interface PtArt59Input {
    /** The footprint (polígono de implantação) the planes bound — scene-XZ metres. */
    readonly footprint: ReadonlyArray<Pt>;
    readonly frontages: ReadonlyArray<PtArt59Frontage>;
    readonly corner?: PtArt59Corner | null;
}

export interface PtArt59PlaneProvenance {
    readonly planeId: string;
    readonly frontageId: string;
    readonly clause: 'art. 59' | 'art. 59 §1' | 'art. 59 §2';
    readonly baseHeight_m: number;
    /** The measured street width (alinhamento to alinhamento), m. */
    readonly streetWidth_m: number;
}

export type PtArt59Planes =
    | {
          readonly ok: true;
          readonly planes: readonly InclinedPlaneSpec[];
          readonly provenance: readonly PtArt59PlaneProvenance[];
          /** `assumed` whenever a §1 flag was unknown or a §2 corner was read (doctrine §0.4). */
          readonly confidence: 'resolved' | 'assumed';
          readonly assumptions: readonly string[];
          readonly instrument: PtInstrumentRef;
          readonly watch: string;
      }
    | {
          readonly ok: false;
          readonly refusalReason: string;
          readonly instrument: PtInstrumentRef;
      };

/* ────────────────────────────── small vector helpers ────────────────────────────── */

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, z: a.z + b.z });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, z: a.z * k });
const cross = (a: Pt, b: Pt): number => a.x * b.z - a.z * b.x;
const len = (a: Pt): number => Math.hypot(a.x, a.z);
const finite = (p: Pt): boolean => Number.isFinite(p.x) && Number.isFinite(p.z);

/** Signed distance of `q` from the line A→B; positive = the solver's positive side (cross(dir, q−A) > 0). */
function signedDistance(a: Pt, b: Pt, q: Pt): number {
    const d = sub(b, a);
    return cross(d, sub(q, a)) / len(d);
}

/**
 * Build the CONVEX extent of a frontage band: the strip perpendicular to the opposing alignment
 * between `from` and `to` along it, from 1 m behind the alignment to `depth` m toward the parcel.
 */
function bandExtent(a: Pt, b: Pt, from: number, to: number, depth: number): Pt[] {
    const d = sub(b, a);
    const l = len(d);
    const u = mul(d, 1 / l);
    // Unit normal toward the positive side: for dir (dx, dz) the positive side (cross > 0) is (−dz, dx).
    const n: Pt = { x: -u.z, z: u.x };
    const a1 = add(a, mul(d, from));
    const b1 = add(a, mul(d, to));
    return [add(a1, mul(n, -1)), add(b1, mul(n, -1)), add(b1, mul(n, depth)), add(a1, mul(n, depth))];
}

/* ────────────────────────────── the constructor ────────────────────────────── */

/**
 * PURE: resolve RGEU art. 59 (+ §1, §2) into `InclinedPlaneSpec`s over the footprint. TOTAL:
 * every input lands on planes-with-provenance or on a NAMED refusal.
 */
export function buildPtRgeuArt59Planes(input: PtArt59Input): PtArt59Planes {
    const refuse = (refusalReason: string): PtArt59Planes => ({ ok: false, refusalReason, instrument: PT_RGEU_ART59 });

    if (input.footprint.length < 3 || !input.footprint.every(finite)) {
        return refuse('no footprint (polígono de implantação) — art. 59 bounds a footprint; none was supplied (doctrine §12 step 9 precedes step 10)');
    }
    if (input.frontages.length === 0) {
        return refuse('no frontage supplied — art. 59 is NEIGHBOUR-DEPENDENT: it needs the opposing building\'s alignment per public way, which nothing here may fabricate');
    }
    const ids = new Set<string>();
    for (const f of input.frontages) {
        if (ids.has(f.id)) return refuse(`duplicate frontage id "${f.id}"`);
        ids.add(f.id);
        if (![f.opposingAlignmentA, f.opposingAlignmentB, f.parcelAlignmentA, f.parcelAlignmentB].every(finite)) {
            return refuse(`frontage "${f.id}" has a non-finite alignment point`);
        }
        if (len(sub(f.opposingAlignmentB, f.opposingAlignmentA)) < 1e-6) {
            return refuse(`frontage "${f.id}": the opposing alignment is a point, not a line`);
        }
    }

    const assumptions: string[] = [];
    const planes: InclinedPlaneSpec[] = [];
    const provenance: PtArt59PlaneProvenance[] = [];

    // Depth of every extent: far enough to cover the whole footprint from any alignment.
    const depthFor = (a: Pt, b: Pt): number =>
        Math.max(...input.footprint.map((p) => Math.abs(signedDistance(a, b, p)))) + 1;

    // Per frontage: orient A→B so the parcel is on the positive side; measure the street width.
    const oriented = new Map<string, { a: Pt; b: Pt; width: number; f: PtArt59Frontage }>();
    for (const f of input.frontages) {
        const mid = mul(add(f.parcelAlignmentA, f.parcelAlignmentB), 0.5);
        let a = f.opposingAlignmentA;
        let b = f.opposingAlignmentB;
        const s = signedDistance(a, b, mid);
        if (Math.abs(s) < 1e-6) {
            return refuse(`frontage "${f.id}": the parcel alignment lies ON the opposing alignment — zero street width; not a public way`);
        }
        if (s < 0) { const t = a; a = b; b = t; }
        oriented.set(f.id, { a, b, width: Math.abs(s), f });
    }

    // §2 — corner: measure both widths, decide narrower/wider, and split the narrower frontage.
    let cornerNarrowId: string | null = null;
    let cornerRaise = 0;
    let cornerAlong: { a: Pt; b: Pt; fromCorner: number } | null = null;
    if (input.corner) {
        const A = oriented.get(input.corner.frontageIdA);
        const B = oriented.get(input.corner.frontageIdB);
        if (!A || !B) return refuse(`corner names frontage ids "${input.corner.frontageIdA}"/"${input.corner.frontageIdB}" that are not in the input`);
        if (!finite(input.corner.cornerPoint)) return refuse('corner point is non-finite');
        if (Math.abs(A.width - B.width) < 1e-6) {
            return refuse('art. 59 §2 names two streets of DIFFERENT width; the two measured widths are equal (the "different level" arm is not implemented — supply widths or omit the corner)');
        }
        const [narrow, wide] = A.width < B.width ? [A, B] : [B, A];
        cornerNarrowId = narrow.f.id;
        cornerRaise = wide.width - narrow.width;
        // Along-line coordinate of the corner on the NARROWER opposing alignment (projection).
        const d = sub(narrow.b, narrow.a);
        const l = len(d);
        const t = ((input.corner.cornerPoint.x - narrow.a.x) * d.x + (input.corner.cornerPoint.z - narrow.a.z) * d.z) / (l * l);
        cornerAlong = { a: narrow.a, b: narrow.b, fromCorner: t };
        assumptions.push(
            `art. 59 §2 read in the article's own geometry: on the ${PT_RGEU_ART59_CORNER_RUN_M} m corner run of ` +
            `"${narrow.f.id}" (width ${narrow.width.toFixed(2)} m) the 45° line starts ${cornerRaise.toFixed(2)} m higher so the ` +
            `façade may reach the permitted height of "${wide.f.id}" (width ${wide.width.toFixed(2)} m). A flat cap at ` +
            'that height was rejected because it would restrict the deep plot below the base rule (an allowance cannot restrict). ' +
            'Discretionary reading — confirm with the licensing authority.',
        );
    }

    for (const { a, b, width, f } of oriented.values()) {
        const depth = depthFor(a, b);
        const bands: PtArt59Band[] = f.bands && f.bands.length > 0
            ? [...f.bands]
            : [{ from: 0, to: 1, parcelOnDownhillSide: f.parcelOnDownhillSide }];
        for (const band of bands) {
            if (!(band.from >= 0 && band.to <= 1 && band.to > band.from)) {
                return refuse(`frontage "${f.id}": band [${band.from}, ${band.to}] is not a sub-interval of [0, 1]`);
            }
            // If the orientation flipped A/B, the band fractions refer to the caller's A→B; map them.
            const flipped = a !== f.opposingAlignmentA;
            const from = flipped ? 1 - band.to : band.from;
            const to = flipped ? 1 - band.from : band.to;

            let base = 0;
            let clause: PtArt59PlaneProvenance['clause'] = 'art. 59';
            if (band.parcelOnDownhillSide === true) {
                base = PT_RGEU_ART59_DOWNHILL_TOLERANCE_M;
                clause = 'art. 59 §1';
            } else if (band.parcelOnDownhillSide === null) {
                assumptions.push(
                    `frontage "${f.id}" band [${band.from}, ${band.to}]: slope direction unknown — §1's 1,50 m tolerance NOT applied ` +
                    '(base 0). If the parcel is downhill the true limit is 1,50 m higher: this UNDER-states (safe direction).',
                );
            }

            // §2 split of the narrower frontage into the corner run and the rest.
            const segments: Array<{ from: number; to: number; raise: number; clause: PtArt59PlaneProvenance['clause'] }> = [];
            if (cornerNarrowId === f.id && cornerAlong) {
                const runFrac = PT_RGEU_ART59_CORNER_RUN_M / len(sub(b, a));
                const c = cornerAlong.fromCorner;
                // The run extends from the corner INTO the frontage; the corner sits at one end.
                const runFrom = c <= 0.5 ? Math.max(from, c) : Math.max(from, c - runFrac);
                const runTo = c <= 0.5 ? Math.min(to, c + runFrac) : Math.min(to, c);
                if (runTo > runFrom) {
                    segments.push({ from: runFrom, to: runTo, raise: cornerRaise, clause: 'art. 59 §2' });
                    if (from < runFrom) segments.push({ from, to: runFrom, raise: 0, clause });
                    if (runTo < to) segments.push({ from: runTo, to, raise: 0, clause });
                } else {
                    segments.push({ from, to, raise: 0, clause });
                }
            } else {
                segments.push({ from, to, raise: 0, clause });
            }

            for (const seg of segments) {
                const id = `${f.id}${seg.clause === 'art. 59 §2' ? '-corner-run' : ''}[${seg.from.toFixed(3)},${seg.to.toFixed(3)}]`;
                planes.push({
                    id,
                    anchorA: a,
                    anchorB: b,
                    baseHeight_m: base + seg.raise,
                    slopePerMeter: PT_RGEU_ART59_SLOPE_PER_M,
                    governsExtent: bandExtent(a, b, seg.from, seg.to, depth),
                });
                provenance.push({ planeId: id, frontageId: f.id, clause: seg.clause, baseHeight_m: base + seg.raise, streetWidth_m: width });
            }
        }
    }

    return {
        ok: true,
        planes,
        provenance,
        confidence: assumptions.length === 0 ? 'resolved' : 'assumed',
        assumptions,
        instrument: PT_RGEU_ART59,
        watch: PT_RGEU_STATUS_WATCH,
    };
}

export type PtArt59Solve =
    | {
          readonly ok: true;
          readonly solve: Extract<InclinedTopSolve, { ok: true }>;
          readonly planes: readonly InclinedPlaneSpec[];
          readonly provenance: readonly PtArt59PlaneProvenance[];
          readonly confidence: 'resolved' | 'assumed';
          readonly assumptions: readonly string[];
          readonly instrument: PtInstrumentRef;
          readonly watch: string;
      }
    | { readonly ok: false; readonly refusalReason: string; readonly instrument: PtInstrumentRef };

/**
 * PURE: build the art. 59 planes and solve the EXACT volume under them (+ an optional flat cap —
 * the plan's H/Alt-derived `topAboveS`, see `ptTopCapAboveSoleira`). A footprint region no
 * frontage governs and no cap bounds is REFUSED by the solver (`no-vertical-limit`) and surfaced
 * here with the doctrine's remedy: supply the PDM cap.
 */
export function solvePtRgeuArt59(input: PtArt59Input, flatCap_m: number | null): PtArt59Solve {
    const built = buildPtRgeuArt59Planes(input);
    if (!built.ok) return built;
    const solved = solveInclinedTop(input.footprint, { flatCap_m, planes: built.planes });
    if (!solved.ok) {
        return {
            ok: false,
            instrument: PT_RGEU_ART59,
            refusalReason:
                `the inclined-top solve refused (${solved.reason}${solved.detail ? `: ${solved.detail}` : ''}). ` +
                (solved.reason === 'no-vertical-limit'
                    ? 'Part of the footprint is bounded by no frontage plane and no cap — supply the PDM\'s H or Alt (doctrine §10, `Alt` as absolute cap) rather than leave it unbounded.'
                    : ''),
        };
    }
    return {
        ok: true,
        solve: solved,
        planes: built.planes,
        provenance: built.provenance,
        confidence: built.confidence,
        assumptions: built.assumptions,
        instrument: PT_RGEU_ART59,
        watch: PT_RGEU_STATUS_WATCH,
    };
}
