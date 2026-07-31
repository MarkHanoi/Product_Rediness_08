/**
 * Diagnostic for `pdfTableRatio.ts` — dumps detected table regions and searches
 * raw lines, so a "0% of parameters are in tables" claim can be checked against
 * the actual page rather than trusted.
 *
 *   npx tsx tools/spanish-genome-probe/pdfInspect.ts <file.pdf> --tables [--gap N] [--cols N]
 *   npx tsx tools/spanish-genome-probe/pdfInspect.ts <file.pdf> --grep "<regex>" [--max N]
 *   npx tsx tools/spanish-genome-probe/pdfInspect.ts <file.pdf> --page N
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const file = argv[0];
const arg = (n: string, d?: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};
if (!file) {
  console.error('usage: tsx pdfInspect.ts <file.pdf> [--tables|--grep <re>|--page N]');
  process.exit(2);
}
const gapPt = Number(arg('--gap', '14'));
const minCols = Number(arg('--cols', '3'));
const max = Number(arg('--max', '40'));

interface L { page: number; text: string; columns: number; xs: number[] }

async function lines(): Promise<L[]> {
  const pdfjs = require_('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file!)), useSystemFonts: true, isEvalSupported: false }).promise;
  const out: L[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as { str: string; transform: number[]; width: number }[])
      .filter((i) => i.str?.trim())
      .map((i) => ({ x: i.transform[4]!, y: Math.round(i.transform[5]!), w: i.width ?? 0, s: i.str }));
    const byY = new Map<number, typeof items>();
    for (const it of items) {
      const key = [...byY.keys()].find((k) => Math.abs(k - it.y) <= 1) ?? it.y;
      (byY.get(key) ?? byY.set(key, []).get(key)!).push(it);
    }
    for (const [, g] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      const s = g.sort((a, b) => a.x - b.x);
      let columns = 1;
      const xs: number[] = [Math.round(s[0]!.x)];
      for (let i = 1; i < s.length; i++) {
        const prev = s[i - 1]!;
        if (s[i]!.x - (prev.x + prev.w) > gapPt) {
          columns++;
          xs.push(Math.round(s[i]!.x));
        }
      }
      out.push({ page: p, text: s.map((v) => v.s).join(' ').replace(/\s+/g, ' ').trim(), columns, xs });
    }
    page.cleanup();
  }
  return out;
}

const all = await lines();
console.log(`total lines: ${all.length}`);

if (argv.includes('--tables')) {
  const tab = all.filter((l) => l.columns >= minCols);
  console.log(`tabular lines (>=${minCols} cols, gap>${gapPt}pt): ${tab.length}`);
  const byPage = new Map<number, number>();
  for (const t of tab) byPage.set(t.page, (byPage.get(t.page) ?? 0) + 1);
  const dense = [...byPage.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  console.log(`pages with >=3 tabular lines: ${dense.length}`);
  for (const [p, n] of dense.slice(0, max)) console.log(`  p.${p}  ${n} rows`);
  console.log('\nsample rows from the densest pages:');
  for (const [p] of dense.slice(0, 4)) {
    console.log(`\n--- page ${p} ---`);
    for (const l of all.filter((x) => x.page === p).slice(0, 18)) {
      console.log(`  [${l.columns}c] ${l.text.slice(0, 150)}`);
    }
  }
} else if (arg('--grep')) {
  const re = new RegExp(arg('--grep')!, 'i');
  const hits = all.filter((l) => re.test(l.text));
  console.log(`matches: ${hits.length}`);
  for (const h of hits.slice(0, max)) console.log(`  p.${h.page} [${h.columns}c] ${h.text.slice(0, 180)}`);
} else if (arg('--page')) {
  const p = Number(arg('--page'));
  for (const l of all.filter((x) => x.page === p)) console.log(`[${l.columns}c x=${l.xs.join(',')}] ${l.text.slice(0, 170)}`);
}
