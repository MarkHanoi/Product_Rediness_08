// Attribution fixtures — REAL DATA, hand-attributed. Not synthetic.
//
// Every `verbatim` below was read out of a real document by another agent's live run
// and is reproduced from the repo record it landed in:
//
//   Berlin  → docs/04-reference/jurisdictions/de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md §4
//             (VERIFIED 2026-07-31 by running the parser over all 209 pages of the
//             8-30 Begründung) and the corrected PROBE-VERDICT-2026-07-31.md.
//   Madrid  → docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/nz7.json
//             (the two rival `7.2.e / farRatio` records and their mutual
//             `conflict.rival` blocks) + COMPENDIO-2025-EXTRACTION-01.md §5.
//   Denmark → docs/04-reference/jurisdictions/dk/findings/
//             BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md §2/§4 (VERIFIED-LIVE).
//   Paris   → docs/04-reference/jurisdictions/fr/fr-idf/75056-paris/ENVELOPE.md
//             (the three `plub_*` layers; precedence UNKNOWN).
//
// ⚠ WHAT IS SYNTHETIC HERE, STATED HONESTLY: the *attribution* — the `instrument`,
// `legalStatus` and `ruleKind` fields — is applied BY HAND from the prose analysis in
// those documents. No producer emits it yet (LEGAL-ATTRIBUTION-MODEL.md §7.1). The
// values, the verbatims and the citations are real; the classification is a human
// reading of a human analysis. That is the honest state, and it is why these fixtures
// test the RESOLVER and cannot test an attribution PRODUCER that does not exist.

import { type ParameterEvidence } from '../../src/attribution/types.js';

const BERLIN_DOC = 'begruendung-8-30.pdf (B-Plan 8-30 Begründung)';

/**
 * BERLIN 8-30 — the four GRZ readings. **All four are correct readings of the text.**
 * Only 0,4 is the plan's binding Festsetzung. This is the regression that proves the
 * whole layer: taking 0,8 overstates buildable footprint 2×; taking 0,3 understates
 * it by 25 %.
 */
