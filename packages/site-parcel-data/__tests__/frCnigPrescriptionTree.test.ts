// FR — the CNIG prescription decision tree. Each block pins a distinction that turns an UNKNOWN
// into a different, honest answer the source itself licenses (FR-FOUNDER-REACHABILITY-BOUNDARY §2).

import { describe, expect, it } from 'vitest';

import type { RuleSourceRef } from '@pryzm/schemas';
import {
    FR_CNIG_TREE_ORDER,
    classifyFrCnigCode,
    frCnigRuleStates,
    recoverFrNumberFromText,
    type FrPrescriptionRow,
} from '../src/rulepacks/frCnigPrescriptionTree.js';

const ref: RuleSourceRef = {
    country: 'FR',
    authority: "IGN / Géoportail de l'urbanisme (DGALN)",
    dataset: 'zone_urba',
    plan_id: '200046977_PLUI_20260326',
    object_id: null,
    document: '200046977_reglement_20260326.pdf',
    article: null,
    page: null,
};

function row(p: Partial<FrPrescriptionRow>): FrPrescriptionRow {
    return {
        typepsc: null, stypepsc: null, libelle: null, txt: null,
        nomfic: '200046977_reglement_20260326.pdf', idurba: '200046977_PLUI_20260326', ...p,
    };
}

describe('CNIG code classification — the table the founder called “much better than an LLM”', () => {
    it.each([
        ['39', '02', 'C2', 'maximum'],
        ['39', '97', 'C2', 'qualitative'],
        ['39', '98', 'C2', 'alternative'],
        ['38', '02', 'C4', 'maximum'],
        ['38', '97', 'C4', 'qualitative'],
        ['40', '02', 'C6', 'maximum'],
        ['40', '97', 'C6', 'qualitative'],
        ['15', '01', 'C5', 'implantation'],
        ['15', '03', 'C5', 'implantation'],
        ['14', null, 'C4', 'drawn-volume'],
    ])('%s.%s → %s / %s', (t, s, parameter, semantic) => {
        const c = classifyFrCnigCode(t, s);
        expect(c).not.toBeNull();
        expect(c!.parameter).toBe(parameter);
        expect(c!.semantic).toBe(semantic);
    });

    it('normalises the subtype spellings the service actually serves', () => {
        // `.00`, `''`, `'0'` and absent all mean "unspecified" — measured in live GPU responses.
        for (const s of ['00', '', '0', null, undefined]) {
            expect(classifyFrCnigCode('39', s)!.semantic).toBe('unspecified');
        }
        // A single-digit SUBTYPE pads to the canonical two — `'2'` is `.02`, a maximum.
        expect(classifyFrCnigCode('39', '2')).toMatchObject({ semantic: 'maximum', code: '39.02' });
        // ⚠ Padding a single-digit TYPE cannot resurrect an unsourced family: `'9'` → `'09'`, which
        // is not one of the five we hold, so it stays null rather than being guessed into one.
        expect(classifyFrCnigCode('9', '2')).toBeNull();
    });

    it('⛔ an UNSOURCED code classifies as null, never guessed into a parameter', () => {
        // The founder's §2 list plus 14 is what we hold. 43/44/47 are real CNIG codes with no
        // sourced envelope meaning here — inventing one would silently mis-file a real rule.
        for (const t of ['43', '44', '47', '99', '17']) {
            expect(classifyFrCnigCode(t, '00')).toBeNull();
        }
    });
});

describe('numeric recovery — the CNIG schema mandates NO universal numeric field', () => {
    it('recovers a number and its unit VERBATIM from free text', () => {
        expect(recoverFrNumberFromText('Hauteur maximale 9 m')).toEqual({
            value: 9, unit: 'm', verbatim: 'Hauteur maximale 9 m',
        });
        expect(recoverFrNumberFromText(null, 'emprise 40 %')).toMatchObject({ value: 40, unit: '%' });
        expect(recoverFrNumberFromText('R+2, soit 3 niveaux')).toMatchObject({ unit: 'niveaux' });
    });

    it('⚠ MEASURED: Paris `39.02` carries "Hauteur plafond" and an EMPTY txt — type, no value', () => {
        // Live GPU response, 2026-09-04. This is the founder's
        // "RULE EXISTS=YES · TYPE=YES · LOCATION=YES · SOURCE=YES · VALUE=NOT ALWAYS", observed.
        expect(recoverFrNumberFromText('Hauteur plafond', '')).toBeNull();
    });

    it('never invents a number from an empty or absent text', () => {
        expect(recoverFrNumberFromText(null, undefined, '')).toBeNull();
        expect(recoverFrNumberFromText('Hauteur maximale')).toBeNull();
    });
});

