// SCRATCH PROBE (lane E8-SPINE) — print the candidate rows of a WITHHELD grid, to
// establish that the value really is on the page the spine refuses to read from.
import { readFile } from 'node:fs/promises';
import { buildCanonicalDocument } from '../../../../../packages/ordinance-extraction/src/structure/canonicalDocument.js';
import { toPositionedItems } from '../../../../../packages/ordinance-extraction/src/structure/lines.js';
import type { PageItems } from '../../../../../packages/ordinance-extraction/src/structure/types.js';

async function main(): Promise<void> {
    const file = process.argv[2]!;
    const target = Number(process.argv[3] ?? 34);
    const bytes = new Uint8Array(await readFile(file));
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    const pages: PageItems[] = [];
    for (let n = 26; n <= 36; n++) {
        const p = await doc.getPage(n);
        pages.push({ pageNumber: n, items: toPositionedItems((await p.getTextContent()).items ?? []) });
        p.cleanup?.();
    }
    await doc.destroy();
    const built = buildCanonicalDocument('probe', pages);
    for (const rec of built.tables) {
        if (rec.table.page !== target) continue;
        console.log(`p${target} confident=${rec.table.confident} rows(published)=${rec.table.rows.length} candidateRows(withheld)=${rec.diagnostics.candidateRows.length} reasons=[${rec.diagnostics.reasons.join(', ')}] unsnapped=${rec.diagnostics.unsnappedItems}`);
        console.log(`HEADER: ${JSON.stringify(rec.table.header)}`);
        for (const r of rec.diagnostics.candidateRows.slice(0, 12)) console.log('  CANDIDATE:', JSON.stringify(r));
    }
}
main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
