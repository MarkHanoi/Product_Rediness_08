// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-RGEU-ART60 (lane ENVELOPE-IBERIA round 3, 2026-09-04) — doctrine §3 art. 60 + §12 step 10:
// "Minimum 10 m between façades with habitable-room openings."
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Round 2 shipped art. 59 (the plane) and art. 65 (the pé-direito); art. 60 was the one national
// geometric rule of the step-10 stack with NO module. It is NEIGHBOUR-DEPENDENT like art. 59: the
// 10 m is measured between the PROPOSED façade and the OPPOSING façade, so the rule cannot be
// applied from the parcel alone. This module therefore takes, per parcel edge class, the distance
// from THAT edge to the nearest opposing façade (measured outward, by the caller from context
// buildings) and answers how far the proposed façade must pull back from the edge so that the two
// façades are ≥ 10 m apart — an ADDITIONAL inward erosion, composed with Re/Af by the pipeline.
//
// ⛔ THE DIRECTION OF EVERY UNKNOWN IS STATED (L-616):
//   • opposing distance UNKNOWN on an edge → `unresolved` for that edge (blocks — a smaller true
//     distance would require a larger erosion, so guessing 0 erosion OVERSTATES);
//   • "does the façade have habitable-room openings?" UNKNOWN → the rule is applied (a façade
//     WITHOUT openings is exempt, so applying it is the conservative reading) and FLAGGED assumed;
//   • no opposing façade at all on that edge → not applicable, by name.
//
// ⚠ WATCH FLAG: RGEU revocation decreed, effects deferred (`PT_RGEU_STATUS_WATCH`).
//
// PURITY: L2-pure. No I/O.

import type { ParcelEdgeClassification } from '@pryzm/schemas';
import { PT_RGEU_STATUS_WATCH } from './ptHeightQuantities.js';
import { type PtInstrumentRef } from './ptProvenance.js';

export const PT_RGEU_ART60_MIN_M = 10;

export const PT_RGEU_ART60: PtInstrumentRef = {
    instrument: 'Regulamento Geral das Edificações Urbanas (RGEU, DL 38 382/1951, as amended)',
    version: 'RGEU — in force, revocation decreed with effects DEFERRED',
    dateInForce: null,
    article: 'art. 60.º — distância mínima de 10 m entre fachadas com vãos de compartimentos habitáveis',
};

/** One façade-facing edge class of the parcel, with what the caller measured across it. */
export interface PtArt60Edge {
    readonly edge: Exclude<ParcelEdgeClassification, 'unclassified'>;
    /**
     * Distance from THIS parcel edge, outward, to the nearest opposing façade (m). `null` = not
     * measured (blocks). Pass `Infinity`/a `noOpposingFacade` flag when there is none.
     */
    readonly opposingFacadeDistance_m: number | null;
    /** True when the caller established there is NO opposing façade across this edge. */
    readonly noOpposingFacade?: boolean;
    /** Will the proposed façade on this edge carry habitable-room openings? null = unknown (assumed yes). */
    readonly habitableOpenings: boolean | null;
    /** The Re/Af already eroding this edge (m) — art. 60 only ADDS what Re/Af leave uncovered. */
    readonly existingErosion_m: number;
}

export interface PtArt60EdgeOutcome {
    readonly edge: PtArt60Edge['edge'];
    readonly effect: 'not-applicable' | 'satisfied' | 'additional-erosion' | 'unresolved';
    /** Extra inward erosion required ON TOP of Re/Af, m (0 unless `additional-erosion`). */
    readonly additionalErosion_m: number;
    readonly why: string;
}

export type PtArt60Verdict =
    | {
          readonly ok: true;
          readonly edges: readonly PtArt60EdgeOutcome[];
          /** `assumed` when any façade's openings were unknown. */
          readonly confidence: 'resolved' | 'assumed';
          readonly assumptions: readonly string[];
          readonly instrument: PtInstrumentRef;
          readonly watch: string;
      }
    | {
          readonly ok: false;
          readonly refusalReason: string;
          readonly edges: readonly PtArt60EdgeOutcome[];
          readonly instrument: PtInstrumentRef;
      };

/**
 * PURE: art. 60 per edge. Required separation S = 10 m; the proposed façade sits `existingErosion`
 * inside the edge, the opposing façade `D` outside it, so the gap is `existingErosion + D` and the
 * additional erosion is `max(0, 10 − existingErosion − D)`. TOTAL.
 */
export function evaluatePtRgeuArt60(edges: ReadonlyArray<PtArt60Edge>): PtArt60Verdict {
    const out: PtArt60EdgeOutcome[] = [];
    const assumptions: string[] = [];
    const unresolved: string[] = [];
    for (const e of edges) {
        if (e.noOpposingFacade === true) {
            out.push({ edge: e.edge, effect: 'not-applicable', additionalErosion_m: 0, why: 'no opposing façade across this edge — art. 60 does not bind here' });
            continue;
        }
        if (e.habitableOpenings === false) {
            out.push({ edge: e.edge, effect: 'not-applicable', additionalErosion_m: 0, why: 'the proposed façade carries no habitable-room openings — art. 60 does not bind' });
            continue;
        }
        if (e.habitableOpenings === null) {
            assumptions.push(`${e.edge} edge: whether the façade will carry habitable-room openings is unknown — art. 60 APPLIED (the conservative reading; a façade without openings would be exempt).`);
        }
        const d = e.opposingFacadeDistance_m;
        if (d === null || !Number.isFinite(e.existingErosion_m) || e.existingErosion_m < 0) {
            unresolved.push(`${e.edge} edge: the distance to the opposing façade is not measured — art. 60 cannot be applied; assuming no opposing façade would OVERSTATE.`);
            out.push({ edge: e.edge, effect: 'unresolved', additionalErosion_m: 0, why: 'opposing façade distance not measured' });
            continue;
        }
        if (d === Infinity) {
            out.push({ edge: e.edge, effect: 'not-applicable', additionalErosion_m: 0, why: 'no opposing façade (distance ∞)' });
            continue;
        }
        if (!Number.isFinite(d) || d < 0) {
            unresolved.push(`${e.edge} edge: opposing distance ${String(d)} is not a distance.`);
            out.push({ edge: e.edge, effect: 'unresolved', additionalErosion_m: 0, why: 'non-finite/negative distance' });
            continue;
        }
        const gap = e.existingErosion_m + d;
        const extra = Math.max(0, PT_RGEU_ART60_MIN_M - gap);
        if (extra <= 1e-9) {
            out.push({ edge: e.edge, effect: 'satisfied', additionalErosion_m: 0, why: `façade gap ${gap.toFixed(2)} m ≥ ${PT_RGEU_ART60_MIN_M} m (Re/Af ${e.existingErosion_m} m + opposing ${d} m)` });
        } else {
            out.push({ edge: e.edge, effect: 'additional-erosion', additionalErosion_m: extra, why: `façade gap would be ${gap.toFixed(2)} m < ${PT_RGEU_ART60_MIN_M} m — the ${e.edge} façade must pull back a further ${extra.toFixed(2)} m (art. 60)` });
        }
    }
    if (unresolved.length > 0) {
        return { ok: false, refusalReason: unresolved.join(' '), edges: out, instrument: PT_RGEU_ART60 };
    }
    return {
        ok: true,
        edges: out,
        confidence: assumptions.length === 0 ? 'resolved' : 'assumed',
        assumptions,
        instrument: PT_RGEU_ART60,
        watch: PT_RGEU_STATUS_WATCH,
    };
}
