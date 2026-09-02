// LANE FR-STEP4 — the FR no-extraction product, proven at the CHAIN layer (committed ≠
// reachable: these run the same `resolveFrNoExtractionAt` a dispatcher will call).
//
// Fixtures are RECORDED LIVE 2026-09-02 bodies (fixtures/fr-step4/recorded-live-2026-09-02.json,
// geometry stripped — the clients consume properties only), replayed via `FrFetchDeps.fetchImpl`.
// Every regime branch has a LIVE witness:
//   • Paris 11e   (48.8585, 2.3785)     → PLU 75056_PLU_20260616, zone UG, 5 prescriptions,
//                                         5 SUP assiettes, alti 37.54 m, 49 BD TOPO buildings
//   • Lyon        (45.7640, 4.8357)     → PLUi 200046977 — the TYPEDOC case-split pin
//                                         (doc_urba serves 'PLUI', /document serves 'PLUi')
//   • Loray       (47.157245, 6.493262) → PLUi 242504181 (the brief's §4.1 LORAY commune, 25349)
//   • Bergonne    (45.5250, 3.2200)     → RNU (is_rnu=true, no document) — the aggregate-free refusal
//   • Artigue     (42.826760, 0.640911) → POS 31019_POS_20110919 — the §3.2 caducity fall-through
//   • Pardines    (45.5636, 3.1856)     → carte communale sector N — derived-plan-governs
//   • Paris Marais(48.8578, 2.3622)     → PSMV 75056_PSMV_20131218_A — site-specific refusal
//
// THE NON-NEGOTIABLES UNDER TEST:
//   1. NEVER A NUMBER — no envelope field exists anywhere in the record type; refusals and
//      slices carry identity, provenance and citations only.
//   2. FAILURE ≠ EMPTY (control 9) — a severed GPU yields `transient` with the L0 token
//      verbatim on every branch; an outage NEVER becomes an RNU or an empty.
//   3. DETERMINISM — same fixtures + same fetchedAtIso → byte-identical records; the
//      IDURBA-non-unique and multi-municipality picks are pinned with stated rules.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    FR_DOC_URBA_SELECTION_RULE,
    FR_MUNICIPALITY_SELECTION_RULE,
    buildFrGpuWfsPointUrl,
    frElevationAtPoint,
    frGpuFeaturesAtPointWithFallback,
    frNeighbourBuildingsAtPoint,
    normaliseFrDuType,
    pickFrDocUrbaRow,
    resolveFrNoExtractionAt,
    type FrNoExtractionDeps,
    type FrNoExtractionRecord,
} from '../src/countryAdapters/fr/index.js';

const FIXTURES = JSON.parse(
    readFileSync(
        new URL('./fixtures/fr-step4/recorded-live-2026-09-02.json', import.meta.url),
        'utf8',
    ),
) as Record<string, unknown> & { __label__: string };

const FETCHED_AT = '2026-09-02T18:00:00.000Z';

/** The recorded points, [lat, lon] — must match the recorder exactly. */
const POINTS: Record<string, readonly [number, number]> = {
    paris11: [48.8585, 2.3785],
    lyon: [45.764, 4.8357],
    loray: [47.157245, 6.493262],
    bergonne: [45.525, 3.22],
    artigue: [42.82676, 0.640911],
    pardines: [45.5636, 3.1856],
    marais: [48.8578, 2.3622],
};

const EMPTY_FC = { type: 'FeatureCollection', features: [], totalFeatures: 0 };

function body(key: string): unknown {
    const b = FIXTURES[key];
    if (b === undefined) throw new Error(`fixture key missing: ${key}`);
    return b;
}

/** Which recorded point does this URL address? (JSON [lon, lat] as the recorder wrote it.) */
function pointNameOf(decodedUrl: string): string | null {
    for (const [name, [lat, lon]] of Object.entries(POINTS)) {
        if (decodedUrl.includes(`[${lon},${lat}]`)) return name;
        if (decodedUrl.includes(`lon=${lon}&lat=${lat}`)) return name;
        if (decodedUrl.includes(`BBOX=${lon - 0.0008}`)) return name;
    }
    return null;
}

