// LANE FR-ZONEID — the FR national zone-identity leg, proven at the CHAIN layer (committed ≠
// reachable doctrine: these run the same `resolveFrZoneIdentityAt` a dispatcher will call).
//
// Fixtures are RECORDED LIVE 2026-09-02 bodies (fixtures/fr-gpu-zoneid/*.json — the label
// names the service and the re-record path), replayed via `FrFetchDeps.fetchImpl`. The four
// chain branches each have a LIVE witness:
//   • Lyon Presqu'île (45.7640, 4.8357)  → zone-urba UCe1b (PLUi 200046977_PLUI_20260326)
//   • rural Auvergne  (45.5636, 3.1856)  → zone-urba EMPTY, secteur-cc "N" (CC 63268, Pardines)
//   • Bergonne        (45.5250, 3.2200)  → both EMPTY, municipality is_rnu:true (RNU)
//   • Golfe du Lion   (42.90,   3.60)    → municipality EMPTY (the honest sea absent)
//
// THE TWO NON-NEGOTIABLES UNDER TEST:
//   1. NEVER A NUMBER — every non-deferred branch yields an EnvelopeRefusal naming the zone,
//      the instrument and why; no numeric envelope field exists anywhere in the output type.
//   2. NEVER PRE-EMPT — a Paris point yields `deferred` to `fr-75056-paris` WITHOUT touching
//      the network (the regression arm: the certified-pack path stays first).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    FR_GPU_APICARTO_BASE,
    buildFrGpuPointUrl,
    frCountryAdapter,
    frGpuFeaturesAtPoint,
    parseFrGpuZoneFeature,
    parseFrIdurba,
    parseFrReglementPageAnchor,
    resolveFrZoneIdentityAt,
    type FrChainDeps,
} from '../src/countryAdapters/fr/index.js';
import { resolveRegisteredJurisdictionAt } from '../src/rulepacks/registry.js';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL('./fixtures/fr-gpu-zoneid/recorded-live-2026-09-02.json', import.meta.url),
        'utf8',
    ),
) as Record<string, unknown> & { __label__: string };

/** Route by module + "lon,lat" substring of the decoded geom → canned recorded body. */
function makeFetch(
    routes: ReadonlyArray<readonly [string, unknown]>,
    calls: string[] = [],
): FrChainDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        calls.push(url);
        for (const [needle, body] of routes) {
            if (url.includes(needle)) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(body),
                } as unknown as Response;
            }
        }
        throw new Error(`frZoneIdentity.test: unrouted URL in fixture replay — ${url.slice(0, 160)}`);
    }) as typeof fetch;
    return { fetchImpl };
}

/** A guard fake for points the real registry claims nothing at (rural France). */
const noClaim: FrChainDeps['resolveRegisteredJurisdiction'] = () => ({ kind: 'none' });

/** Fixture body accessor that fails BY NAME on a missing key. */
function body(key: string): unknown {
    const b = FIXTURES[key];
    if (b === undefined) throw new Error(`fixture key missing: ${key}`);
    return b;
}

