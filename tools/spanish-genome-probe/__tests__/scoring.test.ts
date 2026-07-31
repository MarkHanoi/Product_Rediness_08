/**
 * Spanish Genome probe — scorer tests.
 *
 * The calibration tests run OFFLINE against `fixtures/madrid-crawl-slim.json`,
 * a real 701-layer crawl of sigma.madrid.es captured 2026-07-31. They are the
 * regression lock on the calibration: if someone later tunes the heuristics to
 * make another city pass, Madrid's ranks move and these fail.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyField, rankLayers, scoreLayer, bestFieldFor } from '../scoring.js';
import { fold } from '../heuristics.js';
import { getJson } from '../arcgisCrawler.js';

const here = dirname(fileURLToPath(import.meta.url));
interface SlimLayer {
  serviceName: string;
  layerName: string;
  layerUrl: string;
  geometryType: string | null;
  wkid: number | null;
  fields: { name: string; alias: string }[];
}
const madrid = JSON.parse(readFileSync(join(here, 'fixtures/madrid-crawl-slim.json'), 'utf8')) as {
  layers: SlimLayer[];
};

describe('fold', () => {
  it('folds Spanish and Valencian diacritics and separators', () => {
    expect(fold('Ordenación')).toBe('ordenacion');
    expect(fold('Ordenació')).toBe('ordenacio');
    expect(fold('AMB_TX_ETIQ')).toBe('amb tx etiq');
    expect(fold('Urbanístic')).toBe('urbanistic');
  });
});

describe('classifyField — Madrid phase-42 pairs', () => {
  it('maps the four proven Madrid fields', () => {
    expect(classifyField('AMB_TX_ETIQ').key).toBe('zoneCode');
    expect(classifyField('AMB_TX_ETIQ').confidence).toBe(0.99);
    expect(classifyField('AMB_TX_DENOM').key).toBe('officialDesignation');
    expect(classifyField('COEF_Z').key).toBe('coefficient');
    expect(classifyField('TIPOAMB').key).toBe('planningAreaType');
  });

  it('maps generic Spanish zone-code morphology', () => {
    expect(classifyField('CODIGO').key).toBe('zoneCode');
    expect(classifyField('COD_ZONA').key).toBe('zoneCode');
    expect(classifyField('CLAVE').key).toBe('zoneCode');
    expect(classifyField('CALIFICACION').key).toBe('zoneCode');
    expect(classifyField('ORDENANZA').key).toBe('zoneCode');
    expect(classifyField('CODAMBORD').key).toBe('zoneCode');
  });

  it('maps the P41 numeric planning vocabulary', () => {
    expect(classifyField('ALTURA_MAX').key).toBe('maxHeight');
    expect(classifyField('H_MAX').key).toBe('maxHeight');
    expect(classifyField('NUM_PLANTAS').key).toBe('maxFloors');
    expect(classifyField('EDIFICABILIDAD').key).toBe('far');
    expect(classifyField('OCUPACION').key).toBe('coverage');
    expect(classifyField('FONDO_EDIF').key).toBe('buildableDepth');
    expect(classifyField('RETRANQUEO_FRONTAL').key).toBe('setback');
    expect(classifyField('ALINEACION').key).toBe('alignment');
  });

  it('does NOT claim a zone code for a cadastral block id', () => {
    // CODMANZANA is Madrid's block number, not a zoning key. Claiming it would
    // be a confident-wrong answer (L-616 class).
    expect(classifyField('CODMANZANA').key).not.toBe('zoneCode');
    expect(classifyField('OBJECTID').key).toBeNull();
    expect(classifyField('SHAPE').key).toBeNull();
  });

  it('falls back to the alias at a confidence penalty', () => {
    const c = classifyField('F1', 'Ordenanza');
    expect(c.key).toBe('zoneCode');
    expect(c.confidence).toBeLessThan(0.82);
  });
});

describe('CALIBRATION LOCK — Madrid ground truth (701-layer live crawl fixture)', () => {
  const ranked = rankLayers(madrid.layers);
  const rankOf = (suffix: string): number => {
    const hit = ranked.find((r) => r.layer.layerUrl.endsWith(suffix));
    if (!hit) throw new Error(`layer not present in fixture: ${suffix}`);
    return hit.rank;
  };

  it('crawled the whole planning catalogue', () => {
    expect(madrid.layers.length).toBe(701);
  });

  it('ranks NORMAS_ZONALES/0 (the zoning layer) in the top 3', () => {
    expect(rankOf('NORMAS_ZONALES/MapServer/0')).toBeLessThanOrEqual(3);
  });

  it('ranks PG_ORDENACION/3 (derived plans APR/APE/API) in the top 3', () => {
    expect(rankOf('PG_ORDENACION/MapServer/3')).toBeLessThanOrEqual(3);
  });

  it('DOCUMENTS A KNOWN LIMITATION: the NZ1 envelope layer is NOT found in the top 3', () => {
    // PG_CONDICIONES_EDIFICACION/6 carries CODMANZANA/NUMORD/COEF_Z — no zone
    // code, no designation — so the zoning-oriented scorer ranks it ~#24 even
    // on its own calibration city. Locked in as a fact, not aspiration: the
    // probe is a ZONING/planning-area discoverer, not an envelope discoverer.
    const r = rankOf('PG_CONDICIONES_EDIFICACION/MapServer/6');
    expect(r).toBeGreaterThan(3);
    expect(r).toBeLessThanOrEqual(30);
  });

  it('recovers AMB_TX_ETIQ / AMB_TX_DENOM on the zoning layer', () => {
    const zl = madrid.layers.find((l) => l.layerUrl.endsWith('NORMAS_ZONALES/MapServer/0'))!;
    expect(bestFieldFor(zl.fields, 'zoneCode')?.field).toBe('AMB_TX_ETIQ');
    expect(bestFieldFor(zl.fields, 'officialDesignation')?.field).toBe('AMB_TX_DENOM');
  });

  it('keeps non-planning Madrid layers out of the top 20', () => {
    const top20 = ranked.slice(0, 20).map((r) => `${r.layer.serviceName}/${r.layer.layerName}`);
    for (const bad of ['CALLEJERO', 'MOVILIDAD', 'RESIDUOS']) {
      expect(top20.filter((t) => t.toUpperCase().includes(bad)).length).toBe(0);
    }
  });
});

describe('scoreLayer composition', () => {
  it('rewards polygon geometry over lines', () => {
    const base = { serviceName: 'X', layerName: 'Zonas', fields: [] };
    const poly = scoreLayer({ ...base, geometryType: 'esriGeometryPolygon' });
    const line = scoreLayer({ ...base, geometryType: 'esriGeometryPolyline' });
    expect(poly.score - line.score).toBe(10);
  });

  it('penalises Madrid-observed non-planning names', () => {
    const s = scoreLayer({ serviceName: 'CALLEJERO', layerName: 'Zonas', geometryType: null, fields: [] });
    expect(s.breakdown.negatives).toBeLessThan(0);
  });

  it('records which heuristics fired, with provenance', () => {
    const s = scoreLayer({
      serviceName: 'PLANEAMIENTO',
      layerName: 'Calificación Urbanística',
      geometryType: 'esriGeometryPolygon',
      fields: [{ name: 'CODIGO' }, { name: 'DENOMINACION' }],
    });
    const tokens = s.hits.map((h) => h.token);
    expect(tokens).toContain('calificacio');
    expect(tokens).toContain('urbanistic');
    expect(tokens.some((t) => t.startsWith('ontology:zoneCode'))).toBe(true);
    expect(s.hits.every((h) => ['MAD', 'B11', 'SEV', 'P41', 'P42'].includes(h.src))).toBe(true);
  });
});

describe('getJson — failure is never absence (L-422/457/467/469)', () => {
  const mk = (init: ResponseInit, body: string) => (async () => new Response(body, init)) as unknown as typeof fetch;

  it('distinguishes http-error from ok', async () => {
    const r = await getJson('https://x/t', { fetchImpl: mk({ status: 500 }, 'boom') });
    expect(r.status).toBe('http-error');
    if (r.status === 'http-error') expect(r.httpStatus).toBe(500);
  });

  it('treats an ArcGIS 200 error envelope as an error, not as data', async () => {
    const r = await getJson('https://x/t', {
      fetchImpl: mk({ status: 200 }, JSON.stringify({ error: { code: 400, message: 'Invalid URL' } })),
    });
    expect(r.status).toBe('arcgis-error');
  });

  it('distinguishes a parse failure from an empty catalogue', async () => {
    const bad = await getJson('https://x/t', { fetchImpl: mk({ status: 200 }, '<html>404</html>') });
    expect(bad.status).toBe('parse-error');
    const empty = await getJson<{ services: unknown[] }>('https://x/t', {
      fetchImpl: mk({ status: 200 }, JSON.stringify({ services: [] })),
    });
    expect(empty.status).toBe('ok');
    if (empty.status === 'ok') expect(empty.value.services).toEqual([]);
  });
});