/**
 * The fixture-replay fetch: routes every URL the chain can emit to its recorded body.
 * `overrides` win over the default routing (synthetic-branch + failure-injection tests).
 */
function fixtureFetch(
    overrides: ReadonlyArray<readonly [string, unknown | 'THROW' | 'HTTP502']> = [],
    calls: string[] = [],
): FrNoExtractionDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        calls.push(url);
        const respond = (b: unknown) =>
            ({ ok: true, status: 200, text: async () => JSON.stringify(b) }) as unknown as Response;
        for (const [needle, b] of overrides) {
            if (url.includes(needle)) {
                if (b === 'THROW') throw new Error('ECONNREFUSED (test-severed)');
                if (b === 'HTTP502') {
                    return {
                        ok: false,
                        status: 502,
                        text: async () => 'Bad Gateway',
                    } as unknown as Response;
                }
                return respond(b);
            }
        }
        const name = pointNameOf(url);
        if (url.includes('altimetrie')) {
            return respond(
                name === 'paris11'
                    ? body('paris11/altimetry')
                    : { elevations: [{ z: 200.5, acc: 'TEST-SYNTHETIC' }] },
            );
        }
        if (url.includes('BDTOPO_V3:batiment')) {
            return respond(name === 'paris11' ? body('paris11/bdtopo') : EMPTY_FC);
        }
        if (url.includes('doc_urba')) {
            const m = url.match(/idurba='([^']+)'/);
            const key = m ? `doc-urba/${m[1]}` : null;
            return respond(key !== null && FIXTURES[key] !== undefined ? body(key) : EMPTY_FC);
        }
        const mod = url.match(/api\/gpu\/([a-z-]+)\?/)?.[1];
        if (mod !== undefined && name !== null) {
            const key = `${name}/${mod}`;
            return respond(FIXTURES[key] !== undefined ? body(key) : EMPTY_FC);
        }
        throw new Error(`frNoExtraction.test: unrouted URL — ${url.slice(0, 160)}`);
    }) as typeof fetch;
    return { fetchImpl, fetchedAtIso: FETCHED_AT };
}

async function resolveAt(
    name: keyof typeof POINTS,
    deps: FrNoExtractionDeps,
): Promise<FrNoExtractionRecord> {
    const [lat, lon] = POINTS[name]!;
    const out = await resolveFrNoExtractionAt(lat, lon, deps);
    expect(out.status).toBe('found');
    if (out.status !== 'found') throw new Error('unreachable');
    return out.value;
}

/* ────────────────────────── client extensions ─────────────────────────── */

describe('frGpuClient — step-4 extensions', () => {
    it('builds the WFS fallback URL with the MEASURED lat-lon CQL axis order', () => {
        const url = buildFrGpuWfsPointUrl('zone-urba', 48.8585, 2.3785);
        expect(url).toContain('TYPENAMES=wfs_du%3Azone_urba');
        // URLSearchParams form-encodes the CQL space as '+' — the live WFS accepts it
        // (verified 2026-09-02: this exact builder's URL → found, libelle UG).
        expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain(
            'INTERSECTS(the_geom,POINT(48.8585 2.3785))',
        );
    });

    it('falls back to the direct WFS ONLY on a transient — an API Carto EMPTY never triggers it', async () => {
        const calls: string[] = [];
        const emptyPrimary = fixtureFetch([['apicarto.ign.fr', EMPTY_FC]], calls);
        const out = await frGpuFeaturesAtPointWithFallback('zone-urba', 48.8585, 2.3785, emptyPrimary);
        expect(out.status).toBe('absent');
        expect(calls.some((u) => u.includes('data.geopf.fr'))).toBe(false);
    });

    it('serves the answer through the WFS fallback when API Carto 502s', async () => {
        const deps = fixtureFetch([
            ['apicarto.ign.fr', 'HTTP502'],
            ['wfs_du:zone_urba', body('paris11/zone-urba')],
        ]);
        const out = await frGpuFeaturesAtPointWithFallback('zone-urba', 48.8585, 2.3785, deps);
        expect(out.status).toBe('found');
        if (out.status === 'found') {
            expect(out.value[0]!.properties['libelle']).toBe('UG');
        }
    });

    it('names BOTH transports when both fail — endpoint-unreachable, never an empty', async () => {
        const deps = fixtureFetch([['', 'THROW']]);
        const out = await frGpuFeaturesAtPointWithFallback('municipality', 48.8585, 2.3785, deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') {
            expect(out.reason.startsWith('endpoint-unreachable:')).toBe(true);
            expect(out.reason).toContain('BOTH transports');
        }
    });
});

