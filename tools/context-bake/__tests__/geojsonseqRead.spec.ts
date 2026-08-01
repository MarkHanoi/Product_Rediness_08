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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/** This spec's own directory — the anchor for resolving the .mjs under test in a child process. */
const __dirnameish = dirname(fileURLToPath(import.meta.url));

// @ts-expect-error — plain-Node bake tooling; no .d.ts by design.
import { readGeojsonseqFeatures, loadJoinFootprints } from '../geojsonseqRead.mjs';
// @ts-expect-error — plain-Node bake tooling; no .d.ts by design.
import { partitionGeojsonseq, loadJoinFootprintsBounded, HEAP_BYTES_PER_FOOTPRINT } from '../geojsonseqRead.mjs';

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

// ─────────────────────────────────────────────────────────────────────────────
// §JOIN-BOUNDED-WORKING-SET (L-659) — THE SECOND CRASH.
//
// The L-658 fix above made the READ stream. The PIPELINE still materialised every
// feature, so run 30693132326 (sha bb92b276) died 23 minutes in on the whole-Spain
// height join with
//     FATAL ERROR: Ineffective mark-compacts near heap limit   (exit 134)
//     Mark-Compact 4045.6 (4131.0) -> 4039.9 (4141.8) MB
// and a native stack ending in `Factory::NewFixedDoubleArray` — V8 allocating
// polygon coordinate arrays inside JSON.parse.
//
// These lock down the fix: a join HOLDS only the footprints it will stamp and
// passes everything else through as raw bytes. The last one MEASURES the constant
// the whole budget rests on, so ~1.26 kB/footprint is never taken on trust.
// ─────────────────────────────────────────────────────────────────────────────

/** A feature at a chosen lon/lat, shaped like osmium's real polygon export. */
const at = (id: number, lon: number, lat: number) =>
    JSON.stringify({
        type: 'Feature', id: `w${id}`, properties: { building: 'yes' },
        geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 1e-4, lat], [lon + 1e-4, lat + 1e-4], [lon, lat]]] },
    });

const readLines = (p: string) => readFileSync(p, 'utf8').split('\n').filter(Boolean);

describe('partitionGeojsonseq — §JOIN-BOUNDED-WORKING-SET', () => {
    it('retains ONLY the selected records and streams the rest through as raw bytes', () => {
        // 3 inside a Barcelona-ish bbox, 5 elsewhere in "Spain".
        const inside = [at(1, 2.15, 41.39), at(2, 2.16, 41.40), at(3, 2.17, 41.38)];
        const outside = [at(4, -3.7, 40.4), at(5, -0.4, 39.5), at(6, -6.0, 37.4), at(7, -4.4, 36.7), at(8, 0.5, 42.0)];
        const src = fixture('spainish.geojsonseq', [...inside, ...outside].map((l) => RS + l).join('\n') + '\n');
        const out = join(DIR, 'spainish-stamped.geojsonseq');

        const r = partitionGeojsonseq(src, out, (f: any) => {
            const [lon, lat] = f.geometry.coordinates[0][0];
            return lon >= 2.05 && lon <= 2.24 && lat >= 41.32 && lat <= 41.47 ? { f } : null;
        });

        expect(r.status).toBe('ok');
        expect(r.lines).toBe(8);
        expect(r.parsed).toBe(8);
        expect(r.retainedCount).toBe(3);
        expect(r.passedThrough).toBe(5);
        // The pass-through file holds exactly the 5 NOT retained — the caller appends the other 3.
        expect(readLines(out)).toHaveLength(5);
    });

    it('§CONTEXT-DATA-HONESTY — a passed-through footprint keeps its ORIGINAL tags, unmarked', () => {
        const tagged = JSON.stringify({ type: 'Feature', properties: { building: 'yes', height: '23.5' }, geometry: { type: 'Polygon', coordinates: [[[-3.7, 40.4], [-3.7, 40.5], [-3.6, 40.5], [-3.7, 40.4]]] } });
        const src = fixture('honesty.geojsonseq', `${RS}${tagged}\n`);
        const out = join(DIR, 'honesty-out.geojsonseq');
        const r = partitionGeojsonseq(src, out, () => null);
        expect(r.passedThrough).toBe(1);
        const back = JSON.parse(readLines(out)[0]);
        // Its own OSM height survives; nothing was added, and it is NOT dressed as measured.
        expect(back.properties.height).toBe('23.5');
        expect(back.properties['pryzm:height_src']).toBeUndefined();
    });

    it('strips the RFC 8142 RS from records it passes through (L-658, on the new path)', () => {
        const src = fixture('rs-passthrough.geojsonseq', `${RS}${feature(1)}\n${RS}${feature(2)}\n`);
        const out = join(DIR, 'rs-passthrough-out.geojsonseq');
        const r = partitionGeojsonseq(src, out, () => null);
        expect(r.rsStripped).toBe(2);
        // Round-trips: every emitted line is parseable JSON, i.e. tippecanoe-safe.
        expect(readLines(out).map((l) => JSON.parse(l).type)).toEqual(['Feature', 'Feature']);
    });

    it('drops a MALFORMED record rather than emitting an unparseable line into the tileset', () => {
        const src = fixture('mixed.geojsonseq', `${RS}${feature(1)}\n{broken\n${RS}${feature(2)}\n`);
        const out = join(DIR, 'mixed-out.geojsonseq');
        const r = partitionGeojsonseq(src, out, () => null);
        expect(r.lines).toBe(3);
        expect(r.parsed).toBe(2);
        expect(r.malformed).toBe(1);
        expect(readLines(out)).toHaveLength(2);
    });

    it('a heap-watchdog trip is a LOUD structured error, not an anonymous V8 abort', () => {
        const src = fixture('watchdog.geojsonseq', Array.from({ length: 400 }, (_, i) => RS + at(i, 2.15, 41.39)).join('\n') + '\n');
        const out = join(DIR, 'watchdog-out.geojsonseq');
        // watchdogFraction 0 → the first progress check trips. Proves the abort path is reachable
        // AND that it names the file / record count / retained count, which the V8 FATAL never did.
        const r = partitionGeojsonseq(src, out, (f: any) => ({ f }), { chunkBytes: 4096, watchdogFraction: 0 });
        expect(r.status).toBe('error');
        expect(r.reason).toMatch(/HEAP WATCHDOG/);
        expect(r.reason).toMatch(/retained/);
    });

    it('loadJoinFootprintsBounded keeps the honest statuses apart', () => {
        const empty = fixture('empty-bounded.geojsonseq', '');
        expect(loadJoinFootprintsBounded(empty, join(DIR, 'e1.out'), () => null, 'MDS join').status).toBe('documented');

        const junk = fixture('junk-bounded.geojsonseq', Array.from({ length: 5 }, () => '{nope').join('\n') + '\n');
        const bad = loadJoinFootprintsBounded(junk, join(DIR, 'e2.out'), () => null, 'MDS join');
        expect(bad.status).toBe('error');
        expect(bad.reason).toMatch(/PIPELINE defect/);

        // ⚠ ZERO retained is NOT a failure — it means "nothing to measure here", a real answer.
        const far = fixture('far-bounded.geojsonseq', `${RS}${at(1, -3.7, 40.4)}\n`);
        const none = loadJoinFootprintsBounded(far, join(DIR, 'e3.out'), () => null, 'MDS join');
        expect(none.status).toBe('ok');
        expect(none.retained).toHaveLength(0);
        expect(none.read.passedThrough).toBe(1);
    });
});

