// LANE PT-ZONEID — the PT national zone-identity leg on CRUS, proven at the CHAIN layer
// (committed ≠ reachable doctrine: these run the same `resolvePtZoneIdentityAt` a dispatcher
// will call).
//
// Fixtures are RECORDED LIVE 2026-09-02 bodies (fixtures/pt-crus-zoneid/*.json — the label
// names the service and the re-record path), replayed via `PtFetchDeps.fetchImpl`. The Porto
// body was RE-PROBED live the same day by the inheriting lane and came back byte-identical.
// Chain branches with a LIVE witness:
//   • Lisboa Baixa (38.7223, −9.1393) → 2 candidates, ONE contains — the containment-pick arm
//     (bbox INTERSECTS more than it CONTAINS; picking by bbox membership = wrong-zone citation)
//   • Porto        (41.1579, −8.6291) → Espaço Verde + the gate-shut pack-draft coverage line
//   • Évora        (38.5667, −7.9000) → Espaço Habitacional → no-rule-pack coverage refusal
//   • Atlantic     (inside-bbox point) → served zero → the honest absent
//
// THE TWO NON-NEGOTIABLES UNDER TEST:
//   1. NEVER A NUMBER — every found branch yields an EnvelopeRefusal naming zone + instrument
//      + why; no numeric envelope field exists anywhere in the output type, and no unsigned
//      Porto draft value reaches any user-readable field.
//   2. FAILURE ≠ EMPTY — 5xx / non-JSON / unreadable geometry are `transient` with an L0-table
//      token (L-12874); the served zero and the ambiguous double-containment are `absent` with
//      genuine-absence tokens. The two never trade places.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EnvelopeRefusalSchema, TRANSIENT_FETCH_REASONS } from '@pryzm/schemas';
import {
    PT_CRUS_OGCAPI_ENDPOINT,
    PT_PORTO_DTCC,
    PT_PORTO_PDM_CERTIFIED,
    PT_PORTO_PDM_DRAFT,
    buildPtCrusPointUrl,
    classifyPtCrusClasse,
    parsePtCrusItemsBody,
    parsePtCrusZone,
    ptCountryAdapter,
    ptCrusFeaturesAtPoint,
    ptCrusZoneRefusal,
    ptGetJson,
    ptPortoPdmDraftRefusal,
    ptRefusalCodeForZone,
    resolvePtZoneIdentityAt,
    type PtCrusZone,
    type PtFetchDeps,
} from '../src/countryAdapters/pt/index.js';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL('./fixtures/pt-crus-zoneid/recorded-live-2026-09-02.json', import.meta.url),
        'utf8',
    ),
) as Record<string, unknown> & { __label__: string };

/** Fixture body accessor that fails BY NAME on a missing key. */
function body(key: string): unknown {
    const b = FIXTURES[key];
    if (b === undefined) throw new Error(`fixture key missing: ${key}`);
    return b;
}

/** Route by a "lonMin,latMin" bbox substring of the items URL → canned recorded body. */
function makeFetch(
    routes: ReadonlyArray<readonly [string, unknown]>,
    calls: string[] = [],
): PtFetchDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        calls.push(url);
        for (const [needle, routed] of routes) {
            if (url.includes(needle)) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(routed),
                } as unknown as Response;
            }
        }
        throw new Error(`ptZoneIdentity.test: unrouted URL in fixture replay — ${url.slice(0, 160)}`);
    }) as typeof fetch;
    return { fetchImpl };
}

/** A minimal synthetic FeatureCollection (used ONLY for branches no live body can witness). */
function synthetic(features: unknown[]): unknown {
    return { type: 'FeatureCollection', numberReturned: features.length, features };
}

/** A 2×2-degree-ish square Polygon feature around (lat, lon), with a full CRUS attribute bag. */
function squareFeature(
    lat: number,
    lon: number,
    half: number,
    props: Record<string, unknown>,
): unknown {
    return {
        type: 'Feature',
        properties: props,
        geometry: {
            type: 'Polygon',
            coordinates: [
                [
                    [lon - half, lat - half],
                    [lon + half, lat - half],
                    [lon + half, lat + half],
                    [lon - half, lat + half],
                    [lon - half, lat - half],
                ],
            ],
        },
    };
}

const EVORA_PROPS: Record<string, unknown> = {
    fid: 218933,
    dtcc: '0705',
    municipio: 'ÉVORA',
    classificacao_e_qualificacao: 'Solo Urbano - Espaços habitacionais',
    classe_2021: 'Solo Urbano',
    categoria_2021: 'Espaço Habitacional',
    escala_origem: '10000',
    fonte: 'CRUS',
    autor: 'DGT',
    data_pub_origem: '2025-01-01T00:00:00Z',
    registo_ou_deposito: '04.07.05/PDM/02/2025/162',
    situacao_pdm: 'Vigente',
    codigo: 1,
};