describe('frAltimetry — measured shape + the no-data sentinel', () => {
    it('parses the recorded Paris body (z=37.54, string accuracy)', async () => {
        const out = await frElevationAtPoint(48.8585, 2.3785, fixtureFetch());
        expect(out.status).toBe('found');
        if (out.status === 'found') {
            expect(out.value.elevationM).toBe(37.54);
            expect(out.value.accuracy).toBe('Variable suivant la source de mesure');
            expect(out.value.resource).toBe('ign_rge_alti_wld');
        }
    });

    it('classifies z=-99999 as ABSENT by name — the sentinel is never an elevation', async () => {
        const deps = fixtureFetch([['altimetrie', { elevations: [{ z: -99999.0, acc: 'x' }] }]]);
        const out = await frElevationAtPoint(42.9, 3.6, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toContain('no-data sentinel z=-99999');
    });
});

describe('frBdTopoNeighbours — heights with the honesty frame', () => {
    it('parses the recorded 49-building Paris block, sorted and counted', async () => {
        const out = await frNeighbourBuildingsAtPoint(48.8585, 2.3785, fixtureFetch());
        expect(out.status).toBe('found');
        if (out.status === 'found') {
            expect(out.value.served).toBe(49);
            expect(out.value.buildings.length + out.value.withoutHeight).toBe(49);
            expect(out.value.buildings.every((b) => b.heightM > 0)).toBe(true);
            const ids = out.value.buildings.map((b) => b.cleabs ?? '');
            expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
            expect(out.value.caveat).toContain('photogrammetric');
        }
    });
});

/* ────────────────────────── the regime branches ───────────────────────── */

describe('no-extraction record — PLU main path (Paris 11e, live fixture)', () => {
    it('emits the full record: regime, zone, prescriptions, SUP, terrain, neighbours, doc', async () => {
        const rec = await resolveAt('paris11', fixtureFetch());
        expect(rec.refusal).toBeNull();

        // regime — two municipality features; the lowest-INSEE rule picks the commune
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') {
            expect(rec.regime.value.regime).toBe('PLU');
            expect(rec.regime.value.commune.insee).toBe('75056');
            expect(rec.regime.value.commune.name).toBe('PARIS');
            expect(rec.regime.value.communeSelectionRule).toBe(FR_MUNICIPALITY_SELECTION_RULE);
            expect(rec.regime.value.documentName).toBe('75056_PLU_20260616');
            expect(rec.regime.provenance.source.country).toBe('FR');
        }

        // derivability — the normal case, no derived plan
        expect(rec.derivability.status).toBe('resolved');
        if (rec.derivability.status === 'resolved') {
            expect(rec.derivability.value.class).toBe('reglement-text-path');
        }

        // zone — UG with the règlement pointer (the product's core citation)
        expect(rec.zone.status).toBe('resolved');
        if (rec.zone.status === 'resolved') {
            expect(rec.zone.value.zones[0]!.zoneCode).toBe('UG');
            expect(rec.zone.value.zones[0]!.reglementDoc).toBe('75056_reglement_20260616.pdf');
            expect(rec.zone.provenance.validityBasis).toBe('legal');
            expect(rec.zone.provenance.valid_from).toBe('2026-06-16'); // datvalid 20260616
            expect(rec.zone.provenance.source.plan_id).toBe('75056_PLU_20260616');
        }

        // permitted uses — DEST* empty on the live row → typed unresolved naming the règlement
        expect(rec.permittedUses.status).toBe('unresolved');
        if (rec.permittedUses.status === 'unresolved') {
            expect(rec.permittedUses.retryable).toBe(false);
            expect(rec.permittedUses.refusal_reason).toContain('75056_reglement_20260616.pdf');
            expect(rec.permittedUses.refusal_reason).toContain('No default is asserted');
        }

        // prescriptions — 5 surf at the live point, non-§5 codes carried verbatim untyped
        expect(rec.prescriptions.status).toBe('resolved');
        if (rec.prescriptions.status === 'resolved') {
            expect(rec.prescriptions.value.counts).toEqual({ surf: 5, lin: 0, pct: 0 });
            expect(rec.prescriptions.value.atPoint.every((p) => p.meaning === null)).toBe(true);
            expect(rec.prescriptions.value.scopeNote).toContain('not evidence it does not exist');
        }

        // SUP — 5 assiettes with the acte riding as `fichier`
        expect(rec.sup.status).toBe('resolved');
        if (rec.sup.status === 'resolved') {
            expect(rec.sup.value.counts.s).toBe(5);
            const ac1 = rec.sup.value.assiettes.find((a) => a.categorie === 'ac1');
            expect(ac1).toBeDefined();
            expect(ac1!.acte).toMatch(/\.pdf$/);
        }

        // terrain + neighbours
        expect(rec.terrain.status).toBe('resolved');
        if (rec.terrain.status === 'resolved') {
            expect(rec.terrain.value.elevationM).toBe(37.54);
            expect(rec.terrain.value.datumNote).toContain('datum');
        }
        expect(rec.neighbours.status).toBe('resolved');
        if (rec.neighbours.status === 'resolved') expect(rec.neighbours.value.served).toBe(49);

        // governing document — DATAPPRO + ETAT joined from doc_urba, both links present
        expect(rec.governingDocument.status).toBe('resolved');
        if (rec.governingDocument.status === 'resolved') {
            const g = rec.governingDocument.value;
            expect(g.name).toBe('75056_PLU_20260616');
            expect(g.datappro).toBe('20260616');
            expect(g.etat).toBe('03');
            expect(g.docUrbaJoin).toBe('joined');
            expect(g.downloadByPartitionUrl).toBe(
                'https://www.geoportail-urbanisme.gouv.fr/document/download-by-partition/DU_75056',
            );
            expect(g.legifranceUrl).toContain('legifrance.gouv.fr');
            expect(g.legifranceArticles).toContain('R151-39');
        }
    });

    it('is byte-deterministic: two runs with the same fetchedAtIso diff empty', async () => {
        const a = await resolveAt('paris11', fixtureFetch());
        const b = await resolveAt('paris11', fixtureFetch());
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe('no-extraction record — PLUi (Lyon) + the TYPEDOC case-split pin', () => {
    it('normalises PLUI→PLUi across /document and doc_urba while keeping verbatims', async () => {
        const rec = await resolveAt('lyon', fixtureFetch());
        expect(rec.refusal).toBeNull();
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') {
            expect(rec.regime.value.regime).toBe('PLUi');
            expect(rec.regime.value.commune.insee).toBe('69123'); // LYON, not the arrondissement
        }
        expect(rec.zone.status).toBe('resolved');
        if (rec.zone.status === 'resolved') {
            expect(rec.zone.value.zones[0]!.zoneCode).toBe('UCe1b');
        }
        expect(rec.governingDocument.status).toBe('resolved');
        if (rec.governingDocument.status === 'resolved') {
            // the doc_urba row serves typedoc 'PLUI' (live pin) — the record speaks 'PLUi'
            expect(rec.governingDocument.value.duType).toBe('PLUi');
            expect(rec.governingDocument.value.datappro).toBe('20260326');
            expect(rec.governingDocument.value.etat).toBe('07');
        }
        // the normaliser itself, both spellings
        expect(normaliseFrDuType('PLUI')).toBe('PLUi');
        expect(normaliseFrDuType('PLUi')).toBe('PLUi');
        expect(normaliseFrDuType('PLU')).toBe('PLU');
    });

    it('resolves the LORAY commune (INSEE 25349 — the brief §4.1 contract commune)', async () => {
        const rec = await resolveAt('loray', fixtureFetch());
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') {
            expect(rec.regime.value.commune.insee).toBe('25349');
            expect(rec.regime.value.commune.name).toBe('LORAY');
            expect(rec.regime.value.regime).toBe('PLUi');
        }
        expect(rec.zone.status).toBe('resolved');
        if (rec.zone.status === 'resolved') expect(rec.zone.value.zones[0]!.zoneCode).toBe('Aa');
    });
});

describe('no-extraction record — RNU (Bergonne): the aggregate-free cited refusal', () => {
    it('cites the per-commune is_rnu flag, names the SuDocUH discrepancy, quotes NO aggregate', async () => {
        const rec = await resolveAt('bergonne', fixtureFetch());
        expect(rec.refusal).not.toBeNull();
        const refusal = rec.refusal!;
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.detail).toContain('is_rnu=true');
        expect(refusal.detail).toContain('per-commune');
        expect(refusal.detail).toContain('SuDocUH');
        // the aggregate ban: NEITHER published figure appears anywhere on the card
        const text = JSON.stringify(refusal);
        for (const banned of ['9,461', '9461', '6,646', '6646', '23.77', '19.0', '35,010', '35010', '35,011']) {
            expect(text).not.toContain(banned);
        }
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') expect(rec.regime.value.regime).toBe('RNU');
        expect(rec.derivability.status).toBe('resolved');
        if (rec.derivability.status === 'resolved') {
            expect(rec.derivability.value.class).toBe('rnu-no-derivation');
        }
        expect(rec.zone.status).toBe('unresolved');
        expect(rec.governingDocument.status).toBe('resolved');
        if (rec.governingDocument.status === 'resolved') {
            expect(rec.governingDocument.value.name).toBe("Règlement national d'urbanisme");
            expect(rec.governingDocument.value.legifranceArticles).toContain('L111-1');
        }
    });
});

describe('no-extraction record — POS caducity fall-through (Artigue, live)', () => {
    it('treats the served POS as dead, names 27 March 2017, and falls through to RNU', async () => {
        const rec = await resolveAt('artigue', fixtureFetch());
        expect(rec.refusal).not.toBeNull();
        const refusal = rec.refusal!;
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.headline).toContain('caduc since 27 March 2017');
        expect(refusal.detail).toContain('L174-1');
        expect(refusal.detail).toContain('31019_POS_20110919');
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') {
            expect(rec.regime.value.regime).toBe('POS-caduc');
            expect(rec.regime.value.isRnuFlag).toBe(true); // the GPU flag agrees, carried verbatim
        }
        // partial output over blank: the caduc POS zoning is still carried as identity
        expect(rec.zone.status).toBe('resolved');
        if (rec.zone.status === 'resolved') {
            expect(rec.zone.value.zones[0]!.zoneCode).toBe('NC');
            expect(rec.zone.value.zones[0]!.idurba).toBeNull(); // old-standard row, live
        }
        expect(rec.derivability.status).toBe('resolved');
        if (rec.derivability.status === 'resolved') {
            expect(rec.derivability.value.class).toBe('rnu-no-derivation');
        }
        // the dead POS's old-standard DESTDOMI (served live on this row) must NOT come back
        // as current permitted uses — the caduc instrument's uses die with it
        expect(rec.permittedUses.status).toBe('unresolved');
        if (rec.permittedUses.status === 'unresolved') {
            expect(rec.permittedUses.refusal_reason).toContain('L111-1');
        }
        expect(rec.governingDocument.status).toBe('resolved');
        if (rec.governingDocument.status === 'resolved') {
            expect(rec.governingDocument.value.legifranceArticles).toContain('L174-1');
        }
    });
});

