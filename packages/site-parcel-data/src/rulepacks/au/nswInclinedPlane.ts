// §NSW-INCLINED-PLANE — the Burwood building height plane, handed to the SHARED solver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THIS FILE ADDS NO GEOMETRY. IT IS AN ADAPTER, AND THAT IS THE POINT.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `geometry/inclinedTop.ts` already solves `plane(origin_line, angle, height_at_origin)` exactly —
// it predates this lane, it is line-anchored in precisely the shape Burwood LEP 2012 cl 4.3A
// describes, and lane ENVELOPE-IBERIA added `governsExtent` to it on 2026-09-04 for RGEU art. 59.
// ⭐ §GREP-FOR-THE-EXISTING-SOLVER-FIRST: the build prompt §8 asked for this primitive and the
// correct amount of it to write is zero.
//
// ⭐ AND `governsExtent` IS EXACTLY WHAT THE NSW CLAUSE NEEDS, WHICH IS WHY THIS ADAPTER EXISTS
// RATHER THAN A SECOND SOLVER. Burwood cl 4.3A:
//
//   "Despite clause 4.3, the height of a building on land marked **"Area A" on the Height of
//    Buildings Map** is not to exceed the building height plane for that land."
//
// The plane does not govern the whole parcel — it governs Area A. Without an extent the plane is
// either applied everywhere (OVERSTATES the constraint, shrinking land the clause does not reach)
// or dropped (understates it). Both are wrong; the second is L-616. The shared field expresses it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS ADAPTER REFUSES, AND WHY EACH REFUSAL IS A REAL MISSING FACT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. NO ORIGIN LINE. The polygon says WHERE the plane applies; the LINE it rises from is drawn on
//     the Building Height Plane Map and this pack does not fetch that geometry. ⛔ Deriving a line
//     from the polygon's longest edge is a guess wearing a plausible face — see the note on
//     `NswPlaneOriginLine`.
//  2. THE ORIENTATION CANNOT BE HONOURED. The instrument words it as a compass side ("East of BHP
//     line", "North of BHP line"), and the solver words it as "positive = LEFT of A→B". Those agree
//     only for a particular winding, so this adapter ORIENTS the line rather than assuming, and
//     refuses when the line runs parallel to the stated side — where "east of a line running east"
//     names no half-plane at all.
//  3. THE RULING IS NOT CITABLE. A plane that trims someone's building is an assertion about their
//     land; making it without a clause is the §1.2 bug in its most expensive form (a cap cannot be
//     spotted by an owner who knows their site is under-built).
//
// P5-adjacent purity: pure total functions over already-fetched geometry. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.4, C62, C74 §0, C75. ADR-0377 (height datum).

import type { Pt } from '@pryzm/schemas';

import type { InclinedPlaneSpec } from '../../geometry/inclinedTop.js';

import { nswMayContributeValue, type NswCitation } from './nswCitationState.js';
import type { NswControlRuling, NswPlaneParameters } from './nswClauseRegistry.js';

/**
 * The shared scene point — `{ x, z }` metres, **not** `{ x, y }`.
 *
 * ⛔ RE-EXPORTED RATHER THAN RE-DECLARED, AND THE FIRST DRAFT OF THIS FILE GOT IT WRONG. It
 * declared its own `{ x, y }` and reasoned about compass sides on the assumption that +y was
 * north. The repo's plan plane is **x/z** (C12 §1.1, LTP-ENU), so that adapter would have
 * type-errored at the seam — and had the seam been `any`, it would have picked the OPPOSITE side
 * for every north/south plane and trimmed the wrong half of the site. §FAKE-MORE-CAPABLE-THAN-REAL:
 * the parallel type WAS the defect, and the type checker caught what a plausible comment could not.
 */
export type NswPt = Pt;

/**
 * The origin line of a building height plane, supplied by the caller.
 *
 * ⛔ **THIS PACK DOES NOT DERIVE IT, AND MUST NOT.** The BHP line is a mapped feature on the
 * Building Height Plane Map; the ePlanning polygon this pack reads says only WHERE the plane
 * applies. Taking the polygon's longest edge, or its southern edge, or a bounding-box side, would
 * produce a plane of the right shape in the wrong place — a 33° surface anchored a few metres off
 * is a several-metre error at the far side of a lot, delivered with a clause attached.
 *
 * ⚠ **FRAME CONTRACT, AND IT IS CITED RATHER THAN ASSUMED.** Points are scene-XZ metres in the
 * LTP-ENU frame, where **C12 §7 states `east = x, north = −z, up = y`** (and §9 repeats
 * `north = -z` as the SiteFrame authority). The orientation logic below turns compass words from
 * the instrument into a side of the line, so it is entirely at the mercy of that mapping: get the
 * sign of north wrong and every north/south plane trims the opposite half of the site, silently,
 * with a clause attached. ⛔ Latitude/longitude degrees are NOT such a frame.
 */
