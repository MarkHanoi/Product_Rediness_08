// Bench: `frame-budget` — NFT 4.
//
// ############################################################################
// ##  NFT 4 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 4 target: 16.6 ms p95 (60 FPS)
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   The frame budget is GPU submit plus rAF cadence. This bench drives Fak
//   eRafAdapter, which is synchronous and has no cadence at all.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   FrameScheduler queue-drain time under a fake rAF. It has never carried
//    a 16.6 ms threshold - it asserts only '> 0'.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 4, measurability: 'not-yet-measurable'), and `nftLimit(4)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
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

describe('[NOT-YET-MEASURABLE NFT 4] frame-budget', () => {
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
          'NFT-4 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures FrameScheduler ' +
          'drain overhead (FakeRafAdapter, no GPU). Full 60-FPS frame budget ' +
          'including GPU is measured in apps/editor-bench/ (Wave 13).',
      }, null, 2),
    );

    // Scheduling overhead only. Must pass (non-zero samples measured).
    expect(p95).toBeGreaterThan(0);
    expect(tickCount).toBeGreaterThan(0);
  });
});
