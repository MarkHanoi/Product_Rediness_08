// FRANCE — PAU (*parties actuellement urbanisées*) as a DERIVABLE-NON-AUTHORITATIVE outcome.
// Founder blocker review 2026-09-04 §6 (move 5).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE REFRAME THIS FILE IMPLEMENTS — and the line it must never cross
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The 100-parcel audit recorded PAU membership as `undeterminable` and REFUSED it 11 times. The
// founder's §6 corrects the axis, not the refusal: *"The honest position is not 'undeterminable'.
// It is: a parameterised derivation exists, the State uses one, and no derivation is
// authoritative."* The criteria are judicially settled even though the definition is not:
//
//   • CE 29 mars 2017, Commune de Saint-Bauzille-de-Putois, n° 393730, and CAA Douai 31 oct. 2018,
//     n° 16DA01991 — PAU = parts of the communal territory already comprising a SIGNIFICANT NUMBER
//     AND DENSITY of existing constructions.
//   • CAA Bordeaux 20 déc. 2018, n° 16BX04244 — construction DENSITY and the existence of ACCESS
//     ROADS AND EQUIPMENT are the principal criteria; a project is inside where it is in
//     continuity or immediate proximity and does not extend urbanisation.
//   • DREAL Auvergne-Rhône-Alpes / IADT — a SIG model that traces a commune's PAU automatically
//     from MODULABLE criteria (distance to the nearest dwelling, number of dwellings generating a
//     PAU), as an aid to instructing urbanism acts in RNU communes. Restricted to State services;
//     ⚠ ITS PARAMETER VALUES ARE NOT KNOWN TO PRYZM and nothing below claims to be them.
//
// And the ceiling, from the State itself answering a parliamentary question (review §0): the
// appreciation of urbanised character depends closely on local circumstances, so *there can be no
// definition, still less national criteria*; the notion is left to the local authority's
// appreciation under the judge's control. **No dataset closes that, and this file does not try.**
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HOW THE RESULT IS SEATED IN THE SHARED VOCABULARY (no new state, no new field)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `RuleState` already has the seat, pinned by `ruleState.test.ts` (`derivedPau`): a declared-method
// derivation is `status: 'resolved'` · `reachability: 'derivable'` · `provenance: 'estimated'`.
// `ruleRecovery` counts it as `resolvedEstimated` — a TYPED OUTCOME (in `honestAnswerRate`) that is
// EXCLUDED from `parameterRecoveryRate`, because the founder's question is "authoritative parameter
// without human judgement" and this is neither. The founder's `confidence: assumed` is spelled with
// the ratified `FieldProvenance` member `estimated` ("a curated/inferred value; never
// authoritative") rather than by minting `assumed`.
//
// ⛔ WHAT A CONSUMER MAY AND MAY NOT DO WITH THE VERDICT. It may DISPLAY it, with its parameters
// and the statement below. It may NOT gate constructibility on it, draw a "constructible" envelope
// from it, or present it as the commune's PAU. The instructing authority determines PAU membership;
// this is what a declared method indicates, and the method is ours.
//
// PURE + deterministic (C58 §1.1/§1.9). Inputs are already-fetched geometry in scene metres (the
// BD TOPO `batiment` neighbours `frBdTopoNeighbours.ts` serves; the roads the frontage derivation
// consumes). No I/O, no clock, no RNG.

import type { Pt, RuleSourceRef, RuleState } from '@pryzm/schemas';
import { pointInPolygon, pointSegmentDistance } from '@pryzm/site-validators';

/* ───────────────────────────── the declared parameters ─────────────────────────── */

/**
 * The modulable criteria a PAU derivation reads — the SAME axes the DREAL AuRA model exposes
 * (distance to nearest dwelling; number of dwellings generating a PAU) plus the CAA Bordeaux
 * access criterion. Every run declares the values it used; they travel with the verdict.
 */
export interface FrPauParameters {
    /** Radius (m) around the parcel within which existing DWELLINGS are counted. */
    readonly dwellingRadiusM: number;
    /** Minimum dwellings inside that radius for the "significant number and density" test. */
    readonly minDwellingsInRadius: number;
    /** Maximum distance (m) from the parcel to its NEAREST dwelling — the continuity test. */
    readonly maxGapToNearestDwellingM: number;
    /** Require an access road for `inside` (CAA Bordeaux: access roads and equipment). */
    readonly requireRoadAccess: boolean;
}

/**
 * ⚠ PRYZM's WORKING ASSUMPTION — declared, not sourced. These are NOT the DREAL AuRA values (that
 * model is restricted to State services and its thresholds are unknown to us), and they are not
 * drawn from any judgment: the courts state the criteria, never a number. They exist so that a
 * derivation is REPRODUCIBLE and its parameters VISIBLE; a caller with a better-grounded set
 * passes its own, and the verdict records whichever was used.
 */
