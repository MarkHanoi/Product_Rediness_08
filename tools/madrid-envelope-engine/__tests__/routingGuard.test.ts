// ROUTING GUARD TESTS — being right about when NOT to draw.
//
// ⭐ These are the adapter's most important tests, because the failure they prevent is INVISIBLE:
// a correct number applied under the wrong instrument produces a confident, well-cited,
// precisely-wrong envelope that nobody can distinguish from a right one until a licence is refused.

import { describe, it, expect } from 'vitest';
import { classifyRoute, routingRefusals, MADRID_MISSING_CONSTRAINTS } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmRoutingGuard.js';

const clean = {
    ambitoToken: null,
    instrumentFigure: null,
    instrumentKeyMatches: 0,
    soilClass: 'Suelo Urbano Consolidado',
    isPublicSystem: false,
};

describe('classifyRoute', () => {
    it('recognises Norma-Zonal codes in every observed shape', () => {
        // Every one of these is a live value from the capital's own AMB_TX_ETI column.
        for (const t of ['4', '1.3', '3.1.a', '8.2.b', '9.4.a', '5.2', '7.1.b']) {
            expect(classifyRoute(t)).toBe('norma-zonal');
        }
    });

    it('recognises development instruments in every observed prefix', () => {
        for (const t of ['APR.16.04', 'APE.10.02', 'API.08.03', 'UZP.2.01', 'UZPp.03.01-RP', 'PP.1']) {
            expect(classifyRoute(t)).toBe('development');
        }
    });

    // MUTATION: dropping the `[.\s_-]` separator from the prefix regex. A bare `^APR` would
    // classify a hypothetical ordinance named "APROVECHAMIENTO" as a development instrument.
    it('does not match a development prefix that is merely a word-start', () => {
        expect(classifyRoute('APROVECHAMIENTO')).toBe('unrecognised');
    });

    // ⛔ THE SINGLE MOST IMPORTANT ASSERTION IN THIS FILE.
    // MUTATION: `return 'norma-zonal'` as the final fallback. That one line makes every
    // unreadable token silently assert "no development plan governs here" — the L-526 error.
    it('NEVER degrades an unrecognised token to norma-zonal', () => {
        for (const t of ['ZZZ-99', 'PLAN DEL ESTE', '???', 'ámbito sin código']) {
            expect(classifyRoute(t)).toBe('unrecognised');
            expect(classifyRoute(t)).not.toBe('norma-zonal');
        }
    });

    it('treats blank, whitespace, null and undefined as unrecognised', () => {
        for (const t of ['', '   ', null, undefined]) expect(classifyRoute(t)).toBe('unrecognised');
    });
});

describe('routingRefusals — clean routing', () => {
    it('returns NO refusals when the base plan governs and the land is urban', () => {
        expect(routingRefusals(clean)).toEqual([]);
    });

    it('returns no refusals for an explicit Norma-Zonal token', () => {
        expect(routingRefusals({ ...clean, ambitoToken: '4' })).toEqual([]);
    });
});

describe('routingRefusals — the four routing refusals', () => {
    // The override ratio is 37.11 % by area region-wide and 48.43 % in the capital. This is the
    // single largest reason PRYZM must decline in Madrid, and it is a statement about the LAW.
    it('refuses a development ámbito, and marks it legally grounded', () => {
        const r = routingRefusals({ ...clean, ambitoToken: 'APR.16.04' });
        const dev = r.find((x) => x.reason === 'development-ambito-governs');
        expect(dev).toBeDefined();
        expect(dev?.legallyGrounded).toBe(true);
        expect(dev?.headline).toContain('APR.16.04');
        // MUTATION: `retryable: true`. A delegation never clears on a retry, and offering the
        // affordance sends the user round a loop for ever (L-574 / §L-590c).
        expect(dev?.retryable).toBe(false);
    });

    // ⛔ 30.66 % of AMBITO_MODIF (municipality, name) keys are non-unique — 619 of 2,019.
    // MUTATION: picking the newest / largest / first match. That is PRYZM legislating.
    it('refuses when the instrument key matches more than one instrument', () => {
        const r = routingRefusals({ ...clean, instrumentKeyMatches: 2 });
        const amb = r.find((x) => x.reason === 'instrument-key-ambiguous');
        expect(amb).toBeDefined();
        expect(amb?.headline).toContain('2');
        expect(amb?.legallyGrounded).toBe(false);
    });

    it('does NOT fire the ambiguity refusal on exactly one match', () => {
        expect(routingRefusals({ ...clean, instrumentKeyMatches: 1 })
            .some((x) => x.reason === 'instrument-key-ambiguous')).toBe(false);
    });

    // 0 means NO JOIN WAS ATTEMPTED. It must produce neither a false clearance nor a false alarm.
    it('does not fire the ambiguity refusal when no join was attempted (0)', () => {
        expect(routingRefusals({ ...clean, instrumentKeyMatches: 0 })
            .some((x) => x.reason === 'instrument-key-ambiguous')).toBe(false);
    });

    // DS_FIG_DES is null on 52.84 % of AMBITO rows: the corpus names an instrument whose legal
    // regime it does not state.
    it('refuses when an instrument is recorded but its class is unpublished', () => {
        const r = routingRefusals({ ...clean, ambitoToken: 'ALGO RARO', instrumentFigure: null });
        expect(r.some((x) => x.reason === 'instrument-class-unpublished')).toBe(true);
    });

    it('does NOT fire instrument-class-unpublished when the base plan governs', () => {
        expect(routingRefusals({ ...clean, ambitoToken: '1.3', instrumentFigure: null })
            .some((x) => x.reason === 'instrument-class-unpublished')).toBe(false);
    });

    it('refuses an unrecognised routing token by name', () => {
        const r = routingRefusals({ ...clean, ambitoToken: 'ZZZ-99' });
        const u = r.find((x) => x.reason === 'routing-token-unrecognised');
        expect(u).toBeDefined();
        expect(u?.headline).toContain('ZZZ-99');
        expect(u?.legallyGrounded).toBe(false);
    });
});

