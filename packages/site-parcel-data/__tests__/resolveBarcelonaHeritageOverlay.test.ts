// BARCELONA HERITAGE OVERLAY — driven entirely by REAL `WMSCATPATRI` payloads captured live at
// Barcelona Cathedral (Barri Gòtic), 2026-08-03 (`fixtures/bcn-catpatri-cathedral.json`). Only the
// FAILURE MODES (unreachable layer, malformed body, out-of-region) are synthesised — the schema
// under test is not.
//
// ⭐ THE PROPERTY UNDER TEST THROUGHOUT: a refusal is a discriminated VALUE, an empty overlay
// (no heritage here) is a SUCCESS with `effects: []`, and a partially-unreachable layer set never
// gets silently folded into "nothing here" — it is named in `unreachableLayers`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    resolveBarcelonaHeritageOverlay,
    BCN_HERITAGE_ASSET_LAYERS,
    BCN_HERITAGE_BUFFER_LAYERS,
    BCN_HERITAGE_LEGAL_BASIS_ASSET,
    BCN_HERITAGE_LEGAL_BASIS_BUFFER,
    BCN_HERITAGE_NO_GEOMETRY_CAVEAT,
    type BarcelonaHeritageOverlayEffect,
} from '../src/providers/resolveBarcelonaHeritageOverlay.js';
import {
    parseBcnCatpatriFeatureInfo,
    bcnCatpatriIsServiceException,
    bcnHeritageStatutoryLetter,
    readBcnHeritageAssetFeature,
    readBcnHeritageBufferFeature,
} from '../src/providers/bcnCatpatriFeatureInfo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
    readFileSync(resolve(HERE, 'fixtures', 'bcn-catpatri-cathedral.json'), 'utf8'),
) as {
    queryPoint: { lat: number; lon: number };
    assetLayerName: string;
    assetRawXml: string;
    bufferLayerName: string;
    bufferRawXml: string;
    serviceExceptionSamples: Record<string, string>;
    emptyFeatureCollectionSample: string;
};

const PT = FIXTURE.queryPoint;
const ASSET_LAYER = BCN_HERITAGE_ASSET_LAYERS[0]!; // the verified `A` layer
const BUFFER_LAYER = BCN_HERITAGE_BUFFER_LAYERS[0]!; // the verified entorn layer

/** A fake `fetch` that answers each layer from a lookup table, `text()`-based (mirrors the real WMS). */
function fakeFetchByLayer(answers: Record<string, { ok: boolean; xml: string | null }>): typeof fetch {
    return (async (input: unknown) => {
        const url = String(input);
        const m = /[?&]layer=([^&]+)/.exec(url);
        const layer = m ? decodeURIComponent(m[1]!) : '';
        const a = answers[layer];
        if (!a) return { ok: false, text: async () => '' } as unknown as Response;
        if (!a.ok || a.xml === null) return { ok: false, text: async () => a.xml ?? '' } as unknown as Response;
        return { ok: true, text: async () => a.xml } as unknown as Response;
    }) as unknown as typeof fetch;
}

