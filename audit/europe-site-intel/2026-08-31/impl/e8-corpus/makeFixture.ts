// SCRATCH (lane E8-SPINE, not committed) — emit the Luzern BZR test fixture FROM
// THE REAL PDF, so the fixture cannot drift from the corpus it claims to describe
// (§corpus-never-jittered · §verification-artifact-can-predate-subject).
import { readFile, writeFile } from 'node:fs/promises';
import { toPositionedItems } from '../../../../../packages/ordinance-extraction/src/structure/lines.js';

async function main(): Promise<void> {
    const file = process.argv[2]!;
    const out = process.argv[3]!;
    const wanted = [26, 27];
    const bytes = new Uint8Array(await readFile(file));
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({
        data: bytes,
        useSystemFonts: false,
        isEvalSupported: false,
        disableFontFace: true,
        verbosity: 0,
    }).promise;

    const blocks: string[] = [];
    for (const n of wanted) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        const items = toPositionedItems(content.items ?? []);
        // Keep only what the Anhang-1 grid needs: the header band on p26 and rows
        // 10/11/17 on p27, plus the page-furniture line, so the fixture exercises
        // the furniture-skip rule too.
        const keep = items.filter((i) => {
            if (n === 26) return i.y >= 590 && i.y <= 650;
            return (i.y >= 570 && i.y <= 780) || i.y < 40;
        });
        blocks.push(
            `    {\n        pageNumber: ${n},\n        items: [\n` +
                keep
                    .map(
                        (i) =>
                            `            { text: ${JSON.stringify(i.text)}, x: ${i.x.toFixed(2)}, y: ${i.y.toFixed(2)}, width: ${i.width.toFixed(2)}, height: ${i.height.toFixed(2)} },`,
                    )
                    .join('\n') +
                '\n        ],\n    },',
        );
    }
    await doc.destroy();
    await writeFile(out, blocks.join('\n'), 'utf8');
    console.log(`wrote ${out}`);
}
main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
});
