// CLI — WP3 CORPUS CHARACTERISATION: how much of the Berlin Begründung corpus is
// born-digital text, hybrid, or scanned?
//
//   npx tsx tools/ordinance-ingest/characterize.ts [--n 500] [--seed 20260731]
//                                                  [--minutes 90] [--gb 6]
//
// This answers the question PROBE-VERDICT-2026-07-31.md §5 explicitly left open:
//   "The text-vs-scan mix-rate across the ~7,000 plans is an unrun sampling
//    question. Do not assert a percentage until sampled."
//
// HONESTY RULES BAKED IN:
//   - the sample is SEEDED, so the reported statistic is reproducible;
//   - results are appended to JSONL as they complete, so an interrupted run still
//     yields a usable, honestly-sized sample rather than nothing;
//   - the report always names the ACTUAL n examined, never the n requested;
//   - acquisition failures are counted SEPARATELY from `scanned` — a document
//     nobody could download is not a document without a text layer, and folding
//     the two would inflate the OCR estimate with documents never looked at.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from './lib/httpCache.js';
import { extractPdfText } from './lib/pdfText.js';
import { seededSample, type BerlinPlanRecord } from './lib/berlinCatalogue.js';
import { classifyDigitisation, tallyCorpus } from '../../packages/ordinance-extraction/src/ingest/classify.js';
import type { DigitisationProfile } from '../../packages/ordinance-extraction/src/ingest/types.js';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

interface SampleResult {
    readonly planid: string;
    readonly planname: string;
    readonly url: string;
    readonly acquired: boolean;
    readonly acquisitionReason?: string;
    readonly byteLength?: number;
    readonly extracted?: boolean;
    readonly extractionReason?: string;
    readonly profile?: DigitisationProfile;
}

