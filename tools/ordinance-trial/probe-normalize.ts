// E8-TRIAL probe — IS THE SPINE'S PROSE COLLAPSE CAUSED BY A BYPASSED NORMALIZER?
//
// MEASURED: the BEFORE run (flattened `extractRules` over `normalizePages(...)`
// output) emitted 1 correct claim on CH-PROSE and 12 claims / 4 TPs on DE-PROSE.
// The AFTER run (the Layer-3 spine) emits 0 and 3/0. Something in the spine path
// LOSES rules the same grammar found.
//
// HYPOTHESIS. `buildCanonicalDocument(id, pages, texts)` carries `texts` verbatim,
// and `tools/ordinance-ingest/lib/pdfPageItems.ts` builds them with
// `joinPdfTextItems` — i.e. RAW Layer-2 text. `ingest/normalize.ts` is never
// called anywhere in `spine/` or `structure/`. If the German grammar was authored
// against NORMALIZED text (soft-hyphen joins, ligature folding, whitespace), the
// spine is feeding it a string it was never tuned for.
//
// ⛔ THE POINT OF A PROBE IS TO BE ABLE TO COME BACK NEGATIVE. It runs the SAME
// grammar over BOTH strings for the SAME pages and prints both. If the counts
// match, the hypothesis is dead and the cause is elsewhere.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from '../ordinance-ingest/lib/httpCache.js';
import { extractPageGeometry } from '../ordinance-ingest/lib/pdfPageItems.js';
import { normalizePages } from '../../packages/ordinance-extraction/src/ingest/normalize.js';
import { extractRules } from '../../packages/ordinance-extraction/src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { E8_GOLD_SET } from './goldset/e8-gold-set.js';

async function main(): Promise<void> {
    for (const s of E8_GOLD_SET.strata) {
        if (s.valueShape !== 'prose') continue;
        const cacheDir = join('.cache', 'ordinance-ingest', 'pdf');
        const acq = await acquirePdf(s.documentUrl, { cacheDir });
        if (!acq.ok || acq.sha256 !== s.sha256) {
            console.log(`${s.id}: REFUSED (hash/acquire)`);
            continue;
        }
        const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, s.documentUrl)));
        const geo = await extractPageGeometry(bytes, {
            fromPage: Math.min(...s.pages),
            toPage: Math.max(...s.pages),
        });
        const wanted = new Set(s.pages);
        const raw = geo.texts.filter((t) => wanted.has(t.pageNumber));
        const norm = normalizePages(raw).pages;

        console.log(`\n═══ ${s.id} · pages ${s.pages.join(', ')} ═══`);
        for (const label of ['RAW (what the spine feeds the grammar)', 'NORMALIZED (what the BEFORE run fed it)']) {
            const pages = label.startsWith('RAW') ? raw : norm;
            let rules = 0;
            const seen: string[] = [];
            for (const p of pages) {
                const out = extractRules(p.text, GERMAN_GRAMMAR, { document: s.id, page: p.pageNumber });
                if (!out.ok) continue;
                rules += out.rules.length;
                for (const r of out.rules) seen.push(`p${p.pageNumber} ${r.field}=${r.value}`);
            }
            console.log(`  ${label.padEnd(42)} rules=${rules}`);
            for (const x of seen) console.log(`      ${x}`);
        }

        // The concrete difference, shown rather than asserted.
        const rp = raw.map((p) => p.text).join('\n');
        const np = norm.map((p) => p.text).join('\n');
        console.log(`  chars raw=${rp.length} normalized=${np.length} · identical=${rp === np}`);
        if (rp !== np) {
            // First 3 places they diverge, with context — the evidence a reader checks.
            let shown = 0;
            for (let i = 0, j = 0; i < rp.length && j < np.length && shown < 3; i++, j++) {
                if (rp[i] === np[j]) continue;
                console.log(`    diverge @raw ${i}: raw="${JSON.stringify(rp.slice(i - 40, i + 40))}"`);
                console.log(`                       nrm="${JSON.stringify(np.slice(j - 40, j + 40))}"`);
                shown++;
                break;
            }
        }
    }
}

void main();
