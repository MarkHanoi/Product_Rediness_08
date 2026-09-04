// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-IMPLANTACAO (lane ENVELOPE-IBERIA, 2026-09-04) — doctrine §12 steps 8 + 9: the C1 family
// INFERRED (always `inferred`/`assumed`, refused without a stated basis) and the polígono de
// implantação DERIVED from `Re` and `Af` — "the NATIONALLY SANCTIONED METHOD, not an
// interpretation" (§2.5).
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// STEP 8 — C1. Doctrine: "C1 is stated nowhere as a field. Infer it from typology and alinhamento
// language, and mark derivation_method = inferred, confidence = assumed, ALWAYS. If C1 cannot be
// inferred with a stated basis, REFUSE — the wrong family produces well-formed nonsense."
// The families are the RATIFIED `GeometricRuleKind` vocabulary (packages/schemas GeometricRule.ts)
// — this file names three of them and mints none. Each vocabulary entry keys on a PHRASE the
// regulamento / Planta de Ordenamento legend actually uses, and that phrase IS the stated basis.
// Evidence base for each entry is repo-measured (cited inline); anything outside the table refuses.
//
// STEP 9 — the polígono de implantação. Re (recuo: alinhamento → façade plane) erodes the FRONT
// edge; Af lateral erodes the SIDE edges; Af tardoz erodes the REAR edge. It reuses the SHIPPED
// `insetPolygonPerEdge` (§grep-for-the-existing-solver-first). A null Re/Af is UNRESOLVED and
// blocks — ⛔ never 0 (L-616: `0` is "build to the boundary", a determination). When the plan DRAWS
// the polygon (PU/PP/loteamento), the drawn one is used and checked against Ai (area ≥ Ai).
//
// PURITY: L2-pure. Data + pure functions. No I/O.

import type { ParcelEdgeClassification, Pt } from '@pryzm/schemas';
import { insetPolygonPerEdge } from '../../geometry/insetPolygon.js';
import { ptAssumed, ptResolved, type PtInstrumentRef, type PtProvenancedValue } from './ptProvenance.js';

/* ══════════════════════════════ step 8 — C1 inference ══════════════════════════════ */

/** The three ratified families a Portuguese legend can name. Members of `GeometricRuleKind` — not a rival. */
export type PtC1Family = 'alignment' | 'setback' | 'context-aggregate';

export interface PtC1VocabularyEntry {
    /** The normalised phrase (accent/case-insensitive) the legend or regulamento uses. */
    readonly phrase: string;
    readonly family: PtC1Family;
    /** The stated basis — WHY this phrase implies this family. Travels onto the output. */
    readonly basis: string;
    /** Where the repo measured this phrase in a real Portuguese legend. */
    readonly evidence: string;
}

/** DR 5/2019 concept the inference is framed in (alinhamento / recuo / afastamento / polígono de implantação). */
export const PT_C1_INSTRUMENT: PtInstrumentRef = {
    instrument: 'Decreto Regulamentar n.º 5/2019 — alinhamento, recuo, afastamento, polígono de implantação; município Planta de Ordenamento legend',
    version: 'DR 5/2019',
    dateInForce: '2019-09-27',
    article: 'Anexo — conceitos: alinhamento (Al), recuo (Re), afastamento (Af), polígono de implantação; C1 inferred from typology/alinhamento language (doctrine §12 step 8)',
};

/**
 * THE VOCABULARY — every entry keys on a phrase MEASURED in a served Portuguese legend and states
 * its basis. Order matters only for the FIRST match; ties are refused (see `inferPtC1Family`).
 */
export const PT_C1_VOCABULARY: readonly PtC1VocabularyEntry[] = [
    {
        phrase: 'frente urbana continua',
        family: 'alignment',
        basis: 'a CONTINUOUS urban frontage places the façade ON the alinhamento (recuo 0) with the built depth measured from it — the alignment + depth grammar',
        evidence: 'Porto CRUS legend «Solo Urbano – Espaços centrais – Área de frente urbana contínua tipo I/II», served live 2026-09-02 (ptPortoPdmDraft.ts, ptPortoFucTipo)',
    },
    {
        phrase: 'moradia',
        family: 'setback',
        basis: 'the moradia (detached/semi-detached house) typology is governed by afastamentos to the boundaries — the per-edge setback grammar',
        evidence: 'Porto CRUS legend «Área de edifícios de tipo moradia» (tools/envelope-slot-coverage/out/pt.slots.md, fabric frame, n = 6); doctrine §6 example «EH1 — Espaço habitacional de moradias»',
    },
    {
        phrase: 'implantacao livre',
        family: 'setback',
        basis: 'blocos isolados de implantação LIVRE — no alinhamento binds the façade; the footprint is bounded by afastamentos only',
        evidence: 'Porto CRUS legend «Área de blocos isolados de implantação livre» (pt.slots.md fabric frame, n = 7)',
    },
    {
        phrase: 'tracado urbano',
        family: 'context-aggregate',
        basis: 'Lisboa\'s Traçados Urbanos A/B state NO índice and fix height as a TRIMMED MEAN of the neighbours\' façade heights — a fabric-derived (context-aggregate) grammar (ADR-0379 kind)',
        evidence: 'Lisboa CRUS legend «Espaço Central e Habitacional – Traçado Urbano A/B/C Consolidado» (pt.slots.md fabric frame, n = 25); pt/sources/LISBOA-RPDML-PARAMETERS.md',
    },
] as const;

