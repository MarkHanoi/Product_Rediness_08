// L-480 client adapter — tests for the MUC clau lookup parse.
//
// The proxy is tested server-side (server/__tests__/mucZoningProxy.test.ts); here we pin the
// CLIENT parse, which is where a real-vs-unresolved answer must stay distinguishable. Verified
// live on prod 2026-07-20: GET /api/muc/zoning?lat=41.39324&lon=2.16438 → clau "13a".

import { describe, expect, it } from 'vitest';
import { parseMucResponse } from '../src/ui/site/zoning/MucZoningProvider';

describe('§MUC-CLIENT parseMucResponse', () => {
    it('parses a resolved Eixample 13a payload (the real prod shape)', () => {
        const got = parseMucResponse({
            zoning: {
                clau: '13a',
                clauLabel: 'Densificació Urbana Intensiva',
                mucCode: 'R2',
                mucLabel: 'Residencial, Urbà tradicional',
                ineCode: '08019',
                source: 'muc-gencat',
                sourceLayer: 'MUCVW_MUCS_QUAL',
            },
        });
        expect(got?.clau).toBe('13a');
        expect(got?.mucCode).toBe('R2');
        expect(got?.source).toBe('muc-gencat');
    });

    it('returns null for the explicit unresolved answer — never a false zone', () => {
        // The proxy answers {zoning:null, reason:'unresolved'} on ambiguity/outage. That must
        // NOT parse into a usable clau — it would silently apply a rule pack on no evidence.
        expect(parseMucResponse({ zoning: null, reason: 'unresolved' })).toBeNull();
    });

    it('returns null for a record with no municipal clau', () => {
        expect(parseMucResponse({ zoning: { mucCode: 'R2' } })).toBeNull();
        expect(parseMucResponse({ zoning: { clau: '   ' } })).toBeNull();
    });

    it('never throws on malformed input', () => {
        expect(parseMucResponse(null)).toBeNull();
        expect(parseMucResponse({})).toBeNull();
        expect(parseMucResponse('nope')).toBeNull();
        expect(parseMucResponse({ zoning: 'nope' })).toBeNull();
    });

    it('keeps 13b usable but distinct — the pack decides, not the parser', () => {
        // The founder's Poblenou parcel is 13b. The parser returns it faithfully; the rule-pack
        // selector (next step) is what refuses to apply the 13a/13E pack to it.
        const got = parseMucResponse({ zoning: { clau: '13b', mucCode: 'R2' } });
        expect(got?.clau).toBe('13b');
    });
});