describe('routingRefusals — land class', () => {
    // 1,124 of Boadilla's 1,958 rows (57 %) are public-system ordinances. This is a statement
    // about the LAW: telling a zona-verde owner "PRYZM has not encoded this zone" would be a
    // different, and wrong, claim.
    it('refuses a public system and marks it legally grounded', () => {
        const r = routingRefusals({ ...clean, isPublicSystem: true });
        const ps = r.find((x) => x.reason === 'public-system');
        expect(ps).toBeDefined();
        expect(ps?.legallyGrounded).toBe(true);
        expect(ps?.ordinanceRef).not.toBeNull();
    });

    it('refuses non-urban soil', () => {
        for (const soil of ['Suelo No Urbanizable Protegido', 'Suelo Rústico', 'Suelo No Urbanizable Común']) {
            expect(routingRefusals({ ...clean, soilClass: soil })
                .some((x) => x.reason === 'not-urban-land')).toBe(true);
        }
    });

    // MUTATION: matching `/urbaniz/` naively. "Suelo Urbanizable Programado" contains
    // "urbaniz" AND is buildable; "Suelo No Urbanizable" contains it and is not. The negative
    // must lose to the positive.
    it('does NOT refuse urbanizable land, which IS buildable', () => {
        for (const soil of [
            'Suelo Urbano Consolidado', 'Suelo Urbanizable Programado',
            'Suelo Urbanizable Sectorizado', 'Suelo Apto Para Urbanizar',
        ]) {
            expect(routingRefusals({ ...clean, soilClass: soil })
                .some((x) => x.reason === 'not-urban-land')).toBe(false);
        }
    });

    it('does not refuse on an unstated soil class — absent is not non-urban', () => {
        expect(routingRefusals({ ...clean, soilClass: null })
            .some((x) => x.reason === 'not-urban-land')).toBe(false);
    });
});

describe('routingRefusals — NOT short-circuited', () => {
    // MUTATION: `return [first]` or an early `return`. A user who resolves one blocker then hits
    // a second they were never told about.
    it('reports EVERY reason that is true, not the first', () => {
        const r = routingRefusals({
            ambitoToken: 'APR.16.04',
            instrumentFigure: null,
            instrumentKeyMatches: 3,
            soilClass: 'Suelo No Urbanizable Protegido',
            isPublicSystem: true,
        });
        const reasons = r.map((x) => x.reason);
        expect(reasons).toContain('public-system');
        expect(reasons).toContain('not-urban-land');
        expect(reasons).toContain('development-ambito-governs');
        expect(reasons).toContain('instrument-class-unpublished');
        expect(reasons).toContain('instrument-key-ambiguous');
        expect(r.length).toBeGreaterThanOrEqual(5);
    });
});

describe('MADRID_MISSING_CONSTRAINTS — every envelope is an OPEN TOP', () => {
    // ADR-0293. All three constrain DOWNWARD, so omitting them OVER-states (L-616).
    it('names the aeronautical, heritage and flood constraints', () => {
        const joined = MADRID_MISSING_CONSTRAINTS.join(' ').toLowerCase();
        expect(joined).toContain('aesa');
        expect(joined).toContain('barajas');
        expect(joined).toContain('heritage');
        expect(joined).toContain('flood');
    });

    // The sweep found the servidumbres LAYERS but they carry no elevation attribute. Recording
    // "published but no height" is a different fact from "not held", and the distinction is what
    // stops the next agent re-finding the layer and assuming it closes the constraint.
    it('records that the aeronautical layers are published but carry no elevation', () => {
        const aero = MADRID_MISSING_CONSTRAINTS.find((c) => c.includes('AESA'));
        expect(aero).toContain('SERVIDUMBRES_AERONAUTICAS');
        expect(aero).toMatch(/no elevation attribute/i);
    });

    it('states the direction of every constraint, so none can be read as optional', () => {
        for (const c of MADRID_MISSING_CONSTRAINTS) expect(c).toContain('DOWNWARD');
    });
});
