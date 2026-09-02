// LANE PT-ENVELOPE (the founder's PDM data-model brief, Immediate Action 2) — THE NATIONAL
// CATEGORY → DEVELOPABILITY MAP, and the refusal-card upgrade it powers.
//
// THE BRIEF'S PRACTICAL CONSEQUENCE, WIRED: "you can answer 'is this parcel developable, and
// for what' nationally, from the category alone, before touching any regulamento" — because
// Portugal's nomenclature is a CLOSED national list with semantic meaning (unlike France's
// five TYPEZONE letters + free text). This module maps each of the 18 categories to a typed
// DEVELOPABILITY verdict and upgrades the existing zone-named refusal card with it.
//
// WHAT THE HONEST OUTPUT IS — AND IS NOT. The output is a DEVELOPABILITY STATEMENT plus the
// catalogue citation, appended to the EXISTING cited refusal. It is NEVER a numeric envelope:
// the model carries NO envelope parameters (the brief's verified gap — the only numeric field
// in the whole five-table model is MEDIDA, area/length), so a verdict here bounds NOTHING.
// The refusal's `code` and `legallyGrounded` are UNTOUCHED by the upgrade (the
// ptPortoPdmDraftRefusal precedent: an upgrade changes the accuracy of the statement, never
// the legal claim — ptCrusZone's weakest-claim bias already chose those from the served
// classification, and the two vocabularies agree by construction; see the alignment test).
//
// THE JOIN, AND ITS TWO-WITNESS DISCIPLINE (measured 2026-09-02): CRUS serves `codigo` = the
// Anexo I catalogue code (8/8 features, 5 municípios, both classes). The lookup keys on codigo
// FIRST, falls back to an exact normalised name match on `categoria_2021`, and REFUSES (null)
// on any disagreement — codigo naming one category while the served name names another, or a
// catalogue classe contradicting the served `classe_2021`. Two witnesses disagreeing are never
// resolved by picking (the degenerate-geometry discipline, applied to attributes). A null
// upgrade = the card keeps its PRIOR honest refusal, unchanged — which is also the falsification
// path: sever the catalogue and every card reverts, no crash, no fabricated verdict.
//
// PURE. Data + refusal construction only; no I/O (the ptPortoPdmDraft discipline).

import type { EnvelopeRefusal } from '@pryzm/schemas';
import type { PtCrusZone } from './ptCrusZone.js';
import {
    PT_PDM_NORM_CITATION,
    ptSoilCategoryByCodigo,
    ptSoilCategoryByName,
    type PtSoilCategory,
} from './ptPdmDataModel.js';

/**
 * The typed national developability verdict — the brief's Immediate Action 2 assignment,
 * verbatim: "2/3/4/5/6 development targets; 7/151/152 correct nulls; rústico 13/14/16 limited;
 * the rest refusals."
 */
export type PtDevelopabilityVerdict =
    /** Codes 2, 3, 4, 5, 6 — the categoria admits private urban development. */
    | 'development-target'
    /** Codes 7, 151, 152 — no private buildable envelope exists BY CATEGORY SEMANTICS. */
    | 'correct-null'
    /** Codes 13, 14, 16 — circumscribed edification under the rural regime, per-PDM. */
    | 'limited-edification'
    /** Codes 8, 9, 10, 11, 12, 15, 17 — solo rústico reserved from urbanisation. */
    | 'no-urban-envelope';

/** The brief's assignment as data — total over the 18 codes (the totality test pins this). */
export const PT_DEVELOPABILITY_BY_CODIGO: Readonly<Record<number, PtDevelopabilityVerdict>> = {
    2: 'development-target',
    3: 'development-target',
    4: 'development-target',
    5: 'development-target',
    6: 'development-target',
    7: 'correct-null',
    151: 'correct-null',
    152: 'correct-null',
    8: 'no-urban-envelope',
    9: 'no-urban-envelope',
    10: 'no-urban-envelope',
    11: 'no-urban-envelope',
    12: 'no-urban-envelope',
    13: 'limited-edification',
    14: 'limited-edification',
    15: 'no-urban-envelope',
    16: 'limited-edification',
    17: 'no-urban-envelope',
};

/** One resolved developability statement — a verdict + prose + citation, NEVER a number. */
export interface PtDevelopabilityStatement {
    readonly category: PtSoilCategory;
    readonly verdict: PtDevelopabilityVerdict;
    /** The one-line verdict the card shows (prose; no numeric field exists on this type). */
    readonly statement: string;
    readonly citation: string;
}

