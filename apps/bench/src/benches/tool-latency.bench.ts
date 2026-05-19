// Bench: `tool-latency` — NFT-3 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 3 — NFT 3: "Tool latency (click → visible)
//   | < 50 ms p95 | apps/bench/src/benches/tool-latency.bench.ts".
//
// What this file CAN measure (headless Node):
//   * CommandBus wall.create dispatch latency — pure command-pipeline
//     overhead (L2 handler + store patch) with no renderer or DOM.
//   * The NFT-3 tool budget of < 50 ms includes the renderer frame;
//     this headless proxy captures the command-pipeline share which
//     is the dominant contributor for data-heavy command sequences.
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * Frame scheduling and renderer first-frame paint latency.
//   * Input device sampling jitter.
//   * CSS layout / React reconciliation time.
//
// NFT-3 production target: < 50 ms p95 (click → visible, full pipeline).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommandBus } from '@pryzm/command-bus';
import { WallStore, buildWallHandlerSet, type WallsState } from '@pryzm/plugin-wall';
import { createId } from '@pryzm/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 50;
const SAMPLES = 500;

const AUDIT = {
  actorId: 'bench-tool-latency',
  projectId: 'bench-nft-3',
  clientId: 'bench-client-nft3',
};

describe('tool-latency', () => {
  it('wall.create CommandBus dispatch is the NFT-3 headless proxy', async () => {
    const store = new WallStore();
    const bus = new CommandBus({
      audit: AUDIT,
      storesProvider: () => ({
        wall: Object.fromEntries(store.getState()) as WallsState,
      }),
    });
    for (const h of buildWallHandlerSet()) bus.register(h);

    // Warmup — JIT + module cache.
    for (let i = 0; i < WARMUP; i++) {
      await bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_bench_warmup',
      });
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      await bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_bench',
      });
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);
    const p99 = p(0.99);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'tool-latency.json'),
      JSON.stringify({
        name: 'tool-latency',
        p50,
        p95,
        p99,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 50,
        notes:
          'NFT-3 headless proxy per 01-VISION.md §5. Measures CommandBus ' +
          'wall.create dispatch latency (command pipeline only, no renderer). ' +
          'Full tool-latency including renderer first-frame is measured in ' +
          'apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    // Shape assertions.
    expect(typeof bus.executeCommand).toBe('function');
    expect(p95).toBeGreaterThan(0);
    // Command pipeline must be well under the NFT-3 tool budget.
    expect(p95).toBeLessThan(50);
  });
});