export type PtC1Inference =
    | {
          readonly ok: true;
          readonly family: PtProvenancedValue<PtC1Family>;
          readonly matched: PtC1VocabularyEntry;
      }
    | {
          readonly ok: false;
          /** Doctrine step 8 — no stated basis ⇒ REFUSE. */
          readonly refusalReason: string;
          readonly candidates: readonly PtC1Family[];
      };

function normalisePt(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * PURE: infer the C1 family from legend / regulamento language. ALWAYS `inferred` + `assumed`
 * (doctrine step 8). Two vocabulary entries naming DIFFERENT families in one text is a refusal,
 * not a pick; no match is a refusal, not a default.
 */
export function inferPtC1Family(designacaoOrText: string): PtC1Inference {
    const n = normalisePt(designacaoOrText);
    const hits = PT_C1_VOCABULARY.filter((v) => n.includes(v.phrase));
    const families = [...new Set(hits.map((h) => h.family))];
    if (hits.length === 0) {
        return {
            ok: false,
            refusalReason:
                `C1 cannot be inferred with a stated basis from «${designacaoOrText}» — no vocabulary phrase matches. ` +
                'The wrong family produces well-formed nonsense (doctrine §12 step 8): REFUSED. Extend PT_C1_VOCABULARY with a measured phrase + basis, never guess.',
            candidates: [],
        };
    }
    if (families.length > 1) {
        return {
            ok: false,
            refusalReason:
                `C1 ambiguous for «${designacaoOrText}»: the text names ${families.join(' AND ')} (${hits.map((h) => `"${h.phrase}"`).join(', ')}). Two families are never resolved by picking — refused.`,
            candidates: families,
        };
    }
    const m = hits[0]!;
    return {
        ok: true,
        matched: m,
        family: ptAssumed(
            m.family,
            'GeometricRuleKind',
            PT_C1_INSTRUMENT,
            'inferred',
            ['legend/regulamento text', `phrase "${m.phrase}"`],
            'ordinance-pdf',
            [`C1 = ${m.family} INFERRED from the phrase "${m.phrase}": ${m.basis}. Evidence: ${m.evidence}. Doctrine step 8: always inferred/assumed — confirm against the regulamento article.`],
        ),
    };
}

/* ══════════════════════════════ step 9 — polígono de implantação ══════════════════════════════ */

export interface PtImplantacaoInput {
    /** The parcel ring (A1), scene-XZ metres. */
    readonly parcelRing: ReadonlyArray<Pt>;
    /** Per-edge classification (front = the alinhamento edge; side = lateral; rear = tardoz). */
    readonly edgeClassifications: ReadonlyArray<ParcelEdgeClassification>;
    /** Re — recuo, m (alinhamento → façade plane). null = unresolved (⛔ never 0). */
    readonly recuo_m: number | null;
    /** Af lateral, m. null = unresolved. */
    readonly afastamentoLateral_m: number | null;
    /** Af tardoz, m. null = unresolved. */
    readonly afastamentoTardoz_m: number | null;
    /** A DRAWN polígono de implantação (PU/PP/loteamento), if the plan draws one — takes precedence. */
    readonly drawnPoligono?: ReadonlyArray<Pt> | null;
    /** Ai — área de implantação the plan fixes (m²), to check a drawn polygon against (area ≥ Ai). */
    readonly Ai_m2?: number | null;
}

export type PtImplantacaoOutcome =
    | {
          readonly kind: 'poligono';
          readonly ring: ReadonlyArray<Pt>;
          readonly source: 'drawn' | 'derived-from-recuo-afastamentos';
          readonly areaM2: number;
          readonly confidence: 'resolved';
          readonly instrument: PtInstrumentRef;
          readonly inputs: readonly string[];
      }
    | {
          /** The erosion consumed the parcel: no polígono exists under these Re/Af — a legally grounded no. */
          readonly kind: 'empty';
          readonly refusalReason: string;
          readonly instrument: PtInstrumentRef;
      }
    | {
          readonly kind: 'unresolved';
          readonly refusalReason: string;
          readonly instrument: PtInstrumentRef;
      };

function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

/**
 * PURE: build the polígono de implantação. A drawn polygon wins (checked against Ai); otherwise
 * Re/Af erode the parcel through the shipped per-edge inset. TOTAL.
 */
export function buildPtPoligonoImplantacao(input: PtImplantacaoInput): PtImplantacaoOutcome {
    const instrument = PT_C1_INSTRUMENT;
    if (input.drawnPoligono && input.drawnPoligono.length >= 3) {
        const area = ringArea(input.drawnPoligono);
        if (typeof input.Ai_m2 === 'number' && Number.isFinite(input.Ai_m2) && area + 1e-6 < input.Ai_m2) {
            return {
                kind: 'unresolved',
                instrument,
                refusalReason: `the drawn polígono de implantação (${area.toFixed(2)} m²) is SMALLER than the plan's Ai (${input.Ai_m2} m²) — DR 5/2019 requires area ≥ Ai; a data defect to report, not to reconcile`,
            };
        }
        return { kind: 'poligono', ring: input.drawnPoligono, source: 'drawn', areaM2: area, confidence: 'resolved', instrument, inputs: ['drawnPoligono', 'Ai_m2'] };
    }
    if (input.parcelRing.length < 3) {
        return { kind: 'unresolved', instrument, refusalReason: 'no parcel ring (A1 unresolved) — doctrine §12 step 1 precedes step 9' };
    }
    if (input.edgeClassifications.length !== input.parcelRing.length) {
        return { kind: 'unresolved', instrument, refusalReason: `edge classifications (${input.edgeClassifications.length}) do not match the ring (${input.parcelRing.length} edges) — A3 per-edge classification is unresolved` };
    }
    const missing: string[] = [];
    if (input.recuo_m === null) missing.push('Re (recuo)');
    if (input.afastamentoLateral_m === null) missing.push('Af lateral');
    if (input.afastamentoTardoz_m === null) missing.push('Af tardoz');
    if (missing.length > 0) {
        return {
            kind: 'unresolved',
            instrument,
            refusalReason: `${missing.join(', ')} not in hand — the polígono de implantação cannot be derived (doctrine §2.5). ⛔ A missing Re/Af is NEVER 0 ("build to the boundary" is a determination, L-616). Resolve from the regulamento article or refuse.`,
        };
    }
    const re = input.recuo_m as number;
    const afL = input.afastamentoLateral_m as number;
    const afT = input.afastamentoTardoz_m as number;
    if ([re, afL, afT].some((v) => !Number.isFinite(v) || v < 0)) {
        return { kind: 'unresolved', instrument, refusalReason: 'a recuo/afastamento is non-finite or negative — not a distance' };
    }
    const inset = insetPolygonPerEdge(input.parcelRing, input.edgeClassifications, {
        front: re,
        side: afL,
        rear: afT,
        // An unclassified edge is eroded by the LARGEST of the three — the conservative (inward) choice.
        unclassified: Math.max(re, afL, afT),
    });
    if (inset.degenerate || inset.polygon.length < 3) {
        return {
            kind: 'empty',
            instrument,
            refusalReason: `Re ${re} m / Af lateral ${afL} m / Af tardoz ${afT} m consume the parcel entirely — no polígono de implantação exists under these values (a legally grounded no, if the values are the regulamento's)`,
        };
    }
    return {
        kind: 'poligono',
        ring: inset.polygon,
        source: 'derived-from-recuo-afastamentos',
        areaM2: ringArea(inset.polygon),
        confidence: 'resolved',
        instrument,
        inputs: ['parcelRing', 'edgeClassifications', 'recuo_m', 'afastamentoLateral_m', 'afastamentoTardoz_m'],
    };
}

/** Convenience: a resolved Re/Af value block (for callers assembling the doctrine §13 output). */
export function ptRecuoAfastamentoValue(which: 'Re' | 'Af-lateral' | 'Af-tardoz', metres: number, article: string, instrument: string): PtProvenancedValue<number> {
    return ptResolved(metres, 'm', { instrument, version: null, dateInForce: null, article }, 'direct', [which], 'ordinance-pdf');
}
