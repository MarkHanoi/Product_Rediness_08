// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-RUSTICO-FUEL-STRIP (lane ENVELOPE-IBERIA, 2026-09-04) — DL 82/2021 art. 61, THE ONE
// PORTUGUESE ENVELOPE CONSTRAINT THAT IS FULLY DERIVABLE FROM NATIONAL LAW.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ WHY THIS AND NOT A MUNICIPAL PACK. Every other Portuguese envelope parameter — índice,
// cércea, profundidade, afastamentos — lives in one of 308 municipal PDM regulamento PDFs, and
// two whole-document reads landed this week say the numbers are often not there AT ALL:
//   • PORTO (`sources/SOURCES.md` §A.0.3b): NO subcategory states footprint + height + intensity.
//     `afastamento` occurs ONCE in 100 pages; `índice de ocupação` never; `pé-direito` once with
//     no value and no named referent, so "3 pisos" cannot even be converted to metres.
//   • LISBOA (`sources/LISBOA-RPDML-PARAMETERS.md`): Traçados A and B state NO índice at all and
//     their height is a TRIMMED MEAN of the neighbours' façade heights.
// `PT-ENVELOPE-DERIVATION-DOCTRINE.md` §5 names the exception and says to prefer it:
// **rural buildability is FULLY DERIVABLE.** DL 82/2021 art. 61 states a NUMBER, nationally, for
// every município, with no municipal transcription in the loop.
//
// THE RULE (doctrine §5, §12 step 3). Construction or extension in *solo rústico*, OUTSIDE an
// *aglomerado rural*, in forest territory **or less than 50 m from forest territory**, requires
// CUMULATIVELY: a **50 m fuel-management strip** around the building, AND a setback from the
// property boundary (or from an abutting property of the same owner) **never less than 50 m**.
//
//     parcel ring → negative buffer 50 m → EMPTY  → REFUSE, citing DL 82/2021 art. 61
//                                        → non-empty → that ring is the OUTER BOUND
//
// ⛔ IT IS AN OUTER BOUND, NEVER AN ENTITLEMENT. Clearing this constraint does not grant a
// building: the parcel still needs its municipal parameters, and this module supplies none. What
// it supplies is the one thing Portugal CAN answer without a regulamento — *"can anything be built
// on this rustic parcel at all?"* — and, on many small rustic parcels, the answer is a legally
// grounded NO that needs no municipal reading whatsoever. That refusal is a complete product
// (doctrine §0: *"a cited refusal is a valid, complete product"*).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ THE ±50 % PROBLEM, AND WHY THE DEFAULT IS FLAGGED RATHER THAN TRUSTED (L-616)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Doctrine §5: *"Strip widths may vary ±50 % per the Programa Sub-regional."* The direction
// matters and it is NOT symmetric in consequence:
//   • a programme NARROWING the strip to 25 m means our 50 m erosion UNDERSTATES the buildable
//     area — safe, the L-616-approved direction;
//   • a programme WIDENING it to 75 m means our 50 m erosion **OVERSTATES** — the one direction
//     C58 §1.4 forbids, and the exact shape of L-616 (*"an UNKNOWN constraint drawn as zero or
//     unbounded OVERSTATES on real land"*).
// ⇒ When no Programa Sub-regional value is supplied, the outcome is stamped
// `stripBasis: 'statutory-default-unverified'` and `mayOverstate: true`. It is still returned —
// a refusing gate needs its escape hatch (L-942), and the 50 m statutory figure is the correct
// starting point — but a caller MUST NOT publish it as an entitlement without saying so.
// Supplying `subRegionalStripM` clears the flag and records the basis.
//
// ⚠ AND THE APPLICABILITY INPUTS ARE TRISTATE, NOT BOOLEAN. "Is this within 50 m of forest
// territory?" has three answers — yes, no, and NOBODY ASKED — and the third must not collapse
// into either. Doctrine §0.2: any parameter at `unresolved` BLOCKS the envelope. So `null`
// forest proximity yields `unresolved`, never `not-applicable`.
//
// ⛔ WHAT IT DOES NOT DO, stated so it is not mistaken for more:
//   • it does NOT decide *solo rústico* vs *solo urbano* — that is B2 (CRUS + the municipal
//     planta de ordenamento), supplied by the caller;
//   • it does NOT locate forest territory — that is the SGIFR/ICNF layer, and PRYZM wires none;
//   • it does NOT apply the maintenance strips (50 m into forest, 10 m into agricultural, 100 m
//     around aglomerados / campsites / industrial parks), which bind land OUTSIDE the parcel;
//   • it does NOT model the *aglomerado rural* boundary — supplied by the caller.
// Every one of those is an INPUT with an honest `null`, not a silent assumption.
//
// ⚠ WATCH FLAG (doctrine §13): the SGIFR technical norms were re-homologated by **Despacho
// 675/2026** and are reviewed **not less than annually**. `PT_DL82_ART61_REVIEW_WATCH` carries it.
//
// PURITY: L2-pure. Geometry + data. No I/O. Reuses the SHIPPED `insetPolygonPerEdge` solver
// (§grep-for-the-existing-solver-first) rather than writing a second erosion.