export const BERLIN_8_30_GRZ: readonly ParameterEvidence<number>[] = [
    // p8 — the 1958/60 Baunutzungsplan's DEPICTION. The verb is `dargestellt` (§5
    // BauGB) and the subject is "der Baunutzungsplan, der weiter gilt". The founder's
    // own probe quoted this sentence as 8-30's parameters; it is not.
    {
        parameter: 'maxCoverage',
        value: 0.3,
        unit: 'ratio',
        instrument: {
            id: 'Baunutzungsplan Berlin 1958/60',
            kind: 'depiction',
            effectiveFrom: '1960-01-01',
            supersededBy: 'B-Plan 8-30',
        },
        legalStatus: 'superseded',
        legalStatusSource: 'plan_text',
        ruleKind: 'numeric',
        citation: {
            document: BERLIN_DOC,
            page: 8,
            verbatim:
                'Der Baunutzungsplan, der weiter gilt, hat … folgende Ausweisungen: … wird ein ' +
                'Allgemeines Wohngebiet mit einer zulässigen Grundflächenzahl GRZ von 0,3 sowie ' +
                'einer Geschossflächenzahl GFZ von 0,9 dargestellt.',
        },
        confidence: 'high',
        note:
            '§5 BauGB Darstellung, not §9 BauGB Festsetzung. The instrument "weiter gilt" ' +
            'generally, and is still superseded FOR THIS PARCEL by 8-30\'s own Festsetzung — ' +
            'which is why kind=depiction and legalStatus=superseded are two independent facts.',
    },

    // p59 — a figure the plan's own author COMPUTED to describe existing building.
    // Same instrument as the winner, same voice, and NOT a determination. This row is
    // why `legalStatus` hangs off the STATEMENT and not off the document.
    {
        parameter: 'maxCoverage',
        value: 0.39,
        unit: 'ratio',
        instrument: { id: 'B-Plan 8-30', kind: 'binding-plan' },
        legalStatus: 'illustrative',
        legalStatusSource: 'plan_text',
        ruleKind: 'numeric',
        citation: {
            document: BERLIN_DOC,
            page: 59,
            verbatim:
                '…entspricht die zulässige Überbauung einer rechnerischen GRZ von 0,39',
        },
        confidence: 'high',
        note: '"rechnerische GRZ" — a computed descriptive figure, never a Festsetzung.',
    },

    // p56 — ✅ THE BINDING FESTSETZUNG.
    {
        parameter: 'maxCoverage',
        value: 0.4,
        unit: 'ratio',
        instrument: { id: 'B-Plan 8-30', kind: 'binding-plan', effectiveFrom: '2021-01-01' },
        legalStatus: 'binding',
        legalStatusSource: 'plan_text',
        ruleKind: 'numeric',
        citation: {
            document: BERLIN_DOC,
            page: 56,
            article: '§ 19 Abs. 2 BauNVO',
            verbatim:
                'Für das ca. 35.020 m² große Allgemeine Wohngebiet wird die zulässige Grundfläche ' +
                'gemäß § 19 Abs. 2 BauNVO auf eine GRZ von 0,4 … und die zulässige GFZ gemäß ' +
                '§ 20 Abs. 2 BauNVO auf 1,2 … begrenzt.',
        },
        confidence: 'high',
        note: '"begrenzt auf" — §9 BauGB. This plan\'s own determination.',
    },

    // p47/50/60/74/158/178 — the §19(4) BauNVO OVERRUN ceiling for Garagen und
    // Nebenanlagen. Binding law, correctly read, and NOT the base GRZ. It loses on
    // RANK (binding-plan 0 < statute 2), not on status — which is the point: it is
    // real law that is not the answer to "what is the GRZ".
    {
        parameter: 'maxCoverage',
        value: 0.8,
        unit: 'ratio',
        instrument: { id: 'BauNVO § 19 Abs. 4', kind: 'statute' },
        legalStatus: 'binding',
        legalStatusSource: 'statute',
        ruleKind: 'conditional',
        citation: {
            document: BERLIN_DOC,
            page: 47,
            article: '§ 19 Abs. 4 BauNVO',
            verbatim: '…überschritten werden darf, das einer GRZ von 0,8 entspricht',
        },
        confidence: 'high',
        note:
            'A permitted OVERRUN above the base for Garagen/Nebenanlagen, never the base. ' +
            'Taking it as the GRZ overstates buildable footprint 2×.',
    },
];

const MADRID_DOC = 'Compendio 2025 de las NNUU del PGOUM-97 (24-09-2025)';

/**
 * MADRID NZ 7 grado 2º nivel "e" — two rival FAR values, SAME instrument, SAME kind,
 * SAME legal status. Recorded in `nz7.json` with `confidence: "ambiguous"` and mutual
 * `conflict.rival` blocks: *"CONFLICT REPORTED, NOT RESOLVED."*
 *
 * Art. 8.7.20 IS the more specific (nivel-"e"-only) provision, and the Compendio
 * contains NO express derogation clause — so applying lex specialis would be an
 * unsourced legal opinion. The resolver must answer `conflicted` with NO value.
 */
