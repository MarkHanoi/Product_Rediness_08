// §DK-OVERLAY-CLASS — EXCLUSION is never a default; unknown is never dropped; nothing is a blanket NO_BUILD.

import { describe, it, expect } from 'vitest';
import {
    DK_OVERLAY_REGISTRY,
    classifyDkOverlay,
    dkOverlaysPermitNoBuild,
    dkOverlayToRuleState,
} from '../src/rulepacks/dkOverlayClassification.js';

const REF = {
    country: 'DK',
    authority: 'Miljøstyrelsen / Kommune',
    dataset: 'overlay (kind supplied by caller)',
    plan_id: null,
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

describe('the registry', () => {
    it('has NO kind whose default effect is EXCLUSION — every Danish protection is dispensable', () => {
        for (const r of DK_OVERLAY_REGISTRY) expect(r.defaultEffect).not.toBe('EXCLUSION');
    });
    it('marks every legal basis as not re-verified', () => {
        for (const r of DK_OVERLAY_REGISTRY) expect(r.basisVerification).toBe('lane-cited-not-re-verified');
    });
    it('landzone is CONDITIONAL, not no-build (doctrine 4.8 / R8)', () => {
        expect(classifyDkOverlay('landzone').effect).toBe('CONDITIONAL');
    });
    it('Natura 2000 is SCREENING, drikkevandsinteresser INFORMATIONAL', () => {
        expect(classifyDkOverlay('natura2000').effect).toBe('SCREENING');
        expect(classifyDkOverlay('drikkevandsinteresser').effect).toBe('INFORMATIONAL');
    });
});

describe('EXCLUSION only through the instrument’s own cited words', () => {
    it('a skovbyggelinje alone is CONDITIONAL and does not permit NO_BUILD', () => {
        const c = classifyDkOverlay('skovbyggelinje');
        expect(c.effect).toBe('CONDITIONAL');
        expect(dkOverlaysPermitNoBuild([c])).toBe(false);
        const s = dkOverlayToRuleState(c, REF);
        if (s.status !== 'refused') throw new Error('narrowing');
        expect(s.basis).toBe('requires-determination');
    });
    it('an explicit cited prohibition yields EXCLUSION with the verbatim clause', () => {
        const c = classifyDkOverlay('fredning', {
            explicitProhibition: { verbatim: 'Området må ikke bebygges.', citation: 'Fredningskendelse 1978 §3' },
        });
        expect(c.effect).toBe('EXCLUSION');
        expect(c.basisVerification).toBe('instrument-verbatim');
        expect(c.statement).toContain('Området må ikke bebygges');
        expect(dkOverlaysPermitNoBuild([c])).toBe(true);
    });
    it('an empty prohibition does NOT unlock EXCLUSION', () => {
        expect(classifyDkOverlay('fredning', { explicitProhibition: { verbatim: '', citation: 'x' } }).effect).toBe('CONDITIONAL');
    });
});

describe('unknown kinds are surfaced, never dropped', () => {
    it('an unknown kind is UNCLASSIFIED → unrecovered/semantic/unknown', () => {
        const c = classifyDkOverlay('some-new-theme');
        expect(c.effect).toBe('UNCLASSIFIED');
        expect(c.statement).toContain('never NO_BUILD');
        const s = dkOverlayToRuleState(c, REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('unknown');
    });
    it('INFORMATIONAL maps to F2 (rule-not-applicable) — no envelope question is asked', () => {
        const s = dkOverlayToRuleState(classifyDkOverlay('jordforurening'), REF);
        if (s.status !== 'refused') throw new Error('narrowing');
        expect(s.basis).toBe('rule-not-applicable');
    });
    it('SCREENING maps to qualitative — an assessment duty, not a number', () => {
        expect(dkOverlayToRuleState(classifyDkOverlay('kystnaerhedszone'), REF).status).toBe('qualitative');
    });
});