export interface NswPlaneOriginLine {
    readonly a: NswPt;
    readonly b: NswPt;
    /** Free-text provenance — which map sheet or feature the line was read from. Carried, not parsed. */
    readonly source: string;
}

/** The compass sides the measured `orientation` strings use. Closed; anything else refuses. */
export type NswPlaneSide = 'east' | 'west' | 'north' | 'south';

/**
 * Read the instrument's orientation phrase. **Total** — an unrecognised phrase returns `null`,
 * which refuses.
 *
 * Measured vocabulary, from `Local_Provisions/430 CLASS_DESCRIPTION` on all nine NSW Building
 * Height Plane polygons: `"East of BHP line"`, `"West of BHP line"`, `"North of BHP line"`.
 * ⛔ Matched on the leading compass word only, and never on a substring of the whole phrase: a
 * future `"North-east of BHP line"` must REFUSE rather than silently resolve to north.
 */
export function nswPlaneSide(orientation: string | null | undefined): NswPlaneSide | null {
    const t = (orientation ?? '').trim().toLowerCase();
    const m = /^(east|west|north|south)\b/.exec(t);
    const word = m?.[1];
    if (!word) return null;
    // ⛔ Guard the "North-east" case explicitly: `\b` matches at the hyphen, so the regex above
    // would accept it. A compound bearing does not name one of the four half-planes this
    // adapter can express.
    if (/^(east|west|north|south)[- ]?(east|west|north|south)\b/.test(t)) return null;
    return word as NswPlaneSide;
}

/** Compass directions as scene-XZ unit vectors. ⛔ `north = -z` per C12 §7 / §9, not `+y`. */
const SIDE_VECTOR: Readonly<Record<NswPlaneSide, NswPt>> = Object.freeze({
    east: { x: 1, z: 0 },
    west: { x: -1, z: 0 },
    north: { x: 0, z: -1 },
    south: { x: 0, z: 1 },
});

/** Why an NSW plane could not be handed to the solver. A closed set; each names a missing fact. */
export type NswPlaneRefusal =
    | 'no-registry-ruling'
    | 'no-plane-parameters'
    | 'uncited'
    | 'no-origin-line'
    | 'degenerate-origin-line'
    | 'unreadable-orientation'
    | 'orientation-parallel-to-line'
    | 'non-finite-parameters';

export type NswPlaneAdaptation =
    | { readonly ok: true; readonly spec: InclinedPlaneSpec; readonly note: string }
    | { readonly ok: false; readonly reason: NswPlaneRefusal; readonly detail: string };

/**
 * Turn one NSW plane ruling into an `InclinedPlaneSpec` the shared solver accepts.
 *
 * `slopePerMeter = tan(angleDeg)`. `baseHeight_m = lineHeight_m`. The line is ORIENTED so that the
 * solver's positive side (LEFT of A→B) is the side the instrument names, because those two
 * conventions coincide for exactly one winding and guessing which is a coin-flip that trims the
 * wrong half of the site.
 *
 * `governsExtent` is the caller's Area-A polygon when it has one, and `null` otherwise —
 * `null` means "governs everywhere", which is the solver's prior behaviour and the right reading
 * only when the caller has established that the plane really does reach the whole footprint.
 *
 * ⚠ `governsExtent` IS NOT DEFAULTED TO THE CONTROL POLYGON, tempting as that is. The ePlanning
 * polygon is the mapped extent of the CONTROL; "Area A on the Height of Buildings Map" is a
 * different feature on a different map. Passing one as the other would be a plausible-looking
 * substitution of one government polygon for another.
 */
