// Córdoba — `resolveCordobaEnvelope` + `pepchCorniceForPlantas`: the COACo WFS envelope resolver.
//
// The compliance-critical seam turned pure: given FIXTURE WFS GeoJSON (NEVER a live call — every test
// injects `fetchImpl`), the parse is deterministic. The fixtures mirror the shape verified live on
// 2026-07-26 (`coaco:vcatastro_urbanismo` carries per-parcel `max_plantas` + `zona_nom` + `ordenanza`;
// real parcel `3834946UG4933S` → `max_plantas:2`, `zona_nom:'Sur'`). These tests pin the honesty
// properties in the resolver header: never throws, a Catastro-derived cornice ESTIMATE (never an
// ordinance ceiling), `max_plantas` absent → refusal (never a fabricated PB), and PB+3 is the ceiling.

import { describe, it, expect } from 'vitest';
import {
    resolveCordobaEnvelope,
    pepchCorniceForPlantas,
    PEPCH01_CORNICE_HEIGHT_BY_PLANTAS,
    CORDOBA_PARCEL_ENVELOPE_PATH,
} from '../src/providers/resolveCordobaPgou.js';

const PT = { lat: 37.8745, lon: -4.7757 }; // a parcel in the Sur pilot.

/** A GeoJSON FeatureCollection with one feature carrying `properties`. */
const fc = (properties: Record<string, unknown>) => ({ features: [{ properties }] });

/** A fetch stub returning `body` as JSON with a settable `ok`. Counts calls. */
function stubFetch(body: unknown, ok = true): { fetchImpl: typeof fetch; calls: () => number } {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => n };
}

describe('pepchCorniceForPlantas — the PB+N → cornice ladder (PEPCH Arts 43-55)', () => {
    it('maps PB..PB+3 to 4.5 / 8 / 11 / 14 m', () => {
        expect(pepchCorniceForPlantas(1)).toBe(4.5); // PB
        expect(pepchCorniceForPlantas(2)).toBe(8); // PB+1
        expect(pepchCorniceForPlantas(3)).toBe(11); // PB+2
        expect(pepchCorniceForPlantas(4)).toBe(14); // PB+3
        expect(PEPCH01_CORNICE_HEIGHT_BY_PLANTAS[2]).toBe(8);
    });

    it('refuses (null) anything outside the model — never extrapolates or coerces to 0', () => {
        expect(pepchCorniceForPlantas(5)).toBeNull(); // above PB+3
        expect(pepchCorniceForPlantas(0)).toBeNull();
        expect(pepchCorniceForPlantas(-1)).toBeNull();
        expect(pepchCorniceForPlantas(2.5)).toBeNull(); // non-integer storey
        expect(pepchCorniceForPlantas('2')).toBeNull(); // not a number
        expect(pepchCorniceForPlantas(null)).toBeNull();
    });
});

describe('resolveCordobaEnvelope — the per-parcel WFS resolve', () => {
    it('a real parcel (max_plantas 2, Sur, CTP) → PB+1, 8 m cornice + honest provenance note', async () => {
        const { fetchImpl, calls } = stubFetch(
            fc({ max_plantas: 2, zona_nom: 'Sur', ordenanza: 'Colonia Tradicional Popular' }),
        );
        const res = await resolveCordobaEnvelope(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.params.maxPlantas).toBe(2);
            expect(res.params.pbPlusN).toBe(1);
            expect(res.params.corniceHeight_m).toBe(8);
            expect(res.params.ocupacion).toBe(0.8);
            expect(res.params.patioRatio).toBe(0.25);
            expect(res.params.zona).toBe('Sur');
            expect(res.params.ordenanza).toBe('Colonia Tradicional Popular');
            expect(res.params.granularity).toBe('parcel');
            // The honesty note must flag Catastro-derived + unverified + instrument mismatch.
            expect(res.params.provenanceNote).toMatch(/Catastro|max_plantas/);
            expect(res.params.provenanceNote).toMatch(/unverified|PEPCH|PGOU/);
            expect(res.params.ordinanceRef).toMatch(/PEPCH/);
        }
        expect(calls()).toBe(1);
    });

    it('tolerates a comma-decimal / string storey value from the WFS', async () => {
        const { fetchImpl } = stubFetch(fc({ max_plantas: '3', zona_nom: 'Noroeste' }));
        const res = await resolveCordobaEnvelope(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.params.maxPlantas).toBe(3);
            expect(res.params.corniceHeight_m).toBe(11); // PB+2
        }
    });

    it('a missing / blank / zero max_plantas → `no-max-plantas` (never a fabricated PB, C58 §1.7a)', async () => {
        for (const bad of [{ zona_nom: 'Sur' }, { max_plantas: '' }, { max_plantas: 0 }]) {
            const { fetchImpl } = stubFetch(fc(bad));
            const res = await resolveCordobaEnvelope(PT, { fetchImpl });
            expect(res.ok, JSON.stringify(bad)).toBe(false);
            if (!res.ok) expect(res.reason).toBe('no-max-plantas');
        }
    });

    it('a storey count beyond PB+3 → `plantas-out-of-model` (refuse, never extrapolate)', async () => {
        const { fetchImpl } = stubFetch(fc({ max_plantas: 6, zona_nom: 'Sur' }));
        const res = await resolveCordobaEnvelope(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('plantas-out-of-model');
    });

    it('no parcel feature at the point (outside the pilot) → `no-parcel`', async () => {
        const { fetchImpl } = stubFetch({ features: [] });
        const res = await resolveCordobaEnvelope(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-parcel');
    });

    it('a missing point refuses WITHOUT fetching', async () => {
        const { fetchImpl, calls } = stubFetch(fc({ max_plantas: 2 }));
        const res = await resolveCordobaEnvelope(null, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-point');
        expect(calls()).toBe(0);
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = stubFetch(fc({ max_plantas: 2 }), false);
        const res = await resolveCordobaEnvelope(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveCordobaEnvelope(PT, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('the default proxy path is same-origin (C57 CSP — never the GeoServer host directly)', () => {
        expect(CORDOBA_PARCEL_ENVELOPE_PATH.startsWith('/api/')).toBe(true);
    });
});