describe('§heap-budget — the MEASURED constant the stamp budget rests on', () => {
    it('a parsed osmium-shaped footprint costs ~1.26 kB of V8 heap (order of magnitude)', () => {
        // THIS IS THE NUMBER that proves `--max-old-space-size` ALONE could not have fixed run
        // 30693132326: at this rate a national footprint set needs >10 GB and the runner has 16.
        // If it ever drifts, HEAP_BYTES_PER_FOOTPRINT and bake.mjs's §HEIGHT-STAMP-BUDGET
        // preflight arithmetic must drift with it.
        const N = 20000;
        const ring = (lon: number, lat: number) => {
            const r: number[][] = [];
            for (let k = 0; k < 12; k++) r.push([+(lon + Math.cos((k / 12) * 6.283) * 1.2e-4).toFixed(7), +(lat + Math.sin((k / 12) * 6.283) * 9e-5).toFixed(7)]);
            r.push(r[0]);
            return r;
        };
        const body = Array.from({ length: N }, (_, i) => RS + JSON.stringify({
            type: 'Feature', id: `w${1e8 + i}`, properties: { building: 'yes', 'building:levels': String(2 + (i % 8)) },
            geometry: { type: 'Polygon', coordinates: [ring(2.05 + (i % 400) * 2.5e-5, 41.32 + ((i / 400) | 0) * 2.5e-5)] },
        })).join('\n') + '\n';
        const src = fixture('heapbudget.geojsonseq', body);

        // Measured in a CHILD process, not here. In-process the vitest worker's own churn (this
        // 8 MB fixture string alone) makes a heapUsed delta swing NEGATIVE — the first attempt at
        // this test measured −15 B/feature. A child whose only job is the read gives the honest
        // number, and it is the same method used to derive HEAP_BYTES_PER_FOOTPRINT.
        const mod = pathToFileURL(join(__dirnameish, '..', 'geojsonseqRead.mjs')).href;
        const out = execFileSync(process.execPath, ['--input-type=module', '-e',
            `const { readGeojsonseqFeatures } = await import(${JSON.stringify(mod)});`
            + `const r = readGeojsonseqFeatures(${JSON.stringify(src)});`
            + 'console.log(JSON.stringify({ parsed: r.parsed, heapUsed: process.memoryUsage().heapUsed, alive: r.feats.length }));',
        ], { encoding: 'utf8' });
        const child = JSON.parse(out.trim().split('\n').pop() as string);
        expect(child.parsed).toBe(N);

        // Subtract a bare-interpreter baseline so we measure the FEATURES, not Node's own floor.
        const baseOut = execFileSync(process.execPath, ['--input-type=module', '-e',
            'console.log(JSON.stringify({ heapUsed: process.memoryUsage().heapUsed }));',
        ], { encoding: 'utf8' });
        const baseline = JSON.parse(baseOut.trim().split('\n').pop() as string).heapUsed;

        const bytesPerFeature = (child.heapUsed - baseline) / N;
        // Wide band ON PURPOSE — the load-bearing claim is the ORDER OF MAGNITUDE (kB, not bytes).
        // GC timing makes a tight bound flaky, and a flaky gate gets deleted rather than fixed.
        expect(bytesPerFeature).toBeGreaterThan(HEAP_BYTES_PER_FOOTPRINT * 0.5);
        expect(bytesPerFeature).toBeLessThan(HEAP_BYTES_PER_FOOTPRINT * 2.0);
        // …and the on-disk record is far SMALLER. THAT is the trap: file size does not predict heap.
        expect(body.length / N).toBeLessThan(bytesPerFeature / 2);
        // The child held every feature alive across its own measurement — no early collection.
        expect(child.alive).toBe(N);
    });
});