export const FR_PAU_WORKING_PARAMETERS: FrPauParameters = Object.freeze({
    dwellingRadiusM: 100,
    minDwellingsInRadius: 5,
    maxGapToNearestDwellingM: 50,
    requireRoadAccess: true,
});

/* ───────────────────────────── the authorities, cited once ────────────────────── */

export interface FrPauAuthority {
    readonly kind: 'jurisprudence' | 'state-model' | 'parliamentary-answer';
    readonly citation: string;
    readonly holding: string;
    /** Founder review §6 carried these; PRYZM has not re-read the judgments. Stated, not hidden. */
    readonly verification: 'founder-review-2026-09-04-not-re-verified';
}

export const FR_PAU_AUTHORITIES: readonly FrPauAuthority[] = Object.freeze([
    {
        kind: 'jurisprudence',
        citation: 'CE 29 mars 2017, Commune de Saint-Bauzille-de-Putois, n° 393730',
        holding: 'PAU = parts of the communal territory already comprising a significant number and density of existing constructions.',
        verification: 'founder-review-2026-09-04-not-re-verified',
    },
    {
        kind: 'jurisprudence',
        citation: 'CAA Douai 31 oct. 2018, n° 16DA01991',
        holding: 'Same test — significant number and density of existing constructions.',
        verification: 'founder-review-2026-09-04-not-re-verified',
    },
    {
        kind: 'jurisprudence',
        citation: 'CAA Bordeaux 20 déc. 2018, n° 16BX04244',
        holding:
            'Construction density and the existence of access roads and equipment are the principal criteria; ' +
            'inside where in continuity or immediate proximity and not extending urbanisation.',
        verification: 'founder-review-2026-09-04-not-re-verified',
    },
    {
        kind: 'state-model',
        citation: 'DREAL Auvergne-Rhône-Alpes / IADT — SIG model tracing a commune’s PAU from modulable criteria',
        holding:
            'Distance to the nearest dwelling and number of dwellings generating a PAU, as an aid to instructing ' +
            'urbanism acts in RNU communes. Restricted distribution; parameter values unknown to PRYZM.',
        verification: 'founder-review-2026-09-04-not-re-verified',
    },
    {
        kind: 'parliamentary-answer',
        citation: 'Réponse ministérielle (question parlementaire) on the notion of PAU',
        holding:
            'Appreciation depends closely on local circumstances; there can be no definition, still less national ' +
            'criteria; the notion is left to the local authority under the judge’s control.',
        verification: 'founder-review-2026-09-04-not-re-verified',
    },
]);

/** The one sentence every consumer must show beside the verdict. */
export const FR_PAU_STATEMENT =
    'Derived indication only — only the instructing authority determines whether a parcel lies within ' +
    'the parties actuellement urbanisées (L.111-3). Parameters declared; method ours; not authoritative.';

/* ───────────────────────────── inputs and the derivation ──────────────────────── */

/** One existing DWELLING (BD TOPO `batiment` with a residential usage), as a representative point. */
export interface FrPauDwelling {
    readonly id: string;
    /** Scene XZ metres, same frame as the parcel ring. */
    readonly point: Pt;
}

export interface FrPauInput {
    /** Parcel ring in scene XZ metres (open or closed; ≥ 3 vertices). */
    readonly parcelRing: readonly Pt[];
    /** Every dwelling the neighbour fetch returned within at least `dwellingRadiusM` of the parcel. */
    readonly dwellings: readonly FrPauDwelling[];
    /**
     * Was the dwelling set COMPLETE within the radius? `'unknown'` when the fetch was capped, bbox-
     * clipped or transport-degraded — then an empty set is not evidence of emptiness
     * (§CONTEXT-DATA-HONESTY: failure and empty are the same value unless you say which).
     */
    readonly dwellingsCoverage: 'complete-within-radius' | 'unknown';
    /** Does an access road reach the parcel (from the frontage derivation)? `null` = not derived. */
    readonly roadAccess: boolean | null;
    readonly parameters?: FrPauParameters;
}

export type FrPauVerdict = 'inside' | 'outside' | 'indeterminate';

export interface FrPauDerivation {
    readonly verdict: FrPauVerdict;
    /** Why `indeterminate`, when it is — the missing input, named. */
    readonly indeterminateBecause: string | null;
    readonly dwellingsWithinRadius: number;
    /** Distance (m) from the parcel boundary to the nearest dwelling point; 0 if a dwelling is inside. */
    readonly nearestDwellingM: number | null;
    readonly roadAccess: boolean | null;
    readonly parameters: FrPauParameters;
    readonly authorities: readonly FrPauAuthority[];
    readonly statement: string;
}

function openRing(ring: readonly Pt[]): Pt[] {
    if (ring.length < 2) return [...ring];
    const f = ring[0]!;
    const l = ring[ring.length - 1]!;
    return f.x === l.x && f.z === l.z ? ring.slice(0, -1) : [...ring];
}

