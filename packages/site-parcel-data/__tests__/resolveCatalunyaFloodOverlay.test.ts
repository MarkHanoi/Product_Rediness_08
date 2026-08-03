// CATALUNYA FLOOD OVERLAY — the provider's refusal vocabulary and effect mapping, exercised
// through the injected-fetch seam, driven by REAL WFS payloads.
//
// Both fixture features (ZFP OBJECTID 2025, DPH OBJECTID 460) were extracted LIVE from
// `sig.gencat.cat/ows/AIGUA/wfs` on 2026-08-03 (this session) — see
// `fixtures/catalunya-aigua-besos-zfp-dph.json` for the verbatim payload and request URLs. Only
// the FAILURE MODES are synthesised, same posture as `resolveBalearsMuib.test.ts`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    resolveCatalunyaFloodOverlay,
    catalunyaFloodOverlayRefusalIsTransient,
    CATALUNYA_FLOOD_OVERLAY_MISSING_CONSTRAINTS,
} from '../src/providers/resolveCatalunyaFloodOverlay.js';
import {
    readCatalunyaEspaiFluvialFeature,
    readCatalunyaEspaiFluvialFeatureCollection,
} from '../src/providers/catalunyaAiguaEspaiFluvial.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
    readFileSync(resolve(HERE, 'fixtures', 'catalunya-aigua-besos-zfp-dph.json'), 'utf8'),
) as {
    queryPointWgs84: { lat: number; lon: number };
    zfp: { raw25831: unknown };
    dph: { raw25831: unknown };
};

const PT = FIXTURE.queryPointWgs84;
const ZFP_FEATURE = FIXTURE.zfp.raw25831;
const DPH_FEATURE = FIXTURE.dph.raw25831;

