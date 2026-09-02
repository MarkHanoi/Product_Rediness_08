// SCRATCH PROBE (lane E8-SPINE, not committed) — run the Layer-3/4 producer over a
// cached PDF and print the reconstructed grids.
import { readFile } from 'node:fs/promises';
import { buildCanonicalDocument } from '../../../../../packages/ordinance-extraction/src/structure/canonicalDocument.js';
import { toPositionedItems } from '../../../../../packages/ordinance-extraction/src/structure/lines.js';
import type { PageItems } from '../../../../../packages/ordinance-extraction/src/structure/types.js';

async function main(): Promise<void> {
    const file = process.argv[2]!;
    const from = Number(process.argv[3] ?? 1);
    const to = Number(process.argv[4] ?? 9999);
    const bytes = new Uint8Array(await readFile(file));
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({
        data: bytes,
        useSystemFonts: false,
        isEvalSupported: false,
        disableFontFace: true,
        verbosity: 0,
    }).promise;
    const pages: PageItems[] = [];
    for (let n = from; n <= Math.min(to, doc.numPages); n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push({ pageNumber: n, items: toPositionedItems(content.items ?? []) });
        page.cleanup?.();
    }
    await doc.destroy();

    const built = buildCanonicalDocument('probe', pages);
    console.log(`pages=${built.document.pageCount} sections=${built.document.sections.length} tables=${built.document.tables.length}`);
    for (const rec of built.tables) {
        const t = rec.table;
        console.log(
            `\n── p${t.page} confident=${t.confident} headerSource=${t.headerSource} anchors=[${t.columnAnchors
                .map((a) => a.toFixed(1))
                .join(', ')}] reasons=[${rec.diagnostics.reasons.join(', ')}] rows=${t.rows.length} candidate=${rec.diagnostics.bodyRowCount}`,
        );
        if (t.header) console.log(`   HEADER: ${JSON.stringify(t.header)}`);
        for (const row of t.rows.slice(0, 8)) console.log(`   ROW:    ${JSON.stringify(row)}`);
    }
}
main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
});