describe('ptCrusClient — URL shape + FetchOutcome classification', () => {
    it('builds the OGC API items URL with the spec-fixed lon,lat bbox order (measured fact 3)', () => {
        const url = buildPtCrusPointUrl(38.7223, -9.1393);
        expect(url.startsWith(`${PT_CRUS_OGCAPI_ENDPOINT}/collections/crus/items?`)).toBe(true);
        const bbox = new URL(url).searchParams.get('bbox')!;
        const [a, b, c, d] = bbox.split(',').map(Number);
        // lon −9.1393 first, lat 38.7223 second — lon,lat order, min before max.
        expect(a).toBeCloseTo(-9.1394, 6);
        expect(b).toBeCloseTo(38.7222, 6);
        expect(c).toBeCloseTo(-9.1392, 6);
        expect(d).toBeCloseTo(38.7224, 6);
    });

    it('classifies a thrown fetch as transient endpoint-unreachable (L0 token, never absent)', async () => {
        const deps: PtFetchDeps = {
            fetchImpl: (async () => {
                throw new Error('getaddrinfo ENOTFOUND');
            }) as typeof fetch,
        };
        const out = await ptGetJson('https://example.invalid/x', 'test', deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') {
            expect(out.reason.startsWith('endpoint-unreachable:')).toBe(true);
            expect(out.reason).toContain('ENOTFOUND');
        }
    });

    it('classifies HTTP 502 as transient upstream-failed — the measured real failure of 2026-09-02', async () => {
        const deps: PtFetchDeps = {
            fetchImpl: (async () =>
                ({ ok: false, status: 502, text: async () => '<html>Proxy Error</html>' }) as unknown as Response) as typeof fetch,
        };
        const out = await ptGetJson('https://x/items', 'test', deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason.startsWith('upstream-failed: HTTP 502')).toBe(true);
    });

    it('classifies an HTML body behind a 200 as transient, never "no data here"', async () => {
        const deps: PtFetchDeps = {
            fetchImpl: (async () =>
                ({ ok: true, status: 200, text: async () => '<html>maintenance</html>' }) as unknown as Response) as typeof fetch,
        };
        const out = await ptGetJson('https://x/items', 'test', deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason.startsWith('upstream-failed: non-JSON body')).toBe(true);
    });

    it('every transient token this suite observes is in the L0 TRANSIENT_FETCH_REASONS table (L-12874)', () => {
        // The client emits exactly two prefixes; both must be L0 members, and the absent family
        // must NOT be (the two vocabularies never trade places).
        expect(TRANSIENT_FETCH_REASONS).toContain('endpoint-unreachable');
        expect(TRANSIENT_FETCH_REASONS).toContain('upstream-failed');
        for (const absentToken of ['no-feature', 'no-point', 'degenerate-geometry']) {
            expect(TRANSIENT_FETCH_REASONS).not.toContain(absentToken);
        }
    });

    it('parsePtCrusItemsBody: no features array → transient; unreadable geometry → transient naming the fid', () => {
        const noArray = parsePtCrusItemsBody({ type: 'FeatureCollection' }, 'u');
        expect(noArray.status).toBe('transient');
        if (noArray.status === 'transient') expect(noArray.reason.startsWith('upstream-failed:')).toBe(true);

        const badGeom = parsePtCrusItemsBody(
            synthetic([{ properties: { fid: 42 }, geometry: { type: 'Point', coordinates: [0, 0] } }]),
            'u',
        );
        expect(badGeom.status).toBe('transient');
        if (badGeom.status === 'transient') {
            expect(badGeom.reason).toContain('unreadable CRUS geometry');
            expect(badGeom.reason).toContain('42');
        }

        const noProps = parsePtCrusItemsBody(synthetic([{ geometry: null }]), 'u');
        expect(noProps.status).toBe('transient');
    });

    it('ptCrusFeaturesAtPoint: the recorded served zero → absent no-feature (the honest sea answer)', async () => {
        const deps = makeFetch([['collections/crus/items', body('seaZeroItems')]]);
        const out = await ptCrusFeaturesAtPoint(41.15, -8.75, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason.startsWith('no-feature:')).toBe(true);
    });
});