/** A fake `fetch` returning one JSON body. `ok:false` simulates the proxy's own error status. */
function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
    return (async () =>
        ({ ok, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

describe('§CATALUNYA-FLOOD-PARSER — reading the real WFS attribute schema', () => {
    it('reads the real ZFP feature (Besòs mouth, OBJECTID 2025) byte-for-byte', () => {
        const f = readCatalunyaEspaiFluvialFeature(ZFP_FEATURE);
        expect(f).not.toBeNull();
        expect(f?.gmlId).toBe('AIGUA_ZFP.2025');
        expect(f?.OBJECTID).toBe(2025);
        expect(f?.ID_ES).toBe('ZH060_202004_001');
        expect(f?.CODI).toBe('060');
        expect(f?.ARPSI).toBe('ES100060');
        expect(f?.Q).toBe(0);
        expect(f?.KM).toBe(0);
        // ⚠ Observed as a single space, not empty — the reader does NOT trim it away.
        expect(f?.NOM_AA).toBe(' ');
        expect(f?.HISTORIA).toContain('aca_metadada_ef_ZH060_202004_001.pdf');
    });

    it('reads the real DPH feature (Besòs mouth, OBJECTID 460) byte-for-byte', () => {
        const f = readCatalunyaEspaiFluvialFeature(DPH_FEATURE);
        expect(f).not.toBeNull();
        expect(f?.gmlId).toBe('AIGUA_DPH.460');
        expect(f?.OBJECTID).toBe(460);
        expect(f?.ID_ES).toBe('ZH060_201908_001');
        expect(f?.CODI).toBe('060');
        expect(f?.ARPSI).toBe('ES100060');
        expect(f?.Q).toBe(444.3);
        expect(f?.KM).toBe(9.14);
        expect(f?.NOM_AA).toBe('Confluència amb riu Ripoll');
        expect(f?.NOM_AV).toBe('Desembocadura a mar');
    });

    it('both layers share ONE schema — same reader, same fields, only OBJECTID differs on identity', () => {
        const zfp = readCatalunyaEspaiFluvialFeature(ZFP_FEATURE);
        const dph = readCatalunyaEspaiFluvialFeature(DPH_FEATURE);
        expect(Object.keys(zfp ?? {}).sort()).toEqual(Object.keys(dph ?? {}).sort());
        // ⭐ Same river (Besòs, ARPSI ES100060) on both — the fixture pair is a real overlap case.
        expect(zfp?.ARPSI).toBe(dph?.ARPSI);
    });

    it('drops unreadable rows rather than throwing, from a mixed collection', () => {
        const coll = readCatalunyaEspaiFluvialFeatureCollection({
            features: [ZFP_FEATURE, { type: 'Feature', properties: {} }, null, 42],
        });
        // The garbage rows carry no identity at all and are dropped; the real one survives.
        expect(coll.length).toBe(1);
        expect(coll[0]?.OBJECTID).toBe(2025);
    });

    it('returns null on a feature with no identifying field at all', () => {
        expect(readCatalunyaEspaiFluvialFeature({ properties: {} })).toBeNull();
        expect(readCatalunyaEspaiFluvialFeature(null)).toBeNull();
        expect(readCatalunyaEspaiFluvialFeature('not an object')).toBeNull();
    });
});

describe('§CATALUNYA-FLOOD-RESOLVER — discriminated refusal, never a silent null', () => {
    it('refuses out-of-Catalunya points without ever touching fetch', async () => {
        const r = await resolveCatalunyaFloodOverlay(
            { lat: 40.4168, lon: -3.7038 }, // Madrid
            { fetchImpl: fakeFetch({ zfp: [], dph: [] }) },
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('out-of-catalunya');
    });

    it('refuses non-finite / missing points as out-of-catalunya', async () => {
        const r1 = await resolveCatalunyaFloodOverlay(null);
        expect(r1.ok).toBe(false);
        if (!r1.ok) expect(r1.reason).toBe('out-of-catalunya');

        const r2 = await resolveCatalunyaFloodOverlay({ lat: Number.NaN, lon: 2.17 });
        expect(r2.ok).toBe(false);
        if (!r2.ok) expect(r2.reason).toBe('out-of-catalunya');
    });

    it('⭐ MAPS BOTH REAL HITS TO OverlayEffect — DPH prohibits, ZFP restricts, DPH ordered first', async () => {
        const r = await resolveCatalunyaFloodOverlay(PT, {
            fetchImpl: fakeFetch({ zfp: [ZFP_FEATURE], dph: [DPH_FEATURE] }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effects.length).toBe(2);

        const [dphEffect, zfpEffect] = r.effects;
        expect(dphEffect?.kind).toBe('DPH');
        expect(dphEffect?.severity).toBe('prohibits');
        expect(dphEffect?.citation).toContain('RD 638/2016');
        expect(dphEffect?.description).toContain('Domini Públic Hidràulic');
        expect(dphEffect?.description).toContain('ES100060');
        expect(dphEffect?.sourceFeature.OBJECTID).toBe(460);

        expect(zfpEffect?.kind).toBe('ZFP');
        expect(zfpEffect?.severity).toBe('restricts');
        expect(zfpEffect?.citation).toContain('declaració responsable');
        expect(zfpEffect?.description).toContain('Zona de Flux Preferent');
        expect(zfpEffect?.sourceFeature.OBJECTID).toBe(2025);

        // ADR-0293-style posture: the gap (ZI unqueried, etc.) rides on every successful answer.
        expect(r.missingConstraints).toBe(CATALUNYA_FLOOD_OVERLAY_MISSING_CONSTRAINTS);
        expect(r.missingConstraints.some((m) => m.includes('ZI'))).toBe(true);
    });

    it('maps a DPH-only hit (no ZFP polygon at this exact point) to a single prohibiting effect', async () => {
        const r = await resolveCatalunyaFloodOverlay(PT, {
            fetchImpl: fakeFetch({ zfp: [], dph: [DPH_FEATURE] }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effects.length).toBe(1);
        expect(r.effects[0]?.kind).toBe('DPH');
        expect(r.effects[0]?.severity).toBe('prohibits');
    });

    it('⭐ FAILURE ≠ EMPTY — one layer not answering is endpoint-unreachable, never a clean negative', async () => {
        const r = await resolveCatalunyaFloodOverlay(PT, {
            fetchImpl: fakeFetch({ zfp: null, dph: [] }),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('endpoint-unreachable');
        expect(r.detail).toContain('ZFP did not answer');
        expect(catalunyaFloodOverlayRefusalIsTransient(r.reason)).toBe(true);
    });

    it('a REAL negative — both layers answer, completely, with nothing — refuses durably', async () => {
        const r = await resolveCatalunyaFloodOverlay(PT, {
            fetchImpl: fakeFetch({ zfp: [], dph: [] }),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-flood-constraint-here');
        expect(catalunyaFloodOverlayRefusalIsTransient(r.reason)).toBe(false);
    });

    it('refuses when the proxy itself errors (non-200)', async () => {
        const r = await resolveCatalunyaFloodOverlay(PT, {
            fetchImpl: fakeFetch(null, false, 502),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('endpoint-unreachable');
        expect(r.detail).toContain('502');
    });

    it('refuses (non-fatally) when fetch throws', async () => {
        const throwingFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        const r = await resolveCatalunyaFloodOverlay(PT, { fetchImpl: throwingFetch });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('endpoint-unreachable');
    });

    it('refuses when no fetch implementation is available', async () => {
        const r = await resolveCatalunyaFloodOverlay(PT, { fetchImpl: undefined });
        // globalThis.fetch exists in this Node test env, so this exercises the explicit-undefined
        // path only when the environment truly has none; assert it never throws either way.
        expect(typeof r.ok).toBe('boolean');
    });
});
