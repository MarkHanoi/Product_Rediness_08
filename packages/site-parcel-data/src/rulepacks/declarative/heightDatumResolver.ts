// ADR-0377 / §S1-DATUM — THE FIRST RESOLVER CONSUMER of the height-datum seat.
//
// WHAT THIS IS. `HeightDatum` (packages/schemas/src/site/HeightDatum.ts) names WHICH plane a
// stated height is measured from. This module answers the next question — *who can resolve that
// plane to metres on a real parcel?* — with a typed, exhaustive routing verdict:
//
//   • `facade-rasant`      → WIRED. Routed to the existing Art. 240 machinery
//                            (`geometry/facadeRasantDatum.ts`), function references carried, not
//                            strings — the resolver's own refusal ladder (terrain-not-sampled /
//                            terrain-posting-too-coarse / no-front-edge / …) then governs.
//   • `absolute-national`  → FLAGGED, never resolved as a building height. The DE
//                            «72,2 m über NHN» class is now REPRESENTABLE-AND-FLAGGED: the rule
//                            can say it is an absolute altitude, and this verdict says what a
//                            consumer may and may not do with it (Paris HMC discipline: not
//                            applied as a cap without terrain + frame conversion).
//   • `unknown`            → REFUSED. An unresolved datum never defaults to any plane — the
//                            whole point of the member (ADR-0377).
//   • everything else      → REFUSED with the machinery gap NAMED as OURS (`legallyGrounded`
//                            false in spirit: the ordinance answers; PRYZM lacks the sampler —
//                            L-616 / Murcia §R-7: never attribute our gap to the law).
//
// THE SWITCH IS EXHAUSTIVE (assertNever). Adding a datum member without deciding its routing here
// is a COMPILE error naming this file — the ADR-0270 reason-4 guarantee, applied to datums.
//
// PURE + deterministic (C58 §1.1). No I/O; the rasant machinery itself takes injected samples.
// P8: OTel span on the exported entry point.

import { trace } from '@opentelemetry/api';
import { heightDatumOf, type HeightDatum, type AbsoluteVerticalFrame } from '@pryzm/schemas';
import {
    resolveParcelRasantDatum,
    resolveFacadeRasantDatum,
    facadeSamplePoints,
    assertPostingResolves,
} from '../../geometry/facadeRasantDatum.js';

const _tracer = trace.getTracer('pryzm.zoning.declarative');

/** Compile-time exhaustiveness guard (the answerabilityClass.ts idiom). */
function assertNever(x: never, context: string): never {
    throw new Error(`[heightDatumResolver] unhandled ${context}: ${String(x)}`);
}

/** The routing verdict for one datum. */
export type HeightDatumResolution =
    /**
     * A resolver EXISTS and is wired. `resolve`/`resolveSingleFacade` are the real functions —
     * the caller supplies façade fronts + injected terrain samples and inherits the Art. 240
     * refusal ladder (a routing verdict is not a resolved elevation).
     */
    | {
          readonly kind: 'wired';
          readonly datum: 'facade-rasant';
          readonly resolve: typeof resolveParcelRasantDatum;
          readonly resolveSingleFacade: typeof resolveFacadeRasantDatum;
          readonly samplePoints: typeof facadeSamplePoints;
          readonly postingGuard: typeof assertPostingResolves;
          readonly detail: string;
      }
    /**
     * REPRESENTABLE-AND-FLAGGED: an absolute national altitude. NOT a building height — a
     * consumer may carry/display it with its frame, and may NOT compare it to a relative height
     * or extrude from it without a terrain elevation at the legal reference point in the same
     * frame.
     */
    | {
          readonly kind: 'absolute-flagged';
          readonly frame: AbsoluteVerticalFrame;
          readonly detail: string;
      }
    /** No resolution. `code` names WHY; `detail` names what would close it. */
    | {
          readonly kind: 'refusal';
          readonly code: 'datum-unresolved' | 'no-resolver-wired';
          readonly datum: HeightDatum['kind'];
          readonly detail: string;
      };

/**
 * Route a height datum to its resolver. TOTAL over the member registry (exhaustive switch), and
 * total over absence: callers may pass the raw optional `ZoningRule.heightDatum` — absence is
 * `unknown` via `heightDatumOf`, which REFUSES here, so a legacy pack can never silently acquire
 * a plane it did not state.
 */
export function resolveHeightDatumStrategy(
    datum: HeightDatum | null | undefined,
): HeightDatumResolution {
    const span = _tracer.startSpan('pryzm.zoning.declarative.resolveHeightDatumStrategy');
    try {
        const d = heightDatumOf(datum);
        span.setAttribute('pryzm.heightDatum', d.kind);
        switch (d.kind) {
            case 'facade-rasant':
                return {
                    kind: 'wired',
                    datum: 'facade-rasant',
                    resolve: resolveParcelRasantDatum,
                    resolveSingleFacade: resolveFacadeRasantDatum,
                    samplePoints: facadeSamplePoints,
                    postingGuard: assertPostingResolves,
                    detail:
                        'Routed to geometry/facadeRasantDatum.ts (PGM Art. 240 machinery, L-584): ' +
                        'sample ON the façade line (ends + centre mandatory), Nyquist posting ' +
                        'guard, tram segmentation, cited refusals. ⚠ Its scalars are Art. 240’s ' +
                        'own — another jurisdiction’s façade-datum rule arrives as pack data with ' +
                        'its own article, never by re-tuning those constants.',
                };
            case 'absolute-national':
                return {
                    kind: 'absolute-flagged',
                    frame: d.frame,
                    detail:
                        `An absolute altitude in ${d.frame} is NOT a building height (ADR-0377). ` +
                        'Carry and display it with its frame; converting it to a height cap ' +
                        'requires a terrain elevation at the legal reference point in the same ' +
                        'frame (the Paris HMC discipline: representable, deliberately not applied ' +
                        'without terrain). Comparing it to a relative height is the flagged E8 DE ' +
                        'defect, not a unit mismatch.',
                };
            case 'unknown':
                return {
                    kind: 'refusal',
                    code: 'datum-unresolved',
                    datum: d.kind,
                    detail:
                        'The source does not resolve which plane its height is measured from — ' +
                        'refusing is mandatory; defaulting to any plane would publish a height ' +
                        'measured from an assumed datum (the L-584 class, ADR-0377).',
                };
            case 'street-level':
            case 'mean-ground-at-facade':
            case 'terrain-highest':
            case 'terrain-lowest':
                return {
                    kind: 'refusal',
                    code: 'no-resolver-wired',
                    datum: d.kind,
                    detail:
                        `Datum '${d.kind}' is representable but PRYZM has no sampler wired for it ` +
                        'yet (the façade-rasant machinery is Art. 240-specific). This is a gap in ' +
                        'PRYZM, not in the ordinance — never attribute our gap to the law ' +
                        '(L-616 / Murcia §R-7). A resolver lands as its own module + registry row.',
                };
            default:
                return assertNever(d, 'HeightDatum kind');
        }
    } finally {
        span.end();
    }
}