describe('§BCN-HERITAGE-PARSER — the raw GetFeatureInfo attribute-bag schema', () => {
    it('⭐ parses the REAL Cathedral BCIN feature — layer name, statutory NIVELL, full attribute list', () => {
        const raws = parseBcnCatpatriFeatureInfo(FIXTURE.assetRawXml);
        expect(raws).toHaveLength(1);
        const raw = raws[0]!;
        expect(raw.layerName).toBe('Poligon_de_bé_cultural_d_interès_nacional__A_');
        expect(Object.keys(raw.attributes).sort()).toEqual(
            [
                'AUTOR',
                'DENOMIN',
                'DESCRIPCIO',
                'DISTRICTE',
                'EPOCA',
                'ESTIL',
                'FOTOGRAFI',
                'ID',
                'IDENTIFICA',
                'INTERVEN',
                'NIVELL',
                'PLANOLS',
                'PROPIETAT',
                'US_ACTUAL',
                'US_ORIG',
            ].sort(),
        );

        const feature = readBcnHeritageAssetFeature(raw);
        expect(feature.id).toBe('10541');
        expect(feature.identifica).toBe('3053');
        expect(feature.districte).toBe('01');
        expect(feature.denomin).toBe('CATEDRAL'); // trimmed; source prints a trailing space
        expect(feature.estil).toBe('Gòtic');
        expect(feature.usOrig).toBe('Religiós');
        expect(feature.usActual).toBe('Religiós');
        expect(feature.propietat).toBe('Diòcesi de Barcelona');
        expect(feature.nivell).toBe('A');
        expect(feature.interven).toContain('Conservació integral');

        expect(bcnHeritageStatutoryLetter(feature.nivell)).toBe('A');
    });

    it('⭐ parses the REAL protection-buffer features — TIP_ENTORN, multiple overlapping rows, GUID id', () => {
        const raws = parseBcnCatpatriFeatureInfo(FIXTURE.bufferRawXml);
        expect(raws).toHaveLength(3);
        expect(raws.every((r) => r.layerName === 'Polígon_d_entorn_de_protecció_A')).toBe(true);

        const first = readBcnHeritageBufferFeature(raws[0]!);
        expect(first.id).toBe('AAQ9MPAB5AAAAq0AAF'); // NOT numeric — a GeoMedia row GUID
        expect(first.denomin).toBe('CONJUNT ESPECIAL DEL SECTOR DE LA MURALLA ROMANA');
        expect(first.nivell).toBe('B');
        expect(first.tipEntorn).toBeNull(); // printed empty on the "conjunt" row

        const entornB = readBcnHeritageBufferFeature(raws[1]!);
        expect(entornB.denomin).toContain('ENTORN B');
        expect(entornB.nivell).toBe('B');
        expect(entornB.tipEntorn).toBe('B');
        expect(entornB.interven).toContain('Article 32.2');
    });

    it('recognises a `ServiceException` body distinctly from an empty `FeatureCollection`', () => {
        for (const xml of Object.values(FIXTURE.serviceExceptionSamples)) {
            expect(bcnCatpatriIsServiceException(xml)).toBe(true);
            expect(parseBcnCatpatriFeatureInfo(xml)).toEqual([]);
        }
        expect(bcnCatpatriIsServiceException(FIXTURE.emptyFeatureCollectionSample)).toBe(false);
        expect(parseBcnCatpatriFeatureInfo(FIXTURE.emptyFeatureCollectionSample)).toEqual([]);
    });

    it('never throws on malformed input', () => {
        expect(parseBcnCatpatriFeatureInfo('')).toEqual([]);
        expect(parseBcnCatpatriFeatureInfo('<not-xml-at-all')).toEqual([]);
        expect(() => parseBcnCatpatriFeatureInfo(null as unknown as string)).not.toThrow();
    });

    it('closes the statutory-letter vocabulary to the five Llei 9/1993 categories', () => {
        expect(bcnHeritageStatutoryLetter('A')).toBe('A');
        expect(bcnHeritageStatutoryLetter('e')).toBe('E'); // case-insensitive
        expect(bcnHeritageStatutoryLetter('Z')).toBeNull();
        expect(bcnHeritageStatutoryLetter(null)).toBeNull();
    });
});

