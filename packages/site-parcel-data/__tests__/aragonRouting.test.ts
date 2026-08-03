// ARAGÓN — Huesca (INE 22125) + Zaragoza (INE 50297) as REFUSAL jurisdictions.
//
// Mirrors cornellaRouting.test.ts / valenciaRouting.test.ts: it asserts the S2 routing boundary,
// the S5 registration DISPOSITION (a cited refusal, never a number), and — the part that matters
// most for this jurisdiction — that NOTHING here ever publishes a buildable figure while the
// underlying blockers (an ungeoreferenced plan sheet; a withheld zoning attribute) stand.

import { describe, it, expect } from 'vitest';
import {
    resolveZoneDisposition,
    listJurisdictionCoverage,
    registeredPackZoneCodes,
} from '../src/rulepacks/registry.js';
import {
    HUESCA_BBOX,
    HUESCA_CATASTRO_DGC_CODE,
    HUESCA_INE_CODE,
    ZARAGOZA_BBOX,
    ZARAGOZA_CATASTRO_DGC_CODE,
    ZARAGOZA_INE_CODE,
    isInHuesca,
    isInZaragoza,
} from '../src/providers/aragonBbox.js';
import {
    HUESCA_ENVELOPE_VERIFIED,
    HUESCA_JURISDICTION_ID,
    ZARAGOZA_ENVELOPE_VERIFIED,
    ZARAGOZA_JURISDICTION_ID,
    huescaNoRulePackRefusal,
    zaragozaNoRulePackRefusal,
} from '../src/rulepacks/esAragon.js';

// Reference points (WGS84).
const HUESCA_CENTRE = { lat: 42.1362, lon: -0.4087 };
const ZARAGOZA_CENTRE = { lat: 41.6488, lon: -0.8891 };
const MADRID = { lat: 40.4168, lon: -3.7038 };
const BARCELONA = { lat: 41.3916, lon: 2.165 };

