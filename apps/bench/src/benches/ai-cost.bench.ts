// Bench: `ai-cost` — S49 D8.
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S49 line 206 ("D8: lint + perf bench (`apps/bench/ai-cost.ts`)").
//
// Measures the two CostMeter S49 surface methods that sit on every
// AI plane submit:
//   • preCheckBudget(projectId, estimatedCostUsd)
//   • recordCall(workflow, projectId, costUsd, latencyMs, extras)
//
// Cold time = first sample. Warm = next 99. Measured = 1000.
// Reports p50/p95/p99 + cold for each surface; writes JSON to
// `apps/bench/.run-output/ai-cost.json` and a markdown baseline to
// `apps/bench/reports/ai-cost-baseline.md`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CostMeter, type AiUsageRow } from '../../../../packages/ai-cost/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

interface BenchSample {
  scenario: string;
  cold: number;
  warmAvg: number;
  p50: number;
  p95: number;
  p99: number;
  budgetMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function makeMeter() {
  // In-memory sink so the bench stays I/O-free and we measure the
  // CostMeter machinery alone, not Postgres.
  const sink: AiUsageRow[] = [];
  const meter = new CostMeter({
    perCallCeilingUsd: 0.18,
    perProjectMonthlyBudget: () => 100,
    preCallRejection: true,
    usageSink: (row) => { sink.push(row); },
  });
  return { meter, sink };
}

async function runScenario(
  name: string,
  iter: () => Promise<void> | void,
  budgetMs: number,
): Promise<BenchSample> {
  // Cold sample.
  const t0 = performance.now();
  await iter();
  const cold = performance.now() - t0;

  // Warm-up: 99 more iterations (100 warm total inc. cold).
  const warmTimes: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    await iter();
    warmTimes.push(performance.now() - s);
  }
  const warmAvg = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // Measured: 1000 samples.
  const measured: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const s = performance.now();
    await iter();
    measured.push(performance.now() - s);
  }
  const sorted = [...measured].sort((a, b) => a - b);
  return {
    scenario: name,
    cold,
    warmAvg,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    budgetMs,
  };
}

describe('bench — ai-cost', () => {
  it('preCheckBudget + recordCall stay under per-call budgets', async () => {
    const samples: BenchSample[] = [];

    // Scenario A — preCheckBudget.
    {
      const { meter } = makeMeter();
      let n = 0;
      samples.push(await runScenario(
        'preCheckBudget',
        async () => { await meter.preCheckBudget(`proj-${n++ & 0xff}`, 0.04); },
        0.5,
      ));
    }

    // Scenario B — recordCall (no sink work — array push).
    {
      const { meter } = makeMeter();
      let n = 0;
      samples.push(await runScenario(
        'recordCall',
        async () => {
          n++;
          await meter.recordCall('ai.floorplan.draft', `proj-${n & 0xff}`, 0.04, 120, {
            actorId: 'U-1', plan: 'personal', model: 'haiku', surface: 'ai.workflow.floorplan',
          });
        },
        0.5,
      ));
    }

    // Scenario C — combined (closer to AiPlane.submit shape).
    {
      const { meter } = makeMeter();
      let n = 0;
      samples.push(await runScenario(
        'preCheck+recordCall',
        async () => {
          n++;
          const ok = await meter.preCheckBudget(`proj-${n & 0xff}`, 0.04);
          if (ok.ok) {
            await meter.recordCall('ai.floorplan.draft', `proj-${n & 0xff}`, 0.04, 120, {
              actorId: 'U-1', plan: 'personal', model: 'haiku',
            });
          }
        },
        1.0,
      ));
    }

    writeFileSync(
      resolve(RUN_OUTPUT, 'ai-cost.json'),
      JSON.stringify({ ts: new Date().toISOString(), samples }, null, 2),
    );

    const md = [
      '# Bench — ai-cost (S49 baseline)',
      '',
      `_Generated: ${new Date().toISOString()}_`,
      '',
      '| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...samples.map((s) => `| ${s.scenario} | ${s.cold.toFixed(3)} | ${s.warmAvg.toFixed(3)} | ${s.p50.toFixed(3)} | ${s.p95.toFixed(3)} | ${s.p99.toFixed(3)} | ${s.budgetMs.toFixed(2)} |`),
      '',
      'Source: `apps/bench/src/benches/ai-cost.bench.ts` per PHASE-3A §S49 D8.',
      '',
    ].join('\n');
    writeFileSync(resolve(REPORTS, 'ai-cost-baseline.md'), md);

    // Soft assertion — fail loud if the meter regresses past the
    // headline budget. p95 is the SLO target; we leave a 10x margin
    // for slow CI runners while still catching genuine regressions.
    for (const s of samples) {
      expect(s.p95, `${s.scenario} p95 over 10× budget`).toBeLessThan(s.budgetMs * 10);
    }
  });
});
