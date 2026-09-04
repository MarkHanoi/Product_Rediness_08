// §NL-ROOF-UNDERDETERMINED — THE HAND-BUILT FIXTURE `NL-ENVELOPE-MASTER-PROMPT.md` §15 REQUIRES.
//
// The acceptance criterion, verbatim:
//   "goothoogte + bouwhoogte + no roof rule → UNDERDETERMINED, never a triangle — hand-built
//    fixture."
//
// The canonical numbers from §7.4 are `goothoogte 4 m` + `bouwhoogte 10 m`, and they are used
// below unchanged so the fixture and the prompt name the same case.
//
// ⚠ WHY THIS FILE ASSERTS ABSENCES AS WELL AS PRESENCES. A test that only checked
// `status === 'UNDERDETERMINED'` would still pass if the module ALSO emitted a pitch, a ridge
// height or a roof polygon alongside it — and a renderer would happily draw the triangle. So the
// negative assertions (no pitch, no ridge, no roof surface anywhere in the result) are the actual
// guard; the status check is the easy half.

import { describe, it, expect } from 'vitest';
import {
    resolveNlRoofDeterminacy,
    nlRoofToRuleState,
    type NlRoofInputs,
} from '../src/rulepacks/nlRoofDeterminacy.js';

const REF = {
    country: 'NL',
    authority: 'Gemeente (bestemmingsplan)',
    dataset: 'ruimtelijkeplannen/IMRO2012',
    plan_id: 'NL.IMRO.TEST.FIXTURE-VG01',
    object_id: null,
    document: null,
    article: 'Artikel 4.2.1',
    page: null,
} as const;

describe('§15 acceptance — goothoogte + bouwhoogte + no roof rule → UNDERDETERMINED, never a triangle', () => {
    const CANONICAL: NlRoofInputs = {
        goothoogte_m: 4,
        bouwhoogte_m: 10,
        planTextExamined: true,
        // No roofRules at all — the §7.4 case exactly.
    };

    it('returns UNDERDETERMINED, not a determined roof', () => {
        const r = resolveNlRoofDeterminacy(CANONICAL);
        expect(r.status).toBe('UNDERDETERMINED');
    });

    it('NEVER emits a pitch, a ridge height or a roof form — the triangle guard', () => {
        const r = resolveNlRoofDeterminacy(CANONICAL);
        // The DETERMINED arm is the only one carrying these keys. Assert structurally, so adding
        // a pitch to the UNDERDETERMINED arm later fails HERE rather than in a renderer.
        expect(r).not.toHaveProperty('pitchDeg');
        expect(r).not.toHaveProperty('ridgeHeightM');
        expect(r).not.toHaveProperty('form');
        // And no roof SURFACE of any kind, under any spelling.
        const serialised = JSON.stringify(r).toLowerCase();
        for (const forbidden of ['triangle', 'apex', 'ridgeline', 'roofpolygon', 'roofsurface', 'vertices']) {
            expect(serialised).not.toContain(forbidden);
        }
    });

    it('DOES emit the honest legal bounds — the escape hatch, not a dead end (L-942)', () => {
        const r = resolveNlRoofDeterminacy(CANONICAL);
        expect(r.bounds.eavesLimitM).toBe(4);
        expect(r.bounds.overallLimitM).toBe(10);
        // The roof must live in the 6 m between the two planes. A study may draw THAT prism.
        expect(r.bounds.roofZoneThicknessM).toBe(6);
    });

    it('states WHY in words a user can read, naming both limits', () => {
        const r = resolveNlRoofDeterminacy(CANONICAL);
        expect(r.why).toContain('TWO LIMITS');
        expect(r.why).toContain('4');
        expect(r.why).toContain('10');
        expect(r.why).not.toBe('unknown');
    });

    it('maps to RuleState C6 unrecovered/pdf with mechanism PRESENT — never F1', () => {
        const s = nlRoofToRuleState(resolveNlRoofDeterminacy(CANONICAL), REF);
        expect(s.rule).toBe('C6');
        expect(s.status).toBe('unrecovered');
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('pdf');
        // ⚠ THE LOAD-BEARING ASSERTION. `absent` would be F1 — "this plan has no roof mechanism" —
        // which the plan-text census (dakhelling in 28.8% of plans) says is often simply false.
        expect(s.mechanism).toBe('present');
        expect(s.mechanism).not.toBe('absent');
    });

    it('mechanism is UNKNOWN — still never absent — when the plan text was not read', () => {
        const s = nlRoofToRuleState(
            resolveNlRoofDeterminacy({ ...CANONICAL, planTextExamined: false }),
            REF,
        );
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('unknown');
        expect(s.mechanism).not.toBe('absent');
    });
});