describe('no-extraction record — carte communale (Pardines, live)', () => {
    it('zones via secteur-cc and refuses derivation naming the CC expedient', async () => {
        const rec = await resolveAt('pardines', fixtureFetch());
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') {
            expect(rec.regime.value.regime).toBe('CC');
            expect(rec.regime.value.note).toContain('RNU rules apply');
        }
        expect(rec.zone.status).toBe('resolved');
        if (rec.zone.status === 'resolved') {
            expect(rec.zone.value.documentKind).toBe('secteur-cc');
            expect(rec.zone.value.zones[0]!.zoneCode).toBe('N');
        }
        expect(rec.derivability.status).toBe('resolved');
        if (rec.derivability.status === 'resolved') {
            expect(rec.derivability.value.class).toBe('derived-plan-governs');
            expect(rec.derivability.value.trigger).toBe('secteur-cc');
            expect(rec.derivability.value.expedient).toBe('63268_CC_20190221');
        }
        expect(rec.refusal).not.toBeNull();
        expect(rec.refusal!.code).toBe('derived-plan');
        expect(() => EnvelopeRefusalSchema.parse(rec.refusal!)).not.toThrow();
    });
});

describe('no-extraction record — PSMV (Paris Marais, live)', () => {
    it('refuses as derived-plan naming the site-specific document', async () => {
        const rec = await resolveAt('marais', fixtureFetch());
        expect(rec.regime.status).toBe('resolved');
        if (rec.regime.status === 'resolved') {
            expect(rec.regime.value.regime).toBe('PSMV');
            expect(rec.regime.value.commune.insee).toBe('75056'); // lowest-INSEE over 75103
        }
        expect(rec.refusal).not.toBeNull();
        const refusal = rec.refusal!;
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.code).toBe('derived-plan');
        expect(refusal.legallyGrounded).toBe(true);
        expect(refusal.headline).toContain('75056_PSMV_20131218_A');
        expect(refusal.detail).toContain('building by building');
        expect(rec.derivability.status).toBe('resolved');
        if (rec.derivability.status === 'resolved') {
            expect(rec.derivability.value.trigger).toBe('psmv');
        }
    });
});

