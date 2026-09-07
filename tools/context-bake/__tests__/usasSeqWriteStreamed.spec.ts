// §SEQ-WRITE-STREAMED-USAS (2026-09-07, lane USAS-OVERFLOW) — no height stamp writes its retained
// band as ONE string, and the shared appender APPENDS.
//
// WHY THIS SPEC EXISTS. Run 34101676645 (massachusetts, heightJoin:'usas') died in band 2 of 3 with
// `RangeError: Invalid string length` at usasNationalStamp.mjs's retained write —
//   `appendFileSync(retainedOutPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n')`
// — the third country to die on that exact line shape (France twice: L-12937, L-12978). The fix for
// France (§SEQ-WRITE-STREAMED, ff093d76) chunked the whole-set writes in heightSources.mjs and its
// comment said the per-module writes "are already bounded by their batch size and are left alone".
// Eight stamp modules under heights/ carried the identical un-chunked line. This spec reads every
// heights/*Stamp.mjs as TEXT (the mnhFr.spec.ts precedent) so a ninth cannot bring it back.
//
// The (b) half of the same run — "0 measured so far over 451 cell(s)" in band 1 — was NOT a defect:
// the Massachusetts ground in that band is ORNL-only (live-probed, see the module header). What the
// log could not say was whether those 451 cells were VOID or ERROR, because the summary that says so
// is only printed if the sweep survives. The per-band line now carries both counters, pinned here.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFeaturesSeq, SEQ_WRITE_CHUNK_CHARS } from '../heightSources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HEIGHTS = resolve(HERE, '../heights');
const stampFiles = readdirSync(HEIGHTS).filter((f) => /Stamp\.mjs$/.test(f)).sort();
const text = (f: string) => readFileSync(resolve(HEIGHTS, f), 'utf8');

/** The exact un-chunked shape: the WHOLE retained set serialised into one string. The count-chunked
 *  siblings (`records.slice(i, i + chunk).map(...)`) do not match — `records.map(` is the tell.
 *  Matched on CODE lines only: usasNationalStamp.mjs quotes the dead line in the comment that explains
 *  its removal, and a pin that punished the file for documenting the fix would measure the wrong thing
 *  (the usasNational.spec `overture` lesson). */
