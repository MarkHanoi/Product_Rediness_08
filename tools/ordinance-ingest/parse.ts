// CLI — WP5: run the FULL chain over a real document and report what the parser
// makes of it.
//
//   npx tsx tools/ordinance-ingest/parse.ts --url <pdf-url> [--section-only]
//
//   acquire → extract text → normalize → extractRules(GERMAN_GRAMMAR)
//           → toEnvelopeParameters
//
// This is the loop that turns real planning documents into regression tests: run
// it, read what came out, and pin the honest result — including the awkward ones.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from './lib/httpCache.js';
import { extractPdfText } from './lib/pdfText.js';
import { normalizePages } from '../../packages/ordinance-extraction/src/ingest/normalize.js';
import { classifyDigitisation } from '../../packages/ordinance-extraction/src/ingest/classify.js';
import { extractRules } from '../../packages/ordinance-extraction/src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { toEnvelopeParameters } from '../../packages/ordinance-extraction/src/envelope/mapper.js';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
    const url = arg('url');
    if (!url) throw new Error('--url is required');
    const cacheDir = arg('cache', join('.cache', 'ordinance-ingest', 'pdf')) as string;
    const document = arg('document', url.split('/').pop() ?? url) as string;

    const acq = await acquirePdf(url, { cacheDir });
    if (!acq.ok) throw new Error(`acquisition failed: ${acq.reason} — ${acq.detail}`);

    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, url)));
    const text = await extractPdfText(bytes);
    if (!text.ok) throw new Error(`extraction failed: ${text.reason} — ${text.detail}`);

    const profile = classifyDigitisation(text.pages);
    const { pages } = normalizePages(text.pages);
    console.log(
        `${document}: ${profile.pageCount} pages, ${profile.digitisation}, ${text.totalChars.toLocaleString()} chars`,
    );

    // Parse page by page so every citation carries a REAL page number.
    let rules = 0;
    const found: string[] = [];
    for (const page of pages) {
        if (page.chars === 0) continue;
        const extraction = extractRules(page.text, GERMAN_GRAMMAR, {
            document,
            page: page.pageNumber,
        });
        if (!extraction.ok) continue;
        const env = toEnvelopeParameters(extraction);
        if (!env.ok) continue;
        for (const o of env.outcomes) {
            if (o.status === 'resolved') {
                rules += 1;
                found.push(
                    `  p${page.pageNumber}  ${o.key} = ${o.value} ${o.unit}` +
                        `${o.autoAccepted ? '' : '  [FLAGGED]'}  « ${o.citation.sentence.slice(0, 110)} »`,
                );
            } else if (o.status === 'conflicted') {
                found.push(
                    `  p${page.pageNumber}  ${o.key} CONFLICT: ${o.candidates.map((c) => c.value).join(' vs ')}`,
                );
            }
        }
    }
    console.log(`\n── resolved/conflicted parameters (${rules} resolved) ──`);
    for (const line of found.slice(0, 60)) console.log(line);
    if (found.length > 60) console.log(`  … and ${found.length - 60} more`);
}

main().catch((err: unknown) => {
    console.error('parse failed:', err);
    process.exitCode = 1;
});