describe('§BCN-HERITAGE-OVERLAY — the resolver, driven by the real fixture through injected fetch', () => {
    it('out-of-barcelona refuses without querying anything', async () => {
        const r = await resolveBarcelonaHeritageOverlay(
            { lat: 40.4168, lon: -3.7038 }, // Madrid
            { fetchImpl: fakeFetchByLayer({}) },
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('out-of-barcelona');
    });

    it('no fetch implementation available anywhere ⇒ endpoint-unreachable, never throws', async () => {
        const original = globalThis.fetch;
        // Deliberately removing fetch to exercise the "no transport at all" branch.
        delete (globalThis as { fetch?: typeof fetch }).fetch;
        try {
            const r = await resolveBarcelonaHeritageOverlay(PT, {});
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('endpoint-unreachable');
        } finally {
            globalThis.fetch = original;
        }
    });

    it('⭐ resolves the REAL Cathedral asset + buffer effects when only the verified layers answer', async () => {
        const r = await resolveBarcelonaHeritageOverlay(PT, {
            fetchImpl: fakeFetchByLayer({
                [ASSET_LAYER.layerName]: { ok: true, xml: FIXTURE.assetRawXml },
                [BUFFER_LAYER.layerName]: { ok: true, xml: FIXTURE.bufferRawXml },
            }),
            assetLayers: [ASSET_LAYER],
            bufferLayers: [BUFFER_LAYER],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        expect(r.geometryAvailable).toBe(false);
        expect(r.caveat).toBe(BCN_HERITAGE_NO_GEOMETRY_CAVEAT);
        expect(r.unreachableLayers).toEqual([]);
        expect(r.queriedLayers).toEqual([ASSET_LAYER.layerName, BUFFER_LAYER.layerName]);

        const assetEffects = r.effects.filter(
            (e): e is Extract<BarcelonaHeritageOverlayEffect, { kind: 'protected-asset' }> =>
                e.kind === 'protected-asset',
        );
        expect(assetEffects).toHaveLength(1);
        expect(assetEffects[0]!.statutoryLetter).toBe('A');
        expect(assetEffects[0]!.legalBasis).toBe(BCN_HERITAGE_LEGAL_BASIS_ASSET);
        expect(assetEffects[0]!.feature.denomin).toBe('CATEDRAL');

        const bufferEffects = r.effects.filter(
            (e): e is Extract<BarcelonaHeritageOverlayEffect, { kind: 'protection-buffer' }> =>
                e.kind === 'protection-buffer',
        );
        expect(bufferEffects).toHaveLength(3);
        expect(bufferEffects.every((e) => e.legalBasis === BCN_HERITAGE_LEGAL_BASIS_BUFFER)).toBe(true);
        expect(bufferEffects.map((e) => e.feature.nivell)).toEqual(['B', 'B', 'B']);
    });

    it('⭐ an empty answer from every layer is SUCCESS with zero effects, not a refusal', async () => {
        const r = await resolveBarcelonaHeritageOverlay(PT, {
            fetchImpl: fakeFetchByLayer({
                [ASSET_LAYER.layerName]: { ok: true, xml: FIXTURE.emptyFeatureCollectionSample },
                [BUFFER_LAYER.layerName]: { ok: true, xml: FIXTURE.emptyFeatureCollectionSample },
            }),
            assetLayers: [ASSET_LAYER],
            bufferLayers: [BUFFER_LAYER],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effects).toEqual([]);
        expect(r.unreachableLayers).toEqual([]);
    });

    it('⭐ a partially-unreachable layer set is NAMED, never silently folded into "nothing here"', async () => {
        const r = await resolveBarcelonaHeritageOverlay(PT, {
            fetchImpl: fakeFetchByLayer({
                [ASSET_LAYER.layerName]: { ok: true, xml: FIXTURE.assetRawXml },
                [BUFFER_LAYER.layerName]: { ok: false, xml: null },
            }),
            assetLayers: [ASSET_LAYER],
            bufferLayers: [BUFFER_LAYER],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.unreachableLayers).toEqual([BUFFER_LAYER.layerName]);
        expect(r.effects.some((e) => e.kind === 'protected-asset')).toBe(true);
        expect(r.effects.some((e) => e.kind === 'protection-buffer')).toBe(false);
    });

    it('⭐ every queried layer unreachable ⇒ endpoint-unreachable, never a false "no heritage here"', async () => {
        const r = await resolveBarcelonaHeritageOverlay(PT, {
            fetchImpl: fakeFetchByLayer({}), // no entries ⇒ every layer resolves `ok:false`
            assetLayers: [ASSET_LAYER],
            bufferLayers: [BUFFER_LAYER],
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('endpoint-unreachable');
    });

    it('a `ServiceException` body counts as that layer NOT answering, same as a transport failure', async () => {
        const r = await resolveBarcelonaHeritageOverlay(PT, {
            fetchImpl: fakeFetchByLayer({
                [ASSET_LAYER.layerName]: { ok: true, xml: FIXTURE.serviceExceptionSamples.infoFormatTextPlainInvalid! },
                [BUFFER_LAYER.layerName]: { ok: true, xml: FIXTURE.bufferRawXml },
            }),
            assetLayers: [ASSET_LAYER],
            bufferLayers: [BUFFER_LAYER],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.unreachableLayers).toEqual([ASSET_LAYER.layerName]);
        expect(r.effects.every((e) => e.kind === 'protection-buffer')).toBe(true);
    });

    it('never throws, whatever the injected fetch does', async () => {
        const throwingFetch = (async () => {
            throw new Error('boom');
        }) as unknown as typeof fetch;
        const r = await resolveBarcelonaHeritageOverlay(PT, { fetchImpl: throwingFetch });
        expect(r.ok).toBe(false);
    });
});