describe('frGpuClient — URL shape + FetchOutcome classification', () => {
    it('builds the measured API Carto point URL with GeoJSON [lon, lat] order', () => {
        const url = buildFrGpuPointUrl('zone-urba', 45.764, 4.8357);
        expect(url.startsWith(`${FR_GPU_APICARTO_BASE}/zone-urba?`)).toBe(true);
        const geom = decodeURIComponent(url.split('geom=')[1]!);
        expect(JSON.parse(geom)).toEqual({ type: 'Point', coordinates: [4.8357, 45.764] });
    });

    it('classifies a network throw as TRANSIENT endpoint-unreachable (never absent)', async () => {
        const deps: FrChainDeps = {
            fetchImpl: (async () => {
                throw new Error('getaddrinfo ENOTFOUND apicarto.ign.fr');
            }) as typeof fetch,
        };
        const out = await frGpuFeaturesAtPoint('zone-urba', 45.764, 4.8357, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') {
            expect(out.reason.startsWith('endpoint-unreachable:')).toBe(true);
            expect(out.reason).toContain('ENOTFOUND');
        }
    });

    it('classifies a GPU 502 as TRANSIENT upstream-failed naming the status — NEVER empty (acceptance arm 3)', async () => {
        const deps: FrChainDeps = {
            fetchImpl: (async () =>
                ({ ok: false, status: 502, text: async () => 'Bad Gateway' }) as unknown as Response) as typeof fetch,
        };
        const out = await frGpuFeaturesAtPoint('zone-urba', 45.764, 4.8357, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason).toContain('upstream-failed: HTTP 502');
    });

    it('classifies a non-JSON 200 body as TRANSIENT', async () => {
        const deps: FrChainDeps = {
            fetchImpl: (async () =>
                ({ ok: true, status: 200, text: async () => '<html>maintenance</html>' }) as unknown as Response) as typeof fetch,
        };
        const out = await frGpuFeaturesAtPoint('zone-urba', 45.764, 4.8357, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason).toContain('non-JSON body');
    });

    it('classifies the measured HTTP-200 zero-feature body as ABSENT naming module + point', async () => {
        const deps = makeFetch([['zone-urba', body('zone-urba@45.5636,3.1856')]]);
        const out = await frGpuFeaturesAtPoint('zone-urba', 45.5636, 3.1856, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toBe('no-feature: gpu/zone-urba @ 45.5636,3.1856');
    });
});

describe('frZoneIdentity — pure parsers on the recorded live bags', () => {
    it('parses the live Lyon zone-urba feature verbatim', () => {
        const fc = body('zone-urba@45.7640,4.8357') as { features: Array<{ properties: Record<string, unknown> }> };
        const z = parseFrGpuZoneFeature('zone-urba', fc.features[0]!.properties);
        expect(z).not.toBeNull();
        expect(z!.zoneCode).toBe('UCe1b');
        expect(z!.typeZone).toBe('U');
        expect(z!.idurba).toBe('200046977_PLUI_20260326');
        expect(z!.instrument).toBe('PLUi');
        expect(z!.instrumentDate).toBe('2026-03-26');
        expect(z!.partition).toBe('DU_200046977');
        expect(z!.reglementDoc).toBe('200046977_reglement_20260326.pdf');
        expect(z!.reglementUrl).toBeNull(); // urlfic "" — naming ≠ addressing (E8 scout)
        expect(z!.validatedOn).toBe('20260326');
        expect(z!.zoneLabel).toContain('Tissu urbain dense');
    });

    it('parses the live Pardines secteur-cc feature (the rung zone-urba cannot see)', () => {
        const fc = body('secteur-cc@45.5636,3.1856') as { features: Array<{ properties: Record<string, unknown> }> };
        const z = parseFrGpuZoneFeature('secteur-cc', fc.features[0]!.properties);
        expect(z).not.toBeNull();
        expect(z!.zoneCode).toBe('N');
        expect(z!.sectorType).toBe('03');
        expect(z!.idurba).toBe('63268_CC_20190221');
        expect(z!.instrument).toBe('CC');
        expect(z!.instrumentDate).toBe('2019-02-21');
    });

    it('parses idurba kinds incl. the lowercase PLUi variant, and refuses garbage with nulls', () => {
        expect(parseFrIdurba('75056_PLU_20260616')).toEqual({ instrument: 'PLU', instrumentDate: '2026-06-16' });
        expect(parseFrIdurba('200030195_PLUi_20260304')).toEqual({ instrument: 'PLUi', instrumentDate: '2026-03-04' });
        expect(parseFrIdurba('31555_PSMV_20250217')).toEqual({ instrument: 'PSMV', instrumentDate: '2025-02-17' });
        expect(parseFrIdurba('63268_CC_20190221')).toEqual({ instrument: 'CC', instrumentDate: '2019-02-21' });
        expect(parseFrIdurba('not-an-idurba')).toEqual({ instrument: null, instrumentDate: null });
        expect(parseFrIdurba(null)).toEqual({ instrument: null, instrumentDate: null });
    });

    it('parses the #page anchor off EITHER field (Marseille urlfic / Nice nomfic — E8 scout)', () => {
        expect(
            parseFrReglementPageAnchor(
                '200054807_reglement_20260803_A.pdf',
                'https://plui.ampmetropole.fr/x/PLUi_CT1_L_Reglement.pdf#page=80',
            ),
        ).toBe(80);
        expect(parseFrReglementPageAnchor('200030195_reglement_20250711.pdf#page=64', '')).toBe(64);
        expect(parseFrReglementPageAnchor('75056_reglement_20260616.pdf', '')).toBeNull();
    });
});

describe('resolveFrZoneIdentityAt — the four branches, each on its live witness', () => {
    it('Lyon: zone-urba → kind "zone" with the ZONE-NAMED, source-cited refusal (never a number)', async () => {
        const calls: string[] = [];
        const deps = { ...makeFetch([['zone-urba', body('zone-urba@45.7640,4.8357')]], calls), resolveRegisteredJurisdiction: noClaim };
        const out = await resolveFrZoneIdentityAt(45.764, 4.8357, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found' || out.value.kind !== 'zone') throw new Error('expected zone');
        expect(out.value.documentKind).toBe('zone-urba');
        expect(out.value.zones[0]!.zoneCode).toBe('UCe1b');
        const refusal = EnvelopeRefusalSchema.parse(out.value.refusal);
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.headline).toContain('UCe1b');
        expect(refusal.headline).toContain('PLUi 200046977_PLUI_20260326');
        expect(refusal.headline).toContain('no envelope asserted');
        expect(refusal.detail).toContain('règlement');
        expect(refusal.ordinanceRef).toContain('200046977_PLUI_20260326');
        expect(refusal.knownFacts.join('\n')).toContain('Planning zone: UCe1b');
        // one network call — the ladder stopped at the first answering rung
        expect(calls.length).toBe(1);
    });

    it('rural Auvergne: zone-urba EMPTY → secteur-cc "N" — the CC rung zone-urba alone would misreport', async () => {
        const deps = {
            ...makeFetch([
                ['zone-urba', body('zone-urba@45.5636,3.1856')],
                ['secteur-cc', body('secteur-cc@45.5636,3.1856')],
            ]),
            resolveRegisteredJurisdiction: noClaim,
        };
        const out = await resolveFrZoneIdentityAt(45.5636, 3.1856, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found' || out.value.kind !== 'zone') throw new Error('expected zone');
        expect(out.value.documentKind).toBe('secteur-cc');
        expect(out.value.zones[0]!.zoneCode).toBe('N');
        expect(out.value.refusal.headline).toContain('Zone N');
        expect(out.value.refusal.ordinanceRef).toContain('63268_CC_20190221');
    });

    it('Bergonne: both document rungs EMPTY → municipality is_rnu:true → the RNU named refusal', async () => {
        const deps = {
            ...makeFetch([
                ['zone-urba', body('zone-urba@45.5250,3.2200')],
                ['secteur-cc', body('secteur-cc@45.5250,3.2200')],
                ['municipality', body('municipality@45.5250,3.2200')],
            ]),
            resolveRegisteredJurisdiction: noClaim,
        };
        const out = await resolveFrZoneIdentityAt(45.525, 3.22, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found' || out.value.kind !== 'rnu') throw new Error('expected rnu');
        expect(out.value.municipality).toEqual({ insee: '63036', name: 'BERGONNE', isRnu: true });
        const refusal = EnvelopeRefusalSchema.parse(out.value.refusal);
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.headline).toContain('BERGONNE');
        expect(refusal.headline).toContain('RNU');
        expect(refusal.detail).toContain('Règlement national');
    });

    it('sea point: municipality EMPTY → honest ABSENT (never a refusal card, never a retry card)', async () => {
        const deps = {
            ...makeFetch([
                ['zone-urba', body('zone-urba@45.5250,3.2200')],
                ['secteur-cc', body('secteur-cc@45.5250,3.2200')],
                ['municipality', body('municipality@42.90,3.60')],
            ]),
            resolveRegisteredJurisdiction: noClaim,
        };
        const out = await resolveFrZoneIdentityAt(42.9, 3.6, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toBe('no-feature: gpu/municipality @ 42.9,3.6');
    });

    it('a transient rung STOPS the ladder — an outage never falls through to "no PLU here"', async () => {
        const calls: string[] = [];
        const deps: FrChainDeps = {
            fetchImpl: (async (input: string | URL | Request) => {
                calls.push(String(input));
                return { ok: false, status: 502, text: async () => 'Bad Gateway' } as unknown as Response;
            }) as typeof fetch,
            resolveRegisteredJurisdiction: noClaim,
        };
        const out = await resolveFrZoneIdentityAt(45.764, 4.8357, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason).toContain('upstream-failed: HTTP 502');
        expect(calls.length).toBe(1); // secteur-cc / municipality never consulted on a failure
    });

    it('a feature bag with no libelle is a mapper refusal BY NAME (L-12874 spelling), never a silent empty', async () => {
        const deps = {
            ...makeFetch([
                ['zone-urba', { type: 'FeatureCollection', features: [{ properties: { libelle: '', idurba: 'x' } }] }],
            ]),
            resolveRegisteredJurisdiction: noClaim,
        };
        const out = await resolveFrZoneIdentityAt(45.764, 4.8357, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason.startsWith('mapper-refused:')).toBe(true);
    });
});

describe('the pre-emption guard — the regression arm (acceptance 2)', () => {
    it('the REAL registry still claims Paris Marais for fr-75056-paris (existing path unchanged)', () => {
        const claim = resolveRegisteredJurisdictionAt(48.859, 2.348);
        expect(claim.kind).toBe('resolved');
        if (claim.kind === 'resolved') expect(claim.jurisdiction.jurisdictionId).toBe('fr-75056-paris');
    });

    it('a Paris point yields DEFERRED to fr-75056-paris WITHOUT any network call (default guard)', async () => {
        const calls: string[] = [];
        const deps: FrChainDeps = {
            fetchImpl: (async (input: string | URL | Request) => {
                calls.push(String(input));
                throw new Error('the national leg must not fetch inside a registered jurisdiction');
            }) as typeof fetch,
            // deliberately NO guard override: the production default must defer by itself
        };
        const out = await resolveFrZoneIdentityAt(48.859, 2.348, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found' || out.value.kind !== 'deferred') throw new Error('expected deferred');
        expect(out.value.to).toContain('fr-75056-paris');
        expect(calls.length).toBe(0);
    });

    it('an out-of-France point is ABSENT before any I/O (bbox pre-filter, never the decider)', async () => {
        const calls: string[] = [];
        const deps: FrChainDeps = {
            fetchImpl: (async (input: string | URL | Request) => {
                calls.push(String(input));
                throw new Error('must not fetch outside the pre-filter');
            }) as typeof fetch,
        };
        const out = await resolveFrZoneIdentityAt(52.52, 13.405, deps); // Berlin
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toContain('outside FRANCE_BBOX');
        expect(calls.length).toBe(0);
    });
});

describe('the adapter value + the never-a-number contract', () => {
    it('frCountryAdapter is the §J shape with rules.kind "zone-identity" (not "structured")', () => {
        expect(frCountryAdapter.country).toBe('FR');
        expect(frCountryAdapter.rules.kind).toBe('zone-identity');
        const rows = frCountryAdapter.sources();
        // ONE GPU row, deliberately (zone-urba/secteur-cc/municipality are ONE national
        // service — the LU precedent). Lane FR-STEP4 (2026-09-02) added the DISTINCT
        // altimetry source row beside it; the pin guards GPU non-multiplicity, not the count.
        const gpuRows = rows.filter((r) => r.id === 'fr-gpu-apicarto-du');
        expect(gpuRows.length).toBe(1);
        expect(gpuRows[0]!.probes.length).toBeGreaterThanOrEqual(3);
    });

    it('no branch of the resolution union carries a numeric envelope field', async () => {
        // Structural assertion at the VALUE layer: the zone branch's own keys are the closed
        // identity set — no height/emprise/far/setback key exists to be filled wrongly later.
        const deps = { ...makeFetch([['zone-urba', body('zone-urba@45.7640,4.8357')]]), resolveRegisteredJurisdiction: noClaim };
        const out = await resolveFrZoneIdentityAt(45.764, 4.8357, deps);
        if (out.status !== 'found' || out.value.kind !== 'zone') throw new Error('expected zone');
        expect(Object.keys(out.value).sort()).toEqual(['documentKind', 'kind', 'refusal', 'zones']);
        const zoneKeys = Object.keys(out.value.zones[0]!);
        for (const forbidden of ['height', 'hauteur', 'emprise', 'far', 'coverage', 'setback']) {
            expect(zoneKeys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
        }
    });
});
