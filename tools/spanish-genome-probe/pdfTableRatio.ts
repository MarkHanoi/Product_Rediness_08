/**
 * D7 — "What fraction of an ordinance's numeric planning parameters live in
 * TABLES vs prose?"
 *
 *   npx tsx tools/spanish-genome-probe/pdfTableRatio.ts <file.pdf> [--section "TÍTULO VIII"] [--endSection "TÍTULO IX"]
 *
 * Founder discovery D7 calls this "probably the single most important research
 * question", because table extraction accuracy is far higher than free-text
 * extraction, and the answer decides whether to build a table extractor
 * (currently 0% capability) or lean on the German-style born-digital text path.
 *
 * Method, stated so the number can be argued with:
 *  1. Text is extracted per page with pdf.js, keeping each item's x/y/width.
 *  2. Items are grouped into LINES by rounded y.
 *  3. A line is TABULAR if it has >= `minColumns` items separated by x-gaps
 *     wider than `gapPt` — i.e. it looks like a row with columns.
 *  4. A TABLE REGION is >= `minRows` consecutive tabular lines. A single
 *     wide-spaced line (e.g. a heading with a page number) is NOT a table.
 *  5. A PARAMETER HIT is a line matching a Spanish planning-parameter term AND
 *     containing a number. Each hit is attributed to `table` or `prose`.
 *
 * Also reports born-digital vs scanned (pages with no extractable text) and any
 * embedded metadata dates, because a consolidated ordinance's effective date
 * governs every citation drawn from it.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

/** Spanish planning-parameter vocabulary (founder P41/D4 + Madrid batch 3b §5–8). */
const PARAM_TERMS: { key: string; re: RegExp }[] = [
  { key: 'height', re: /\baltura\b|\bcornisa\b/i },
  { key: 'floors', re: /\bplantas?\b|\bnúmero de plantas\b/i },
  { key: 'coverage', re: /\bocupaci[óo]n\b/i },
  { key: 'far', re: /\bedificabilidad\b|\bcoeficiente\b|\baprovechamiento\b/i },
  { key: 'setback', re: /\bretranqueo\b|\bseparaci[óo]n\b|\blinderos?\b/i },
  { key: 'depth', re: /\bfondo edificable\b|\bfondo\b|\bprofundidad\b/i },
  { key: 'alignment', re: /\balineaci[óo]n\b/i },
  { key: 'patio', re: /\bpatio\b/i },
  { key: 'plotSize', re: /\bparcela m[íi]nima\b|\bsuperficie m[íi]nima\b/i },
  { key: 'frontage', re: /\blinde?ro frontal\b|\bfachada m[íi]nima\b/i },
];
/** A bare integer/decimal, optionally with a unit or percent. */
const NUMBER_RE = /(?<![\w.,])\d{1,4}(?:[.,]\d{1,2})?\s*(?:%|m²|m2|m\b|metros\b|plantas?\b)?/i;

export interface Line {
  page: number;
  y: number;
  text: string;
  columns: number;
  tabular: boolean;
  inTableRegion: boolean;
}

export interface TableRatioReport {
  file: string;
  pages: number;
  pagesWithNoText: number;
  bornDigital: boolean;
  metadata: Record<string, string>;
  sectionRange: { start: number | null; end: number | null; label: string } | null;
  scanned: { pagesScanned: number; sample: number[] };
  lines: number;
  tabularLines: number;
  tableRegions: number;
  paramHits: { total: number; inTable: number; inProse: number; byKey: Record<string, { table: number; prose: number }> };
  tableRatio: number | null;
}

interface Item { x: number; y: number; w: number; s: string }