describe('partial roof rules narrow the family but STILL do not determine a roof', () => {
    it('a dakvorm alone is a FAMILY of roofs, not one roof', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakvorm: 'zadeldak' },
        });
        expect(r.status).toBe('UNDERDETERMINED');
        if (r.status !== 'UNDERDETERMINED') throw new Error('narrowing');
        expect(r.partialRules).toContain('dakvorm: zadeldak');
    });

    it('a pitch RANGE is not a pitch — 30–60° is still many roofs', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakvorm: 'zadeldak', dakhelling_deg: [30, 60] },
        });
        expect(r.status).toBe('UNDERDETERMINED');
    });

    it('a pitch WITHOUT a form does not say gable vs hip vs shed', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakhelling_deg: 45 },
        });
        expect(r.status).toBe('UNDERDETERMINED');
    });

    it('form AND a single pitch together DO determine one — the escape hatch works', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakvorm: 'zadeldak', dakhelling_deg: 45 },
        });
        expect(r.status).toBe('DETERMINED');
        if (r.status !== 'DETERMINED') throw new Error('narrowing');
        expect(r.pitchDeg).toBe(45);
        expect(r.form).toBe('zadeldak');
    });
});

describe('the three non-underdetermined states are DIFFERENT CLAIMS, not shades of null', () => {
    it('bouwhoogte with NO goothoogte is UNSHAPED_BY_PLAN — a fact about the LAW', () => {
        // Phase 0's commonest shape by far: 24 bouwhoogte vs 2 goothoogte (land),
        // 24 vs 6 (urban). The plan simply does not shape the roof.
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: null,
            bouwhoogte_m: 12,
            planTextExamined: true,
        });
        expect(r.status).toBe('UNSHAPED_BY_PLAN');
        const s = nlRoofToRuleState(r, REF);
        expect(s.status).toBe('refused');
        if (s.status !== 'refused') throw new Error('narrowing');
        // A legally grounded absence — NOT a coverage gap.
        expect(s.basis).toBe('no-limit-stated');
    });

    it('UNSHAPED_BY_PLAN still carries the overall cap — no-limit-stated is NOT unbounded (L-616)', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: null,
            bouwhoogte_m: 12,
            planTextExamined: true,
        });
        expect(r.bounds.overallLimitM).toBe(12);
    });

    it('no limits at all is NO_VERTICAL_LIMIT_RECOVERED, and says so is not "unlimited"', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: null,
            bouwhoogte_m: null,
            planTextExamined: false,
        });
        expect(r.status).toBe('NO_VERTICAL_LIMIT_RECOVERED');
        expect(r.why).toContain('does NOT mean the height is unlimited');
        const s = nlRoofToRuleState(r, REF);
        expect(s.status).toBe('unrecovered');
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('missing-source');
    });

    it('a goothoogte of 0 or a negative height is not a limit — never read as a cap', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 0,
            bouwhoogte_m: -3,
            planTextExamined: true,
        });
        expect(r.status).toBe('NO_VERTICAL_LIMIT_RECOVERED');
    });
});

