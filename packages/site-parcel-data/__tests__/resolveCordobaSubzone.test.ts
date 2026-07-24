// Córdoba — `resolveCordobaSubzone` + `subzoneCodeFromLink`: the COACo WFS subzone resolver.
//
// The compliance-critical seam turned pure: given FIXTURE WFS GeoJSON (NEVER a live call — every test
// injects `fetchImpl`), the parse is deterministic. The fixtures mirror the shapes the
// CORDOBA-DATA-RECON-SPIKE §4 captured live (`coaco:ordenanzas` link + `coaco:vcatastro_urbanismo`
// refcat-join). These tests pin the honesty properties in the resolver header: never throws, the
// subzone comes from the `link` basename (not the coarser family), and the `actuacion` override.

import { describe, it, expect } from 'vitest';
import {
    resolveCordobaSubzone,
    subzoneCodeFromLink,
    CORDOBA_ENVELOPE_VERIFIED,
} from '../src/index.js';

const PT = { lat: 37.8745, lon: -4.7757 }; // a Colonia Tradicional Popular parcel in the Sur pilot.

/** A GeoJSON FeatureCollection with one feature carrying `properties`. */
const fc = (properties: Record<string, unknown>) => ({ features: [{ properties }] });

/**
 * A URL-aware fetch stub: returns `ordenanzas` for the ordenanzas route and `vcatastro` for the
 * vcatastro route, each as JSON with `ok: true`. Counts calls per route.
 */
function routedFetch(bodies: { ordenanzas?: unknown; vcatastro?: unknown; ok?: boolean }): {
    fetchImpl: typeof fetch;
    calls: () => { ord: number; vc: number };
} {
    let ord = 0;
    let vc = 0;
    const fetchImpl = (async (url: string) => {
        const isVc = url.includes('/vcatastro');
        if (isVc) vc++;
        else ord++;
        const body = isVc ? bodies.vcatastro : bodies.ordenanzas;
        return { ok: bodies.ok ?? true, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => ({ ord, vc }) };
}

describe('subzoneCodeFromLink — the O_* link basename → subzone parse', () => {
    it('inserts the hyphen before trailing digits', () => {
        expect(subzoneCodeFromLink('https://x/doc/O_MC3.pdf')).toBe('MC-3');
        expect(subzoneCodeFromLink('O_PAS2')).toBe('PAS-2');
        expect(subzoneCodeFromLink('O_UAD3.PDF')).toBe('UAD-3');
        expect(subzoneCodeFromLink('O_CTP1')).toBe('CTP-1');
        expect(subzoneCodeFromLink('O_OA1')).toBe('OA-1');
        expect(subzoneCodeFromLink('O_UAS1')).toBe('UAS-1');
    });
    it('keeps the bare form for a digit-less basename (the non-packed families)', () => {
        expect(subzoneCodeFromLink('O_PTC.pdf')).toBe('PTC');
        expect(subzoneCodeFromLink('O_COMERCIAL')).toBe('COMERCIAL');
        expect(subzoneCodeFromLink('O_EP')).toBe('EP');
    });
    it('returns null for anything without an O_ family prefix (never guesses)', () => {
        expect(subzoneCodeFromLink('MC3')).toBeNull();
        expect(subzoneCodeFromLink('')).toBeNull();
        expect(subzoneCodeFromLink(null)).toBeNull();
        expect(subzoneCodeFromLink(undefined)).toBeNull();
        expect(subzoneCodeFromLink(42)).toBeNull();
    });
});

describe('resolveCordobaSubzone — the two-step COACo resolve', () => {
    it('the verification gate stays CLOSED (this resolver is wired but never rendered today)', () => {
        expect(CORDOBA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('STEP 1 only (no refcat) — subzone from the link basename, family echoed, no override', async () => {
        const { fetchImpl, calls } = routedFetch({
            ordenanzas: fc({ ordenanza: 'Manzana Cerrada', link: 'https://x/doc/O_MC3.pdf' }),
        });
        const res = await resolveCordobaSubzone(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.subzone).toBe('MC-3');
            expect(res.resolution.ordenanza).toBe('Manzana Cerrada');
            expect(res.resolution.linkBasename).toBe('O_MC3');
            expect(res.resolution.derivedPlanningOverride).toBe(false);
            expect(res.resolution.supPcM2).toBeNull(); // no refcat → STEP 2 skipped
        }
        expect(calls().vc).toBe(0); // no vcatastro call without a refcat
    });

    it('STEP 2 (with refcat) — attributes join; empty actuacion → no override', async () => {
        const { fetchImpl, calls } = routedFetch({
            ordenanzas: fc({ ordenanza: 'Colonia Tradicional Popular', link: 'O_CTP1.pdf' }),
            vcatastro: fc({ sup_pc_m2: '165', max_plantas: 2, actuacion: '' }),
        });
        const res = await resolveCordobaSubzone(PT, { fetchImpl, refcat: '3834946UG4933S' });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.subzone).toBe('CTP-1');
            expect(res.resolution.supPcM2).toBe(165);
            expect(res.resolution.maxPlantas).toBe(2);
            expect(res.resolution.actuacion).toBeNull();
            expect(res.resolution.derivedPlanningOverride).toBe(false);
        }
        expect(calls().vc).toBe(1);
    });

    it('a NON-EMPTY actuacion → derivedPlanningOverride true (subordinate instrument governs)', async () => {
        const { fetchImpl } = routedFetch({
            ordenanzas: fc({ ordenanza: 'Manzana Cerrada', link: 'O_MC1.pdf' }),
            vcatastro: fc({ sup_pc_m2: '300', max_plantas: 4, actuacion: 'PERI-05' }),
        });
        const res = await resolveCordobaSubzone(PT, { fetchImpl, refcat: 'ABC' });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.actuacion).toBe('PERI-05');
            expect(res.resolution.derivedPlanningOverride).toBe(true);
        }
    });

    it('a vcatastro miss is NON-fatal — STEP 1 still binds the subzone', async () => {
        const { fetchImpl } = routedFetch({
            ordenanzas: fc({ ordenanza: 'Ordenación Abierta', link: 'O_OA1.pdf' }),
            vcatastro: undefined, // handled as ok:true with undefined body → firstProps null
        });
        const res = await resolveCordobaSubzone(PT, { fetchImpl, refcat: 'ZZZ' });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.subzone).toBe('OA-1');
            expect(res.resolution.supPcM2).toBeNull();
        }
    });

    it('a missing point refuses WITHOUT fetching', async () => {
        const { fetchImpl, calls } = routedFetch({ ordenanzas: fc({ link: 'O_MC3.pdf' }) });
        const res = await resolveCordobaSubzone(null, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-point');
        expect(calls().ord).toBe(0);
    });

    it('no ordenanzas feature at the point (outside the pilot) → `no-subzone`', async () => {
        const { fetchImpl } = routedFetch({ ordenanzas: { features: [] } });
        const res = await resolveCordobaSubzone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-subzone');
    });

    it('a feature with an unparseable link → `unparseable-subzone` (never a guessed family)', async () => {
        const { fetchImpl } = routedFetch({ ordenanzas: fc({ ordenanza: 'Manzana Cerrada', link: 'not-a-token' }) });
        const res = await resolveCordobaSubzone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-subzone');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = routedFetch({ ordenanzas: fc({ link: 'O_MC3.pdf' }), ok: false });
        const res = await resolveCordobaSubzone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveCordobaSubzone(PT, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });
});
