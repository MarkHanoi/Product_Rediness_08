// §DK-GRAPHIC-LEG — the route the drawn regulation takes, and what each route lets us SAY.

import { describe, it, expect } from 'vitest';
import { resolveDkGraphicLeg } from '../src/rulepacks/dkGraphicLeg.js';
import { resolveDkOmfangRegulation } from '../src/rulepacks/dkOmfangRegulation.js';
import { resolveDkByggefeltEnvelopeContribution } from '../src/rulepacks/dkByggefeltBinding.js';

const REF = {
    country: 'DK',
    authority: 'Kommune (lokalplan)',
    dataset: 'plandata.dk WFS',
    plan_id: 'LP-593',
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

const IOMFANG_TRUE = resolveDkOmfangRegulation({
    flags: { iomfangreg: true, kompleks: false },
    numbers: {},
    doklink: 'https://dokument.plandata.dk/20_1234.pdf',
    planLabel: 'Lokalplan 593',
});
const IOMFANG_FALSE = resolveDkOmfangRegulation({ flags: { iomfangreg: false }, numbers: { maxbygnhjd: 8.5 } });

/** A binding byggefelt (the Lindgreens Allé II shape: bygkunifelt=true, bygvejledende=false). */
const BINDING = resolveDkByggefeltEnvelopeContribution({
    lp_plannr: '593',
    lp_plannavn: 'Lindgreens Allé II',
    kommunenavn: 'København',
    doklink: 'https://dokument.plandata.dk/20_1234.pdf',
    bygkunifelt: true,
    bygvejledende: false,
    maxbygnhjd: 24,
});

describe('applicability', () => {
    it('does not apply when iomfangreg is not true', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_FALSE });
        expect(r.route).toBe('not-applicable');
        expect(r.footprintState).toBeNull();
    });
});

describe('routes, in authority order', () => {
    it('a placeable byggefelt → byggefelt-geometry: footprint C4 RESOLVED as geometry, height from the field', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'found', value: BINDING }, planLabel: 'Lokalplan 593' });
        expect(r.route).toBe('byggefelt-geometry');
        const fp = r.footprintState!(REF);
        expect(fp.rule).toBe('C4');
        expect(fp.status).toBe('resolved');
        if (fp.status !== 'resolved') throw new Error('narrowing');
        expect(String(fp.value)).toContain('byggefelt polygon');
        const h = r.heightState!(REF);
        if (h.status !== 'resolved') throw new Error('narrowing');
        expect(h.value).toBe(24);
        expect(r.caveats.some((c) => c.includes('MANDATORY placement'))).toBe(true);
    });
    it('byggefelt absent, delområde present → delomraade-extent: C4 unrecovered/graphic/present', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'absent', reason: 'none' }, delomraadePresent: true });
        expect(r.route).toBe('delomraade-extent');
        const fp = r.footprintState!(REF);
        if (fp.status !== 'unrecovered') throw new Error('narrowing');
        expect(fp.failure).toBe('graphic');
        expect(fp.mechanism).toBe('present');
        expect(fp.stoppedAt).toContain('upper-bound extent');
    });
    it('neither digitised → document-kortbilag with the doklink; mechanism PRESENT, never F1', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'absent', reason: 'none' }, delomraadePresent: false, doklink: 'https://dokument.plandata.dk/20_1234.pdf' });
        expect(r.route).toBe('document-kortbilag');
        const fp = r.footprintState!(REF);
        if (fp.status !== 'unrecovered') throw new Error('narrowing');
        expect(fp.failure).toBe('graphic');
        expect(fp.mechanism).toBe('present');
        expect(fp.stoppedAt).toBe('https://dokument.plandata.dk/20_1234.pdf');
        const h = r.heightState!(REF);
        if (h.status !== 'unrecovered') throw new Error('narrowing');
        expect(h.failure).toBe('pdf');
    });
    it('a TRANSIENT byggefelt fetch does not fall through to the document — unresolved, uncacheable', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'transient', reason: 'timeout' }, delomraadePresent: true });
        expect(r.route).toBe('byggefelt-unresolved');
        expect(r.higherAuthorityUnresolved).toBe(true);
        const fp = r.footprintState!(REF);
        if (fp.status !== 'unrecovered') throw new Error('narrowing');
        expect(fp.failure).toBe('inaccessible');
    });
    it('a not-placeable byggefelt (conflicting flags) is not drawn — falls to the document route', () => {
        const conflict = resolveDkByggefeltEnvelopeContribution({ bygkunifelt: true, bygvejledende: true, lp_plannr: '1' });
        expect(conflict.semantics).toBe('not-placeable');
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'found', value: conflict } });
        expect(r.route).toBe('document-kortbilag');
        expect(r.statement).toContain('not placeable');
    });
});