/** The verdict prose — DEVELOPABILITY statements, deliberately number-free. */
const VERDICT_PROSE: Readonly<Record<PtDevelopabilityVerdict, string>> = {
    'development-target':
        'DEVELOPMENT TARGET — the national categoria admits private urban edification; the ' +
        'numbers that would bound it live in the município\'s Regulamento (not encoded)',
    'correct-null':
        'CORRECT NULL — no private buildable envelope exists by national category semantics; ' +
        'an empty envelope here is the right answer, not missing data',
    'limited-edification':
        'LIMITED — the rural regime admits circumscribed edification for this categoria ' +
        '(aglomerado rural / edificação dispersa / ocupação turística), fixed per-PDM',
    'no-urban-envelope':
        'NON-DEVELOPABLE (urban) — a solo rústico categoria the RJIGT reserves from ' +
        'urbanisation; no urban envelope exists to state',
};

/**
 * Resolve the national developability statement for a CRUS-resolved zone, or null.
 *
 * Null is a REFUSAL TO CLAIM, returned when:
 *   • neither the served `codigo` nor an exact normalised `categoria_2021` name matches the
 *     closed catalogue (unknown code, pre-2015 vocabulary, a service change — or the catalogue
 *     severed: the falsification path);
 *   • the two witnesses DISAGREE — codigo resolves one category, the name resolves another;
 *   • the catalogue classe contradicts the served `classe_2021`.
 * The caller treats null as "no upgrade" — the prior honest refusal stands unchanged.
 */
export function ptDevelopabilityForZone(zone: {
    readonly codigo: number | null;
    readonly categoria2021: string;
    readonly classe2021: string;
}): PtDevelopabilityStatement | null {
    const byCodigo = zone.codigo !== null ? ptSoilCategoryByCodigo(zone.codigo) : null;
    const byName = ptSoilCategoryByName(zone.categoria2021);

    // Two witnesses disagreeing are never resolved by picking.
    if (byCodigo !== null && byName !== null && byCodigo.codigo !== byName.codigo) return null;

    const category = byCodigo ?? byName;
    if (category === null) return null;

    // The catalogue classe must agree with the served classe — a codigo-3 (urbano) record
    // served as "Solo Rústico" is a data anomaly, not a category to certify.
    const servedClasse = zone.classe2021
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
    const expected = category.classe === 'urbano' ? 'solo urbano' : 'solo rustico';
    if (servedClasse.replace(/\s+/g, ' ').trim() !== expected) return null;

    const verdict = PT_DEVELOPABILITY_BY_CODIGO[category.codigo];
    if (verdict === undefined) return null; // unreachable while the map is total; never guess if it is not

    return {
        category,
        verdict,
        statement: VERDICT_PROSE[verdict],
        citation: PT_PDM_NORM_CITATION,
    };
}

/**
 * PURE: upgrade a zone-named refusal with the NATIONAL DEVELOPABILITY verdict + catalogue
 * citation. `code` / `legallyGrounded` / `headline` / `ordinanceRef` are UNTOUCHED — the
 * upgrade adds a statement, never a claim, and NEVER a number. When the catalogue cannot
 * settle the category (null statement), the base refusal is returned UNCHANGED — the
 * falsification contract: sever the catalogue and the prior honest refusal returns.
 */
export function ptDevelopabilityRefusal(zone: PtCrusZone, base: EnvelopeRefusal): EnvelopeRefusal {
    const dev = ptDevelopabilityForZone(zone);
    if (dev === null) return base;
    const classeLabel = dev.category.classe === 'urbano' ? 'Solo Urbano' : 'Solo Rústico';
    return {
        ...base,
        detail:
            base.detail +
            ` ⭐ NATIONAL DEVELOPABILITY (closed catalogue): ${dev.statement}. Categoria nacional ` +
            `"${dev.category.designacao}" (código ${dev.category.codigo}, ${classeLabel}), per ` +
            `${dev.citation}. The PDM data model carries NO envelope parameter (no cércea, no ` +
            `índice, no pisos, no afastamento — its only numeric field is MEDIDA, area/length), ` +
            `so this verdict is a developability statement about the CATEGORY, never an envelope.`,
        knownFacts: [
            ...base.knownFacts,
            `Categoria nacional: código ${dev.category.codigo} — ${dev.category.designacao} (${classeLabel})`,
            `Developability (catálogo nacional): ${verdictLabel(dev.verdict)}`,
        ],
    };
}

/** Short card label per verdict (the knownFacts line). */
function verdictLabel(v: PtDevelopabilityVerdict): string {
    switch (v) {
        case 'development-target':
            return 'DEVELOPMENT TARGET (numbers live in the Regulamento — unencoded)';
        case 'correct-null':
            return 'CORRECT NULL (no private buildable envelope by category semantics)';
        case 'limited-edification':
            return 'LIMITED (circumscribed rural-regime edification, per-PDM)';
        case 'no-urban-envelope':
            return 'NON-DEVELOPABLE (solo rústico reserved from urbanisation)';
    }
}
