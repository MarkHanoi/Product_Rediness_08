// §SEQ-WRITE-STREAMED (L-12937) — the whole-set geojsonseq writer never builds one giant string.
// France's mnh_fr join died with `RangeError: Invalid string length` on `feats.map(...).join('\n')`.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFeaturesSeq, SEQ_WRITE_CHUNK_CHARS } from '../heightSources.mjs';

describe('§SEQ-WRITE-STREAMED (L-12937)', () => {
    it('writes one JSON feature per line, in order, and returns the count', () => {
        const dir = mkdtempSync(join(tmpdir(), 'seqw-'));
        const path = join(dir, 'out.geojsonseq');
        const feats = Array.from({ length: 1000 }, (_, i) => ({ type: 'Feature', properties: { i }, geometry: null }));
        expect(writeFeaturesSeq(path, feats)).toBe(1000);
        const lines = readFileSync(path, 'utf8').split('\n');
        expect(lines.at(-1)).toBe('');                     // trailing newline
        expect(lines.length - 1).toBe(1000);
        expect(JSON.parse(lines[0]!).properties.i).toBe(0);
        expect(JSON.parse(lines[999]!).properties.i).toBe(999);
        rmSync(dir, { recursive: true, force: true });
    });

    it('flushes in bounded chunks: a set larger than one chunk still lands complete and identical', () => {
        const dir = mkdtempSync(join(tmpdir(), 'seqw-'));
        const path = join(dir, 'big.geojsonseq');
        const pad = 'x'.repeat(64 * 1024);                   // 64 KiB per feature
        const n = Math.ceil((SEQ_WRITE_CHUNK_CHARS * 2.5) / pad.length);   // ~2.5 chunks
        const feats = Array.from({ length: n }, (_, i) => ({ i, pad }));
        expect(writeFeaturesSeq(path, feats)).toBe(n);
        const txt = readFileSync(path, 'utf8');
        expect(txt.length).toBeGreaterThan(SEQ_WRITE_CHUNK_CHARS * 2);
        const lines = txt.split('\n');
        expect(lines.length - 1).toBe(n);
        expect(JSON.parse(lines[n - 1]!).i).toBe(n - 1);
        rmSync(dir, { recursive: true, force: true });
    });

    it('an empty set produces an empty file, not a missing one', () => {
        const dir = mkdtempSync(join(tmpdir(), 'seqw-'));
        const path = join(dir, 'empty.geojsonseq');
        expect(writeFeaturesSeq(path, [])).toBe(0);
        expect(readFileSync(path, 'utf8')).toBe('');
        rmSync(dir, { recursive: true, force: true });
    });
});
