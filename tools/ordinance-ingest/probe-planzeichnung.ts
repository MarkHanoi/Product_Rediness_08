// PROBE — are the PLANZEICHNUNGEN (drawing PDFs) text or raster?
//
//   npx tsx tools/ordinance-ingest/probe-planzeichnung.ts [--n 25] [--seed 20260731]
//
// WHY THIS IS THE DECIDING MEASUREMENT FOR WP6. The WP1 census found that 56.3 %
// of in-force Berlin B-Plans expose ONLY `scan_www` — the drawing — with no
// Begründung prose at all. For those plans every planning number lives in the
// Nutzungsschablone, a table ON that drawing. Whether table reconstruction is
// even *approachable* therefore depends on a question nobody has measured:
//
//   does the Planzeichnung carry a text layer, or is it a raster scan?
//
//   • TEXT  → the Nutzungsschablone is positioned text items; reconstruction is a
//             geometry problem (hard, but tractable — WP6 as scoped).
//   • RASTER→ reconstruction needs OCR *plus* table detection on an image, i.e.
//             the two highest-risk components stacked. The founder's risk table
//             would be understating this row.
//
// The field name itself (`scan_www`, path `/ScansBPlan/`) hints raster — but a
// hint is not a measurement, and this codebase has been burned by exactly that
// (Flate-compressed TEXT was once mistaken for a raster scan, PROBE-VERDICT §4).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from './lib/httpCache.js';
import { extractPdfText } from './lib/pdfText.js';
import { seededSample, type BerlinPlanRecord } from './lib/berlinCatalogue.js';
import { classifyDigitisation } from '../../packages/ordinance-extraction/src/ingest/classify.js';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

async function main(): Promise<void> {
    const outDir = join('.cache', 'ordinance-ingest');
    const cacheDir = join(outDir, 'pdf');
    const n = Number(arg('n', '25'));
    const seed = Number(arg('seed', '20260731'));

    const catalogue = JSON.parse(
        await readFile(join(outDir, 'berlin-catalogue.json'), 'utf8'),
    ) as { plans: BerlinPlanRecord[] };

    // The plans WITHOUT a Begründung — the ones whose only hope is the drawing.
    const drawingOnly = catalogue.plans.filter(
        (p) => p.grund_www === null && p.scan_www !== null,
    );
    const sample = seededSample(drawingOnly, n, seed);

    console.log(
        `Planzeichnung-only plans in the census: ${drawingOnly.length}. Probing n=${sample.length} (seed ${seed}).\n`,
    );

    const tally = { text: 0, hybrid: 0, scanned: 0, failed: 0 };
    for (const plan of sample) {
        const acq = await acquirePdf(plan.scan_www, { cacheDir, politeDelayMs: 600 });
        if (!acq.ok) {
            tally.failed += 1;
            console.log(`  ${plan.planname.padEnd(14)} ACQUIRE-FAIL ${acq.reason}`);
            continue;
        }
        const bytes = new Uint8Array(
            await readFile(cachedPdfPath(cacheDir, plan.scan_www as string)),
        );
        const text = await extractPdfText(bytes, { maxPages: 20 });
        if (!text.ok) {
            tally.failed += 1;
            console.log(`  ${plan.planname.padEnd(14)} EXTRACT-FAIL ${text.reason}`);
            continue;
        }
        const p = classifyDigitisation(text.pages);
        if (p.digitisation === 'born-digital-text') tally.text += 1;
        else if (p.digitisation === 'hybrid') tally.hybrid += 1;
        else tally.scanned += 1;
        console.log(
            `  ${plan.planname.padEnd(14)} ${p.digitisation.padEnd(18)} pages=${p.pageCount} chars=${p.totalChars}`,
        );
    }

    const examined = tally.text + tally.hybrid + tally.scanned;
    console.log(`\n──── Planzeichnung digitisation (ACTUAL n=${examined}, ${tally.failed} failed) ────`);
    console.log(`  text-layer : ${tally.text}`);
    console.log(`  hybrid     : ${tally.hybrid}`);
    console.log(`  raster     : ${tally.scanned}`);
    console.log(
        `\n  ⇒ WP6 (Nutzungsschablone reconstruction) is ${
            tally.text + tally.hybrid > tally.scanned
                ? 'a GEOMETRY problem on positioned text.'
                : 'an OCR + table-detection-on-IMAGE problem — two high-risk components stacked.'
        }`,
    );
}

main().catch((err: unknown) => {
    console.error('probe failed:', err);
    process.exitCode = 1;
});
