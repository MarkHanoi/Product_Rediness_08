// E8-TRIAL — a TRIAL-LOCAL German (DE) qualifier lexicon.
//
// ⛔ THIS IS TRIAL SCAFFOLDING, NOT A PRODUCTION ADAPTER, AND IT EXISTS TO RECORD A
// GAP RATHER THAN TO FILL ONE.
//
// MEASURED 2026-09-02: `grep -rn ": QualifierLexicon" packages/ordinance-extraction/src`
// returns exactly ONE definition — `SWISS_GERMAN_QUALIFIERS` (`de-CH`) in
// `adapters/swissZoneTable.ts`. There is **no lexicon for Germany**, the largest
// corpus in the European wave (NRW alone: numberMatched=82,007, E8-SCOUT §3.1).
//
// ⭐ WHY THAT MATTERS AND WHY IT IS NOT A DETAIL. E4-EXECUTION-CONTROL control 8
// says the semantic qualifiers must SURVIVE normalization. `qualifierSurvivalGate`
// can only find a qualifier its lexicon names, so with no German lexicon the gate
// runs over German text and finds nothing — and "found nothing" and "there is
// nothing" print identically (§context-data-honesty). Driving the Berlin stratum
// with the Swiss lexicon would have measured Switzerland's vocabulary against
// Germany's text and silently credited the mismatch to the corpus.
//
// So this file supplies the minimum a DE run needs, IN THE TRIAL, and the finding
// reported is the ABSENCE in the package — not this stand-in. It is deliberately
// NOT written into `packages/`: minting a production German adapter is a scope
// expansion this lane was not given (control 2/10), and the right home for it is
// the DE country adapter, beside the grammar it belongs to.
//
// Every pattern below is drawn from BauNVO/BauGB vocabulary that appears in the
// measured Berlin corpus. Each one CHANGES WHAT THE NUMBER MEANS — which is the
// only test for membership.

import type { QualifierLexicon } from '../../../packages/ordinance-extraction/src/gates/qualifierSurvival.js';

export const GERMAN_QUALIFIERS: QualifierLexicon = Object.freeze({
    language: 'de',
    patterns: Object.freeze([
        {
            id: 'de-hoechstens',
            pattern: /h(ö|oe)chstens|h(ö|oe)chstma(ß|ss)/u,
            kind: 'bound' as const,
            detail: 'the value is a CEILING, not a determination.',
        },
        {
            id: 'de-mindestens',
            pattern: /mindestens|Mindest/u,
            kind: 'bound' as const,
            detail: 'the value is a FLOOR, not a ceiling — inverting it inverts the envelope (L-616).',
        },
        {
            id: 'de-maximal',
            pattern: /\bmax\.?\b|maximal|zul(ä|ae)ssig(e|en)?\s+H(ö|oe)chst/u,
            kind: 'bound' as const,
            detail: 'an explicit maximum.',
        },
        {
            id: 'de-bis-zu',
            pattern: /\bbis zu\b/u,
            kind: 'bound' as const,
            detail: '"bis zu X" is a permitted RANGE ending at X, not a determination of X.',
        },
        {
            id: 'de-ergibt-sich',
            pattern: /ergibt sich|errechnet sich/u,
            kind: 'condition' as const,
            detail:
                'the number is a COMPUTED CONSEQUENCE of other festgesetzte values, not itself a Festsetzung — ' +
                'republishing it as a rule states a derivation as a determination.',
        },
        {
            id: 'de-obergrenze-baunvo',
            pattern: /Obergrenze|§\s*17\s*(Abs\.?\s*\d+\s*)?BauNVO/u,
            kind: 'applicability' as const,
            detail:
                'a STATUTORY ceiling from the BauNVO, not this parcel’s festgesetzter value — ' +
                'the single most common overstatement in a Begründung.',
        },
        {
            id: 'de-ueberschreitung',
            pattern: /(Ü|Ue)berschreit(ung|en)|abweichend/u,
            kind: 'exception' as const,
            detail: 'an explicit DEROGATION — the base value does not apply as stated.',
        },
        {
            id: 'de-gilt-nicht',
            pattern: /gilt nicht(\s+f(ü|ue)r)?|ausgenommen/u,
            kind: 'exception' as const,
            detail: 'a rule is DISAPPLIED here — dropping it makes a conditional rule unconditional.',
        },
        {
            id: 'de-sofern',
            pattern: /\bsofern\b|\bsoweit\b|\bwenn\b/u,
            kind: 'condition' as const,
            detail: 'the value binds only if the stated condition holds.',
        },
        {
            id: 'de-ueber-nhn',
            pattern: /(ü|ue)ber\s*NHN|(ü|ue)ber\s*NN|(ü|ue)ber\s*Normalh(ö|oe)hennull/u,
            kind: 'bound' as const,
            detail:
                'the height is an ABSOLUTE ELEVATION over a vertical datum, NOT a building height. ' +
                'Treating "55,0 m über NHN" as a 55 m building is the L-584 datum defect in its purest form.',
        },
    ]),
});