/* ────────────────────────── the determinism pins ──────────────────────── */

describe('the IDURBA-non-unique determinism pin', () => {
    const dup = (a: string, b: string, gidA = 1, gidB = 2) => [
        { properties: { idurba: 'X_PLU_20200101', typedoc: 'PLU', etat: '05', datappro: a, gid: gidA } },
        { properties: { idurba: 'X_PLU_20200101', typedoc: 'PLU', etat: '03', datappro: b, gid: gidB } },
    ];

    it('picks the newest DATAPPRO regardless of input order, and STATES the rule', () => {
        const forward = pickFrDocUrbaRow(dup('20200101', '20260616'));
        const reversed = pickFrDocUrbaRow(dup('20260616', '20200101', 2, 1));
        expect(forward.picked!.datappro).toBe('20260616');
        expect(reversed.picked!.datappro).toBe('20260616');
        expect(forward.selectionRule).toBe(FR_DOC_URBA_SELECTION_RULE);
        expect(FR_DOC_URBA_SELECTION_RULE).toContain('NOT unique');
    });

    it('breaks DATAPPRO ties by highest gid', () => {
        const tied = pickFrDocUrbaRow(dup('20260616', '20260616', 7, 9));
        expect(tied.picked!.gid).toBe(9);
    });

    it('flows into the record: a duplicated doc_urba join still yields one stated pick', async () => {
        const twoRows = {
            type: 'FeatureCollection',
            totalFeatures: 2,
            features: dup('20200101', '20260616').map((f) => ({ type: 'Feature', ...f })),
        };
        const rec = await resolveAt('paris11', fixtureFetch([['doc_urba', twoRows]]));
        expect(rec.governingDocument.status).toBe('resolved');
        if (rec.governingDocument.status === 'resolved') {
            expect(rec.governingDocument.value.datappro).toBe('20260616');
            expect(rec.governingDocument.value.docUrbaRowCount).toBe(2);
            expect(rec.governingDocument.value.docUrbaSelectionRule).toBe(FR_DOC_URBA_SELECTION_RULE);
        }
    });
});

