// §DK-GRAPHIC-LEG — the route the drawn regulation takes, and what each route lets us SAY.

import { describe, it, expect } from 'vitest';
import { resolveDkGraphicLeg, censusDkGraphicRoutes, DK_GRAPHIC_ROUTE_CENSUS_2026_09_04 } from '../src/rulepacks/dkGraphicLeg.js';
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

// ── Round 3: a dead doklink is `inaccessible`, never `graphic`; the census reducer reproduces the probe ──

describe('round 3 — doklinkStatus and the route census', () => {
    it('document route with a DEAD doklink → footprint and height are inaccessible (retryable), statement warns', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'absent' } as never, delomraadePresent: false, doklink: 'https://dokument.plandata.dk/20_dead.pdf', doklinkStatus: 'dead' });
        expect(r.route).toBe('document-kortbilag');
        const fp = r.footprintState!(REF);
        const h = r.heightState!(REF);
        expect(fp.status === 'unrecovered' && fp.failure).toBe('inaccessible');
        expect(h.status === 'unrecovered' && h.failure).toBe('inaccessible');
        expect(r.statement).toContain('did not answer');
        expect(r.caveats.some((c) => c.includes('retry'))).toBe(true);
    });

    it('document route with an ANSWERING (or unchecked) doklink keeps graphic/pdf', () => {
        for (const s of ['answers', 'unchecked', undefined] as const) {
            const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'absent' } as never, delomraadePresent: false, doklink: 'https://dokument.plandata.dk/20_1469799_1395150300900.pdf', doklinkStatus: s });
            const fp = r.footprintState!(REF);
            expect(fp.status === 'unrecovered' && fp.failure).toBe('graphic');
            expect(r.heightState!(REF).status === 'unrecovered' && (r.heightState!(REF) as { failure: string }).failure).toBe('pdf');
        }
    });

    it('delområde route with a dead doklink is also inaccessible, and keeps the extent caveat', () => {
        const r = resolveDkGraphicLeg({ omfang: IOMFANG_TRUE, byggefelt: { status: 'absent' } as never, delomraadePresent: true, doklinkStatus: 'dead' });
        expect(r.route).toBe('delomraade-extent');
        expect(r.footprintState!(REF).status === 'unrecovered' && (r.footprintState!(REF) as { failure: string }).failure).toBe('inaccessible');
        expect(r.caveats[0]).toContain('extent');
    });

    it('the census reducer: three-valued flag read, authority-ordered routes, byggefelt semantics, height', () => {
        // Field NAMES and serialisations are the Plandata WFS's (booleans arrive as strings), as in the sample rows.
        const c = censusDkGraphicRoutes([
            { iomfangreg: 'true', kompleks: 'false', byggefeltAtPoint: [{ bygkunifelt: 'false', bygvejledende: 'true', maxbygnhjd: '8.5' }], delomraadeAtPoint: true, doklink: 'https://dokument.plandata.dk/20_a.pdf' },
            { iomfangreg: 'true', kompleks: 'false', byggefeltAtPoint: [{ bygkunifelt: 'true', bygvejledende: 'false', maxbygnhjd: null }], delomraadeAtPoint: false, doklink: 'https://dokument.plandata.dk/20_b.pdf' },
            { iomfangreg: 'true', byggefeltAtPoint: [], delomraadeAtPoint: true, doklink: 'https://dokument.plandata.dk/20_c.pdf' },
            { iomfangreg: 'true', byggefeltAtPoint: [], delomraadeAtPoint: false, doklink: '' },
            { iomfangreg: 'true', byggefeltAtPoint: null, delomraadeAtPoint: null },
            { iomfangreg: 'false', byggefeltAtPoint: [], delomraadeAtPoint: false },
            { iomfangreg: undefined, byggefeltAtPoint: [], delomraadeAtPoint: false },
        ]);
        expect(c.rows).toBe(7);
        expect(c.iomfangregTrue).toBe(5);
        expect(c.iomfangregFalse).toBe(1);
        expect(c.iomfangregAbsent).toBe(1); // absent is NEVER false
        expect(c.route).toEqual({ 'byggefelt-geometry': 2, 'delomraade-extent': 1, 'document-kortbilag': 1, 'byggefelt-unresolved': 1 });
        expect(c.byggefeltSemantics).toEqual({ 'binding-obligation': 1, indicative: 1, 'neither-flag': 0, 'both-flags-conflict': 0 });
        expect(c.byggefeltPublishesHeight).toBe(1);
        expect(c.withDoklink).toBe(3);
    });

    it('the banked census is internally consistent: routes sum to iomfangregTrue per stratum, strata not pooled', () => {
        for (const s of [DK_GRAPHIC_ROUTE_CENSUS_2026_09_04.land, DK_GRAPHIC_ROUTE_CENSUS_2026_09_04.urban]) {
            const sum = s.route['byggefelt-geometry'] + s.route['delomraade-extent'] + s.route['document-kortbilag'];
            expect(sum).toBe(s.iomfangregTrue);
            expect(s.withDoklink).toBe(s.iomfangregTrue);
        }
        expect(DK_GRAPHIC_ROUTE_CENSUS_2026_09_04.doklinkReachability.status['206']).toBe(76);
        expect(DK_GRAPHIC_ROUTE_CENSUS_2026_09_04.datafordelerCredentialPresent).toBe(false);
    });
});