describe('ptCrusZone — parse, classify, refusal code (the weakest-claim bias)', () => {
    it('parses the recorded Évora bag verbatim and refuses a bag missing an identity field', () => {
        const zone = parsePtCrusZone(EVORA_PROPS);
        expect(zone).not.toBeNull();
        expect(zone!.municipio).toBe('ÉVORA');
        expect(zone!.classificacaoEQualificacao).toBe('Solo Urbano - Espaços habitacionais');
        expect(zone!.registoOuDeposito).toBe('04.07.05/PDM/02/2025/162');
        expect(zone!.situacaoPdm).toBe('Vigente');

        const { classe_2021: _dropped, ...withoutClasse } = EVORA_PROPS;
        expect(parsePtCrusZone(withoutClasse)).toBeNull();
    });

    it('recognises the DR 15/2015 classes accent-insensitively and NEVER guesses an unknown one', () => {
        expect(classifyPtCrusClasse('Solo Urbano')).toBe('solo-urbano');
        expect(classifyPtCrusClasse('Solo Rústico')).toBe('solo-rustico');
        expect(classifyPtCrusClasse('SOLO RUSTICO')).toBe('solo-rustico');
        expect(classifyPtCrusClasse('Solo Urbanizável')).toBe('unrecognised'); // abolished pre-2015 class
    });

    const zoneWith = (classe: string, categoria: string): PtCrusZone =>
        parsePtCrusZone({ ...EVORA_PROPS, classe_2021: classe, categoria_2021: categoria })!;

    it('grounds a LEGAL code only where DR 15/2015 categoria semantics settle it', () => {
        expect(ptRefusalCodeForZone(zoneWith('Solo Urbano', 'Espaço Verde'))).toEqual({
            code: 'public-open-space',
            legallyGrounded: true,
        });
        expect(ptRefusalCodeForZone(zoneWith('Solo Urbano', 'Espaço de Uso Especial - Equipamentos'))).toEqual({
            code: 'facility-plan',
            legallyGrounded: true,
        });
        expect(ptRefusalCodeForZone(zoneWith('Solo Rústico', 'Espaço Natural e Paisagístico'))).toEqual({
            code: 'protected-soil',
            legallyGrounded: true,
        });
    });

    it('falls to the WEAKEST claim (no-rule-pack, ungrounded) everywhere else — including the edificável rústico categorias', () => {
        expect(ptRefusalCodeForZone(zoneWith('Solo Urbano', 'Espaço Habitacional'))).toEqual({
            code: 'no-rule-pack',
            legallyGrounded: false,
        });
        expect(ptRefusalCodeForZone(zoneWith('Solo Rústico', 'Aglomerado Rural'))).toEqual({
            code: 'no-rule-pack',
            legallyGrounded: false,
        });
        expect(ptRefusalCodeForZone(zoneWith('Solo Rústico', 'Área de Edificação Dispersa'))).toEqual({
            code: 'no-rule-pack',
            legallyGrounded: false,
        });
        expect(ptRefusalCodeForZone(zoneWith('Solo Urbanizável', 'qualquer coisa'))).toEqual({
            code: 'no-rule-pack',
            legallyGrounded: false,
        });
    });

    it('builds a schema-valid refusal naming zone + instrument verbatim, and caveats a non-Vigente plan', () => {
        const zone = parsePtCrusZone(EVORA_PROPS)!;
        const refusal = ptCrusZoneRefusal(zone);
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.headline).toContain('Solo Urbano - Espaços habitacionais');
        expect(refusal.detail).toContain('PDM de ÉVORA');
        expect(refusal.detail).toContain('04.07.05/PDM/02/2025/162');
        expect(refusal.knownFacts.some((f) => f.includes('Zona (CRUS, verbatim): Solo Urbano - Espaços habitacionais'))).toBe(true);
        expect(refusal.ordinanceRef).toContain('ogcapi.dgterritorio.gov.pt');
        expect(refusal.detail).not.toContain('not "Vigente"');

        const suspended = parsePtCrusZone({ ...EVORA_PROPS, situacao_pdm: 'Suspenso parcialmente' })!;
        expect(ptCrusZoneRefusal(suspended).detail).toContain('"Suspenso parcialmente", not "Vigente"');
    });
});