async function main(): Promise<void> {
    const outDir = arg('out', join('.cache', 'ordinance-ingest')) as string;
    const cacheDir = join(outDir, 'pdf');
    const n = Number(arg('n', '500'));
    const seed = Number(arg('seed', '20260731'));
    const minutes = Number(arg('minutes', '90'));
    const gbCap = Number(arg('gb', '6'));
    const concurrency = Number(arg('concurrency', '3'));
    const maxPages = Number(arg('maxPages', '250'));

    const cataloguePath = join(outDir, 'berlin-catalogue.json');
    if (!existsSync(cataloguePath)) {
        throw new Error(`No catalogue at ${cataloguePath} — run catalogue.ts first.`);
    }
    const catalogue = JSON.parse(await readFile(cataloguePath, 'utf8')) as {
        plans: BerlinPlanRecord[];
    };

    // The extractor's corpus is the plans that HAVE a Begründung.
    const withBegruendung = catalogue.plans.filter((p) => p.grund_www !== null);
    const sample = seededSample(withBegruendung, n, seed);

    const resultsPath = join(outDir, `characterization-seed${seed}.jsonl`);
    await mkdir(outDir, { recursive: true });

    // Resume support: skip plans already recorded.
    const done = new Set<string>();
    if (existsSync(resultsPath)) {
        for (const line of (await readFile(resultsPath, 'utf8')).split('\n')) {
            if (line.trim() === '') continue;
            try {
                done.add((JSON.parse(line) as SampleResult).planid);
            } catch {
                /* ignore a torn last line */
            }
        }
        console.log(`Resuming: ${done.size} already recorded.`);
    }

    const todo = sample.filter((p) => !done.has(p.planid));
    const deadline = Date.now() + minutes * 60_000;
    const byteCap = gbCap * 1024 ** 3;
    let bytesUsed = 0;
    let completed = done.size;
    let stopped: string | null = null;

    console.log(
        `Corpus: ${withBegruendung.length} in-force plans with a Begründung. ` +
            `Sampling n=${sample.length} (seed ${seed}). ${todo.length} to do.\n`,
    );

    let cursor = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            if (stopped !== null) return;
            if (Date.now() > deadline) {
                stopped = `time budget (${minutes} min) reached`;
                return;
            }
            if (bytesUsed > byteCap) {
                stopped = `byte budget (${gbCap} GB) reached`;
                return;
            }
            const idx = cursor++;
            if (idx >= todo.length) return;
            const plan = todo[idx]!;

            let result: SampleResult;
            const acq = await acquirePdf(plan.grund_www, { cacheDir, politeDelayMs: 500 });
            if (!acq.ok) {
                result = {
                    planid: plan.planid,
                    planname: plan.planname,
                    url: plan.grund_www ?? '',
                    acquired: false,
                    acquisitionReason: acq.reason,
                };
            } else {
                bytesUsed += acq.fromCache ? 0 : acq.byteLength;
                const bytes = new Uint8Array(
                    await readFile(cachedPdfPath(cacheDir, plan.grund_www as string)),
                );
                const text = await extractPdfText(bytes, { maxPages });
                result = text.ok
                    ? {
                          planid: plan.planid,
                          planname: plan.planname,
                          url: plan.grund_www as string,
                          acquired: true,
                          byteLength: acq.byteLength,
                          extracted: true,
                          profile: classifyDigitisation(text.pages),
                      }
                    : {
                          planid: plan.planid,
                          planname: plan.planname,
                          url: plan.grund_www as string,
                          acquired: true,
                          byteLength: acq.byteLength,
                          extracted: false,
                          extractionReason: text.reason,
                      };
            }

            await appendFile(resultsPath, `${JSON.stringify(result)}\n`, 'utf8');
            completed += 1;
            if (completed % 10 === 0) {
                console.log(
                    `  ${completed}/${sample.length}  (${(bytesUsed / 1024 ** 3).toFixed(2)} GB, ${Math.round((Date.now() - (deadline - minutes * 60_000)) / 60_000)} min)`,
                );
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // ── Report over everything actually recorded. ──
    const all: SampleResult[] = [];
    for (const line of (await readFile(resultsPath, 'utf8')).split('\n')) {
        if (line.trim() === '') continue;
        try {
            all.push(JSON.parse(line) as SampleResult);
        } catch {
            /* ignore */
        }
    }
    const profiles = all.filter((r) => r.profile).map((r) => r.profile as DigitisationProfile);
    const unclassified = all.length - profiles.length;
    const tally = tallyCorpus(profiles, unclassified);

    const pct = (x: number): string => `${((x / tally.examined) * 100).toFixed(1)}%`;
    const lines = [
        '',
        '════ WP3 — Berlin Begründung corpus characterisation ════',
        `  requested n : ${n}`,
        `  ACTUAL n    : ${tally.examined}   ← the honest denominator`,
        stopped ? `  stopped early: ${stopped}` : '  completed the sample',
        `  seed        : ${seed}`,
        '',
        `  born-digital text : ${tally.bornDigitalText}  (${pct(tally.bornDigitalText)})`,
        `  hybrid            : ${tally.hybrid}  (${pct(tally.hybrid)})`,
        `  scanned           : ${tally.scanned}  (${pct(tally.scanned)})`,
        `  empty             : ${tally.empty}  (${pct(tally.empty)})`,
        `  unclassified      : ${tally.unclassified}  (${pct(tally.unclassified)})  [download/parse failures — NOT scans]`,
        '',
    ];
    // Break the unclassified bucket down, so it is never an opaque lump.
    const reasons = new Map<string, number>();
    for (const r of all) {
        if (r.profile) continue;
        const key = r.acquired ? `extraction:${r.extractionReason}` : `acquisition:${r.acquisitionReason}`;
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    if (reasons.size > 0) {
        lines.push('  unclassified breakdown:');
        for (const [k, v] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
            lines.push(`    ${k}: ${v}`);
        }
        lines.push('');
    }
    const acquired = all.filter((r) => r.acquired).length;
    lines.push(
        `  download success  : ${acquired}/${all.length} (${((acquired / all.length) * 100).toFixed(1)}%)`,
    );
    lines.push('');

    const report = lines.join('\n');
    console.log(report);
    await writeFile(join(outDir, `characterization-seed${seed}.txt`), report, 'utf8');
    await writeFile(
        join(outDir, `characterization-seed${seed}.summary.json`),
        JSON.stringify({ requested: n, seed, stopped, tally, downloadSuccess: acquired / all.length }, null, 2),
        'utf8',
    );
}

main().catch((err: unknown) => {
    console.error('characterize failed:', err);
    process.exitCode = 1;
});
