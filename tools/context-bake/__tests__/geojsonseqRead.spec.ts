// ─────────────────────────────────────────────────────────────────────────────
// §GEOJSONSEQ-READ (L-658) — regression tests for the reader every OSM-footprint
// height join uses.
//
// WHAT THESE LOCK DOWN. The 2026-08-01 whole-layer bake (run 30687958478) shipped
// a 2.3 GB buildings.pmtiles in which Barcelona, Köln and Copenhagen carried ZERO
// measured heights, while every CI step reported success. Three joins had failed,
// two ways, both in this one read:
//
//   • `readFileSync(inPath,'utf8')` on a whole-country clip THREW on V8's
//     0x1fffffe8 (512 MiB) string cap → ES + DK produced nothing.
//   • `osmium export -f geojsonseq` writes GeoJSON Text Sequence (RFC 8142), which
//     prefixes every record with RS (0x1e). `trim()` does not strip 0x1e, so
//     `JSON.parse` rejected EVERY line → Köln reported "0 footprints in the clip"
//     for a file holding 4,267 of them.
//
// The second one survived review because the join was validated against footprints
// fetched from OVERPASS (plain JSON lines, no RS) — never against osmium's real
// output. So the RS case below is the test that was missing.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// @ts-expect-error — plain-Node bake tooling; no .d.ts by design.
import { readGeojsonseqFeatures, loadJoinFootprints } from '../geojsonseqRead.mjs';

/** RFC 8142 record separator — what `osmium export -f geojsonseq` writes before every record. */
const RS = '\u001e';

const DIR = mkdtempSync(join(tmpdir(), 'pryzm-geojsonseq-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function fixture(name: string, body: string | Buffer): string {
    const p = join(DIR, name);
    writeFileSync(p, body);
    return p;
}

const feature = (id: number) =>
    JSON.stringify({ type: 'Feature', properties: { building: 'yes', '@id': `w${id}` }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] } });

describe('readGeojsonseqFeatures', () => {
    it('parses plain JSON-lines (the Overpass-shaped input the joins were built against)', () => {
        const p = fixture('plain.geojsonseq', [feature(1), feature(2), feature(3)].join('\n') + '\n');
        const r = readGeojsonseqFeatures(p);
        expect(r.status).toBe('ok');
        expect(r.parsed).toBe(3);
        expect(r.malformed).toBe(0);
        expect(r.rsStripped).toBe(0);
    });

    // ⚠ THE REGRESSION. This is exactly what osmium hands the bake, and exactly what
    // the old `line.trim()` + JSON.parse silently threw away.
    it('parses RFC 8142 records prefixed with RS (0x1e) — osmium export -f geojsonseq', () => {
        const body = [feature(1), feature(2), feature(3)].map((f) => `${RS}${f}`).join('\n') + '\n';
        const r = readGeojsonseqFeatures(fixture('rs.geojsonseq', body));
        expect(r.status).toBe('ok');
        expect(r.parsed).toBe(3);
        expect(r.malformed).toBe(0);
        expect(r.rsStripped).toBe(3);
    });

    it('reassembles records that straddle a read-chunk boundary', () => {
        const body = Array.from({ length: 40 }, (_, i) => `${RS}${feature(i)}`).join('\n') + '\n';
        // A chunk far smaller than one record forces the tail-carry path on every read.
        const r = readGeojsonseqFeatures(fixture('chunked.geojsonseq', body), { chunkBytes: 17 });
        expect(r.status).toBe('ok');
        expect(r.parsed).toBe(40);
        expect(r.malformed).toBe(0);
    });

    it('ignores blank lines and a missing trailing newline', () => {
        const r = readGeojsonseqFeatures(fixture('blanks.geojsonseq', `\n${feature(1)}\n\n\n${feature(2)}`));
        expect(r.parsed).toBe(2);
        expect(r.lines).toBe(2);
    });

    it('counts malformed records instead of throwing', () => {
        const r = readGeojsonseqFeatures(fixture('bad.geojsonseq', `${feature(1)}\n{not json\n${feature(2)}\n`));
        expect(r.status).toBe('ok');
        expect(r.parsed).toBe(2);
        expect(r.malformed).toBe(1);
    });

    it('reports a missing file as an error, never as an empty read', () => {
        const r = readGeojsonseqFeatures(join(DIR, 'nope.geojsonseq'));
        expect(r.status).toBe('error');
        expect(r.parsed).toBe(0);
    });
});

// §CONTEXT-DATA-HONESTY — the three values the old code collapsed into one cheerful
// `documented`. Collapsing them is what made a broken pipeline look like "no data".
describe('loadJoinFootprints — honest classification', () => {
    it('an EMPTY file is `documented` (there is genuinely nothing to stamp)', () => {
        const r = loadJoinFootprints(fixture('empty.geojsonseq', ''), 'MDS join');
        expect(r.status).toBe('documented');
        expect(r.reason).toMatch(/0 OSM footprint/);
    });

    it('a NON-EMPTY file that parses to nothing is a LOUD error, not "no data"', () => {
        // Every line unparseable — the Köln failure mode.
        const body = Array.from({ length: 12 }, () => '{not json at all').join('\n') + '\n';
        const r = loadJoinFootprints(fixture('unparseable.geojsonseq', body), 'NRW LoD2 join');
        expect(r.status).toBe('error');
        expect(r.reason).toMatch(/NOT ONE parsed/);
        expect(r.reason).toMatch(/PIPELINE defect/);
    });

    it('a readable file is `ok` and hands back the features', () => {
        const r = loadJoinFootprints(fixture('good.geojsonseq', `${RS}${feature(1)}\n${RS}${feature(2)}\n`), 'DHM join');
        expect(r.status).toBe('ok');
        expect(r.feats).toHaveLength(2);
    });

    it('a missing file is an error carrying the join label', () => {
        const r = loadJoinFootprints(join(DIR, 'gone.geojsonseq'), 'Swiss nDSM join');
        expect(r.status).toBe('error');
        expect(r.reason).toMatch(/^Swiss nDSM join:/);
    });
});