describe('resolvePtZoneIdentityAt — the chain over recorded live bodies', () => {
    it('Lisboa Baixa: 2 candidates intersect, exactly ONE contains — the containment pick, not bbox membership', async () => {
        const deps = makeFetch([[decodeURIComponent(buildPtCrusPointUrl(38.7223, -9.1393)), body('lisbonItems')]]);
        const out = await resolvePtZoneIdentityAt(38.7223, -9.1393, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.zone.fid).toBe(183318);
        expect(out.value.zone.classificacaoEQualificacao).toBe(
            'Solo Urbano - Espaço Verde de Recreio e Produção Consolidado',
        );
        expect(out.value.zone.dtcc).toBe('1106');
        expect(out.value.refusal.code).toBe('public-open-space');
        expect(out.value.refusal.legallyGrounded).toBe(true);
        // Lisbon is NOT Porto: the pack-draft coverage line must not appear.
        expect(out.value.refusal.detail).not.toContain('PORTO COVERAGE UPDATE');
    });

    it('Porto: verbatim served designation (en-dashes, doubled space) + the gate-shut pack-draft coverage line', async () => {
        const deps = makeFetch([[decodeURIComponent(buildPtCrusPointUrl(41.1579, -8.6291)), body('portoItems')]]);
        const out = await resolvePtZoneIdentityAt(41.1579, -8.6291, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.zone.dtcc).toBe(PT_PORTO_DTCC);
        expect(out.value.zone.classificacaoEQualificacao).toBe(
            'Solo Urbano  – Espaços verdes e Frente atlântica e ribeirinha – Área verde de fruição coletiva',
        );
        expect(out.value.zone.registoOuDeposito).toBe('01.13.12/PDM/03/2021/93');
        const r = out.value.refusal;
        expect(() => EnvelopeRefusalSchema.parse(r)).not.toThrow();
        // The draft upgrades the COVERAGE STATEMENT — never the legal claim.
        expect(r.code).toBe('public-open-space');
        expect(r.legallyGrounded).toBe(true);
        expect(r.detail).toContain('PORTO COVERAGE UPDATE');
        expect(r.detail).toContain('UNCERTIFIED');
        expect(r.knownFacts.some((f) => f.includes('PT_PORTO_PDM_CERTIFIED=false'))).toBe(true);
        // NEVER A NUMBER: no unsigned draft value reaches a user-readable field.
        for (const field of [r.headline, r.detail, ...r.knownFacts]) {
            expect(field).not.toContain('1,8');
            expect(field).not.toContain('1,4');
            expect(field).not.toContain('21 m');
            expect(field).not.toContain('H/2');
        }
    });

    it('Évora: zone-named no-rule-pack coverage refusal, no draft line (dtcc 0705)', async () => {
        const deps = makeFetch([[decodeURIComponent(buildPtCrusPointUrl(38.5667, -7.9)), body('evoraItems')]]);
        const out = await resolvePtZoneIdentityAt(38.5667, -7.9, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.zone.municipio).toBe('ÉVORA');
        expect(out.value.refusal.code).toBe('no-rule-pack');
        expect(out.value.refusal.legallyGrounded).toBe(false);
        expect(out.value.refusal.headline).toContain('Solo Urbano - Espaços habitacionais');
        expect(out.value.refusal.detail).not.toContain('PORTO COVERAGE UPDATE');
    });

    it('Atlantic inside the mainland bbox: the served zero → absent no-feature (sea is not an outage)', async () => {
        const deps = makeFetch([['collections/crus/items', body('seaZeroItems')]]);
        const out = await resolvePtZoneIdentityAt(41.15, -8.75, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason.startsWith('no-feature:')).toBe(true);
    });

    it('outside the mainland routing bbox (Açores): absent no-point WITHOUT any fetch — CRUS is Continente-only', async () => {
        const calls: string[] = [];
        const deps = makeFetch([], calls); // any fetch would throw "unrouted"
        const out = await resolvePtZoneIdentityAt(37.7412, -25.6756, deps); // Ponta Delgada
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason.startsWith('no-point:')).toBe(true);
        expect(calls.length).toBe(0);
    });

    it('a 502 mid-chain stays transient upstream-failed — never an empty, never an estimate', async () => {
        const deps: PtFetchDeps = {
            fetchImpl: (async () =>
                ({ ok: false, status: 502, text: async () => 'Proxy Error' }) as unknown as Response) as typeof fetch,
        };
        const out = await resolvePtZoneIdentityAt(38.7223, -9.1393, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason.startsWith('upstream-failed: HTTP 502')).toBe(true);
    });

    it('bbox intersection without containment → absent no-feature naming the neighbour count', async () => {
        // A polygon INSIDE the bbox but not containing the point (client fact 4's failure half).
        const off = squareFeature(38.9, -8.9, 0.00002, EVORA_PROPS); // tiny square away from the point
        const deps = makeFetch([['collections/crus/items', synthetic([off])]]);
        const out = await resolvePtZoneIdentityAt(38.7223, -9.1393, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') {
            expect(out.reason.startsWith('no-feature: no CRUS polygon contains')).toBe(true);
            expect(out.reason).toContain('1 nearby polygon(s)');
        }
    });

    it('double containment → absent degenerate-geometry naming BOTH fids — ambiguity is never resolved by picking', async () => {
        const a = squareFeature(38.7223, -9.1393, 0.01, { ...EVORA_PROPS, fid: 1 });
        const b = squareFeature(38.7223, -9.1393, 0.02, { ...EVORA_PROPS, fid: 2 });
        const deps = makeFetch([['collections/crus/items', synthetic([a, b])]]);
        const out = await resolvePtZoneIdentityAt(38.7223, -9.1393, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') {
            expect(out.reason.startsWith('degenerate-geometry:')).toBe(true);
            expect(out.reason).toContain('1, 2');
        }
    });

    it('a containing feature missing identity attributes → transient upstream-failed (cannot name a zone = cannot answer)', async () => {
        const bag = { fid: 9, dtcc: '1106' }; // no municipio / classe / categoria / designation
        const f = squareFeature(38.7223, -9.1393, 0.01, bag);
        const deps = makeFetch([['collections/crus/items', synthetic([f])]]);
        const out = await resolvePtZoneIdentityAt(38.7223, -9.1393, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') {
            expect(out.reason.startsWith('upstream-failed:')).toBe(true);
            expect(out.reason).toContain('missing required zone-identity attributes');
        }
    });
});