import type { ParcelEdgeClassification, Pt } from '@pryzm/schemas';
import { insetPolygonPerEdge } from '../../geometry/insetPolygon.js';

/** The statutory strip, in metres. NOT a tunable — it is the article's own number. */
export const PT_DL82_ART61_STRIP_M = 50;

/** The citation every outcome carries. Values and citations travel together or not at all. */
export const PT_DL82_ART61_CITATION =
    'Decreto-Lei n.º 82/2021, art. 61.º (Sistema de Gestão Integrada de Fogos Rurais) — ' +
    'construção ou ampliação em solo rústico, fora de aglomerado rural, em território florestal ' +
    'ou a menos de 50 m de território florestal, exige CUMULATIVAMENTE uma faixa de gestão de ' +
    'combustível de 50 m em redor da edificação E um afastamento ao limite da propriedade (ou a ' +
    'prédio confinante do mesmo proprietário) nunca inferior a 50 m.';

/** Doctrine §13 watch flag — the norms move, so a cached verdict has a shelf life. */
export const PT_DL82_ART61_REVIEW_WATCH =
    'SGIFR technical norms re-homologated by Despacho 675/2026 and reviewed NOT LESS THAN ' +
    'ANNUALLY. A strip width read today may be superseded; re-check before relying on a cached ' +
    'verdict.';

/** Tristate: the third value is "nobody asked", and it must never collapse into yes or no. */
export type PtTristate = true | false | null;

export interface PtRusticoFuelStripInput {
    /** The parcel ring in scene-XZ METRES. Fewer than 3 vertices is not a parcel. */
    readonly parcelRing: ReadonlyArray<Pt>;
    /** B2 — is this *solo rústico*? `null` ⇒ unresolved (the classification was not made). */
    readonly isSoloRustico: PtTristate;
    /** Is the parcel INSIDE an *aglomerado rural*? Inside ⇒ art. 61 does not bind. */
    readonly inAglomeradoRural: PtTristate;
    /**
     * Is the parcel in forest territory OR less than 50 m from it? `null` ⇒ unresolved.
     * ⚠ PRYZM wires NO forest-territory layer today, so in production this is `null` until an
     * SGIFR/ICNF source is added — which is why `unresolved` is a first-class outcome here and
     * not an afterthought.
     */
    readonly forestOrWithin50m: PtTristate;
    /**
     * The strip width the *Programa Sub-regional* sets for this territory, in metres, when it is
     * in hand. Omit / `null` to use the statutory 50 m — which is then FLAGGED as possibly
     * overstating (see the header's ±50 % note).
     */
    readonly subRegionalStripM?: number | null;
}

export type PtRusticoFuelStripOutcome =
    | {
          readonly kind: 'not-applicable';
          /** Which clause of art. 61 fails to bind — never a bare "no". */
          readonly why: string;
      }
    | {
          readonly kind: 'unresolved';
          /** Doctrine §0.2 — this BLOCKS the envelope. The caller refuses. */
          readonly refusalReason: string;
          readonly ordinanceRef: string;
      }
    | {
          readonly kind: 'refused-empty';
          /** The 50 m erosion consumed the parcel: nothing may be built. A LEGALLY GROUNDED no. */
          readonly refusalReason: string;
          readonly ordinanceRef: string;
          readonly stripM: number;
      }
    | {
          readonly kind: 'outer-bound';
          /** The eroded ring — the OUTER BOUND, not the buildable footprint. */
          readonly ring: ReadonlyArray<Pt>;
          readonly stripM: number;
          readonly stripBasis: 'sub-regional-programme' | 'statutory-default-unverified';
          /**
           * ⛔ TRUE when the strip is the unverified statutory default: a Programa Sub-regional
           * may WIDEN it by up to 50 %, in which case this ring is too generous. L-616 direction.
           */
          readonly mayOverstate: boolean;
          readonly ordinanceRef: string;
          readonly watch: string;
      };

/**
 * PURE: apply DL 82/2021 art. 61 to a rustic parcel. Total — every input lands on exactly one
 * outcome, and `null` inputs land on `unresolved` rather than on a guess.
 *
 * ⚠ THE ORDER OF THE GATES IS THE ARTICLE'S OWN and is not interchangeable: rústico → outside an
 * aglomerado rural → forest proximity. Asking about forest first would consult a layer for land
 * the article does not reach, and would report `unresolved` (blocking the envelope) on urban
 * parcels the rule never touches.
 */