/** Distance from a point to a ring's boundary; 0 when the point is inside the ring. */
function distanceToRing(p: Pt, ring: readonly Pt[]): number {
    if (pointInPolygon(p, ring)) return 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const d = pointSegmentDistance(p, a, b);
        if (d < best) best = d;
    }
    return best;
}

/**
 * Derive a PAU indication for one parcel. **Pure, total, deterministic.**
 *
 * The three criteria are the courts' three, each as a declared threshold:
 *   density     — dwellings within `dwellingRadiusM` ≥ `minDwellingsInRadius`
 *   continuity  — nearest dwelling ≤ `maxGapToNearestDwellingM`
 *   access      — an access road reaches the parcel (when `requireRoadAccess`)
 *
 * ⚠ `indeterminate` is returned — never `outside` — whenever a criterion could not be EVALUATED:
 * coverage unknown, or road access required and not derived. "We do not know" and "there are no
 * dwellings" are different sentences, and only the second may become `outside`.
 */
export function deriveFrPau(input: FrPauInput): FrPauDerivation {
    const parameters = input.parameters ?? FR_PAU_WORKING_PARAMETERS;
    const ring = openRing(input.parcelRing);

    const base = {
        parameters,
        authorities: FR_PAU_AUTHORITIES,
        statement: FR_PAU_STATEMENT,
        roadAccess: input.roadAccess,
    };

    if (ring.length < 3) {
        return {
            ...base,
            verdict: 'indeterminate',
            indeterminateBecause: 'parcel ring has fewer than 3 vertices — no boundary to measure from',
            dwellingsWithinRadius: 0,
            nearestDwellingM: null,
        };
    }

    let within = 0;
    let nearest: number | null = null;
    for (const d of input.dwellings) {
        const dist = distanceToRing(d.point, ring);
        if (!Number.isFinite(dist)) continue;
        if (dist <= parameters.dwellingRadiusM) within += 1;
        if (nearest === null || dist < nearest) nearest = dist;
    }

    if (input.dwellingsCoverage === 'unknown') {
        return {
            ...base,
            verdict: 'indeterminate',
            indeterminateBecause:
                'dwelling coverage within the radius is unknown (capped / clipped / degraded fetch) — an empty or ' +
                'sparse set cannot be read as absence',
            dwellingsWithinRadius: within,
            nearestDwellingM: nearest,
        };
    }

    const densityOk = within >= parameters.minDwellingsInRadius;
    const continuityOk = nearest !== null && nearest <= parameters.maxGapToNearestDwellingM;

    // A failed density or continuity test is a positive finding on complete data: `outside`.
    if (!densityOk || !continuityOk) {
        return { ...base, verdict: 'outside', indeterminateBecause: null, dwellingsWithinRadius: within, nearestDwellingM: nearest };
    }

    if (parameters.requireRoadAccess) {
        if (input.roadAccess === null) {
            return {
                ...base,
                verdict: 'indeterminate',
                indeterminateBecause: 'road access not derived (frontage derivation not run) and the parameter set requires it',
                dwellingsWithinRadius: within,
                nearestDwellingM: nearest,
            };
        }
        if (input.roadAccess === false) {
            return { ...base, verdict: 'outside', indeterminateBecause: null, dwellingsWithinRadius: within, nearestDwellingM: nearest };
        }
    }

    return { ...base, verdict: 'inside', indeterminateBecause: null, dwellingsWithinRadius: within, nearestDwellingM: nearest };
}

/* ───────────────────────────── the RuleState seat ─────────────────────────────── */

/**
 * Seat a derivation as the `B5` state — `resolved / derivable / estimated`, the shape
 * `ruleState.test.ts` pins for a declared-method derivation. The value spells the verdict AND
 * that it is derived, so no reader can mistake it for the commune's own determination.
 */
export function frPauRuleState(d: FrPauDerivation, ref: RuleSourceRef): RuleState {
    const params =
        `r=${d.parameters.dwellingRadiusM}m · n≥${d.parameters.minDwellingsInRadius} · ` +
        `gap≤${d.parameters.maxGapToNearestDwellingM}m · access=${d.parameters.requireRoadAccess ? 'required' : 'not required'}`;
    return {
        rule: 'B5',
        status: 'resolved',
        reachability: 'derivable',
        value: `${d.verdict}-derived-pau`,
        unit: null,
        datum: null,
        provenance: 'estimated',
        ref: {
            ...ref,
            article:
                `L.111-3; CE 29 mars 2017 n° 393730; CAA Douai n° 16DA01991; CAA Bordeaux n° 16BX04244 — ` +
                `derivation (${params}; dwellings within radius ${d.dwellingsWithinRadius}` +
                `${d.nearestDwellingM === null ? '' : `, nearest ${d.nearestDwellingM.toFixed(1)} m`}` +
                `${d.indeterminateBecause === null ? '' : `; indeterminate: ${d.indeterminateBecause}`}), non-authoritative`,
        },
    };
}