describe('the decision tree — one RuleState per parameter the codes speak to', () => {
    it('⭐ `39.97` answers QUALITATIVE RULE, not UNKNOWN — the source licenses it (R151-12)', () => {
        const s = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '97', libelle: "La hauteur doit s'harmoniser avec le bâti voisin." })],
            ref, reglementReachable: true,
        });
        expect(s).toHaveLength(1);
        expect(s[0]!.status).toBe('qualitative');
        expect(s[0]!.rule).toBe('C2');
        if (s[0]!.status !== 'qualitative') throw new Error('unreachable');
        // Quoted verbatim — a qualitative rule silently rendered as a number manufactures an
        // entitlement out of a sentence that grants none.
        expect(s[0]!.text).toContain("s'harmoniser");
        expect(s[0]!.ref.object_id).toBe('TYPEPSC=39.97');
    });

    it('a drawn `39.02` WITH a number resolves; the same code WITHOUT one is `unrecovered`, not absent', () => {
        const withNum = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '02', libelle: 'Hauteur maximale 12 m' })],
            ref, reglementReachable: true,
        });
        expect(withNum[0]).toMatchObject({ status: 'resolved', value: 12, unit: 'm' });
        // ⚠ The datum is NOT in the feature — a number on an unresolved plane is not a cap (ADR-0377).
        expect(withNum[0]).toMatchObject({ datum: null });

        const paris = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '02', libelle: 'Hauteur plafond', txt: '' })],
            ref, reglementReachable: true,
        });
        expect(paris[0]).toMatchObject({ status: 'unrecovered', failure: 'pdf', mechanism: 'present' });
        // `mechanism: 'present'` keeps this OUT of the F1 gap bucket: the plan is not silent,
        // our extractor is. Reporting it as F1 would blame the commune for our unbuilt parser.
        if (paris[0]!.status !== 'unrecovered') throw new Error('unreachable');
        expect(paris[0]!.mechanism).not.toBe('absent');
    });

    it('an unreachable règlement is `missing-source`, a reachable one is `pdf` — two remedies', () => {
        const p = [row({ typepsc: '38', stypepsc: '02', libelle: 'Emprise au sol', nomfic: null })];
        expect(frCnigRuleStates({ prescriptions: p, ref, reglementReachable: false })[0]).toMatchObject({ failure: 'missing-source' });
        expect(frCnigRuleStates({ prescriptions: p, ref, reglementReachable: true })[0]).toMatchObject({ failure: 'pdf' });
    });

    it('a marge de recul is RESOLVED even with no number — the drawn line IS the constraint', () => {
        const s = frCnigRuleStates({
            prescriptions: [row({ typepsc: '15', stypepsc: '01', libelle: 'Marge de recul' })],
            ref, reglementReachable: true,
        });
        expect(s[0]).toMatchObject({ rule: 'C5', status: 'resolved', value: 'drawn implantation line' });
    });

    it('a plan-masse (14) resolves C4 and OUTRANKS a rival 38 row — the drawn plan governs', () => {
        const s = frCnigRuleStates({
            prescriptions: [
                row({ typepsc: '38', stypepsc: '02', libelle: 'Emprise au sol' }),
                row({ typepsc: '14', stypepsc: '00', libelle: 'Secteur de plan de masse' }),
            ],
            ref, reglementReachable: true,
        });
        const c4 = s.filter((x) => x.rule === 'C4');
        expect(c4).toHaveLength(1);
        expect(c4[0]).toMatchObject({ status: 'resolved', reachability: 'source-complete' });
        expect(c4[0]!.ref.object_id).toBe('TYPEPSC=14');
    });

    it('⚠ a `.98` with fewer than two NAMED readings is NOT claimed as an alternative set', () => {
        // A bounded-looking answer with nothing bounding it is worse than an honest gap.
        const thin = frCnigRuleStates({
            prescriptions: [row({ typepsc: '38', stypepsc: '98', libelle: 'Emprise alternative' })],
            ref, reglementReachable: true,
        });
        expect(thin[0]!.status).toBe('unrecovered');

        const named = frCnigRuleStates({
            prescriptions: [row({ typepsc: '38', stypepsc: '98', libelle: '40 % emprise', txt: 'alignement obligatoire sur voie' })],
            ref, reglementReachable: true,
        });
        expect(named[0]!.status).toBe('alternative');
        if (named[0]!.status !== 'alternative') throw new Error('unreachable');
        expect(named[0]!.alternatives).toHaveLength(2);
    });

    it('emits NOTHING for a parameter no code speaks to — silence is the caller’s judgement', () => {
        // Manufacturing an `unrecovered` row here would put OUR unparsed document into the same
        // bucket as a plan that genuinely lacks the mechanism (F1).
        const s = frCnigRuleStates({ prescriptions: [row({ typepsc: '39', stypepsc: '02', libelle: '9 m' })], ref, reglementReachable: true });
        expect(s.map((x) => x.rule)).toEqual(['C2']);
    });

    it('is deterministic — output order is the declared one, never the server’s feature order', () => {
        const p = [
            row({ typepsc: '40', stypepsc: '97', libelle: 'volumétrie qualitative' }),
            row({ typepsc: '15', stypepsc: '02', libelle: 'latérales' }),
            row({ typepsc: '39', stypepsc: '02', libelle: '9 m' }),
        ];
        const a = frCnigRuleStates({ prescriptions: p, ref, reglementReachable: true });
        const b = frCnigRuleStates({ prescriptions: [...p].reverse(), ref, reglementReachable: true });
        expect(a.map((x) => x.rule)).toEqual(['C2', 'C5', 'C6']);
        expect(a).toEqual(b);
        expect(FR_CNIG_TREE_ORDER).toEqual(['C2', 'C4', 'C5', 'C6']);
    });

    it('every emitted state carries the 8-field legal address, refusals included', () => {
        const s = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '97', libelle: 'qualitative' })],
            ref, reglementReachable: true,
        });
        expect(s[0]!.ref).toMatchObject({
            country: 'FR', dataset: 'prescription',
            plan_id: '200046977_PLUI_20260326', document: '200046977_reglement_20260326.pdf',
        });
    });
});