const WHOLE_SET_WRITE = /records\.map\(\(r\) => JSON\.stringify\(r\.feat\)\)\.join\(/;
const codeLines = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('§SEQ-WRITE-STREAMED-USAS — no stamp module serialises its retained band as ONE string', () => {
    it('sweeps a real set of stamp modules (guards against a vacuous pass)', () => {
        expect(stampFiles.length).toBeGreaterThanOrEqual(8);
        expect(stampFiles).toContain('usasNationalStamp.mjs');
        expect(stampFiles).toContain('usOpenHeightsStamp.mjs');
    });

    it.each(stampFiles)('%s has no `records.map(JSON.stringify).join` whole-set write', (f) => {
        expect(codeLines(text(f))).not.toMatch(WHOLE_SET_WRITE);
    });

    it('the eight modules that carried the line now import the SHARED chunked appender and call it', () => {
        for (const f of ['abudhabiNdsmStamp', 'beHeightsStamp', 'caOpenHeightsStamp', 'deLod2LaenderStamp',
            'ealidarGbStamp', 'jpPlateauStamp', 'usOpenHeightsStamp', 'usasNationalStamp']) {
            const src = text(`${f}.mjs`);
            // Imported from heightSources.mjs — never a private copy (§GREP-FOR-THE-EXISTING-SOLVER-FIRST).
            expect(src, f).toMatch(/import \{[^}]*\bappendFeaturesSeq\b[^}]*\} from '\.\.\/heightSources\.mjs';/);
            expect(src, f).not.toMatch(/^(export )?function appendFeaturesSeq\(/m);
            expect(src, f).toMatch(/appendFeaturesSeq\((outPath|retainedOutPath), records\.map\(\(r\) => r\.feat\)\)/);
            // And `appendFileSync` is gone from the fs import, so the un-chunked call cannot come back silently.
            expect(src, f).not.toMatch(/^import \{[^}]*\bappendFileSync\b[^}]*\} from 'node:fs';/m);
        }
    });

    it('usasNationalStamp writes the band through the appender with the retained-out path, and says why', () => {
        const src = text('usasNationalStamp.mjs');
        expect(src).toMatch(/if \(records\.length\) appendFeaturesSeq\(retainedOutPath, records\.map\(\(r\) => r\.feat\)\);/);
        expect(src).toMatch(/§SEQ-WRITE-STREAMED-USAS/);
        expect(src).toMatch(/536,870,888/);              // the measured V8 cap, not "about 512 MiB"
        expect(src).toMatch(/34101676645/);               // the run that died
    });

    it('the per-band progress line names VOID and ERROR cells, so "0 measured" is readable without the summary', () => {
        const src = text('usasNationalStamp.mjs');
        const line = src.match(/console\.log\(` {4}· USA Structures swathe[\s\S]*?\);/)?.[0] ?? '';
        expect(line).toMatch(/\$\{agg\.voidTiles\} void \/ \$\{agg\.tileErrors\} error cell\(s\)/);
        expect(line).toMatch(/\$\{agg\.componentsFetched\} components/);
    });

    it('the (b) verdict is recorded in the module header with the live HTTP answers, not a sentence', () => {
        const src = text('usasNationalStamp.mjs');
        expect(src).toMatch(/-70\.9305,41\.6295,-70\.9095,41\.6505 → HTTP 200, 98 B/);   // New Bedford: empty body
        expect(src).toMatch(/1,047 structures, ALL SOURCE='ORNL'/);
        expect(src).toMatch(/721,851 height-bearing rows/);                             // band 2 would have measured
    });
});

describe('§SEQ-WRITE-STREAMED-USAS — the shared appender APPENDS (the band chain depends on it)', () => {
    it('two calls land both sets, in order, after whatever was already in the file — never a truncate', () => {
        const dir = mkdtempSync(join(tmpdir(), 'seqa-'));
        const path = join(dir, 'out.geojsonseq');
        writeFileSync(path, '{"passthrough":true}\n');      // the partition's pass-through bytes
        const a = Array.from({ length: 500 }, (_, i) => ({ type: 'Feature', properties: { band: 1, i }, geometry: null }));
        const b = Array.from({ length: 300 }, (_, i) => ({ type: 'Feature', properties: { band: 2, i }, geometry: null }));
        expect(appendFeaturesSeq(path, a)).toBe(500);
        expect(appendFeaturesSeq(path, b)).toBe(300);
        const lines = readFileSync(path, 'utf8').split('\n');
        expect(lines.at(-1)).toBe('');
        expect(lines.length - 1).toBe(801);
        expect(lines[0]).toBe('{"passthrough":true}');
        expect(JSON.parse(lines[1]!).properties).toEqual({ band: 1, i: 0 });
        expect(JSON.parse(lines[500]!).properties).toEqual({ band: 1, i: 499 });
        expect(JSON.parse(lines[501]!).properties).toEqual({ band: 2, i: 0 });
        expect(JSON.parse(lines[800]!).properties).toEqual({ band: 2, i: 299 });
        rmSync(dir, { recursive: true, force: true });
    });

    it('a set larger than one chunk lands complete and identical, and the map(r => r.feat) shape is what the stamps pass', () => {
        const dir = mkdtempSync(join(tmpdir(), 'seqa-'));
        const path = join(dir, 'big.geojsonseq');
        writeFileSync(path, '');
        const pad = 'x'.repeat(64 * 1024);
        const n = Math.ceil((SEQ_WRITE_CHUNK_CHARS * 1.5) / pad.length);
        const records = Array.from({ length: n }, (_, i) => ({ clon: 0, clat: 0, feat: { i, pad } }));
        expect(appendFeaturesSeq(path, records.map((r) => r.feat))).toBe(n);
        const txt = readFileSync(path, 'utf8');
        expect(txt.length).toBeGreaterThan(SEQ_WRITE_CHUNK_CHARS);
        const lines = txt.split('\n');
        expect(lines.length - 1).toBe(n);
        expect(JSON.parse(lines[n - 1]!).i).toBe(n - 1);
        expect(lines[0]).not.toMatch(/"clon"/);            // the record wrapper is never written, only the feature
        rmSync(dir, { recursive: true, force: true });
    });

    it('an empty set appends nothing and returns 0 (a band that retained nothing is not a failure)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'seqa-'));
        const path = join(dir, 'empty.geojsonseq');
        writeFileSync(path, 'keep\n');
        expect(appendFeaturesSeq(path, [])).toBe(0);
        expect(readFileSync(path, 'utf8')).toBe('keep\n');
        rmSync(dir, { recursive: true, force: true });
    });
});
