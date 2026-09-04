// §DK-GRAPHIC-LEG (lane ENVELOPE-NLDK, 2026-09-04) — the leg for the 61.2 % of lokalplan features
// where `iomfangreg = true`: the volume is regulated by DRAWING, not by number.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT PHASE 0 ESTABLISHED, AND WHAT THIS LEG ADDS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `iomfangreg = true` co-occurs with a published number 0/183 times (D4c) and covers 61.2 % of
// lokalplan features. `dkOmfangRegulation.ts` already turns that flag into the honest verdict
// `regulated-outside-structured-fields` → `unrecovered` / `pdf` / mechanism PRESENT, with the
// doklink. That is a refusal-quality upgrade. It is not yet a footprint.
//
// This leg asks the next question: WHERE is the drawn regulation, and is any of it digitised?
//   · Plandata's `theme_pdk_byggefelt_vedtaget` IS the digitised drawing — a byggefelt is the
//     kortbilag's buildable field as a polygon, with `bygkunifelt` / `bygvejledende` telling us
//     whether it binds (`dkByggefeltBinding.ts`, single classifier, inherited not re-decided). Where
//     a byggefelt exists for the parcel, the FOOTPRINT half of the drawn regulation is machine-
//     readable: a `geometric` constraint (ConstraintForm), consumed as authoritative geometry.
//   · Where none exists, a `lokalplandelomraade` polygon may still bound the AREA the drawn rule
//     applies to — an upper-bound extent, not a footprint.
//   · Where neither exists, the regulation is in the plan document's kortbilag: `graphic`, with
//     the doklink — the founder's "biggest technical grey area", reachable, not structured.
//
// The HEIGHT half stays where `dkOmfangRegulation` left it (`pdf`, mechanism present) unless the
// byggefelt itself publishes `maxbygnhjd` — 1/15 in Phase 0 D2, so rarely, but then it is a fact.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NOT a placement resolver — `dkEnvelopePlacement.ts` (G6 tiers) hands the engine its
// `GeometricRule`; this module decides, per RULE, what the drawn regulation lets us SAY, in the
// shared `RuleState` vocabulary, and which ROUTE the footprint took. NOT a PDF reader. NOT a
// re-classifier of bindingness.
//
// PURE (C58 §1.9). Deterministic. No I/O.

import type { FetchOutcome, RuleState } from '@pryzm/schemas';
import type { DkByggefeltEnvelopeContribution } from './dkByggefeltBinding.js';
import type { DkOmfangVerdict } from './dkOmfangRegulation.js';

/** Which route the drawn regulation's FOOTPRINT half took. Closed. */
export type DkGraphicRoute =
    /** a placeable byggefelt polygon exists — the drawing is digitised; footprint is `geometric`. */
    | 'byggefelt-geometry'
    /** no byggefelt; a delområde polygon bounds the AREA the drawn rule applies to (upper-bound extent). */
    | 'delomraade-extent'
    /** neither digitised — the regulation is in the kortbilag of the plan document. */
    | 'document-kortbilag'
    /** the byggefelt request did not answer — the route is UNKNOWN, retryable. */
    | 'byggefelt-unresolved'
    /** the leg does not apply: the plan does not flag `iomfangreg=true` (or is kompleks). */
    | 'not-applicable';

export interface DkGraphicLegInputs {
    readonly omfang: DkOmfangVerdict;
    /** The byggefelt contribution for this parcel, as a `FetchOutcome`; `null` = not consulted. */
    readonly byggefelt?: FetchOutcome<DkByggefeltEnvelopeContribution> | null;
    /** Is a `lokalplandelomraade` polygon present at the point? `null` = not consulted. */
    readonly delomraadePresent?: boolean | null;
    readonly doklink?: string | null;
    readonly planLabel?: string | null;
}

export interface DkGraphicLegResolution {
    readonly route: DkGraphicRoute;
    /** `true` when a HIGHER-authority source was transient — do not cache (§FAILURE-IS-NOT-EMPTY). */
    readonly higherAuthorityUnresolved: boolean;
    /** The footprint (C4) statement, in the shared vocabulary. Null when the leg does not apply. */
    readonly footprintState: ((ref: RuleState['ref']) => RuleState) | null;
    /** The height (C2) statement. Null when the leg does not apply. */
    readonly heightState: ((ref: RuleState['ref']) => RuleState) | null;
    readonly statement: string;
    readonly caveats: readonly string[];
}

/**
 * Resolve the graphic leg for one parcel. Pure and total.
 *
 * ROUTE ORDER IS AUTHORITY ORDER: byggefelt (the digitised drawing) > delområde (its extent) >
 * the document. A transient byggefelt fetch does not fall through silently to the document — it
 * marks the route unresolved and the answer uncacheable, because a retry could replace a PDF
 * pointer with plan geometry.
 */