export const MADRID_NZ7_2E_FAR: readonly ParameterEvidence<number>[] = [
    {
        parameter: 'farRatio',
        value: 1.0,
        unit: 'm²/m²',
        instrument: { id: MADRID_DOC, kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'statute',
        ruleKind: 'numeric',
        citation: {
            document: MADRID_DOC,
            article: '8.7.20',
            paragraph: 'párrafo único (el artículo no tiene apartados numerados)',
            page: 438,
            verbatim:
                'En el grado 2º nivel "e" especial, el uso cualificado es, el terciario en sus ' +
                'clases de oficinas y hospedaje. La edificabilidad máxima es de un (1) metro ' +
                'cuadrado por metro cuadrado de parcela edificable…',
        },
        confidence: 'medium',
        note: 'nz7.json records this at confidence "ambiguous" with a rival at 0,5.',
    },
    {
        parameter: 'farRatio',
        value: 0.5,
        unit: 'm²/m²',
        instrument: { id: MADRID_DOC, kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'statute',
        ruleKind: 'numeric',
        citation: {
            document: MADRID_DOC,
            article: '8.7.9',
            paragraph: '1.b)',
            page: 434,
            verbatim: 'Grado 2º: Cinco (5) metros cuadrados por cada diez (10) metros cuadrados.',
        },
        confidence: 'medium',
        note: 'The general grado 2º value. nz7.json records this at confidence "ambiguous".',
    },
];

/**
 * MADRID — the ONE express precedence rule (Art. 8.0.6) doing per-parameter work.
 * A catalogue listing and a Norma Zonal disagree; on `worksRegime` the catalogue
 * wins, and on `farRatio` the SAME pair cannot be ranked at all.
 */
export function madridCataloguePair(parameter: string): readonly ParameterEvidence<number>[] {
    return [
        {
            parameter,
            value: 1,
            instrument: { id: 'Catálogo de Protección (Título 4)', kind: 'catalogue-overlay' },
            legalStatus: 'binding',
            legalStatusSource: 'statute',
            ruleKind: 'numeric',
            citation: {
                document: MADRID_DOC,
                article: '8.0.6',
                page: 366,
                verbatim:
                    'el régimen de obras previsto en el Título 4 de estas Normas tendrá ' +
                    'preferencia sobre las que autorice la norma zonal por la que se regule',
            },
            confidence: 'high',
        },
        {
            parameter,
            value: 2,
            instrument: { id: MADRID_DOC, kind: 'binding-plan' },
            legalStatus: 'binding',
            legalStatusSource: 'statute',
            ruleKind: 'numeric',
            citation: {
                document: MADRID_DOC,
                article: '8.7.9',
                page: 434,
                verbatim: 'Grado 2º: Cinco (5) metros cuadrados por cada diez (10) metros cuadrados.',
            },
            confidence: 'high',
        },
    ];
}

/**
 * PARIS — three height layers, all binding plan data, precedence UNKNOWN. No FR
 * priority table is registered, so the honest answer is `conflicted`.
 */
export const PARIS_HEIGHT: readonly ParameterEvidence<number>[] = [
    {
        parameter: 'maxHeight_m',
        value: 18,
        unit: 'm',
        instrument: { id: 'PLU bioclimatique — plub_filet', kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'unresolved',
        ruleKind: 'graphical',
        citation: {
            document: 'PLU bioclimatique de Paris — plub_filet (20,644 records)',
            verbatim:
                'hauteur plafond stored as a coded letter (haut M/K/C/B/G), read from the ' +
                'graphic plan and measured from a computed surface de nivellement de l\'îlot',
        },
        confidence: 'low',
    },
    {
        parameter: 'maxHeight_m',
        value: 20,
        unit: 'm',
        instrument: { id: 'PLU bioclimatique — plub_hauteur', kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'unresolved',
        ruleKind: 'numeric',
        citation: {
            document: 'PLU bioclimatique de Paris — plub_hauteur',
            verbatim: 'hauteur layer value',
        },
        confidence: 'low',
    },
    {
        parameter: 'maxHeight_m',
        value: 25,
        unit: 'm',
        instrument: { id: 'PLU bioclimatique — plub_hmc', kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'unresolved',
        ruleKind: 'numeric',
        citation: {
            document: 'PLU bioclimatique de Paris — plub_hmc',
            verbatim: 'hauteur maximale de construction layer value',
        },
        confidence: 'low',
    },
];

/** DENMARK — one byggefelt candidate whose status comes from the state machine. */
export function dkByggefeltEvidence(
    legalStatus: ParameterEvidence<number>['legalStatus'],
    detail: string,
): ParameterEvidence<number> {
    return {
        parameter: 'buildableArea',
        value: 1,
        instrument: { id: 'Lokalplan (theme_pdk_byggefelt_vedtaget)', kind: 'binding-plan' },
        legalStatus,
        legalStatusSource: 'metadata',
        ruleKind: 'graphical',
        citation: {
            document: 'https://dokument.plandata.dk/20_2830916_1409662252522.pdf (doklink)',
            verbatim:
                'byggefelt geometry published by Plandata with bygkunifelt / bygvejledende flags',
        },
        confidence: 'high',
        note: detail,
    };
}
