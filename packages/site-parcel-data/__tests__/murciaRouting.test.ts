// Murcia (INE 30030) — the cited-refusal jurisdiction + its routing gate.
//
// These tests lock the HONESTY properties, not the prose. The load-bearing assertions are
// the ones that would fail if somebody "helpfully" filled in a number: the refusal must stay
// `no-rule-pack` / `legallyGrounded: false`, and `buildRefusedEnvelope` must keep every
// numeric field null (L-616: unknown ≠ 0, unknown ≠ a permissive default).

import { describe, expect, it } from 'vitest';
import {
    MURCIA_ENVELOPE_VERIFIED,
    MURCIA_JURISDICTION_ID,
    detectDerivedPlanMarkers,
    murciaNoRulePackRefusal,
} from '../src/rulepacks/esMurciaEnvelope.js';
import {
    buildRefusedEnvelope,
    isRefusedEnvelope,
    isTransientRefusal,
} from '../src/rulepacks/zoneRefusal.js';
import {
    MURCIA_BBOX,
    MURCIA_INE_CODE,
    composeIneCode,
    isInMurcia,
} from '../src/providers/murciaBbox.js';

/** The founder's parcel, resolved live from Catastro on 2026-07-31. */
const PARCEL = {
    refcat: '3481104XH6038S',
    lat: 38.0061,
    lon: -1.138028,
    areaOfficialM2: 935,
    address: 'PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)',
} as const;

