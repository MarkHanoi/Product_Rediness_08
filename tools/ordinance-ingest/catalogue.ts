// CLI — build the Berlin B-Plan catalogue (WP1, metadata only, no PDF downloads).
//
//   npx tsx tools/ordinance-ingest/catalogue.ts [--out <dir>] [--max N]
//
// Emits <out>/berlin-catalogue.json and prints the document-availability CENSUS
// over the whole in-force population — not a sample, because plan metadata is a
// few requests for several thousand records.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    LAYER_IN_FORCE,
    crawlLayer,
    documentAvailability,
} from './lib/berlinCatalogue.js';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
    const outDir = arg('out', join('.cache', 'ordinance-ingest')) as string;
    const maxRaw = arg('max');
    const max = maxRaw ? Number(maxRaw) : undefined;

    console.log(`Crawling ${LAYER_IN_FORCE} from the Berlin bplan WFS…`);
    const plans = await crawlLayer(LAYER_IN_FORCE, { max });
    const availability = documentAvailability(plans);

    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, 'berlin-catalogue.json');
    await writeFile(
        outPath,
        JSON.stringify(
            { crawledAt: new Date().toISOString(), layer: LAYER_IN_FORCE, availability, plans },
            null,
            2,
        ),
        'utf8',
    );

    const pct = (n: number): string =>
        `${((n / availability.plans) * 100).toFixed(1)}%`;
    console.log(`\n── Berlin in-force B-Plan document availability (CENSUS, n=${availability.plans}) ──`);
    console.log(`  Begründung link (grund_www) : ${availability.withBegruendung} (${pct(availability.withBegruendung)})`);
    console.log(`  Planzeichnung only          : ${availability.withPlanzeichnungOnly} (${pct(availability.withPlanzeichnungOnly)})`);
    console.log(`  No document at all          : ${availability.withNoDocument} (${pct(availability.withNoDocument)})`);
    console.log(`\nWrote ${outPath}`);
}

main().catch((err: unknown) => {
    console.error('catalogue failed:', err);
    process.exitCode = 1;
});
