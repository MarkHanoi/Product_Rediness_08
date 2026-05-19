/**
 * Bench harness — K3-D gate per phase-doc-2 §S65 exit criteria.
 *
 * Measures p50/p95/p99 latency for read endpoints in-process.  Targets
 * (per spec):
 *   read p95  < 200 ms
 *   write p95 < 500 ms
 *
 * IN-PROCESS: this is a baseline that establishes the gateway code's
 * intrinsic overhead over the injected ports.  Production p95
 * verification (with network + load + concurrency) happens at S65 D8
 * after deployment to staging.
 *
 * Writes a markdown baseline to `apps/bench/reports/api-gateway-baseline.md`
 * + JSON sidecar so the next sprint can compare.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRig, authHeaders, type TestRig } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, '..', '..', 'bench', 'reports');

interface LatencyStats {
  readonly endpoint: string;
  readonly samples: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

beforeAll(async () => {
  await mkdir(REPORT_DIR, { recursive: true });
});

async function bench(
  endpoint: string,
  url: string,
  init: RequestInit | undefined,
  warm: number,
  measured: number,
): Promise<LatencyStats> {
  for (let i = 0; i < warm; i++) await fetch(url, init);
  const samples: number[] = [];
  for (let i = 0; i < measured; i++) {
    const t0 = performance.now();
    const res = await fetch(url, init);
    await res.arrayBuffer();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]!;
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return Object.freeze({
    endpoint,
    samples: samples.length,
    p50: round(at(0.50)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(samples[samples.length - 1]!),
    mean: round(mean),
  });
}

function round(n: number): number { return Math.round(n * 1000) / 1000; }

describe('K3-D gate — public-API in-process latency', () => {
  it('records baseline + asserts read p95 < 200 ms', async () => {
    rig = await startRig();

    const targets: LatencyStats[] = [];

    targets.push(await bench(
      'GET /v1/health',
      `${rig.baseUrl}/v1/health`,
      undefined,
      50, 200,
    ));

    targets.push(await bench(
      'GET /v1/ai/workflows',
      `${rig.baseUrl}/v1/ai/workflows`,
      undefined,
      50, 200,
    ));

    targets.push(await bench(
      'GET /v1/formulas',
      `${rig.baseUrl}/v1/formulas`,
      undefined,
      50, 200,
    ));

    const adminH = authHeaders({ subject: 'u-admin', scopes: ['project:read'], roles: ['admin'] });
    targets.push(await bench(
      'GET /v1/admin/ai-spend',
      `${rig.baseUrl}/v1/admin/ai-spend`,
      { headers: adminH },
      50, 200,
    ));

    // Persist report so future sprints can compare.
    const tsIso = new Date().toISOString();
    const report = {
      sprint: 'S65',
      kind: 'in-process baseline',
      generatedAt: tsIso,
      node: process.version,
      target: { read_p95_ms: 200, write_p95_ms: 500 },
      results: targets,
    };
    await writeFile(
      join(REPORT_DIR, 'api-gateway-baseline.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    await writeFile(
      join(REPORT_DIR, 'api-gateway-baseline.md'),
      renderMarkdown(report),
      'utf8',
    );

    // Assert against budget — in-process should be FAR below budget.
    for (const t of targets) {
      expect(t.p95, `${t.endpoint} p95 should be < 200 ms`).toBeLessThan(200);
    }
  });
});

function renderMarkdown(r: {
  sprint: string;
  kind: string;
  generatedAt: string;
  node: string;
  target: { read_p95_ms: number; write_p95_ms: number };
  results: readonly LatencyStats[];
}): string {
  const rows = r.results
    .map((t) => `| ${t.endpoint} | ${t.samples} | ${t.p50} | ${t.p95} | ${t.p99} | ${t.max} | ${t.mean} |`)
    .join('\n');
  return [
    `# ${r.sprint} api-gateway baseline (${r.kind})`,
    '',
    `Generated: ${r.generatedAt}`,
    `Node: ${r.node}`,
    `Targets: read p95 < ${r.target.read_p95_ms} ms, write p95 < ${r.target.write_p95_ms} ms`,
    '',
    '| endpoint | samples | p50 ms | p95 ms | p99 ms | max ms | mean ms |',
    '|---|---|---|---|---|---|---|',
    rows,
    '',
    '> In-process baseline. Production p95 verification (network + concurrency) at S65 D8 staging deploy.',
    '',
  ].join('\n');
}