describe('the plan-masse (TYPEPSC 14) derivability gate', () => {
    it('routes a drawn-volume prescription to derived-plan-governs naming the expedient', async () => {
        const planMasseFc = {
            type: 'FeatureCollection',
            totalFeatures: 1,
            features: [
                {
                    type: 'Feature',
                    properties: {
                        typepsc: '14',
                        stypepsc: '00',
                        libelle: 'Secteur de plan de masse test',
                        idurba: '75056_PLU_20260616',
                        partition: 'DU_75056',
                        nomfic: 'plan_masse_expedient.pdf#page=3',
                        urlfic: '',
                        gid: 1,
                    },
                },
            ],
        };
        const rec = await resolveAt('paris11', fixtureFetch([['prescription-surf', planMasseFc]]));
        expect(rec.derivability.status).toBe('resolved');
        if (rec.derivability.status === 'resolved') {
            expect(rec.derivability.value.class).toBe('derived-plan-governs');
            expect(rec.derivability.value.trigger).toBe('plan-masse');
            expect(rec.derivability.value.expedient).toBe('plan_masse_expedient.pdf');
        }
        expect(rec.refusal).not.toBeNull();
        expect(rec.refusal!.code).toBe('derived-plan');
        expect(rec.refusal!.detail).toContain('R151-40');
        // the prescription itself is typed with its §5 meaning
        expect(rec.prescriptions.status).toBe('resolved');
        if (rec.prescriptions.status === 'resolved') {
            const pm = rec.prescriptions.value.atPoint.find((p) => p.typepsc === '14');
            expect(pm!.meaning).toBe('plan-masse-drawn-volume');
            expect(pm!.envelopeRelevant).toBe(true);
            expect(pm!.reglementPage).toBe(3);
        }
    });
});