describe('⭐ the BOUND TYPE is an explicit field — the founder’s three shapes (review §5)', () => {
    it('bouwhoogte alone → prism-upper-bound (UNSHAPED_BY_PLAN)', () => {
        const r = resolveNlRoofDeterminacy({ goothoogte_m: null, bouwhoogte_m: 12, planTextExamined: true });
        expect(r.status).toBe('UNSHAPED_BY_PLAN');
        expect(r.boundType).toBe('prism-upper-bound');
    });
    it('goothoogte alone → eaves-plane-no-top: an eaves constraint and NO top', () => {
        const r = resolveNlRoofDeterminacy({ goothoogte_m: 6, bouwhoogte_m: null, planTextExamined: true });
        expect(r.status).toBe('UNDERDETERMINED');
        expect(r.boundType).toBe('eaves-plane-no-top');
        expect(r.bounds.overallLimitM).toBeNull();
        expect(r.bounds.roofZoneThicknessM).toBeNull();
    });
    it('both limits, no roof rule → roof-zone-slab (the §15 canonical case)', () => {
        const r = resolveNlRoofDeterminacy({ goothoogte_m: 4, bouwhoogte_m: 10, planTextExamined: true });
        expect(r.boundType).toBe('roof-zone-slab');
        expect(r.why).toContain('roof-zone-slab');
    });
    it('goothoogte + a single dakhelling from text → section-closed-by-pitch', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakhelling_deg: 45 },
        });
        expect(r.status).toBe('UNDERDETERMINED');
        expect(r.boundType).toBe('section-closed-by-pitch');
    });
    it('a pitch RANGE does not close the section — still roof-zone-slab', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakhelling_deg: [30, 60] },
        });
        expect(r.boundType).toBe('roof-zone-slab');
    });
    it('goothoogte + nokhoogte → closed-by-ridge (form still open)', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: 4,
            bouwhoogte_m: null,
            planTextExamined: true,
            roofRules: { nokhoogte_m: 9 },
        });
        expect(r.status).toBe('UNDERDETERMINED');
        expect(r.boundType).toBe('closed-by-ridge');
    });
    it('a cap PLUS a dakvorm is NOT unshaped — the plan shapes the roof; prism-upper-bound, UNDERDETERMINED', () => {
        const r = resolveNlRoofDeterminacy({
            goothoogte_m: null,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakvorm: 'zadeldak' },
        });
        expect(r.status).toBe('UNDERDETERMINED');
        expect(r.boundType).toBe('prism-upper-bound');
        const s = nlRoofToRuleState(r, REF);
        // Saying "no-limit-stated" here would be false — the plan DOES state a roof form.
        expect(s.status).toBe('unrecovered');
    });
    it('DETERMINED carries boundType determined; no limits carries none', () => {
        expect(
            resolveNlRoofDeterminacy({
                goothoogte_m: 4,
                bouwhoogte_m: 10,
                planTextExamined: true,
                roofRules: { dakvorm: 'zadeldak', dakhelling_deg: 45 },
            }).boundType,
        ).toBe('determined');
        expect(resolveNlRoofDeterminacy({ goothoogte_m: null, bouwhoogte_m: null, planTextExamined: false }).boundType).toBe(
            'none',
        );
    });
});

describe('determinism (C58 §1.1) — same input, byte-identical output', () => {
    it('repeats byte-identically across 50 runs', () => {
        const input: NlRoofInputs = {
            goothoogte_m: 4,
            bouwhoogte_m: 10,
            planTextExamined: true,
            roofRules: { dakvorm: 'zadeldak', nokrichting: 'evenwijdig aan de voorgevelrooilijn' },
        };
        const first = JSON.stringify(resolveNlRoofDeterminacy(input));
        for (let i = 0; i < 50; i++) {
            expect(JSON.stringify(resolveNlRoofDeterminacy(input))).toBe(first);
        }
    });
});