export async function analysePdf(
  file: string,
  opts: {
    sectionStart?: RegExp;
    sectionEnd?: RegExp;
    fromPage?: number;
    toPage?: number;
    gapPt?: number;
    minColumns?: number;
    minRows?: number;
  } = {},
): Promise<TableRatioReport> {
  const gapPt = opts.gapPt ?? 14;
  const minColumns = opts.minColumns ?? 3;
  const minRows = opts.minRows ?? 3;

  const pdfjs = require_('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  const meta = await doc.getMetadata().catch(() => null);
  const metadata: Record<string, string> = {};
  if (meta?.info) for (const [k, v] of Object.entries(meta.info)) if (typeof v === 'string' && v) metadata[k] = v;

  const pageLines: Line[][] = [];
  const emptyPages: number[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items as { str: string; transform: number[]; width: number }[]) {
      if (!it.str || !it.str.trim()) continue;
      items.push({ x: it.transform[4]!, y: Math.round(it.transform[5]!), w: it.width ?? 0, s: it.str });
    }
    if (items.length === 0) emptyPages.push(p);

    // group into lines by y
    const byY = new Map<number, Item[]>();
    for (const it of items) {
      // tolerate 1pt jitter
      const key = [...byY.keys()].find((k) => Math.abs(k - it.y) <= 1) ?? it.y;
      (byY.get(key) ?? byY.set(key, []).get(key)!).push(it);
    }
    const lines: Line[] = [];
    for (const [y, group] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      const sorted = group.sort((a, b) => a.x - b.x);
      let columns = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        if (sorted[i]!.x - (prev.x + prev.w) > gapPt) columns++;
      }
      lines.push({
        page: p,
        y,
        text: sorted.map((s) => s.s).join(' ').replace(/\s+/g, ' ').trim(),
        columns,
        tabular: columns >= minColumns,
        inTableRegion: false,
      });
    }
    pageLines.push(lines);
    page.cleanup();
  }

  // Mark table regions: >= minRows consecutive tabular lines within a page.
  let tableRegions = 0;
  for (const lines of pageLines) {
    let run = 0;
    for (let i = 0; i <= lines.length; i++) {
      const tab = i < lines.length && lines[i]!.tabular;
      if (tab) run++;
      else {
        if (run >= minRows) {
          tableRegions++;
          for (let j = i - run; j < i; j++) lines[j]!.inTableRegion = true;
        }
        run = 0;
      }
    }
  }

  const all = pageLines.flat();

  // Section restriction
  let start: number | null = null;
  let end: number | null = null;
  let label = '';
  if (opts.sectionStart) {
    label = String(opts.sectionStart);
    for (const l of all) {
      if (start === null && opts.sectionStart.test(l.text)) start = l.page;
      else if (start !== null && opts.sectionEnd && opts.sectionEnd.test(l.text) && l.page > start) {
        end = l.page;
        break;
      }
    }
  }
  let scoped = start !== null ? all.filter((l) => l.page >= start! && (end === null || l.page < end)) : all;
  if (opts.fromPage || opts.toPage) {
    const lo = opts.fromPage ?? 1;
    const hi = opts.toPage ?? doc.numPages;
    scoped = scoped.filter((l) => l.page >= lo && l.page <= hi);
    label = `pages ${lo}-${hi}${label ? ` (${label})` : ''}`;
    start = lo;
    end = hi;
  }

  const byKey: Record<string, { table: number; prose: number }> = {};
  let inTable = 0;
  let inProse = 0;
  for (const l of scoped) {
    if (!NUMBER_RE.test(l.text)) continue;
    for (const t of PARAM_TERMS) {
      if (!t.re.test(l.text)) continue;
      byKey[t.key] ??= { table: 0, prose: 0 };
      if (l.inTableRegion) {
        byKey[t.key]!.table++;
        inTable++;
      } else {
        byKey[t.key]!.prose++;
        inProse++;
      }
    }
  }

  const total = inTable + inProse;
  return {
    file,
    pages: doc.numPages,
    pagesWithNoText: emptyPages.length,
    bornDigital: emptyPages.length / doc.numPages < 0.05,
    metadata,
    sectionRange: opts.sectionStart ? { start, end, label } : null,
    scanned: { pagesScanned: emptyPages.length, sample: emptyPages.slice(0, 20) },
    lines: scoped.length,
    tabularLines: scoped.filter((l) => l.tabular).length,
    tableRegions,
    paramHits: { total, inTable, inProse, byKey },
    tableRatio: total > 0 ? Number((inTable / total).toFixed(3)) : null,
  };
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('spanish-genome-probe/pdfTableRatio.ts');
if (isMain) {
  const file = process.argv[2];
  const secIdx = process.argv.indexOf('--section');
  const endIdx = process.argv.indexOf('--endSection');
  if (!file) {
    console.error('usage: tsx pdfTableRatio.ts <file.pdf> [--section <regex>] [--endSection <regex>]');
    process.exit(2);
  }
  const fromIdx = process.argv.indexOf('--fromPage');
  const toIdx = process.argv.indexOf('--toPage');
  analysePdf(file, {
    sectionStart: secIdx >= 0 ? new RegExp(process.argv[secIdx + 1]!, 'i') : undefined,
    sectionEnd: endIdx >= 0 ? new RegExp(process.argv[endIdx + 1]!, 'i') : undefined,
    fromPage: fromIdx >= 0 ? Number(process.argv[fromIdx + 1]) : undefined,
    toPage: toIdx >= 0 ? Number(process.argv[toIdx + 1]) : undefined,
  })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error('analysis failed:', e);
      process.exit(1);
    });
}