/* ────────────────────────── control 9: failure ≠ refusal ──────────────── */

describe('falsification — a severed GPU is transient-by-name on EVERY branch', () => {
    it('never converts an outage into an RNU, an empty, or any refusal', async () => {
        for (const name of Object.keys(POINTS) as (keyof typeof POINTS)[]) {
            const [lat, lon] = POINTS[name]!;
            const out = await resolveFrNoExtractionAt(lat, lon, fixtureFetch([['', 'THROW']]));
            expect(out.status).toBe('transient');
            if (out.status === 'transient') {
                expect(out.reason.startsWith('endpoint-unreachable:')).toBe(true);
            }
        }
    });

    it('degrades an AUXILIARY failure to a typed retryable slice — the record still ships', async () => {
        const rec = await resolveAt('paris11', fixtureFetch([['altimetrie', 'HTTP502']]));
        expect(rec.terrain.status).toBe('unresolved');
        if (rec.terrain.status === 'unresolved') {
            expect(rec.terrain.retryable).toBe(true);
            expect(rec.terrain.refusal_reason).toContain('upstream-failed');
        }
        // the rest of the record is intact
        expect(rec.regime.status).toBe('resolved');
        expect(rec.zone.status).toBe('resolved');
        expect(rec.refusal).toBeNull();
    });

    it('withholds the prescriptions slice when ONE geometry leg is down (no silent 2-of-3)', async () => {
        const rec = await resolveAt('paris11', fixtureFetch([['prescription-lin', 'HTTP502']]));
        expect(rec.prescriptions.status).toBe('unresolved');
        if (rec.prescriptions.status === 'unresolved') {
            expect(rec.prescriptions.retryable).toBe(true);
            expect(rec.prescriptions.refusal_reason).toContain('understate');
        }
    });
});
