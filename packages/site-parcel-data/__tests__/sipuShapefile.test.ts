// §SIPU-SHAPEFILE-CONTAINER — proves the DBF header parse + SHP polygon parse + the join, against
// a REAL, trimmed fixture — not a synthetic byte buffer.
//
// The fixture (`fixtures/sipu-el-sauzal/ZUSO.{shp,dbf}`) is the first 5 records of El Sauzal's
// real `02SIST/ZUSO.shp`/`.dbf` pair, downloaded 2026-08-03 from
// `opendata.sitcan.es` (`221125-mmpgo-esa-usos-suelo-urbano-240702-240702-sipu.zip`), trimmed to
// keep the repo small — the DBF header (all 7 field descriptors) is copied verbatim, only the
// record count and record bytes are reduced; the SHP header is copied verbatim then patched with
// the correct trimmed file length + bounding box.
//
// ⭐ THE HEADER-PARSED FIELD LIST IS THE POINT OF THIS TEST. A grep of the raw DBF bytes for
// upper-case tokens finds `A10`, `A12`, `A17`, `A2_1` — see `sipuShapefile.ts`'s module header —
// which LOOK like column names but are DATA sitting inside `ETIPLAN`/`TXTPLAN`. Only a real
// byte-offset header parse (bytes 32.., 32-byte field descriptors, terminated by `0x0D`) tells the
// two apart; this test pins that the parser gets it right on real bytes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDbf, parseShpPolygons, parseSipuZoneLayer } from '../src/providers/containers/sipuShapefile.js';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'sipu-el-sauzal');
const dbfBuf = readFileSync(join(FIXTURE_DIR, 'ZUSO.dbf'));
const shpBuf = readFileSync(join(FIXTURE_DIR, 'ZUSO.shp'));

describe('parseDbf — the real ZUSO.dbf header, byte-parsed', () => {
    it('reads exactly the 7 real header fields, in order — never the A10/A12/A17/A2_1 data strings', () => {
        const result = parseDbf(dbfBuf);
        expect(result.fields.map((f) => f.name)).toEqual([
            'ETIQUETA',
            'CODIGO',
            'ETIPLAN',
            'TXTPLAN',
            'OBS',
            'PDF',
            'CAPA',
        ]);
        // ⚠ None of the data-value-shaped strings this file's header comment discusses
        // (`A10`/`A12`/`A17`/`A2_1`) is a field name — confirming the suspicion the header parse
        // exists to check, on real bytes rather than by inspection.
        for (const bogus of ['A10', 'A12', 'A17', 'A2_1']) {
            expect(result.fields.map((f) => f.name)).not.toContain(bogus);
        }
    });

    it('reads the field TYPES and LENGTHS from the descriptor bytes, not assumed', () => {
        const result = parseDbf(dbfBuf);
        const byName = Object.fromEntries(result.fields.map((f) => [f.name, f]));
        expect(byName.ETIQUETA).toEqual({ name: 'ETIQUETA', type: 'C', length: 254, decimals: 0 });
        expect(byName.CODIGO).toEqual({ name: 'CODIGO', type: 'C', length: 254, decimals: 0 });
        expect(byName.CAPA).toEqual({ name: 'CAPA', type: 'N', length: 5, decimals: 0 });
    });

    it('reads the trimmed record count from the header (patched to 5 by the fixture trim)', () => {
        const result = parseDbf(dbfBuf);
        expect(result.recordCount).toBe(5);
        expect(result.rows).toHaveLength(5);
    });

    it('reads real row VALUES — a zone-code fragment (CO-A1) sits in ETIPLAN, a real DATA value, not a header field', () => {
        const result = parseDbf(dbfBuf);
        const first = result.rows[0]!;
        expect(first.ETIQUETA).toBe('RE-ViCo-1');
        expect(first.CODIGO).toBe('1');
        expect(first.ETIPLAN).toBe('CO.A1');
        expect(first.TXTPLAN).toBe('Zona CO-A1.Manzana 1.6.1');
    });
});

describe('parseShpPolygons — the real ZUSO.shp polygon records, byte-parsed', () => {
    it('parses the file header (ESRI file code, shape type = Polygon)', () => {
        // A malformed/wrong-type header throws (asserted indirectly): parsing does not throw here.
        expect(() => parseShpPolygons(shpBuf)).not.toThrow();
    });

    it('returns the same number of polygon records as the trimmed DBF has rows', () => {
        const polygons = parseShpPolygons(shpBuf);
        const dbf = parseDbf(dbfBuf);
        expect(polygons).toHaveLength(dbf.recordCount);
    });

    it('the first polygon has at least one part with at least 4 real vertices, in EPSG:32628 metres', () => {
        const [first] = parseShpPolygons(shpBuf);
        expect(first).toBeTruthy();
        expect(first!.parts.length).toBeGreaterThan(0);
        const ring = first!.parts[0]!;
        expect(ring.length).toBeGreaterThanOrEqual(4); // a closed ring: >=3 distinct + repeated first
        for (const pt of ring) {
            expect(Number.isFinite(pt.x)).toBe(true);
            expect(Number.isFinite(pt.y)).toBe(true);
            // El Sauzal's UTM-28N easting/northing sit in these bands (measured on the full file's
            // own bbox: x in [357726, 361966], y in [3148139, 3151609]) — a sanity range, not an
            // exact pin, so the test survives which-5-records-got-trimmed without being fragile.
            expect(pt.x).toBeGreaterThan(300_000);
            expect(pt.x).toBeLessThan(400_000);
            expect(pt.y).toBeGreaterThan(3_100_000);
            expect(pt.y).toBeLessThan(3_200_000);
        }
    });
});

describe('parseSipuZoneLayer — the DBF+SHP join, generically (zone code + geometry, nothing else)', () => {
    it('joins each DBF row to its same-index SHP polygon and reads the zone code from ETIQUETA', () => {
        const features = parseSipuZoneLayer(shpBuf, dbfBuf);
        expect(features).toHaveLength(5);
        const first = features[0]!;
        expect(first.zoneCode).toBe('RE-ViCo-1');
        expect(first.attributes.ETIPLAN).toBe('CO.A1');
        expect(first.polygon.parts.length).toBeGreaterThan(0);
        expect(first.polygon.parts[0]!.length).toBeGreaterThanOrEqual(4);
    });

    it('never returns a building-parameter field — ZUSO carries none, and this parser does not invent one', () => {
        const features = parseSipuZoneLayer(shpBuf, dbfBuf);
        for (const f of features) {
            expect(Object.keys(f.attributes)).toEqual(['ETIQUETA', 'CODIGO', 'ETIPLAN', 'TXTPLAN', 'OBS', 'PDF', 'CAPA']);
            expect(f.attributes).not.toHaveProperty('AltMaxPl');
            expect(f.attributes).not.toHaveProperty('PMaxOcup');
            expect(f.attributes).not.toHaveProperty('EdifMax');
        }
    });

    it('respects a custom zoneCodeField override for a different SIPU family', () => {
        const features = parseSipuZoneLayer(shpBuf, dbfBuf, { zoneCodeField: 'CODIGO' });
        expect(features[0]!.zoneCode).toBe('1');
        expect(features[1]!.zoneCode).toBe('2');
    });
});
