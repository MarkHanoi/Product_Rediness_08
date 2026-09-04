// §NL-APPLICABILITY (lane ENVELOPE-NLDK, round 4, 2026-09-04) — deep audit **Gap 1**: an
// intersection is NOT an applicability.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS EXISTS TO MAKE UNREPRESENTABLE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `NL-FOUNDER-DEEP-AUDIT.md` §3 Gap 1, verbatim:
//
//   *"⛔ `parcel intersects rule geometry → rule applies` is **wrong**. Resolve **location + activity
//   + subject + rule scope + authority + effective date + exceptions**. A rule may apply only to a
//   certain activity, building type, use, area or object category. ⭐ The DSO's Toepasbaar Opvragen
//   API exposes activities and locations specifically for determining applicable rules."*
//
// The failure is asymmetric and that asymmetry is the whole design:
//   · treating a rule as APPLYING when it does not → a constraint invented on someone's land;
//   · treating a rule as NOT applying when it does → an entitlement invented on someone's land.
// Both are wrong answers with no error raised, so this module has NO arm that returns `applies` from
// a subset of the axes. `applies` requires ALL SEVEN axes SATISFIED. Anything less is
// `undetermined` — a third outcome, distinct from both, that a consumer must handle.
//
// ⚠ THE SHORT-CIRCUIT IS SOUND, THE OTHER DIRECTION IS NOT. One axis `not-satisfied` settles
// `does-not-apply` (a rule addressed to `agrarisch` does not reach a `wonen` parcel however well the
// polygons overlap). One axis `satisfied` settles NOTHING. That is why `location` alone — the
// intersection every naive pipeline performs — can never produce `applies` here.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHERE EACH AXIS COMES FROM (Toepasbaar Opvragen v7, spec read anonymously 2026-09-04, HTTP 200)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The API's 15 paths include `/locaties/_zoek`, `/primairelocaties/_zoek`, `/locatieidentificaties/_zoek`,
// `/activiteitidentificaties/_zoek`, `/activiteiten/{identificatie}/regelteksten`,
// `/activiteiten/{identificatie}/juridischebron`, `/activiteitengeaggregeerd/levenscyclus` and
// `/geometrieidentificaties/_zoek`. `NL_APPLICABILITY_SOURCES` below records which axis each feeds.
// ⛔ Its data plane answers **401** without an `x-api-key` and no key is held, so no axis is
// populated from it today — which is exactly why `not-evaluated` is a first-class verdict rather
// than an optimistic default.
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no RNG, no clock. Deterministic (C58 §1.1).

import type { RuleState } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The seven axes
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The founder's seven, in his order. A CLOSED set — adding an eighth is a doctrine change. */
export type NlApplicabilityAxis =
    /** Does the rule's geometry cover the parcel (or the part of it being built on)? */
    | 'location'
    /** Is the activity being performed one the rule addresses (nieuwbouw / uitbreiding / …)? */
    | 'activity'
    /** Is the SUBJECT — building type, use, object category — one the rule addresses? */
    | 'subject'
    /** Is the rule's own scope (the article's reach within the regeling) the one we are reading? */
    | 'rule-scope'
    /** Is the authority that adopted the rule competent here (gemeente / provincie / waterschap / rijk)? */
    | 'authority'
    /** Is the rule in force on the date the question is asked? */
    | 'effective-date'
    /** Does an exception (an uitzondering, a vergunningvrij carve-out, an afwijking) disapply it? */
    | 'exceptions';

export const NL_APPLICABILITY_AXES: readonly NlApplicabilityAxis[] = Object.freeze([
    'location',
    'activity',
    'subject',
    'rule-scope',
    'authority',
    'effective-date',
    'exceptions',
] as const);

/**
 * ⚠ THREE VERDICTS PER AXIS, NEVER A BOOLEAN. `not-evaluated` and `not-satisfied` are different
 * facts with different remedies — one is our gap, the other is the law's answer — and collapsing
 * them is the §CONTEXT-DATA-HONESTY failure this repository keeps paying for.
 */
