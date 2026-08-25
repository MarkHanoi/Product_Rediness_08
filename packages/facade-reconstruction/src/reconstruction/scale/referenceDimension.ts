// C108 §2.2 / SPEC S17 (brief §5, §16) — scale is USER-SUPPLIED or UNKNOWN.
//
//     "Do not claim the photograph gives exact real-world dimensions. Output
//      normalized geometry, then a user interaction 'Set reference dimension' —
//      click two points, enter e.g. 2.1m — after which the whole facade converts to
//      metric."  — brief §16
//
// ⛔ THERE IS NO THIRD SOURCE (L-11009). No storey-height prior. No door-height
// prior. No EXIF focal length. No street-view lookup. Each of those is a GUESS
// dressed as a MEASUREMENT, and once it is written into `metersPerUnit` nothing
// downstream can tell it from the real thing — which is precisely the
// [[context-data-honesty-family]] failure, transplanted.
//
// If an automatic estimator is ever wanted it is a NEW `status` value, a new C108
// §1.2 row and its own `authorityRank` — never a silent write into this slot.

import type { FacadeIR, Scale } from '../../contracts/FacadeIR.js';
import type { Point2 } from '../../contracts/RasterImage.js';
import { measured, unknown, scalarOf } from '../../contracts/FacadeConfidence.js';

/** The default: unknown, with C62's typed reason. Never `confidence: 0`. */
export function unknownScale(): Scale {
    const evidence = unknown('not-queried');
    return {
        status: 'unknown',
        metersPerUnit: null,
        unknownReason: 'not-queried',
        confidence: scalarOf(evidence),
        evidence,
    };
}

/**
 * Apply the brief §16 interaction: two points in NORMALIZED facade coordinates and
 * the real-world distance between them.
 *
 * Returns a NEW IR — the input is untouched, so a UI can offer the conversion,
 * show it, and let the user undo it without the engine holding state.
 *
 * C62 axes: `authorityRank: 'user'` (the user is authoritative for their own
 * measurement) and `validationState: 'human-reviewed'` (a human supplied it —
 * which is a stronger statement than "a machine computed it", and a weaker one
 * than "the authority confirmed it").
 *
 * ⛔ Refuses a non-positive distance and refuses two coincident points rather than
 * producing an infinite or negative `metersPerUnit`. A silently infinite scale
 * makes every downstream metric plausible and wrong.
 */
export function applyReferenceDimension(
    ir: FacadeIR,
    p0: Point2,
    p1: Point2,
    meters: number,
): FacadeIR {
    if (!Number.isFinite(meters) || meters <= 0) {
        throw new Error(
            `applyReferenceDimension: reference length must be a positive finite number of metres, got ${String(meters)}`,
        );
    }
    const normalizedDistance = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (!(normalizedDistance > 0)) {
        throw new Error(
            'applyReferenceDimension: the two reference points are coincident — no length to scale by (brief §16)',
        );
    }
    const metersPerUnit = meters / normalizedDistance;
    const evidence = { ...measured(1), authorityRank: 'user' as const, validationState: 'human-reviewed' as const };
    const scale: Scale = {
        status: 'user-supplied',
        metersPerUnit,
        confidence: scalarOf(evidence),
        evidence,
    };
    return { ...ir, units: 'meters', scale };
}

/**
 * Convert a normalized facade length to metres, or `null` when scale is unknown.
 *
 * ⭐ Returns `null` rather than the normalized number. A caller that forgets to
 * check gets a visible absence instead of a silently mis-scaled metric value, and
 * the whole point of C108 §2.2 is that "we do not know" must be impossible to
 * mistake for "1.0".
 */
export function toMeters(ir: FacadeIR, normalizedLength: number): number | null {
    if (ir.scale.status !== 'user-supplied' || ir.scale.metersPerUnit === null) return null;
    return normalizedLength * ir.scale.metersPerUnit;
}
