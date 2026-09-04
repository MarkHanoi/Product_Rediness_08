// FR — the CNIG prescription decision tree. Each block pins a distinction that turns an UNKNOWN
// into a different, honest answer the source itself licenses (FR-FOUNDER-REACHABILITY-BOUNDARY §2).

import { describe, expect, it } from 'vitest';

import type { RuleSourceRef } from '@pryzm/schemas';
import {
    FR_CNIG_TREE_ORDER,
    classifyFrCnigCode,
    frCnigIdPrescription,
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
        typepsc: null, stypepsc: null, nature: null, libelle: null, txt: null,
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

describe('§TRIPLE-KEY — the composite id is `TYPEPSC-STYPEPSC-NATURE`, not the dotted pair', () => {
    // Founder blocker review §1 item 2. SRU niveau 1 names the prescription a title governs by
    // exactly this string, so the tree's `object_id` must BE that string or the PDF leg (move 7)
    // has nothing to join on. The founder's own worked examples are the two asserted first.
    it('builds the founder’s worked examples verbatim', () => {
        expect(frCnigIdPrescription('15', '01', 'retrait_par_rapport_voies')).toBe('15-01-retrait_par_rapport_voies');
        expect(frCnigIdPrescription('07', '02', 'Cones_de_vue')).toBe('07-02-Cones_de_vue');
    });

    it('⚠ a v2017-vintage document publishes NO nature — the id degrades to the PAIR, never a guess', () => {
        // Absent / empty / whitespace NATURE all mean "this document predates CNIG 2.1.0". The
        // pair-shaped id is itself the vintage signal (§11 stratification), so it must not be
        // padded with an invented third segment.
        for (const n of [null, undefined, '', '   ']) {
            expect(frCnigIdPrescription('39', '02', n)).toBe('39-02');
        }
        // An unspecified SUBTYPE still occupies its segment as the CNIG `00`, so the id keeps its
        // three-segment grammar and a join on it cannot silently shift columns.
        expect(frCnigIdPrescription('14', null, null)).toBe('14-00');
    });

    it('the classification carries BOTH ids — the pair decides the semantic, the triple joins', () => {
        const c = classifyFrCnigCode('39', '02', 'hauteur_maximale');
        expect(c).toMatchObject({
            code: '39.02',
            idPrescription: '39-02-hauteur_maximale',
            nature: 'hauteur_maximale',
            semantic: 'maximum',
        });
        // ⛔ NATURE is document-authored free text and is NOT a closed list, so it must never move
        // the semantic. A `.97` stays qualitative no matter what NATURE the commune wrote.
        expect(classifyFrCnigCode('39', '97', 'hauteur_maximale')!.semantic).toBe('qualitative');
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
            prescriptions: [row({
                typepsc: '39', stypepsc: '97', nature: 'hauteur_qualitative',
                libelle: "La hauteur doit s'harmoniser avec le bâti voisin.",
            })],
            ref, reglementReachable: true,
        });
        expect(s).toHaveLength(1);
        expect(s[0]!.status).toBe('qualitative');
        expect(s[0]!.rule).toBe('C2');
        if (s[0]!.status !== 'qualitative') throw new Error('unreachable');
        // Quoted verbatim — a qualitative rule silently rendered as a number manufactures an
        // entitlement out of a sentence that grants none.
        expect(s[0]!.text).toContain("s'harmoniser");
        // §TRIPLE-KEY: `object_id` is the SRU niveau 1 `idPrescription`, not a `TYPEPSC=` prose
        // label. A refusal must be joinable on the same key as a recovery, or move 7 lands its
        // parsed values on nothing.
        expect(s[0]!.ref.object_id).toBe('39-97-hauteur_qualitative');
    });

    it('a drawn `39.02` with a number AND its datum resolves; without a number it is `unrecovered`, not absent', () => {
        // ⚠ §DATUM-DECISION (founder review §9): the number alone is NOT a recovery. The plane it
        // is measured FROM must be co-extracted from the SAME text, so the fixture carries it.
        const withNum = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '02', libelle: 'Hauteur maximale 12 m au-dessus du terrain naturel' })],
            ref, reglementReachable: true,
        });
        expect(withNum[0]).toMatchObject({ status: 'resolved', value: 12, unit: 'm' });
        // `terrain naturel` has NO ADR-0377 member, so it is carried with the `fr:` prefix rather
        // than mis-seated onto `terrain-highest`/`terrain-lowest` (which are DK/DE variants).
        expect(withNum[0]).toMatchObject({ datum: 'fr:terrain-naturel' });

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

    it('⛔ §DATUM-DECISION: a metric height on an UNKNOWN plane is `unrecovered`, the number in `partial`', () => {
        // Founder review §9, decided 2026-09-04: a "12 m" whose FROM-plane was not co-extracted is
        // not a recovery — 12 m above the road and 12 m above natural terrain are different
        // buildings on a sloping parcel. Round one emitted `resolved` with `datum: null` for nine
        // such heights, which violated the vocabulary it consumed. The 15/500 falls by design.
        const s = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '02', libelle: 'Hauteur maximale 12 m' })],
            ref, reglementReachable: true,
        });
        expect(s[0]).toMatchObject({ status: 'unrecovered', failure: 'semantic', mechanism: 'present' });
        if (s[0]!.status !== 'unrecovered') throw new Error('unreachable');
        // The number IS carried — visible and reviewable — but it never reaches a numerator.
        expect(s[0]!.partial).toMatchObject({ value: 12, unit: 'm', verbatim: 'Hauteur maximale 12 m' });
        expect(s[0]!.stoppedAt).toContain('terrain naturel');

        // A storey count and a percentage have no FROM-plane at all, so the tightening must not
        // catch them: `R+2` is a cap wherever the ground is.
        const storeys = frCnigRuleStates({
            prescriptions: [row({ typepsc: '39', stypepsc: '02', libelle: 'R+2, soit 3 niveaux' })],
            ref, reglementReachable: true,
        });
        expect(storeys[0]).toMatchObject({ status: 'resolved', value: 3, unit: 'niveaux', datum: null });
        const emprise = frCnigRuleStates({
            prescriptions: [row({ typepsc: '38', stypepsc: '02', libelle: 'Emprise au sol 40 %' })],
            ref, reglementReachable: true,
        });
        expect(emprise[0]).toMatchObject({ status: 'resolved', value: 40, unit: '%', datum: null });
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
        // The WINNER's id travels, not the loser's — a reader following `object_id` back to the GPU
        // must land on the plan-masse feature that actually governs, never on the 38 row it beat.
        expect(c4[0]!.ref.object_id).toBe('14-00');
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