describe('Aragón — S2 router predicates', () => {
    it('routes each capital and rejects non-finite input', () => {
        expect(isInHuesca(HUESCA_CENTRE.lat, HUESCA_CENTRE.lon)).toBe(true);
        expect(isInZaragoza(ZARAGOZA_CENTRE.lat, ZARAGOZA_CENTRE.lon)).toBe(true);
        expect(isInHuesca(NaN, -0.41)).toBe(false);
        expect(isInZaragoza(41.65, Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('⚠ the two Aragonese boxes MUST NOT overlap each other', () => {
        expect(isInHuesca(ZARAGOZA_CENTRE.lat, ZARAGOZA_CENTRE.lon)).toBe(false);
        expect(isInZaragoza(HUESCA_CENTRE.lat, HUESCA_CENTRE.lon)).toBe(false);
    });

    it('⚠ MUST NOT shadow other registered Spanish jurisdictions', () => {
        for (const p of [MADRID, BARCELONA]) {
            expect(isInHuesca(p.lat, p.lon)).toBe(false);
            expect(isInZaragoza(p.lat, p.lon)).toBe(false);
        }
    });

    it('boxes are well-formed (min < max on both axes)', () => {
        for (const b of [HUESCA_BBOX, ZARAGOZA_BBOX]) {
            expect(b.minLat).toBeLessThan(b.maxLat);
            expect(b.minLon).toBeLessThan(b.maxLon);
        }
    });

    it('§EDGE-EPSILON — an INTERPOLATED edge point is still inside (the Córdoba-hole direction)', () => {
        // `minLon + (maxLon - minLon) * n / n` is NOT `maxLon` in IEEE-754: for Huesca it yields
        // -0.32999999999999996, a few ULPs OUTSIDE the declared bound. A naked `<=` rejected it,
        // so `contains` was tighter than the `extent` the coverage globe advertises — the exact
        // shape that lets the generic ESTIMATED triple be published on unread land.
        for (const [box, contains] of [
            [HUESCA_BBOX, isInHuesca],
            [ZARAGOZA_BBOX, isInZaragoza],
        ] as const) {
            for (const n of [3, 6, 7, 9, 10]) {
                for (let i = 0; i <= n; i++) {
                    for (let j = 0; j <= n; j++) {
                        const lat = box.minLat + ((box.maxLat - box.minLat) * i) / n;
                        const lon = box.minLon + ((box.maxLon - box.minLon) * j) / n;
                        expect(contains(lat, lon), `n=${n} ${lat},${lon}`).toBe(true);
                    }
                }
            }
        }
    });

    it('the epsilon is far below survey precision — it cannot swallow a neighbour', () => {
        // Generous by ~0.11 mm, not by anything that could move a real routing decision.
        expect(isInHuesca(HUESCA_BBOX.maxLat + 0.0001, HUESCA_BBOX.maxLon)).toBe(false);
        expect(isInZaragoza(ZARAGOZA_BBOX.minLat - 0.0001, ZARAGOZA_BBOX.minLon)).toBe(false);
    });
});

describe('§CATASTRO-DGC-NOT-INE — the two municipal code systems are kept distinct', () => {
    it('exports BOTH codes, and they DIFFER for these provincial capitals', () => {
        // This is the whole point of the finding: a bulk cadastre download keyed on the INE code
        // answers HTTP 200 with zero entries, which reads exactly like "no coverage".
        expect(HUESCA_INE_CODE).toBe('22125');
        expect(HUESCA_CATASTRO_DGC_CODE).toBe('22901');
        expect(HUESCA_CATASTRO_DGC_CODE).not.toBe(HUESCA_INE_CODE);

        expect(ZARAGOZA_INE_CODE).toBe('50297');
        expect(ZARAGOZA_CATASTRO_DGC_CODE).toBe('50900');
        expect(ZARAGOZA_CATASTRO_DGC_CODE).not.toBe(ZARAGOZA_INE_CODE);
    });

    it('the jurisdiction id is keyed on the INE code, not the DGC code', () => {
        expect(HUESCA_JURISDICTION_ID).toContain(HUESCA_INE_CODE);
        expect(HUESCA_JURISDICTION_ID).not.toContain(HUESCA_CATASTRO_DGC_CODE);
        expect(ZARAGOZA_JURISDICTION_ID).toContain(ZARAGOZA_INE_CODE);
        expect(ZARAGOZA_JURISDICTION_ID).not.toContain(ZARAGOZA_CATASTRO_DGC_CODE);
    });
});

describe('Aragón — S5 registration reachability', () => {
    it('both municipalities appear in the coverage list as ES / municipal', () => {
        const coverage = listJurisdictionCoverage();
        for (const id of [HUESCA_JURISDICTION_ID, ZARAGOZA_JURISDICTION_ID]) {
            const row = coverage.find((c) => c.jurisdictionId === id);
            expect(row, `${id} must be registered`).toBeDefined();
            expect(row!.countryCode).toBe('ES');
            expect(row!.extentResolution).toBe('municipal');
        }
    });

    it('⚠ neither registers ANY packed zone code — packsByZone is empty by construction', () => {
        expect(registeredPackZoneCodes(HUESCA_JURISDICTION_ID)).toHaveLength(0);
        expect(registeredPackZoneCodes(ZARAGOZA_JURISDICTION_ID)).toHaveLength(0);
    });

    it('every zone resolves to a REFUSAL, never to a pack and never to unregistered', () => {
        const cases: readonly [string, string][] = [
            [HUESCA_JURISDICTION_ID, '4'],
            [HUESCA_JURISDICTION_ID, '3'],
            [ZARAGOZA_JURISDICTION_ID, 'A1'],
            [ZARAGOZA_JURISDICTION_ID, 'ZV'],
        ];
        for (const [id, zone] of cases) {
            const d = resolveZoneDisposition(id, zone);
            expect(d.kind, `${id}/${zone}`).toBe('refusal');
            if (d.kind === 'refusal') {
                expect(d.refusal.code).toBe('no-rule-pack');
                // ⚠ NOT legally grounded: the ordinance DOES grant an envelope in both cities.
                // This refusal is a statement about PRYZM's data, never about the law.
                expect(d.refusal.legallyGrounded).toBe(false);
                expect(d.refusal.ordinanceRef).toBeNull();
            }
        }
    });
});

describe('Aragón — the honesty gates are shut, and the copy never promises a figure', () => {
    it('both verification gates are false', () => {
        expect(HUESCA_ENVELOPE_VERIFIED).toBe(false);
        expect(ZARAGOZA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('⛔ no refusal text ever states a buildable NUMBER', () => {
        // The failure this guards is L-616: an UNKNOWN rendered as a datum. Huesca's ordinance
        // contains a written 20 m default that art. 8.4.8 expressly subordinates to the drawing,
        // and a storey→metre table — none of which may leak into an answer as if it applied.
        const refusals = [
            huescaNoRulePackRefusal('4', 'Manzana cerrada'),
            zaragozaNoRulePackRefusal('A1', 'Edificación en manzana cerrada'),
        ];
        for (const r of refusals) {
            const text = `${r.headline} ${r.detail}`;
            expect(text).not.toMatch(/\byour (maximum|buildable)\b/i);
            expect(text).toMatch(/never an estimate|will not publish|shows none|selects none/i);
        }
    });

    it('Huesca states the georeference blocker WITH its measured residual', () => {
        const r = huescaNoRulePackRefusal();
        const text = `${r.headline} ${r.detail}`;
        // The blocker must be reported as a measurement, not as an impression.
        expect(text).toMatch(/2\.31 m/);
        expect(text).toMatch(/EPSG:25830|ETRS89 \/ UTM/);
        expect(text).toMatch(/1\/1\.000/);
    });

    it('Huesca reports the legend ambiguity rather than resolving it', () => {
        const r = huescaNoRulePackRefusal();
        // The depth line and the height-change line share one style under one caption. That must
        // be stated as an ambiguity, NOT silently resolved in favour of the useful meaning.
        expect(r.detail).toMatch(/SAME|same/);
        expect(r.detail).toMatch(/cannot be attributed/i);
    });

    it('Zaragoza names the ONE missing attribute', () => {
        const r = zaragozaNoRulePackRefusal('A1');
        expect(r.detail).toMatch(/subgrado/i);
        expect(r.detail).toMatch(/A1\/3\.1|A1\/4\.1/);
    });

    it('knownFacts pass through without mutation', () => {
        const facts = ['Jurisdiction: Huesca', 'Location: 42.13620, -0.40870'];
        expect(huescaNoRulePackRefusal('4', null, facts).knownFacts).toEqual(facts);
        expect(zaragozaNoRulePackRefusal('A1', null, facts).knownFacts).toEqual(facts);
    });
});