describe('ptPortoPdmDraft — the gate-shut first pack (FR_PARIS_PLU_CERTIFIED mirror)', () => {
    it('the gate is SHUT and typed boolean', () => {
        expect(PT_PORTO_PDM_CERTIFIED).toBe(false);
    });

    it('every draft value carries an article citation and VERIFIED-PRIMARY confidence — no uncited row exists', () => {
        const entries = Object.entries(PT_PORTO_PDM_DRAFT);
        expect(entries.length).toBeGreaterThanOrEqual(15);
        for (const [key, v] of entries) {
            expect(v.article.length, key).toBeGreaterThan(0);
            expect(v.confidence).toBe('VERIFIED-PRIMARY');
            expect(v.text.length, key).toBeGreaterThan(0);
        }
        // Gate assertion 3 CLOSED 2026-09-02 (lane PT-ARTICLE-PINS): zero rows cite a bare
        // chapter — every formerly unpinned row names its Art. N.º + n.º + alínea and carries
        // the pin marker. A citation that names a chapter where the ordinance names an article
        // is not yet a citation.
        const unpinned = entries.filter(([, v]) => v.article.includes('NOT pinned'));
        expect(unpinned.length).toBe(0);
        const pinned = entries.filter(([, v]) => v.article.includes('lane PT-ARTICLE-PINS'));
        expect(pinned.length).toBe(7);
        for (const [key, v] of pinned) {
            expect(v.article, key).toMatch(/Art\. \d+\.º/);
        }
    });

    it('ptPortoPdmDraftRefusal never claims the draft outside Porto and never changes the legal claim inside it', () => {
        const evora = parsePtCrusZone(EVORA_PROPS)!;
        expect(ptPortoPdmDraftRefusal(evora)).toEqual(ptCrusZoneRefusal(evora));

        const porto = parsePtCrusZone({
            ...EVORA_PROPS,
            dtcc: PT_PORTO_DTCC,
            municipio: 'PORTO',
        })!;
        const base = ptCrusZoneRefusal(porto);
        const upgraded = ptPortoPdmDraftRefusal(porto);
        expect(upgraded.code).toBe(base.code);
        expect(upgraded.legallyGrounded).toBe(base.legallyGrounded);
        expect(upgraded.headline).toBe(base.headline);
        expect(() => EnvelopeRefusalSchema.parse(upgraded)).not.toThrow();
    });
});

describe('ptCountryAdapter — the §J shape', () => {
    it('declares the refusal-only rules arm and the probed CRUS source row', () => {
        expect(ptCountryAdapter.country).toBe('PT');
        expect(ptCountryAdapter.rules.kind).toBe('zone-identity-refusal');
        expect(ptCountryAdapter.rules.fetchChain).toBe(resolvePtZoneIdentityAt);
        const sources = ptCountryAdapter.sources();
        expect(sources.length).toBe(1);
        expect(sources[0]!.id).toBe('pt-dgt-crus-ogcapi');
        expect(sources[0]!.probes.length).toBeGreaterThanOrEqual(2);
    });
});