export type NlAxisVerdict = 'satisfied' | 'not-satisfied' | 'not-evaluated';

export interface NlAxisFinding {
    readonly axis: NlApplicabilityAxis;
    readonly verdict: NlAxisVerdict;
    /** One sentence a human can act on. Required — an unexplained verdict is not reviewable. */
    readonly why: string;
}

/** Which DSO surface can populate each axis, and whether it is reachable today. */
export const NL_APPLICABILITY_SOURCES = Object.freeze({
    api: 'Omgevingsdocumenten Toepasbaar 7.7.5 (service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/toepasbaaropvragen/v7)',
    dataPlaneAnonymous: 401,
    keyHeld: false,
    axes: Object.freeze({
        location: '/locaties/_zoek · /primairelocaties/_zoek · /locatieidentificaties/_zoek · /geometrieidentificaties/_zoek',
        activity: '/activiteitidentificaties/_zoek · /activiteiten/{identificatie}/regelteksten',
        subject: '/activiteiten/{identificatie}/regelteksten (the regeltekst names the subject) — plus the omgevingsplan bestemming',
        'rule-scope': 'Presenteren v8 /regelingen/{id}/documentstructuur (which article, within which regeling)',
        authority: '/activiteiten/{identificatie}/juridischebron · Presenteren RegelingZoekobject.bevoegdGezag / typeBevoegdGezag',
        'effective-date': '/activiteitengeaggregeerd/levenscyclus · Presenteren geldigOp / inWerkingOp / beschikbaarOp',
        exceptions: 'Bbl arts. 2.29–2.31 (national floor) + the omgevingsplan overlay — see nlVergunningvrij.ts',
    }),
    verifiedBy: 'public OpenAPI documents, lane ENVELOPE-NLDK round 4; NOT a live query — no key held',
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The resolution
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlApplicabilityVerdict =
    /** 🟢 all seven axes SATISFIED. The only state in which a rule may bind an envelope. */
    | 'applies'
    /** 🔴 at least one axis NOT SATISFIED. The rule does not reach this parcel/activity. */
    | 'does-not-apply'
    /** 🟡 no axis refutes it and at least one was NOT EVALUATED. ⛔ NOT "probably applies". */
    | 'undetermined';

export interface NlApplicabilityResolution {
    readonly verdict: NlApplicabilityVerdict;
    readonly findings: readonly NlAxisFinding[];
    /** The axes that refuted the rule. Non-empty exactly when the verdict is `does-not-apply`. */
    readonly refutedBy: readonly NlApplicabilityAxis[];
    /** The axes nobody evaluated. Non-empty exactly when the verdict is `undetermined`. */
    readonly unevaluated: readonly NlApplicabilityAxis[];
    /**
     * ⛔ TRUE when the ONLY evaluated axis is `location` — i.e. the caller performed the naive
     * intersection and nothing else. Surfaced so the defect Gap 1 names is VISIBLE in the output,
     * not merely absent from the verdict.
     */
    readonly intersectionOnly: boolean;
    readonly statement: string;
}

/** Per-axis input. An axis omitted from the map is `not-evaluated` — omission is never assent. */
export type NlApplicabilityInputs = Partial<Record<NlApplicabilityAxis, { readonly verdict: NlAxisVerdict; readonly why: string }>>;

/**
 * Resolve whether a rule applies. Pure and total.
 *
 * ⛔ THERE IS NO PATH FROM A SUBSET OF THE AXES TO `applies`. A caller holding only a polygon hit
 * gets `undetermined` with `intersectionOnly: true` and the six missing axes named — never a rule it
 * may bind. That is the entire contribution of this module; everything else is bookkeeping.
 */
export function resolveNlApplicability(inputs: NlApplicabilityInputs): NlApplicabilityResolution {
    const findings: NlAxisFinding[] = NL_APPLICABILITY_AXES.map((axis) => {
        const given = inputs[axis];
        if (given === undefined) {
            return { axis, verdict: 'not-evaluated' as const, why: 'not evaluated — no input was supplied for this axis' };
        }
        return { axis, verdict: given.verdict, why: given.why };
    });
    const refutedBy = findings.filter((f) => f.verdict === 'not-satisfied').map((f) => f.axis);
    const unevaluated = findings.filter((f) => f.verdict === 'not-evaluated').map((f) => f.axis);
    const evaluated = findings.filter((f) => f.verdict !== 'not-evaluated').map((f) => f.axis);
    const intersectionOnly = evaluated.length === 1 && evaluated[0] === 'location';

    if (refutedBy.length > 0) {
        return {
            verdict: 'does-not-apply',
            findings,
            refutedBy,
            unevaluated: [],
            intersectionOnly,
            statement:
                `the rule does NOT apply: ${refutedBy.join(', ')} ${refutedBy.length === 1 ? 'is' : 'are'} not satisfied ` +
                `(${findings.filter((f) => f.verdict === 'not-satisfied').map((f) => f.why).join('; ')})`,
        };
    }
    if (unevaluated.length > 0) {
        return {
            verdict: 'undetermined',
            findings,
            refutedBy: [],
            unevaluated,
            intersectionOnly,
            statement: intersectionOnly
                ? '⛔ INTERSECTION ONLY: the parcel meets the rule geometry and nothing else was checked. ' +
                  `Applicability is UNDETERMINED — ${unevaluated.join(', ')} were not evaluated. A polygon hit is not an applicability (deep audit Gap 1).`
                : `applicability is UNDETERMINED: no axis refutes the rule, and ${unevaluated.join(', ')} ${unevaluated.length === 1 ? 'was' : 'were'} not evaluated`,
        };
    }
    return {
        verdict: 'applies',
        findings,
        refutedBy: [],
        unevaluated: [],
        intersectionOnly: false,
        statement: 'the rule applies: all seven applicability axes are satisfied',
    };
}

/**
 * May a resolution be used to BIND an envelope parameter?
 *
 * ⭐ ONLY `applies`. `undetermined` must not bind — binding it invents a constraint — and it must not
 * be discarded either, because discarding it invents an entitlement. The caller's third option is
 * the one this vocabulary exists to give it: report the parameter as `unrecovered`.
 */
export function nlApplicabilityBinds(r: NlApplicabilityResolution): boolean {
    return r.verdict === 'applies';
}

/**
 * Project an applicability resolution onto the shared vocabulary, for a named envelope parameter.
 *
 *   applies         → the caller proceeds; this returns `resolved` on the applicability itself
 *   does-not-apply  → `refused` / `rule-not-applicable` — **F2, a CORRECT absence**
 *   undetermined    → `unrecovered` / `semantic` / mechanism `present` — OUR gap, and the
 *                     unevaluated axes are named in `stoppedAt` so the remedy is legible
 *
 * ⚠ `does-not-apply` is `refused`, NOT `unrecovered`: the instrument was read and it addresses
 * something else. Reporting that as our gap would understate a reading we performed correctly —
 * the mirror of the F1/F2 error, and just as expensive.
 */
export function nlApplicabilityToRuleState(
    r: NlApplicabilityResolution,
    rule: RuleState['rule'],
    ref: RuleState['ref'],
): RuleState {
    if (r.verdict === 'applies') {
        return {
            rule,
            status: 'resolved',
            reachability: 'derivable',
            value: 'applies',
            unit: null,
            datum: null,
            provenance: 'pipeline-extracted',
            ref,
        };
    }
    if (r.verdict === 'does-not-apply') {
        return {
            rule,
            status: 'refused',
            reachability: 'source-complete',
            basis: 'rule-not-applicable',
            reason: r.statement,
            ref,
        };
    }
    return {
        rule,
        status: 'unrecovered',
        reachability: 'derivable',
        failure: 'semantic',
        mechanism: 'present',
        stoppedAt: `applicability undetermined — unevaluated axes: ${r.unevaluated.join(', ')}${r.intersectionOnly ? ' (INTERSECTION ONLY)' : ''}`,
        partial: null,
        ref,
    };
}
