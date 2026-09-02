// READ-ONLY probe — per-page text (post geometric joiner, pre-normalize) with page markers.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from '../ordinance-ingest/lib/httpCache.js';
import { extractPdfText } from '../ordinance-ingest/lib/pdfText.js';

async function main(): Promise<void> {
    const url = process.argv[2]!;
    const out = process.argv[3]!;
    const cacheDir = join('.cache', 'ordinance-ingest', 'pdf');
    const acq = await acquirePdf(url, { cacheDir });
    if (!acq.ok) { console.log('acquire failed', acq.reason); process.exitCode = 1; return; }
    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, url)));
    const t = await extractPdfText(bytes);
    if (!t.ok) { console.log('read failed', t.reason); process.exitCode = 1; return; }
    const body = t.pages.map((p) => `\n@@@PAGE ${p.pageNumber} (${p.chars} ch)\n${p.text}`).join('\n');
    await writeFile(out, body, 'utf8');
    console.log(`pages=${t.pageCount} chars=${t.totalChars} -> ${out}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