describe('Murcia routing gate', () => {
    it('routes the founder parcel', () => {
        expect(isInMurcia(PARCEL.lat, PARCEL.lon)).toBe(true);
    });

    it('rejects a non-finite point rather than throwing', () => {
        expect(isInMurcia(Number.NaN, 0)).toBe(false);
        expect(isInMurcia(38, Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('does NOT route Barcelona, Madrid, or the Philippine town also called Murcia', () => {
        expect(isInMurcia(41.3874, 2.1686)).toBe(false); // Barcelona
        expect(isInMurcia(40.4168, -3.7038)).toBe(false); // Madrid
        // OSM relation 11366415 — Murcia, Negros Occidental, Philippines. A NAME is not a
        // jurisdiction; a competitor report shipped Portuguese tax law onto this Spanish
        // parcel by routing on something other than the data.
        expect(isInMurcia(10.6, 123.05)).toBe(false);
    });

    it('has a bbox that actually contains the parcel', () => {
        expect(PARCEL.lat).toBeGreaterThanOrEqual(MURCIA_BBOX.minLat);
        expect(PARCEL.lat).toBeLessThanOrEqual(MURCIA_BBOX.maxLat);
        expect(PARCEL.lon).toBeGreaterThanOrEqual(MURCIA_BBOX.minLon);
        expect(PARCEL.lon).toBeLessThanOrEqual(MURCIA_BBOX.maxLon);
    });
});

describe('INE code composition — province(2) + municipality(3)', () => {
    it('composes Catastro <cp>30</cp><cm>30</cm> into 30030, not 3030', () => {
        expect(composeIneCode('30', '30')).toBe(MURCIA_INE_CODE);
        expect(composeIneCode('30', '30')).toBe('30030');
    });

    it('returns null rather than guessing on missing or malformed parts', () => {
        expect(composeIneCode(null, '30')).toBeNull();
        expect(composeIneCode('30', undefined)).toBeNull();
        expect(composeIneCode('AB', '30')).toBeNull();
    });
});

describe('derived-plan marker detection (the value-vocabulary classifier, in miniature)', () => {
    it('finds the Plan Parcial and the Unidad de Actuación in the real cadastral address', () => {
        const m = detectDerivedPlanMarkers(PARCEL.address);
        const kinds = m.map((x) => x.kind);
        expect(kinds).toContain('PP');
        expect(kinds).toContain('UA');
        const pp = m.find((x) => x.kind === 'PP')!;
        expect(pp.family).toBe('Plan Parcial');
        expect(pp.ref).toBe('CR-5');
    });

    it('returns [] for an ordinary street address — absence is a real answer', () => {
        expect(detectDerivedPlanMarkers('CL TRAPERIA 4 MURCIA (MURCIA) (MURCIA)')).toEqual([]);
    });

    it('never throws on null/empty input', () => {
        expect(detectDerivedPlanMarkers(null)).toEqual([]);
        expect(detectDerivedPlanMarkers('')).toEqual([]);
        expect(detectDerivedPlanMarkers(undefined)).toEqual([]);
    });

    it('records the exact substring matched, so the claim is checkable', () => {
        const m = detectDerivedPlanMarkers(PARCEL.address);
        for (const marker of m) {
            expect(PARCEL.address.toUpperCase()).toContain(marker.matched.toUpperCase());
        }
    });
});

describe('the Murcia refusal', () => {
    const facts = [
        `Referencia catastral: ${PARCEL.refcat}`,
        `Official area: ${PARCEL.areaOfficialM2} m² (Catastro)`,
        'Municipality: Murcia (INE 30030)',
    ];

    it('is a COVERAGE refusal, never a legal one', () => {
        const r = murciaNoRulePackRefusal(null, null, facts);
        expect(r.code).toBe('no-rule-pack');
        // ⚠ If this flips to true, PRYZM is telling the owner of buildable urban land that
        // the law forbids building on it. That is the opposite error and it is worse.
        expect(r.legallyGrounded).toBe(false);
        expect(r.ordinanceRef).toBeNull();
    });

    it('is NOT the transient code — no retry can transcribe an ordinance', () => {
        const env = buildRefusedEnvelope('unknown', murciaNoRulePackRefusal(), 'none');
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(isTransientRefusal(env)).toBe(false);
    });

    it('carries the known facts so the card is never a blank panel (L-553)', () => {
        const r = murciaNoRulePackRefusal(null, null, facts);
        expect(r.knownFacts).toEqual(facts);
        expect(r.knownFacts.some((f) => f.includes(PARCEL.refcat))).toBe(true);
    });

    it('names the derived instrument when the address carries one — without publishing a number', () => {
        const markers = detectDerivedPlanMarkers(PARCEL.address);
        const r = murciaNoRulePackRefusal(null, null, facts, markers);
        expect(r.detail).toContain('Plan Parcial CR-5');
        expect(r.legallyGrounded).toBe(false); // enriched, NOT upgraded
    });

    it('contains no digits that could be read as an allowance', () => {
        const markers = detectDerivedPlanMarkers(PARCEL.address);
        const r = murciaNoRulePackRefusal(null, null, [], markers);
        const prose = `${r.headline} ${r.detail}`;
        // The only numerals permitted in the prose are those inside an instrument NAME
        // (e.g. "CR-5", "5ª"). No m², no metres, no percentage, no floor count.
        expect(prose).not.toMatch(/\d+\s*(m²|m2|metros|metres|%|plantas|floors)/i);
    });
});

describe('the refused envelope carries nothing extrudable', () => {
    const env = buildRefusedEnvelope('unknown', murciaNoRulePackRefusal(), 'none');

    it('has every numeric field null and no polygon', () => {
        expect(env.insetPolygon).toEqual([]);
        expect(env.maxHeight_m).toBeNull();
        expect(env.farLimitedHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.maxVolumeM3).toBeNull();
        expect(env.insetAreaM2).toBe(0);
        expect(env.tiers).toEqual([]);
    });

    it('is labelled not-determined, never as an estimate', () => {
        expect(env.confidence).toBe('not-determined');
    });
});

describe('the verification gate', () => {
    it('is closed — L-449 sign-off is the founder\'s, not an implementer\'s', () => {
        expect(MURCIA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('uses the canonical jurisdiction id', () => {
        expect(MURCIA_JURISDICTION_ID).toBe('es-30030-murcia');
    });
});
