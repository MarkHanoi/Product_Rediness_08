import { readFile } from 'node:fs/promises';
async function main(): Promise<void> {
  const file = process.argv[2]!;
  const from = Number(process.argv[3] ?? 1);
  const to = Number(process.argv[4] ?? from);
  const bytes = new Uint8Array(await readFile(file));
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  for (let n = from; n <= Math.min(to, doc.numPages); n++) {
    const page = await doc.getPage(n);
    const c = await page.getTextContent();
    console.log(`### page ${n}  items=${c.items.length}`);
    for (const it of c.items as any[]) {
      if (!it.str || it.str.trim() === '') continue;
      const t = it.transform;
      console.log(`x=${(t[4] as number).toFixed(1)}\ty=${(t[5] as number).toFixed(1)}\tw=${(it.width as number).toFixed(1)}\th=${(it.height as number).toFixed(1)}\t${JSON.stringify(it.str)}`);
    }
  }
  await doc.destroy();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