export function resolveDkGraphicLeg(input: DkGraphicLegInputs): DkGraphicLegResolution {
    const plan = input.planLabel && input.planLabel.trim() !== '' ? input.planLabel : 'the governing lokalplan';
    const doklink = input.doklink && input.doklink.trim() !== '' ? input.doklink : null;
    const stoppedAtDoc = doklink ?? 'the lokalplan document (doklink not served)';

    if (input.omfang.kind !== 'regulated-outside-structured-fields') {
        return {
            route: 'not-applicable',
            higherAuthorityUnresolved: false,
            footprintState: null,
            heightState: null,
            statement:
                `${plan}: the graphic leg does not apply — iomfangreg is not true here (${input.omfang.kind}); ` +
                'the structured-field path or the kompleks route governs.',
            caveats: [],
        };
    }

    const bf = input.byggefelt ?? null;
    const heightUnrecovered = (ref: RuleState['ref']): RuleState => ({
        rule: 'C2',
        status: 'unrecovered',
        partial: null,
        reachability: 'extractable',
        failure: 'pdf',
        mechanism: 'present',
        stoppedAt: stoppedAtDoc,
        ref,
    });

    // ── byggefelt found and placeable → the drawing is digitised ──────────────────────────────
    if (bf !== null && bf.status === 'found' && bf.value.semantics !== 'not-placeable') {
        const c = bf.value;
        const caveats: string[] = [...c.caveats];
        if (c.semantics === 'binding-obligation') {
            caveats.push('the byggefelt is a MANDATORY placement (bygkunifelt=true) — a MIN obligation, not an upper bound');
        }
        return {
            route: 'byggefelt-geometry',
            higherAuthorityUnresolved: false,
            footprintState: (ref) => ({
                rule: 'C4',
                status: 'resolved',
                reachability: 'source-complete',
                value: `byggefelt polygon (${c.semantics}; ${c.citation.document})`,
                unit: null,
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            }),
            heightState:
                c.maxHeightM !== null
                    ? (ref) => ({
                          rule: 'C2',
                          status: 'resolved',
                          reachability: 'source-complete',
                          value: c.maxHeightM as number,
                          unit: 'm',
                          datum: null,
                          provenance: 'pipeline-extracted',
                          ref,
                      })
                    : heightUnrecovered,
            statement:
                `${plan} regulates extent by drawing (iomfangreg=true) and the drawing is DIGITISED: a ` +
                `${c.semantics} byggefelt polygon bounds the footprint. ` +
                (c.maxHeightM !== null
                    ? `The byggefelt publishes maks. bygningshøjde ${c.maxHeightM} m.`
                    : 'Height stays in the plan document.'),
            caveats: Object.freeze(caveats),
        };
    }

    // ── byggefelt transient → unresolved, uncacheable ─────────────────────────────────────────
    if (bf !== null && (bf.status === 'transient' || bf.status === 'aborted')) {
        return {
            route: 'byggefelt-unresolved',
            higherAuthorityUnresolved: true,
            footprintState: (ref) => ({
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'inaccessible',
                mechanism: 'present',
                stoppedAt: `theme_pdk_byggefelt_vedtaget did not answer (${bf.status}${'reason' in bf && bf.reason ? ': ' + bf.reason : ''})`,
                ref,
            }),
            heightState: heightUnrecovered,
            statement:
                `${plan} regulates extent by drawing (iomfangreg=true); whether the drawing is digitised as a ` +
                'byggefelt is UNKNOWN because the byggefelt request did not answer. Retry before reading the document.',
            caveats: ['do not cache — a retry may replace the document pointer with plan geometry'],
        };
    }

    // ── no placeable byggefelt: delområde extent, else the document ───────────────────────────
    const bfNote =
        bf === null
            ? 'byggefelt not consulted'
            : bf.status === 'absent'
              ? 'no byggefelt published here'
              : 'the byggefelt is not placeable (metadata conflict or unpublished flags)';
    if (input.delomraadePresent === true) {
        return {
            route: 'delomraade-extent',
            higherAuthorityUnresolved: false,
            footprintState: (ref) => ({
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'graphic',
                mechanism: 'present',
                stoppedAt: `${stoppedAtDoc} — a lokalplandelomraade polygon bounds the AREA the drawn rule applies to (upper-bound extent, not a footprint)`,
                ref,
            }),
            heightState: heightUnrecovered,
            statement:
                `${plan} regulates extent by drawing (iomfangreg=true); ${bfNote}. A delområde polygon bounds ` +
                'the area the drawn rule applies to — an UPPER-BOUND extent, never drawn as the footprint. The ' +
                'footprint itself is in the kortbilag.',
            caveats: ['the delområde is an extent, not a buildable field'],
        };
    }
    return {
        route: 'document-kortbilag',
        higherAuthorityUnresolved: false,
        footprintState: (ref) => ({
            rule: 'C4',
            status: 'unrecovered',
            partial: null,
            reachability: 'extractable',
            failure: 'graphic',
            mechanism: 'present',
            stoppedAt: stoppedAtDoc,
            ref,
        }),
        heightState: heightUnrecovered,
        statement:
            `${plan} regulates extent by drawing (iomfangreg=true); ${bfNote}` +
            (input.delomraadePresent === false ? ', no delområde polygon' : '') +
            `. The regulation is in the plan document's kortbilag${doklink ? `: ${doklink}` : ''}. ` +
            'This is a statement about the INSTRUMENT (mechanism present), not a gap — the footprint is drawn, not numbered.',
        caveats: [],
    };
}
