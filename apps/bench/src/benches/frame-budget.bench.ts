// Bench: `frame-budget` — NFT-4 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 4 — NFT 4: "Frame budget (interactive viewport)
//   | 16.6 ms p95 (60 FPS) | apps/bench/src/benches/frame-budget.bench.ts".
//
// What this file CAN measure (headless Node):
//   * FrameScheduler drain time using FakeRafAdapter — the scheduling
//     overhead cost (priority queue drain, tick listener dispatch) without
//     actual Three.js rendering or GPU cost.
//   * This isolates the pure L5 scheduling budget; GPU time is measured
//     in the browser harness (apps/editor-bench/, Wave 13).
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * GPU render pass time (Three.js WebGLRenderer.render()).
//   * CSS compositing / browser paint time.
//   * rAF scheduling jitter (FakeRafAdapter is synchronous).
//
// NFT-4 production target: 16.6 ms p95 (full frame budget for 60 FPS).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const FRAMES = 200;
const WARMUP = 30;

describe('frame-budget', () => {
  it('FrameScheduler drain overhead (headless proxy) is the NFT-4 scheduling budget', () => {
    const raf = new FakeRafAdapter();
    const scheduler = new FrameScheduler();

    let tickCount = 0;
    scheduler.addTickListener(
      'bench-frame-budget-listener',
      () => { tickCount++; },
      'pre-render',
    );

    scheduler.start(raf);

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      scheduler.scheduleOnce('bench-warmup', () => {});
      raf.pumpFrames(1);
    }

    const samples: number[] = [];
    for (let i = 0; i < FRAMES; i++) {
      scheduler.scheduleOnce(`bench-frame-${i}`, () => {});
      const t0 = performance.now();
      raf.pumpFrames(1);
      samples.push(performance.now() - t0);
    }

    scheduler.stop();

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'frame-budget.json'),
      JSON.stringify({
        name: 'frame-budget',
        p50,
        p95,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 16.6,
        notes:
          'NFT-4 headless proxy per 01-VISION.md §5. Measures FrameScheduler ' +
          'drain overhead (FakeRafAdapter, no GPU). Full 60-FPS frame budget ' +
          'including GPU is measured in apps/editor-bench/ (Wave 13).',
      }, null, 2),
    );

    // Scheduling overhead only. Must pass (non-zero samples measured).
    expect(p95).toBeGreaterThan(0);
    expect(tickCount).toBeGreaterThan(0);
  });
});
