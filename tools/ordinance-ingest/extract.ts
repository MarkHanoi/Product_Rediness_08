// CLI — acquire ONE document and report Layer 1 + Layer 2 + Layer 2b results
// (WP1/WP2 validation).
//
//   npx tsx tools/ordinance-ingest/extract.ts --url <pdf-url> [--pages N] [--dump out.txt]
//
// Prints the acquisition outcome, the character recovery, and the digitisation
// class. Used to validate the extraction layer against a document whose character
// count is known independently (Berlin 8-30: the founder's 2026-07-31 probe
// recovered 637,988 characters over 215 pages).

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from './lib/httpCache.js';
import { extractPdfText } from './lib/pdfText.js';
import { classifyDigitisation } from '../../packages/ordinance-extraction/src/ingest/classify.js';
import { normalizePages } from '../../packages/ordinance-extraction/src/ingest/normalize.js';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
    const url = arg('url');
    if (!url) throw new Error('--url is required');
    const cacheDir = arg('cache', join('.cache', 'ordinance-ingest', 'pdf')) as string;
    const pagesArg = arg('pages');
    const maxPages = pagesArg ? Number(pagesArg) : undefined;
    const dump = arg('dump');

    console.log(`── Layer 1: acquisition ──`);
    const acq = await acquirePdf(url, { cacheDir });
    if (!acq.ok) {
        console.log(`  FAILED  reason=${acq.reason} status=${acq.status ?? '-'}`);
        console.log(`  ${acq.detail}`);
        process.exitCode = 1;
        return;
    }
    console.log(`  OK  ${acq.byteLength.toLocaleString()} bytes  sha256=${acq.sha256.slice(0, 16)}…  cached=${acq.fromCache}`);

    console.log(`── Layer 2: text extraction ──`);
    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, url)));
    const started = Date.now();
    const text = await extractPdfText(bytes, maxPages === undefined ? {} : { maxPages });
    if (!text.ok) {
        console.log(`  FAILED  reason=${text.reason}`);
        console.log(`  ${text.detail}`);
        process.exitCode = 1;
        return;
    }
    const ms = Date.now() - started;
    console.log(`  OK  pages=${text.pageCount}${text.truncated ? ` (read ${text.pages.length})` : ''}  chars=${text.totalChars.toLocaleString()}  producer=${text.producer ?? '-'}  ${ms} ms`);

    console.log(`── Layer 2b: digitisation ──`);
    const profile = classifyDigitisation(text.pages);
    console.log(`  class=${profile.digitisation}  textPages=${profile.textPages}/${profile.pageCount} (${(profile.textPageRatio * 100).toFixed(1)}%)  chars/page=${profile.charsPerPage.toFixed(0)}`);

    console.log(`── WP4: normalization ──`);
    const norm = normalizePages(text.pages);
    const normChars = norm.pages.reduce((s, p) => s + p.chars, 0);
    console.log(`  runningHeadsRemoved=${norm.runningHeads.length}  chars ${text.totalChars.toLocaleString()} → ${normChars.toLocaleString()}`);
    if (norm.runningHeads.length > 0) {
        for (const h of norm.runningHeads.slice(0, 5)) console.log(`    running head: ${JSON.stringify(h)}`);
    }

    if (dump) {
        await writeFile(dump, norm.pages.map((p) => p.text).join('\n\n'), 'utf8');
        console.log(`  wrote normalized text → ${dump}`);
    }
}

main().catch((err: unknown) => {
    console.error('extract failed:', err);
    process.exitCode = 1;
});