export function evaluatePtRusticoFuelStrip(
    input: PtRusticoFuelStripInput,
): PtRusticoFuelStripOutcome {
    const ref = PT_DL82_ART61_CITATION;

    if (input.isSoloRustico === null) {
        return {
            kind: 'unresolved',
            refusalReason:
                'The land classification (solo urbano / solo rústico) was not resolved, so it ' +
                'cannot be determined whether DL 82/2021 art. 61.º binds this parcel. Resolve B2 ' +
                '(CRUS + the municipal planta de ordenamento) or refuse.',
            ordinanceRef: ref,
        };
    }
    if (input.isSoloRustico === false) {
        return { kind: 'not-applicable', why: 'Art. 61.º binds SOLO RÚSTICO only; this parcel is solo urbano.' };
    }
    if (input.inAglomeradoRural === null) {
        return {
            kind: 'unresolved',
            refusalReason:
                'Whether this parcel sits inside an AGLOMERADO RURAL was not resolved. Art. 61.º ' +
                'binds only OUTSIDE one, so the answer changes the verdict and cannot be assumed.',
            ordinanceRef: ref,
        };
    }
    if (input.inAglomeradoRural === true) {
        return {
            kind: 'not-applicable',
            why: 'Art. 61.º binds outside aglomerados rurais; this parcel is inside one.',
        };
    }
    if (input.forestOrWithin50m === null) {
        return {
            kind: 'unresolved',
            refusalReason:
                'Whether this parcel is in FOREST TERRITORY or less than 50 m from it was not ' +
                'resolved — PRYZM wires no SGIFR/ICNF forest-territory layer. Art. 61.º binds ' +
                'only in that case, so the envelope is BLOCKED rather than granted by default ' +
                '(a default here would publish a rustic envelope the fire regime may forbid).',
            ordinanceRef: ref,
        };
    }
    if (input.forestOrWithin50m === false) {
        return {
            kind: 'not-applicable',
            why:
                'The parcel is neither in forest territory nor within 50 m of it, so art. 61.º\'s ' +
                'cumulative 50 m requirement does not bind. ⚠ This says NOTHING about the ' +
                'municipal envelope, which is a separate question this module does not answer.',
        };
    }

    // ── The strip, and whether we can vouch for its width. ────────────────────────────────────
    const supplied = input.subRegionalStripM ?? null;
    const usingProgramme = typeof supplied === 'number' && Number.isFinite(supplied) && supplied >= 0;
    const stripM = usingProgramme ? supplied : PT_DL82_ART61_STRIP_M;

    if (input.parcelRing.length < 3) {
        return {
            kind: 'unresolved',
            refusalReason:
                'No parcel geometry (A1 unresolved) — the negative buffer cannot be computed. ' +
                'Doctrine §12 step 1: no geometry and no client input ⇒ refuse.',
            ordinanceRef: ref,
        };
    }

    // ⚠ A UNIFORM erosion, deliberately: art. 61.º states a distance to THE PROPERTY BOUNDARY,
    // with no front/side/rear distinction, so every edge is `unclassified` and the solver's
    // uniform-fallback seat carries the whole value. Classifying edges here would invent a
    // distinction the article does not make.
    const edges: ParcelEdgeClassification[] = input.parcelRing.map(() => 'unclassified');
    const inset = insetPolygonPerEdge(input.parcelRing, edges, {
        front: stripM,
        side: stripM,
        rear: stripM,
        unclassified: stripM,
    });

    if (inset.degenerate || inset.polygon.length < 3) {
        return {
            kind: 'refused-empty',
            refusalReason:
                `A ${stripM} m setback from every property boundary, required cumulatively by ` +
                'DL 82/2021 art. 61.º for construction in forest-adjacent solo rústico outside an ' +
                'aglomerado rural, consumes this parcel entirely: no part of it is more than ' +
                `${stripM} m from a boundary. Nothing may be built here under that regime.`,
            ordinanceRef: ref,
            stripM,
        };
    }

    return {
        kind: 'outer-bound',
        ring: inset.polygon,
        stripM,
        stripBasis: usingProgramme ? 'sub-regional-programme' : 'statutory-default-unverified',
        // ⛔ The L-616 flag. See the header: only a WIDENING programme makes this overstate, and
        // "no programme in hand" cannot rule that out.
        mayOverstate: !usingProgramme,
        ordinanceRef: ref,
        watch: PT_DL82_ART61_REVIEW_WATCH,
    };
}
