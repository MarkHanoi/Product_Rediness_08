// READ-ONLY probe — dump pdf.js POSITIONED text items for chosen pages, so a human
// (me) can reconstruct a table by column x-position rather than by reading a
// flattened stream. This is the "human opens the page" step of the gold set.
import { readFile } from 'node:fs/promises';

async function main(): Promise<void> {
    const file = process.argv[2];
    const from = Number(process.argv[3] ?? '1');
    const to = Number(process.argv[4] ?? String(from));
    const bytes = new Uint8Array(await readFile(file));
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    console.log(`pages=${doc.numPages}`);
    for (let n = from; n <= Math.min(to, doc.numPages); n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        console.log(`\n===== PAGE ${n} =====`);
        const rows = new Map<number, { x: number; s: string }[]>();
        for (const it of content.items as any[]) {
            if (typeof it.str !== 'string' || it.str.trim() === '') continue;
            const x = Math.round(it.transform[4] * 10) / 10;
            const y = Math.round(it.transform[5] * 2) / 2; // bucket baselines
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y)!.push({ x, s: it.str });
        }
        const ys = [...rows.keys()].sort((a, b) => b - a);
        for (const y of ys) {
            const cells = rows.get(y)!.sort((a, b) => a.x - b.x);
            console.log(`y=${y.toFixed(1)} | ` + cells.map((c) => `${c.x.toFixed(0)}:${c.s}`).join(' | '));
        }
    }
    await doc.destroy();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
