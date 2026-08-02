#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE FIX SHAPE — SELECT ON MUNICIPALITY, NEVER ON FIGURES.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
//   Barcelona     -> BCN_ALCADA_REGULADORA_TABLE      (MPGM-2007, signed SIG-2)
//   Badalona      -> its own instrument, DOGC 5224
//   no footnote   -> BCN_ART327_BASE_METROPOLITAN_TABLE
//   unknown       -> REFUSE, cited
//
// ⛔⛔ BADALONA'S VALUES ARE NUMERICALLY IDENTICAL TO BARCELONA'S. A VALUE CHECK PASSES WHILE THE
//    ATTRIBUTION STAYS WRONG. `bcnAlcadaReguladora.ts` states it outright: «a figures-only check
//    cannot tell the two municipalities apart», and records that the misattribution recurred THREE
//    TIMES. ⇒ THIS MODULE EMITS TWO INDEPENDENT VERDICTS PER MUNICIPALITY:
//      `valueVerdict`        — does the metre value the product emits match the governing text?
//      `attributionVerdict`  — does the product reach that value by citing the RIGHT instrument?
//    They are different defects with different consequences. Badalona is `value-correct /
//    attribution-wrong`; the no-footnote set is `value-wrong / attribution-wrong`. Collapsing them
//    would let Badalona look clean when it is not.
//
// ⚠⚠ THE `unknown` BRANCH IS NOT DECORATIVE. A municipality whose footnote status cannot be
//    established from the CORPUS must REFUSE WITH A CITED REASON — it must NOT fall back to either
//    table. Falling back to the base table would be the SAME CLASS of silent default that caused
//    this defect; it would merely be wrong in the pessimistic direction. UNKNOWN NEVER NO.
//
// ⛔ THE FOOTNOTE STATUS IS ESTABLISHED FROM THE COMMITTED CORPUS, NOT FROM `esAmbPgmScope.ts`.
//    A repo assertion is what disagreed with the repo's behaviour in the first place. `corpusVerify.mjs`
//    is the evidence; this module consumes its output and refuses to invent one.

/** The three deviation classes. There is no fourth, and `unknown` is not one of them — it is a refusal. */
export const LADDER_SOURCE = {
    BARCELONA_MPGM2007: 'BARCELONA_MPGM2007',
    BADALONA_DOGC5224: 'BADALONA_DOGC5224',
    BASE_METROPOLITAN: 'BASE_METROPOLITAN',
    REFUSE_UNKNOWN: 'REFUSE_UNKNOWN',
};

/**
 * @param ine            INE code — ⛔ the key. NEVER the name.
 * @param corpusFindings output of corpusVerify.mjs: `{ deviatingInstrumentsByIne, pgmScopeByIne }`
 */
export function selectLadder(ine, corpusFindings) {
    const dev = corpusFindings.deviatingInstrumentsByIne?.[ine] ?? null;
    const inScope = corpusFindings.pgmGovernedIne?.includes(ine) ?? null;

    if (inScope === false) {
        return {
            ine, source: LADDER_SOURCE.REFUSE_UNKNOWN,
            refuse: true,
            reason: `PGM≠'S' — the Pla General Metropolità does not govern this municipality, so NEITHER Art. 327 ladder applies. Its own general plan supplies the storeys→metres convention and PRYZM does not hold it.`,
            citation: 'AMB qualificacio_refos_3857 layer 16, PGM flag, read per CODI_INE',
        };
    }
    if (inScope === null) {
        return { ine, source: LADDER_SOURCE.REFUSE_UNKNOWN, refuse: true, reason: 'PGM scope for this INE could not be established from the service — UNKNOWN, and UNKNOWN NEVER NO.', citation: null };
    }
    if (dev) {
        return {
            ine, source: dev.ine === '08019' ? LADDER_SOURCE.BARCELONA_MPGM2007 : LADDER_SOURCE.BADALONA_DOGC5224,
            refuse: false,
            reason: `carries its OWN instrument modifying Art. 327/328 — ${dev.instrument}`,
            citation: dev.corpusFile ?? dev.instrument,
            // ⚠ Recorded separately so a numeric coincidence can never be mistaken for a shared instrument.
            numericallyIdenticalToBarcelona: dev.numericallyIdenticalToBarcelona ?? null,
        };
    }
    if (corpusFindings.footnoteAbsenceEstablishedForIne?.includes(ine)) {
        return {
            ine, source: LADDER_SOURCE.BASE_METROPOLITAN, refuse: false,
            reason: 'carries NO footnote entry modifying Art. 327/328 in the committed compendium — the BASE metropolitan ladder governs',
            citation: corpusFindings.footnoteEvidence ?? null,
        };
    }
    return {
        ine, source: LADDER_SOURCE.REFUSE_UNKNOWN, refuse: true,
        reason: 'footnote status NOT ESTABLISHED from the committed corpus. ⛔ Refusing rather than defaulting to either table — a silent default is exactly the defect being measured, and defaulting to the base table would only be wrong in the pessimistic direction.',
        citation: null,
    };
}

/**
 * THE TWO VERDICTS, EMITTED SEPARATELY AND NEVER COLLAPSED.
 *
 * @param sel          selectLadder() result — what SHOULD govern.
 * @param appliedTable the table the PRODUCT actually reads today (always Barcelona's — the defect).
 * @param governingTable the table `sel.source` names.
 */
export function verdicts(sel, appliedTable, governingTable) {
    if (sel.refuse) {
        return {
            attributionVerdict: 'ATTRIBUTION-WRONG',
            attributionWhy: `the product attributes Barcelona's MPGM-2007 to this municipality; the correct behaviour is a CITED REFUSAL (${sel.reason.slice(0, 90)})`,
            valueVerdict: 'VALUE-UNDETERMINED',
            valueWhy: 'no governing ladder is established, so there is no correct metre value to compare against. ⛔ This is NOT "value-correct" — it is the absence of a test.',
        };
    }
    const key = (t) => t.map((b) => `${b.floorsAboveGround}:${b.height_m}`).join(',');
    const valuesMatch = key(appliedTable) === key(governingTable);
    const isBarcelona = sel.source === LADDER_SOURCE.BARCELONA_MPGM2007;
    return {
        attributionVerdict: isBarcelona ? 'ATTRIBUTION-CORRECT' : 'ATTRIBUTION-WRONG',
        attributionWhy: isBarcelona
            ? 'the product reads Barcelona\'s MPGM-2007 table for Barcelona, citing the instrument whose scope is «al terme municipal de Barcelona». Correct.'
            : `the product reads Barcelona's MPGM-2007 table and would cite «al terme municipal de Barcelona» — an instrument that does NOT govern this municipality. The governing source is ${sel.source}.`,
        valueVerdict: valuesMatch ? 'VALUE-CORRECT' : 'VALUE-WRONG',
        valueWhy: valuesMatch
            ? (isBarcelona
                ? 'the applied table IS the governing table.'
                : '⚠ the applied table is numerically IDENTICAL to the governing one — the metre values the product emits happen to be right. ⛔ THE ATTRIBUTION IS STILL WRONG, and a figures-only check cannot tell the two apart. This is precisely the case the source file warns recurred three times.')
            : 'the applied table differs band-for-band from the governing one — every emitted metre value is wrong, in the OVER-GRANTING direction.',
    };
}