export function nswAdaptPlane(params: {
    readonly ruling: NswControlRuling | null;
    readonly citation: NswCitation;
    readonly originLine: NswPlaneOriginLine | null;
    /** The convex "Area A" polygon in the same metric frame, when the caller has it. */
    readonly governsExtent?: ReadonlyArray<NswPt> | null;
    /** Stable id for provenance in the solve. */
    readonly id: string;
}): NswPlaneAdaptation {
    const { ruling, citation, originLine, id } = params;

    if (!ruling) {
        return {
            ok: false,
            reason: 'no-registry-ruling',
            detail:
                'No clause-registry ruling covers this building height plane, so its legal role and ' +
                'its parameters are both unestablished. Reported as a named constraint, never extruded.',
        };
    }
    const p: NswPlaneParameters | null = ruling.plane;
    if (!p) {
        return {
            ok: false,
            reason: 'no-plane-parameters',
            detail:
                `${ruling.instrument} supplies a ruling for this plane but no angle or line height. ` +
                'Bounded but geometrically underdetermined — build prompt §11 status C.',
        };
    }
    // ⛔ ARM B, CHECKED BEFORE THE GEOMETRY. A plane trims a building; asserting one without a
    // clause is the §1.2 bug in the form an owner cannot spot for themselves.
    if (!nswMayContributeValue(citation.state)) {
        return {
            ok: false,
            reason: 'uncited',
            detail:
                citation.absenceReason ??
                'No clause citation could be resolved for this building height plane, so it is not applied.',
        };
    }
    if (!Number.isFinite(p.lineHeight_m) || !Number.isFinite(p.angleDeg)) {
        return {
            ok: false,
            reason: 'non-finite-parameters',
            detail: `Plane parameters are not finite: lineHeight_m=${p.lineHeight_m}, angleDeg=${p.angleDeg}.`,
        };
    }
    if (!originLine) {
        return {
            ok: false,
            reason: 'no-origin-line',
            detail:
                'The building height plane LINE is a mapped feature on the Building Height Plane Map ' +
                'and was not supplied. ⛔ It is not derived from the control polygon: a 33° surface ' +
                'anchored a few metres from where the map draws it is a several-metre error at the ' +
                'far side of the lot, delivered with a clause attached.',
        };
    }
    const dx = originLine.b.x - originLine.a.x;
    const dz = originLine.b.z - originLine.a.z;
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) {
        return {
            ok: false,
            reason: 'degenerate-origin-line',
            detail: `The supplied origin line is a point or non-finite (${JSON.stringify(originLine)}).`,
        };
    }
    const side = nswPlaneSide(p.orientation);
    if (!side) {
        return {
            ok: false,
            reason: 'unreadable-orientation',
            detail:
                `The instrument words the governed side as ${JSON.stringify(p.orientation)}, which is ` +
                'not one of the four compass half-planes this adapter can express. Refusing rather ' +
                'than picking a side.',
        };
    }

    // ── ORIENT THE LINE. The solver's field rises along `(-dz, dx)` — read from `planeToAffine`,
    // not assumed: its gradient is `slope * (-dz, dx) / len`, which it documents as "positive =
    // left of A→B in the x/z convention". Point the line so that direction agrees with the compass
    // side the instrument names.
    const v = SIDE_VECTOR[side];
    const leftDotSide = -dz * v.x + dx * v.z;
    const len = Math.hypot(dx, dz);
    // ⛔ A line running EAST has no "east side". `1e-9 * len` scales the tolerance with the line, so
    // a long line is not judged parallel by float noise and a short one is not judged oblique by it.
    if (Math.abs(leftDotSide) <= 1e-9 * len) {
        return {
            ok: false,
            reason: 'orientation-parallel-to-line',
            detail:
                `The origin line runs ${side === 'east' || side === 'west' ? 'east-west' : 'north-south'} ` +
                `and the instrument governs the ${side} side of it, which names no half-plane. ` +
                'Either the line or the orientation is not what this reader takes it to be, and ' +
                'choosing one would discard the disagreement.',
        };
    }
    const flip = leftDotSide < 0;
    const anchorA = flip ? originLine.b : originLine.a;
    const anchorB = flip ? originLine.a : originLine.b;

    const spec: InclinedPlaneSpec = {
        id,
        anchorA: { x: anchorA.x, z: anchorA.z },
        anchorB: { x: anchorB.x, z: anchorB.z },
        baseHeight_m: p.lineHeight_m,
        slopePerMeter: Math.tan((p.angleDeg * Math.PI) / 180),
        // `undefined`/`null` means "governs everywhere" in the shared solver — the prior behaviour.
        governsExtent: params.governsExtent ?? null,
    };
    return {
        ok: true,
        spec,
        note:
            `${ruling.clause ?? ruling.instrument}: plane rises ${p.angleDeg}° from ` +
            `${p.lineHeight_m} m above existing ground level at the BHP line, governing the ` +
            `${side} side${flip ? ' (line reversed so the solver\'s positive side is that one)' : ''}. ` +
            `Origin line from ${originLine.source}. ` +
            (params.governsExtent
                ? 'Restricted to the supplied "Area A" extent.'
                : '⚠ NO "Area A" extent supplied, so the plane is taken to govern the whole footprint — ' +
                  'which OVERSTATES the constraint wherever cl 4.3A does not reach.'),
    };
}
